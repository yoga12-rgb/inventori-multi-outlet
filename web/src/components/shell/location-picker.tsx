"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import type { AppLocation } from "@/lib/supabase/types";
import { locationTypeLabel } from "@/lib/format";

type Props = {
  locations: AppLocation[];
  selected: string | null;
  paramKey?: string;
};

export function LocationPicker({ locations, selected, paramKey = "loc" }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(value: string) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (!value) sp.delete(paramKey);
    else sp.set(paramKey, value);
    router.push(`?${sp.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <MapPin className="h-4 w-4 text-slate-500" />
      <span className="text-xs text-slate-500">Lokasi</span>
      <select
        className="bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {locations.length === 0 && <option value="">Tidak ada lokasi</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} · {locationTypeLabel[l.type]}
          </option>
        ))}
      </select>
    </label>
  );
}
