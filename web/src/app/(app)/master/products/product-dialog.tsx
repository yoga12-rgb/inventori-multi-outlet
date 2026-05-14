"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";

export type ProductDraft = {
  id: string | null;
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
};

type Props = {
  draft: ProductDraft;
  onClose: () => void;
  onSaved: () => void;
};

export function ProductDialog({ draft, onClose, onSaved }: Props) {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [form, setForm] = useState<ProductDraft>(draft);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(draft), [draft]);

  // Fokus & ESC handling.
  useEffect(() => {
    firstInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.sku.trim()) return "SKU wajib diisi.";
    if (!form.name.trim()) return "Nama produk wajib diisi.";
    if (!form.unit.trim()) return "Unit wajib diisi.";
    if (form.sku.length > 64) return "SKU terlalu panjang.";
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
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit: form.unit.trim(),
      is_active: form.is_active,
    };

    const res = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);

    setBusy(false);

    if (res.error) {
      // Error 23505 = unique_violation pada SKU.
      if (res.error.code === "23505") {
        toast("SKU sudah dipakai produk lain.", "error");
      } else {
        toast(humanizeSupabaseError(res.error), "error");
      }
      return;
    }

    toast(
      form.id ? `Produk "${payload.name}" diperbarui.` : `Produk "${payload.name}" ditambahkan.`,
      "success"
    );
    onSaved();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="card w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2
            id="product-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {form.id ? "Ubah Produk" : "Tambah Produk"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="btn-ghost"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="card-body grid grid-cols-1 gap-4">
          <div>
            <label className="label" htmlFor="sku">
              SKU
            </label>
            <input
              id="sku"
              ref={firstInputRef}
              className="input font-mono"
              value={form.sku}
              onChange={(e) => update("sku", e.target.value.toUpperCase())}
              placeholder="SKU-001"
              required
              maxLength={64}
            />
            <p className="mt-1 text-xs text-slate-500">
              Kode unik. Otomatis diubah ke huruf besar.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="name">
              Nama Produk
            </label>
            <input
              id="name"
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Roti Coklat"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="unit">
              Unit
            </label>
            <input
              id="unit"
              className="input"
              value={form.unit}
              onChange={(e) => update("unit", e.target.value)}
              placeholder="pcs"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Mis. <code>pcs</code>, <code>pack</code>, <code>kg</code>.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Aktif (terlihat di pemilihan kasir &amp; transfer)
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
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
