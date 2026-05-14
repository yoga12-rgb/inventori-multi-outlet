"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { AppLocation, AppRole } from "@/lib/supabase/types";

export type UserDraft = {
  authUserId: string;
  email: string;
  name: string;
  roleId: string;
  locationId: string | null;
  isActive: boolean;
  isNew: boolean;
};

type Props = {
  draft: UserDraft;
  roles: AppRole[];
  locations: AppLocation[];
  onClose: () => void;
  onSaved: () => void;
};

export function UserDialog({ draft, roles, locations, onClose, onSaved }: Props) {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [form, setForm] = useState<UserDraft>(draft);
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

  function update<K extends keyof UserDraft>(key: K, value: UserDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Nama wajib diisi.";
    if (!form.roleId) return "Role wajib dipilih.";
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

    const { error } = await supabase.rpc("admin_user_upsert", {
      p_auth_user_id: form.authUserId,
      p_role_id: form.roleId,
      p_location_id: form.locationId,
      p_name: form.name.trim(),
      p_is_active: form.isActive,
    });
    setBusy(false);

    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }

    toast(
      form.isNew
        ? `Pengguna ${form.email} ditugaskan.`
        : `Pengguna ${form.email} diperbarui.`,
      "success"
    );
    onSaved();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2
            id="user-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {form.isNew ? "Tugaskan Pengguna" : "Ubah Pengguna"}
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
            <label className="label">Email (akun Auth)</label>
            <input
              className="input bg-slate-50 font-mono text-xs"
              value={form.email}
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-slate-500">
              Email diturunkan dari Supabase Auth. Untuk ganti email, edit di
              Authentication &rarr; Users.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="user-name">
              Nama
            </label>
            <input
              id="user-name"
              ref={firstInputRef}
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Yoga Septriana"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="user-role">
              Role
            </label>
            <select
              id="user-role"
              className="input"
              value={form.roleId}
              onChange={(e) => update("roleId", e.target.value)}
              required
            >
              <option value="">Pilih role...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user-location">
              Lokasi
            </label>
            <select
              id="user-location"
              className="input"
              value={form.locationId ?? ""}
              onChange={(e) => update("locationId", e.target.value || null)}
            >
              <option value="">(tidak ada — lintas lokasi)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Kosongkan untuk Super Admin / Kepala Gudang yang melihat semua
              lokasi.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update("isActive", e.target.checked)}
            />
            Aktif
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
