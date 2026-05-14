import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppProduct, TransactionCategory } from "@/lib/supabase/types";
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

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, unit, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("transaction_categories")
      .select("id, code, name, description, is_system, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Kasir"
        description="Pengeluaran barang. Kategori (penjualan, retur, dst.) dapat ditambah Super Admin di Master Data → Kategori. Pemotongan default mengikuti FIFO; kasir bisa override batch sebelum simpan."
      />
      <KasirForm
        locations={session.locations}
        products={(productsRes.data ?? []) as AppProduct[]}
        categories={(categoriesRes.data ?? []) as TransactionCategory[]}
        defaultLocationId={selectedLocationId}
      />
    </div>
  );
}
