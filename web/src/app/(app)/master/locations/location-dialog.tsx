"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { LocationType } from "@/lib/supabase/types";

export type LocationDraft = {
  id: string | null;
  name: string;
  type: LocationType;
  address: string;
  is_active: boolean;
};

type Props = {
  draft: LocationDraft;
  onClose: () => void;
  onSaved: () => void;
};

export function LocationDialog({ draft, onClose, onSaved }: Props) {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [form, setForm] = useState<LocationDraft>(draft);
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

  function update<K extends keyof LocationDraft>(
    key: K,
    value: LocationDraft[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Nama lokasi wajib diisi.";
    if (!form.type) return "Tipe lokasi wajib dipilih.";
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
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim() || null,
      is_active: form.is_active,
    };

    const res = form.id
      ? await supabase.from("locations").update(payload).eq("id", form.id)
      : await supabase.from("locations").insert(payload);

    setBusy(false);

    if (res.error) {
      if (res.error.code === "23505") {
        toast("Nama lokasi sudah dipakai. Pilih nama lain.", "error");
      } else {
        toast(humanizeSupabaseError(res.error), "error");
      }
      return;
    }

    toast(
      form.id
        ? `Lokasi "${payload.name}" diperbarui.`
        : `Lokasi "${payload.name}" ditambahkan.`,
      "success"
    );
    onSaved();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2
            id="location-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {form.id ? "Ubah Lokasi" : "Tambah Lokasi"}
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
            <label className="label" htmlFor="loc-name">
              Nama
            </label>
            <input
              id="loc-name"
              ref={firstInputRef}
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Outlet Pamulang"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="loc-type">
              Tipe
            </label>
            <select
              id="loc-type"
              className="input"
              value={form.type}
              onChange={(e) => update("type", e.target.value as LocationType)}
              required
            >
              <option value="gudang_produksi">Gudang Produksi</option>
              <option value="outlet">Outlet</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="loc-address">
              Alamat (opsional)
            </label>
            <textarea
              id="loc-address"
              className="input min-h-[80px]"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Jl. Raya Pamulang No. 1"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Aktif (terlihat di pemilihan transfer &amp; kasir)
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
