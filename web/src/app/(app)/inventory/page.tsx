import { differenceInDays, parseISO } from "date-fns";
import { Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPicker } from "@/components/shell/location-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, locationTypeLabel } from "@/lib/format";
import type {
  AppLocation,
  AppProduct,
  InventoryBatch,
} from "@/lib/supabase/types";

export const metadata = { title: "Inventory · Detail Batch" };

type SearchParams = { loc?: string; q?: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const role = session.profile?.role?.name;
  const canSeeAll = role === "Super Admin" || role === "Kepala Gudang";

  // Resolve mode lokasi.
  // - "all": tampilkan stok semua lokasi (hanya untuk Super Admin / Kepala Gudang).
  // - <uuid>: tampilkan satu lokasi.
  const rawLoc = searchParams.loc;
  const isAllMode = canSeeAll && rawLoc === "all";
  const selectedLocation = isAllMode
    ? "all"
    : rawLoc ||
      session.defaultLocationId ||
      session.locations[0]?.id ||
      null;

  const search = (searchParams.q ?? "").trim().toLowerCase();

  // Query batch sesuai mode.
  let batchQuery = supabase
    .from("inventory_batches")
    .select(
      "id, product_id, location_id, production_date, expired_date, qty_available",
    )
    .order("location_id", { ascending: true })
    .order("product_id", { ascending: true })
    .order("production_date", { ascending: true });

  if (!isAllMode && selectedLocation) {
    batchQuery = batchQuery.eq("location_id", selectedLocation);
  }
  // Untuk mode "all", tidak ada filter; RLS akan tetap memfilter sesuai role.

  const [batchesRes, productsRes] = await Promise.all([
    selectedLocation
      ? batchQuery
      : Promise.resolve({ data: [] as InventoryBatch[] }),
    supabase.from("products").select("id, sku, name, unit, is_active"),
  ]);

  const products = (productsRes.data ?? []) as AppProduct[];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const locationMap = Object.fromEntries(
    session.locations.map((l) => [l.id, l]),
  );

  const batches = ((batchesRes.data ?? []) as InventoryBatch[]).filter((b) => {
    if (!search) return true;
    const p = productMap[b.product_id];
    if (!p) return false;
    return (
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
    );
  });

  // Group berbeda tergantung mode.
  // - all: location_id → product_id → batches
  // - single: product_id → batches
  const groupedByLocation = isAllMode
    ? batches.reduce<Record<string, Record<string, InventoryBatch[]>>>(
        (acc, b) => {
          (acc[b.location_id] ??= {});
          (acc[b.location_id][b.product_id] ??= []).push(b);
          return acc;
        },
        {},
      )
    : null;

  const groupedByProduct = !isAllMode
    ? batches.reduce<Record<string, InventoryBatch[]>>((acc, b) => {
        (acc[b.product_id] ??= []).push(b);
        return acc;
      }, {})
    : null;

  return (
    <div>
      <PageHeader
        title="Inventory · Detail Batch"
        description={
          isAllMode
            ? "Stok per lokasi untuk seluruh outlet & gudang. FIFO mengutamakan batch tertua. Pilih satu lokasi untuk fokus."
            : "Daftar batch per produk di lokasi terpilih. Batch tertua diutamakan oleh logika FIFO. Indikator kedaluwarsa membantu mengidentifikasi stok rawan."
        }
        actions={
          <LocationPicker
            locations={session.locations}
            selected={selectedLocation}
            includeAll={canSeeAll}
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

      {/* === MODE: SEMUA LOKASI === */}
      {isAllMode &&
        groupedByLocation &&
        (Object.keys(groupedByLocation).length === 0 ? (
          <EmptyState
            title="Tidak ada batch"
            description="Belum ada batch dengan stok di seluruh lokasi yang dapat Anda lihat."
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByLocation)
              .sort(([a], [b]) =>
                (locationMap[a]?.name ?? "").localeCompare(
                  locationMap[b]?.name ?? "",
                ),
              )
              .map(([locId, byProduct]) => (
                <LocationSection
                  key={locId}
                  location={locationMap[locId]}
                  byProduct={byProduct}
                  productMap={productMap}
                />
              ))}
          </div>
        ))}

      {/* === MODE: SATU LOKASI === */}
      {!isAllMode &&
        groupedByProduct &&
        (Object.keys(groupedByProduct).length === 0 ? (
          <EmptyState
            title="Tidak ada batch"
            description="Belum ada batch dengan stok > 0 di lokasi ini, atau filter pencarian tidak cocok."
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByProduct).map(([productId, rows]) => (
              <ProductCard
                key={productId}
                product={productMap[productId]}
                rows={rows}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function LocationSection({
  location,
  byProduct,
  productMap,
}: {
  location?: AppLocation;
  byProduct: Record<string, InventoryBatch[]>;
  productMap: Record<string, AppProduct>;
}) {
  const allBatches = Object.values(byProduct).flat();
  const totalQty = allBatches.reduce((s, b) => s + b.qty_available, 0);
  const productCount = Object.keys(byProduct).length;

  return (
    <section className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-slate-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {location?.name ?? "(Lokasi tidak dikenal)"}
            </h2>
            <p className="text-xs text-slate-500">
              {location ? locationTypeLabel[location.type] : "-"} ·{" "}
              {productCount} produk · {allBatches.length} batch
            </p>
          </div>
        </div>
        <span className="badge-blue">{formatNumber(totalQty)} unit</span>
      </div>
      <div className="card-body space-y-4">
        {Object.entries(byProduct)
          .sort(([a], [b]) =>
            (productMap[a]?.name ?? "").localeCompare(
              productMap[b]?.name ?? "",
            ),
          )
          .map(([productId, rows]) => (
            <ProductCard
              key={productId}
              product={productMap[productId]}
              rows={rows}
              compact
            />
          ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  rows,
  compact = false,
}: {
  product?: AppProduct;
  rows: InventoryBatch[];
  compact?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.qty_available, 0);

  if (compact) {
    return (
      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {product?.name ?? "-"}
            </h3>
            <p className="text-xs text-slate-500">
              SKU {product?.sku ?? "-"} · {rows.length} batch
            </p>
          </div>
          <span className="badge-slate">
            {formatNumber(total)} {product?.unit ?? ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <BatchTable rows={rows} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
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
          <BatchTable rows={rows} />
        </div>
      </div>
    </div>
  );
}

function BatchTable({ rows }: { rows: InventoryBatch[] }) {
  return (
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
              <td>{b.expired_date ? formatDate(b.expired_date) : "-"}</td>
              <td>{renderStatus(status)}</td>
              <td className="text-right font-medium">
                {formatNumber(b.qty_available)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
