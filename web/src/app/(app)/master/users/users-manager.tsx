"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Pencil,
  Power,
  RotateCcw,
  UserPlus,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { AppLocation, AppRole, AppUserProfile } from "@/lib/supabase/types";
import { UserDialog, type UserDraft } from "./user-dialog";

type AuthUserRow = {
  id: string;
  email: string;
  created_at: string;
};

type Props = {
  profiles: AppUserProfile[];
  roles: AppRole[];
  locations: AppLocation[];
  unlinked: AuthUserRow[];
  currentUserId: string;
};

export function UsersManager({
  profiles,
  roles,
  locations,
  unlinked,
  currentUserId,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [editing, setEditing] = useState<UserDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(p: AppUserProfile) {
    setEditing({
      authUserId: p.id,
      email: p.email,
      name: p.name,
      roleId: p.role_id,
      locationId: p.location_id ?? null,
      isActive: p.is_active,
      isNew: false,
    });
  }

  function startLink(au: AuthUserRow) {
    setEditing({
      authUserId: au.id,
      email: au.email,
      name: au.email.split("@")[0] ?? au.email,
      roleId: roles.find((r) => r.name === "Kasir Outlet")?.id ?? roles[0]?.id ?? "",
      locationId: null,
      isActive: true,
      isNew: true,
    });
  }

  async function toggleActive(p: AppUserProfile) {
    if (p.id === currentUserId && p.is_active) {
      toast("Tidak bisa menonaktifkan akun Anda sendiri.", "error");
      return;
    }
    setBusyId(p.id);
    const { error } = await supabase
      .from("users")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast(
      p.is_active ? `${p.name} dinonaktifkan.` : `${p.name} diaktifkan.`,
      "info"
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {unlinked.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-500" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Akun Auth Belum Ditugaskan
                </h2>
                <p className="text-xs text-slate-500">
                  Akun ini sudah ada di Supabase Auth tapi belum punya role &amp;
                  lokasi di aplikasi.
                </p>
              </div>
            </div>
            <span className="badge-yellow">{unlinked.length}</span>
          </div>
          <div className="card-body overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Dibuat</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs">{u.email}</td>
                    <td className="text-slate-500">
                      {new Date(u.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startLink(u)}
                      >
                        <UserPlus className="h-4 w-4" />
                        Tugaskan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Daftar Pengguna
            </h2>
          </div>
          <span className="badge-slate">{profiles.length}</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Lokasi</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-sm text-slate-500"
                  >
                    Belum ada profil pengguna.
                  </td>
                </tr>
              ) : (
                profiles.map((p) => (
                  <tr
                    key={p.id}
                    className={clsx(!p.is_active && "opacity-60")}
                  >
                    <td className="font-medium text-slate-900">
                      {p.name}
                      {p.id === currentUserId && (
                        <span className="ml-2 text-xs font-normal text-brand-600">
                          (Anda)
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs">{p.email}</td>
                    <td>{p.role?.name ?? "-"}</td>
                    <td>{p.location?.name ?? "(lintas)"}</td>
                    <td>
                      {p.is_active ? (
                        <span className="badge-green">Aktif</span>
                      ) : (
                        <span className="badge-red">Nonaktif</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => startEdit(p)}
                          disabled={busyId === p.id}
                          aria-label={`Ubah ${p.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => toggleActive(p)}
                          disabled={busyId === p.id || p.id === currentUserId}
                          aria-label={
                            p.is_active
                              ? `Nonaktifkan ${p.name}`
                              : `Aktifkan ${p.name}`
                          }
                          title={
                            p.id === currentUserId
                              ? "Tidak bisa menonaktifkan diri sendiri"
                              : p.is_active
                                ? "Nonaktifkan"
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <UserDialog
          draft={editing}
          roles={roles}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
