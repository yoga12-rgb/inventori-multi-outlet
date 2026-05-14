"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Power,
} from "lucide-react";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { AppProduct } from "@/lib/supabase/types";
import { ProductDialog, type ProductDraft } from "./product-dialog";

type Props = {
  initial: AppProduct[];
  initialQuery: string;
  initialShowAll: boolean;
  isAdmin: boolean;
};

export function ProductsTable({
  initial,
  initialQuery,
  initialShowAll,
  isAdmin,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<AppProduct[]>(initial);
  const [query, setQuery] = useState(initialQuery);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Sinkronkan rows kalau parent re-render (mis. setelah router.refresh).
  useEffect(() => setRows(initial), [initial]);

  // Sinkronkan filter ke URL (debounced) supaya bookmarkable.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      if (showAll) next.set("show", "all");
      else next.delete("show");
      startTransition(() => {
        router.replace(`/master/products?${next.toString()}`);
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, showAll]);

  const filtered = useMemo(() => rows, [rows]);

  function newDraft(): ProductDraft {
    return { id: null, sku: "", name: "", unit: "pcs", is_active: true };
  }

  async function toggleActive(p: AppProduct) {
    if (!isAdmin) return;
    setBusyId(p.id);
    const { error } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(
      p.is_active ? `Produk "${p.name}" dinonaktifkan.` : `Produk "${p.name}" diaktifkan.`,
      "info"
    );
    router.refresh();
  }

  async function hardDelete(p: AppProduct) {
    if (!isAdmin) return;
    if (
      !confirm(
        `Hapus permanen produk "${p.name}"?\n\nTindakan ini gagal jika produk masih dipakai oleh batch / transaksi (FK restrict). Disarankan menonaktifkan saja.`
      )
    ) {
      return;
    }
    setBusyId(p.id);
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(`Produk "${p.name}" dihapus.`, "info");
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
                placeholder="Cari nama atau SKU..."
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
              Tambah Produk
            </button>
          )}
        </div>

        <div className="card-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Unit</th>
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
                    Tidak ada produk yang cocok.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={clsx(!p.is_active && "opacity-60")}
                  >
                    <td className="font-mono text-xs">{p.sku}</td>
                    <td className="font-medium text-slate-900">{p.name}</td>
                    <td>{p.unit}</td>
                    <td>
                      {p.is_active ? (
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
                                id: p.id,
                                sku: p.sku,
                                name: p.name,
                                unit: p.unit,
                                is_active: p.is_active,
                              })
                            }
                            disabled={busyId === p.id}
                            aria-label={`Ubah ${p.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            aria-label={
                              p.is_active
                                ? `Nonaktifkan ${p.name}`
                                : `Aktifkan ${p.name}`
                            }
                            title={
                              p.is_active
                                ? "Nonaktifkan (soft delete)"
                                : "Aktifkan kembali"
                            }
                          >
                            {busyId === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : p.is_active ? (
                              <Power className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-red-600"
                            onClick={() => hardDelete(p)}
                            disabled={busyId === p.id}
                            aria-label={`Hapus permanen ${p.name}`}
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
        <ProductDialog
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
