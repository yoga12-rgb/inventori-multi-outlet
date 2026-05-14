"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";

export type CategoryDraft = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
};

type Props = {
  draft: CategoryDraft;
  onClose: () => void;
  onSaved: () => void;
};

function slugifyCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function CategoryDialog({ draft, onClose, onSaved }: Props) {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [form, setForm] = useState<CategoryDraft>(draft);
  const [busy, setBusy] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(draft), [draft]);
  useEffect(() => {
    firstInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update<K extends keyof CategoryDraft>(
    key: K,
    value: CategoryDraft[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Nama wajib diisi.";
    if (!form.code.trim()) return "Code wajib diisi.";
    if (!/^[a-z][a-z0-9_]*$/.test(form.code))
      return "Code harus huruf kecil, angka, atau underscore (mulai dengan huruf).";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast(err, "error");
      return;
    }
    setBusy(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };
    const res = form.id
      ? await supabase.from("transaction_categories").update(payload).eq("id", form.id)
      : await supabase.from("transaction_categories").insert(payload);
    setBusy(false);

    if (res.error) {
      if (res.error.code === "23505") {
        toast("Code sudah dipakai kategori lain.", "error");
      } else {
        toast(humanizeSupabaseError(res.error), "error");
      }
      return;
    }

    toast(
      form.id
        ? `Kategori "${payload.name}" diperbarui.`
        : `Kategori "${payload.name}" ditambahkan.`,
      "success",
    );
    onSaved();
  }

  const codeLocked = !!form.id && form.is_system;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2 className="text-base font-semibold text-slate-900">
            {form.id ? "Ubah Kategori" : "Tambah Kategori"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="btn-ghost">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="card-body grid grid-cols-1 gap-4">
          <div>
            <label className="label" htmlFor="cat-name">
              Nama
            </label>
            <input
              id="cat-name"
              ref={firstInputRef}
              className="input"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                update("name", name);
                if (!form.id && !form.code) update("code", slugifyCode(name));
              }}
              placeholder="Penjualan, Sample, Donasi, ..."
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-code">
              Code
            </label>
            <input
              id="cat-code"
              className="input font-mono"
              value={form.code}
              onChange={(e) =>
                update("code", e.target.value.toLowerCase())
              }
              disabled={codeLocked}
              placeholder="penjualan, sample, donasi, ..."
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              {codeLocked
                ? "Code kategori sistem tidak boleh diubah."
                : "Identifier internal. Huruf kecil, angka, atau underscore. Contoh: bonus_karyawan."}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="cat-desc">
              Deskripsi (opsional)
            </label>
            <textarea
              id="cat-desc"
              className="input min-h-[64px]"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Penjelasan singkat untuk kasir."
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-sort">
              Urutan
            </label>
            <input
              id="cat-sort"
              type="number"
              className="input w-32"
              value={form.sort_order}
              onChange={(e) => update("sort_order", Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Lebih kecil = muncul lebih dulu (mis. penjualan=10, retur=30,
              lainnya=90).
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Aktif (terlihat di kasir)
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
