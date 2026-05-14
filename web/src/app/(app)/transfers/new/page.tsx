import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppProduct, InventoryBatch } from "@/lib/supabase/types";
import { TransferForm } from "./transfer-form";

export const metadata = { title: "Transfer Baru" };

type SearchParams = { loc?: string };

export default async function TransferNewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const fromLocationId =
    searchParams.loc ||
    session.defaultLocationId ||
    session.locations.find((l) => l.type === "gudang_produksi")?.id ||
    session.locations[0]?.id ||
    null;

  const [productsRes, batchesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, unit, is_active")
      .eq("is_active", true)
      .order("name"),
    fromLocationId
      ? supabase
          .from("inventory_batches")
          .select(
            "id, product_id, location_id, production_date, expired_date, qty_available"
          )
          .eq("location_id", fromLocationId)
          .gt("qty_available", 0)
          .order("production_date", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div>
      <PageHeader
        title="Buat Transfer"
        description="Pilih lokasi asal & tujuan, lalu pilih batch dan qty yang akan dikirim. Stok lokasi asal akan langsung dipotong dan transfer berstatus In-Transit hingga diterima."
      />
      <TransferForm
        locations={session.locations}
        products={(productsRes.data ?? []) as AppProduct[]}
        initialFromLocationId={fromLocationId}
        initialBatches={(batchesRes.data ?? []) as InventoryBatch[]}
      />
    </div>
  );
}
