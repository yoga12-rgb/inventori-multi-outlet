import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppLocation, AppRole, AppUserProfile } from "@/lib/supabase/types";

export interface SessionInfo {
  userId: string;
  email: string;
  profile: AppUserProfile | null;
  locations: AppLocation[];
  defaultLocationId: string | null;
}

export async function requireSession(): Promise<SessionInfo> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profile + role (RLS allows self-read).
  const { data: profile } = await supabase
    .from("users")
    .select(
      "id, name, email, role_id, location_id, is_active, role:roles(id, name), location:locations(id, name, type, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  // Locations untuk pemilihan lokasi (Super Admin lihat semua, lainnya akan
  // tetap difilter RLS, jadi UI menampilkan apa yang server izinkan).
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, type, is_active")
    .order("name", { ascending: true });

  const typed = (profile ?? null) as
    | (Omit<AppUserProfile, "role" | "location"> & {
        role?: AppRole | null;
        location?: AppLocation | null;
      })
    | null;

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: typed,
    locations: (locations ?? []) as AppLocation[],
    defaultLocationId: typed?.location_id ?? null,
  };
}
