import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppLocation, AppRole, AppUserProfile } from "@/lib/supabase/types";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Pengguna · Master Data" };

type AuthUserRow = {
  id: string;
  email: string;
  created_at: string;
};

export default async function UsersPage() {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const isAdmin = session.profile?.role?.name === "Super Admin";

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Pengguna" />
        <EmptyState
          title="Akses ditolak"
          description="Hanya Super Admin yang dapat mengelola pengguna."
        />
      </div>
    );
  }

  const [profilesRes, rolesRes, locationsRes, unlinkedRes] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, email, role_id, location_id, is_active, role:roles(id, name), location:locations(id, name, type, is_active)"
      )
      .order("name"),
    supabase.from("roles").select("id, name").order("name"),
    supabase
      .from("locations")
      .select("id, name, type, is_active")
      .order("name"),
    supabase.rpc("admin_unlinked_users"),
  ]);

  const profiles = (profilesRes.data ?? []) as unknown as AppUserProfile[];
  const roles = (rolesRes.data ?? []) as AppRole[];
  const locations = (locationsRes.data ?? []) as AppLocation[];
  const unlinked = (unlinkedRes.data ?? []) as AuthUserRow[];

  return (
    <div>
      <PageHeader
        title="Pengguna"
        description="Tautkan akun Supabase Auth ke role & lokasi. User di Supabase Auth dibuat lewat Authentication → Users → Add user, lalu di sini ditugaskan."
      />

      {profiles.length === 0 && unlinked.length === 0 ? (
        <EmptyState
          title="Belum ada pengguna"
          description="Buat dulu user di Supabase Auth (Dashboard → Authentication → Users → Add user)."
          icon={Plus}
        />
      ) : null}

      <UsersManager
        profiles={profiles}
        roles={roles}
        locations={locations}
        unlinked={unlinked}
        currentUserId={session.userId}
      />
    </div>
  );
}
