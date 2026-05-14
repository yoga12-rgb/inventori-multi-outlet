import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profil Saya" };

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <div>
      <PageHeader
        title="Profil Saya"
        description="Atur lokasi default Anda. Role hanya bisa diubah oleh Super Admin lewat Supabase Studio."
      />
      <ProfileForm
        userId={session.userId}
        email={session.email}
        currentName={session.profile?.name ?? ""}
        currentLocationId={session.defaultLocationId}
        roleName={session.profile?.role?.name ?? "—"}
        locations={session.locations}
      />
    </div>
  );
}
