import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppProduct } from "@/lib/supabase/types";
import { KasirForm } from "./kasir-form";

export const metadata = {
  title: "Kasir · Pengeluaran Barang",
};

type SearchParams = { loc?: string };

export default async function KasirPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const selectedLocationId =
    searchParams.loc || session.defaultLocationId || session.locations[0]?.id || null;

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, unit, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Kasir"
        description="Pengeluaran barang (penjualan, retur, complaiment, rusak, lainnya). Pemotongan default mengikuti FIFO; kasir bisa override batch sebelum simpan."
      />
      <KasirForm
        locations={session.locations}
        products={(products ?? []) as AppProduct[]}
        defaultLocationId={selectedLocationId}
      />
    </div>
  );
}
