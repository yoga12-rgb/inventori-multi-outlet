"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { locationTypeLabel } from "@/lib/format";
import type { AppLocation } from "@/lib/supabase/types";

type Props = {
  userId: string;
  email: string;
  currentName: string;
  currentLocationId: string | null;
  roleName: string;
  locations: AppLocation[];
};

export function ProfileForm({
  userId,
  email,
  currentName,
  currentLocationId,
  roleName,
  locations,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(currentName);
  const [locationId, setLocationId] = useState(currentLocationId ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("users")
      .update({
        name,
        location_id: locationId || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast("Profil tersimpan.", "success");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-xl">
      <div className="card-body space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} disabled />
        </div>
        <div>
          <label className="label">Role</label>
          <input className="input" value={roleName} disabled />
        </div>
        <div>
          <label className="label">Nama</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Lokasi default</label>
          <select
            className="input"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">Tanpa lokasi (Super Admin / Kepala Gudang)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {locationTypeLabel[l.type]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            RLS membatasi data yang Anda lihat berdasarkan lokasi ini.
          </p>
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan
        </button>
      </div>
    </form>
  );
}
