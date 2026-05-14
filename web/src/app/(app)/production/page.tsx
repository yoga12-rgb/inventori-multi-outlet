import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppLocation, AppProduct } from "@/lib/supabase/types";
import { ProductionForm } from "./production-form";

export const metadata = { title: "Produksi · Tambah Stok" };

export default async function ProductionPage() {
  const session = await requireSession();
  const role = session.profile?.role?.name;
  const allowed = role === "Super Admin" || role === "Kepala Gudang";

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Produksi" />
        <EmptyState
          title="Akses ditolak"
          description="Hanya Super Admin atau Kepala Gudang yang dapat mencatat produksi."
        />
      </div>
    );
  }

  const supabase = getSupabaseServerClient();
  const [locationsRes, productsRes] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, type, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, name, unit, is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  const locations = (locationsRes.data ?? []) as AppLocation[];
  const products = (productsRes.data ?? []) as AppProduct[];

  // Default ke gudang produksi pertama jika ada.
  const defaultLocationId =
    locations.find((l) => l.type === "gudang_produksi")?.id ??
    locations[0]?.id ??
    null;

  return (
    <div>
      <PageHeader
        title="Catat Produksi / Tambah Stok"
        description="Tambah batch baru ke lokasi (umumnya Gudang Produksi). Batch dengan tanggal produksi yang sama akan diakumulasi qty-nya."
      />
      <ProductionForm
        locations={locations}
        products={products}
        defaultLocationId={defaultLocationId}
      />
    </div>
  );
}
