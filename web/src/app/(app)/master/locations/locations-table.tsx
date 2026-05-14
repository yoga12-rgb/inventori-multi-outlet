"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { locationTypeLabel } from "@/lib/format";
import type { AppLocation } from "@/lib/supabase/types";
import { LocationDialog, type LocationDraft } from "./location-dialog";

type Props = {
  initial: AppLocation[];
  initialQuery: string;
  initialShowAll: boolean;
  isAdmin: boolean;
};

export function LocationsTable({
  initial,
  initialQuery,
  initialShowAll,
  isAdmin,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<AppLocation[]>(initial);
  const [query, setQuery] = useState(initialQuery);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [editing, setEditing] = useState<LocationDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(initial), [initial]);

  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      if (showAll) next.set("show", "all");
      else next.delete("show");
      startTransition(() => {
        router.replace(`/master/locations?${next.toString()}`);
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, showAll]);

  const filtered = useMemo(() => rows, [rows]);

  function newDraft(): LocationDraft {
    return {
      id: null,
      name: "",
      type: "outlet",
      address: "",
      is_active: true,
    };
  }

  async function toggleActive(l: AppLocation) {
    if (!isAdmin) return;
    setBusyId(l.id);
    const { error } = await supabase
      .from("locations")
      .update({ is_active: !l.is_active })
      .eq("id", l.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(
      l.is_active
        ? `Lokasi "${l.name}" dinonaktifkan.`
        : `Lokasi "${l.name}" diaktifkan.`,
      "info"
    );
    router.refresh();
  }

  async function hardDelete(l: AppLocation) {
    if (!isAdmin) return;
    if (
      !confirm(
        `Hapus permanen lokasi "${l.name}"?\n\nTindakan akan gagal jika lokasi masih punya batch / transaksi / transfer (FK restrict). Disarankan menonaktifkan saja.`
      )
    ) {
      return;
    }
    setBusyId(l.id);
    const { error } = await supabase.from("locations").delete().eq("id", l.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(`Lokasi "${l.name}" dihapus.`, "info");
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="card-header gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                placeholder="Cari nama lokasi..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Tampilkan nonaktif
            </label>
            {pending && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing(newDraft())}
            >
              <Plus className="h-4 w-4" />
              Tambah Lokasi
            </button>
          )}
        </div>

        <div className="card-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Alamat</th>
                <th>Status</th>
                {isAdmin && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 4}
                    className="py-6 text-center text-sm text-slate-500"
                  >
                    Tidak ada lokasi yang cocok.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr
                    key={l.id}
                    className={clsx(!l.is_active && "opacity-60")}
                  >
                    <td className="font-medium text-slate-900">{l.name}</td>
                    <td>
                      <span className="badge-slate">
                        {locationTypeLabel[l.type]}
                      </span>
                    </td>
                    <td className="max-w-[24rem] text-slate-600">
                      {(l as AppLocation & { address?: string | null }).address ||
                        "-"}
                    </td>
                    <td>
                      {l.is_active ? (
                        <span className="badge-green">Aktif</span>
                      ) : (
                        <span className="badge-red">Nonaktif</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() =>
                              setEditing({
                                id: l.id,
                                name: l.name,
                                type: l.type,
                                address:
                                  (l as AppLocation & { address?: string | null })
                                    .address ?? "",
                                is_active: l.is_active,
                              })
                            }
                            disabled={busyId === l.id}
                            aria-label={`Ubah ${l.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => toggleActive(l)}
                            disabled={busyId === l.id}
                            aria-label={
                              l.is_active
                                ? `Nonaktifkan ${l.name}`
                                : `Aktifkan ${l.name}`
                            }
                            title={
                              l.is_active
                                ? "Nonaktifkan (soft delete)"
                                : "Aktifkan kembali"
                            }
                          >
                            {busyId === l.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : l.is_active ? (
                              <Power className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-red-600"
                            onClick={() => hardDelete(l)}
                            disabled={busyId === l.id}
                            aria-label={`Hapus permanen ${l.name}`}
                            title="Hapus permanen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <LocationDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
