import { differenceInDays, parseISO } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPicker } from "@/components/shell/location-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppProduct, InventoryBatch } from "@/lib/supabase/types";

export const metadata = { title: "Inventory · Detail Batch" };

type SearchParams = { loc?: string; q?: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const selectedLocation =
    searchParams.loc || session.defaultLocationId || session.locations[0]?.id || null;
  const search = (searchParams.q ?? "").trim().toLowerCase();

  const [batchesRes, productsRes] = await Promise.all([
    selectedLocation
      ? supabase
          .from("inventory_batches")
          .select(
            "id, product_id, location_id, production_date, expired_date, qty_available"
          )
          .eq("location_id", selectedLocation)
          .order("product_id", { ascending: true })
          .order("production_date", { ascending: true })
      : Promise.resolve({ data: [] as InventoryBatch[] }),
    supabase.from("products").select("id, sku, name, unit, is_active"),
  ]);

  const products = (productsRes.data ?? []) as AppProduct[];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const batches = ((batchesRes.data ?? []) as InventoryBatch[]).filter((b) => {
    if (!search) return true;
    const p = productMap[b.product_id];
    if (!p) return false;
    return (
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
    );
  });

  const grouped = batches.reduce<Record<string, InventoryBatch[]>>((acc, b) => {
    (acc[b.product_id] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Inventory · Detail Batch"
        description="Daftar batch per produk di lokasi terpilih. Batch tertua dikutamakan oleh logika FIFO. Indikator kedaluwarsa membantu mengidentifikasi stok rawan."
        actions={
          <LocationPicker
            locations={session.locations}
            selected={selectedLocation}
          />
        }
      />

      <form className="mb-4">
        <input type="hidden" name="loc" value={selectedLocation ?? ""} />
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Cari produk berdasarkan nama atau SKU..."
          className="input max-w-md"
        />
      </form>

      {Object.keys(grouped).length === 0 ? (
        <EmptyState
          title="Tidak ada batch"
          description="Belum ada batch dengan stok > 0 di lokasi ini, atau filter pencarian tidak cocok."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([productId, rows]) => {
            const product = productMap[productId];
            const total = rows.reduce((s, r) => s + r.qty_available, 0);
            return (
              <div key={productId} className="card">
                <div className="card-header">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {product?.name ?? "-"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      SKU {product?.sku} · {rows.length} batch
                    </p>
                  </div>
                  <span className="badge-blue">
                    {formatNumber(total)} {product?.unit ?? ""}
                  </span>
                </div>
                <div className="card-body">
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tanggal Produksi</th>
                          <th>Tanggal Expired</th>
                          <th>Status</th>
                          <th className="text-right">Qty Tersedia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((b) => {
                          const status = expirationStatus(b.expired_date);
                          return (
                            <tr key={b.id}>
                              <td>{formatDate(b.production_date)}</td>
                              <td>
                                {b.expired_date
                                  ? formatDate(b.expired_date)
                                  : "-"}
                              </td>
                              <td>{renderStatus(status)}</td>
                              <td className="text-right font-medium">
                                {formatNumber(b.qty_available)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ExpStatus = "fresh" | "soon" | "near" | "expired" | "none";

function expirationStatus(expired_date: string | null): ExpStatus {
  if (!expired_date) return "none";
  const days = differenceInDays(parseISO(expired_date), new Date());
  if (days < 0) return "expired";
  if (days <= 3) return "near";
  if (days <= 7) return "soon";
  return "fresh";
}

function renderStatus(s: ExpStatus) {
  switch (s) {
    case "expired":
      return <span className="badge-red">Kedaluwarsa</span>;
    case "near":
      return <span className="badge-red">≤ 3 hari</span>;
    case "soon":
      return <span className="badge-yellow">≤ 7 hari</span>;
    case "fresh":
      return <span className="badge-green">Fresh</span>;
    default:
      return <span className="badge-slate">Tanpa expired</span>;
  }
}
