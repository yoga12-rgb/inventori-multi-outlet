"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { AppLocation, AppRole } from "@/lib/supabase/types";

type Props = {
  roles: AppRole[];
  locations: AppLocation[];
  onClose: () => void;
  onCreated: () => void;
};

export function NewUserDialog({ roles, locations, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(
    roles.find((r) => r.name === "Kasir Outlet")?.id ?? roles[0]?.id ?? "",
  );
  const [locationId, setLocationId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function validate(): string | null {
    if (!email.trim()) return "Email wajib diisi.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Format email tidak valid.";
    if (!password || password.length < 6) return "Password minimal 6 karakter.";
    if (!name.trim()) return "Nama wajib diisi.";
    if (!roleId) return "Role wajib dipilih.";
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
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          role_id: roleId,
          location_id: locationId || null,
          is_active: isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error ?? `Gagal (${res.status}).`, "error");
        return;
      }
      toast(`Pengguna ${email} dibuat.`, "success");
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal memanggil server.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2
            id="new-user-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            Buat Pengguna Baru
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
            <label className="label" htmlFor="new-email">
              Email
            </label>
            <input
              id="new-email"
              ref={firstInputRef}
              className="input"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kasir@perusahaan.com"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">
              Password Awal
            </label>
            <input
              id="new-password"
              className="input"
              type="text"
              autoComplete="off"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              User dapat ganti password sendiri setelah login.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="new-name">
              Nama
            </label>
            <input
              id="new-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new-role">
              Role
            </label>
            <select
              id="new-role"
              className="input"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
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
            <label className="label" htmlFor="new-location">
              Lokasi
            </label>
            <select
              id="new-location"
              className="input"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">(tidak ada — lintas lokasi)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Kosongkan untuk Super Admin / Kepala Gudang yang melihat semua lokasi.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
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
              Buat Pengguna
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
