"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Trash2,
  Lock,
} from "lucide-react";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { TransactionCategory } from "@/lib/supabase/types";
import { CategoryDialog, type CategoryDraft } from "./category-dialog";

type Props = {
  initial: TransactionCategory[];
  isAdmin: boolean;
};

export function CategoriesTable({ initial, isAdmin }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<TransactionCategory[]>(initial);
  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setRows(initial), [initial]);

  function newDraft(): CategoryDraft {
    return {
      id: null,
      code: "",
      name: "",
      description: "",
      is_active: true,
      is_system: false,
      sort_order: 50,
    };
  }

  async function toggleActive(c: TransactionCategory) {
    if (!isAdmin) return;
    setBusyId(c.id);
    const { error } = await supabase
      .from("transaction_categories")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(
      c.is_active
        ? `Kategori "${c.name}" dinonaktifkan.`
        : `Kategori "${c.name}" diaktifkan.`,
      "info",
    );
    router.refresh();
  }

  async function hardDelete(c: TransactionCategory) {
    if (!isAdmin) return;
    if (c.is_system) {
      toast("Kategori sistem tidak boleh dihapus. Nonaktifkan saja.", "error");
      return;
    }
    if (
      !confirm(
        `Hapus permanen kategori "${c.name}"?\n\nGagal jika sudah dipakai transaksi (FK restrict). Disarankan menonaktifkan saja.`,
      )
    ) {
      return;
    }
    setBusyId(c.id);
    const { error } = await supabase
      .from("transaction_categories")
      .delete()
      .eq("id", c.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(`Kategori "${c.name}" dihapus.`, "info");
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-slate-900">
            Daftar Kategori
          </h2>
          <div className="flex items-center gap-2">
            <span className="badge-slate">{rows.length}</span>
            {isAdmin && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setEditing(newDraft())}
              >
                <Plus className="h-4 w-4" />
                Tambah Kategori
              </button>
            )}
          </div>
        </div>

        <div className="card-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Code</th>
                <th>Deskripsi</th>
                <th className="text-right">Urutan</th>
                <th>Status</th>
                {isAdmin && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="py-6 text-center text-sm text-slate-500"
                  >
                    Tidak ada kategori.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    className={clsx(!c.is_active && "opacity-60")}
                  >
                    <td className="font-medium text-slate-900">
                      {c.name}
                      {c.is_system && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600">
                          <Lock className="h-3 w-3" />
                          Sistem
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs">{c.code}</td>
                    <td className="max-w-md text-slate-600">
                      {c.description || "-"}
                    </td>
                    <td className="text-right tabular-nums">{c.sort_order}</td>
                    <td>
                      {c.is_active ? (
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
                                id: c.id,
                                code: c.code,
                                name: c.name,
                                description: c.description ?? "",
                                is_active: c.is_active,
                                is_system: c.is_system,
                                sort_order: c.sort_order,
                              })
                            }
                            disabled={busyId === c.id}
                            aria-label={`Ubah ${c.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => toggleActive(c)}
                            disabled={busyId === c.id}
                            aria-label={
                              c.is_active
                                ? `Nonaktifkan ${c.name}`
                                : `Aktifkan ${c.name}`
                            }
                            title={
                              c.is_active
                                ? "Nonaktifkan (soft delete)"
                                : "Aktifkan kembali"
                            }
                          >
                            {busyId === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : c.is_active ? (
                              <Power className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-red-600"
                            onClick={() => hardDelete(c)}
                            disabled={busyId === c.id || c.is_system}
                            aria-label={`Hapus permanen ${c.name}`}
                            title={
                              c.is_system
                                ? "Kategori sistem tidak boleh dihapus"
                                : "Hapus permanen"
                            }
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
        <CategoryDialog
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
