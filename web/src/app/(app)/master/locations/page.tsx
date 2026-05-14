import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppLocation } from "@/lib/supabase/types";
import { LocationsTable } from "./locations-table";

export const metadata = { title: "Lokasi · Master Data" };

type SearchParams = { q?: string; show?: "all" | "active" };

type LocationRow = AppLocation & { address: string | null };

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const query = (searchParams.q ?? "").trim();
  const showAll = searchParams.show === "all";

  let q = supabase
    .from("locations")
    .select("id, name, type, address, is_active")
    .order("name", { ascending: true });
  if (!showAll) q = q.eq("is_active", true);
  if (query) q = q.ilike("name", `%${query}%`);

  const { data } = await q;
  const locations = (data ?? []) as LocationRow[];
  const isAdmin = session.profile?.role?.name === "Super Admin";

  return (
    <div>
      <PageHeader
        title="Lokasi"
        description="Daftar gudang produksi & outlet. Hanya Super Admin yang dapat menambah, mengubah, atau menonaktifkan."
      />

      {locations.length === 0 ? (
        <EmptyState
          title="Belum ada lokasi"
          description={
            isAdmin
              ? "Klik tombol Tambah Lokasi untuk membuat data pertama."
              : "Hubungi Super Admin untuk menambah lokasi."
          }
          icon={Plus}
        />
      ) : null}

      <LocationsTable
        initial={locations}
        initialQuery={query}
        initialShowAll={showAll}
        isAdmin={isAdmin}
      />
    </div>
  );
}
