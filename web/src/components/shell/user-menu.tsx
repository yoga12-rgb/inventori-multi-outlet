"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, User2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUserProfile } from "@/lib/supabase/types";
import { useToast } from "@/components/ui/toast";

type Props = {
  profile: AppUserProfile | null;
  email: string;
};

export function UserMenu({ profile, email }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    toast("Sudah keluar.", "info");
    router.replace("/login");
    router.refresh();
  }

  const name = profile?.name || email;
  const role = profile?.role?.name || "—";
  const location = profile?.location?.name || "Tanpa lokasi";

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <User2 className="h-4 w-4" />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-none text-slate-900">
            {name}
          </span>
          <span className="block text-xs leading-none text-slate-500">
            {role} · {location}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            <p className="font-medium text-slate-900">{name}</p>
            <p>{email}</p>
            <p className="mt-1">
              {role} · {location}
            </p>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            Profil & Lokasi
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}
