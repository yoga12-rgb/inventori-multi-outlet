import { differenceInDays, parseISO } from "date-fns";
import { Boxes } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
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
import {
  InventoryPivotTable,
  type PivotLongRow,
} from "./pivot-table";
import type { TransactionCategory } from "@/lib/supabase/types";

export const metadata = { title: "Inventory · Detail Batch" };

type SearchParams = {
  loc?: string;
  q?: string;
  view?: "pivot" | "detail";
  from?: string;
  to?: string;
};

function todayLocalISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const role = session.profile?.role?.name;
  const canSeeAll = role === "Super Admin" || role === "Kepala Gudang";

  const rawLoc = searchParams.loc;
  const isAllMode = canSeeAll && rawLoc === "all";
  const selectedLocation = isAllMode
    ? "all"
    : rawLoc ||
      session.defaultLocationId ||
      session.locations[0]?.id ||
      null;

  const search = (searchParams.q ?? "").trim().toLowerCase();
  const view = searchParams.view === "detail" ? "detail" : "pivot"; // default pivot
  const today = todayLocalISO();
  const from = searchParams.from?.trim() || today;
  const to = searchParams.to?.trim() || today;

  // Mode "all" + view "pivot": panggil RPC inventory_pivot.
  if (isAllMode && view === "pivot") {
    const [pivotRes, catRes] = await Promise.all([
      supabase.rpc("inventory_pivot", {
        p_from: `${from}T00:00:00`,
        p_to: `${to}T23:59:59.999`,
      }),
      supabase
        .from("transaction_categories")
        .select(
          "id, code, name, description, is_system, is_active, sort_order",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    let pivot = ((pivotRes.data ?? []) as unknown as PivotLongRow[]).map(
      (r) => ({
        ...r,
        qty: Number(r.qty ?? 0),
      }),
    );

    if (search) {
      pivot = pivot.filter(
        (r) =>
          r.product_name.toLowerCase().includes(search) ||
          r.product_sku.toLowerCase().includes(search),
      );
    }

    const categories = (catRes.data ?? []) as TransactionCategory[];

    return (
      <div>
        <PageHeader
          title="Inventory · Pivot Lintas Lokasi"
          description="Stok akhir + aktivitas (oper in/out + tiap kategori pengeluaran) per lokasi × produk dalam rentang tanggal terpilih. Pilih satu lokasi untuk melihat detail batch + FIFO."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <LocationPicker
                locations={session.locations}
                selected={selectedLocation}
                includeAll={canSeeAll}
              />
              <ViewToggle view={view} loc="all" from={from} to={to} q={searchParams.q} />
            </div>
          }
        />

        <FiltersBar
          loc="all"
          from={from}
          to={to}
          q={searchParams.q ?? ""}
          view={view}
        />

        {pivotRes.error ? (
          <EmptyState
            title="Gagal memuat data"
            description={pivotRes.error.message}
          />
        ) : pivot.length === 0 ? (
          <EmptyState
            title="Tidak ada data"
            description="Belum ada produk aktif atau lokasi yang dapat ditampilkan."
          />
        ) : (
          <InventoryPivotTable rows={pivot} categories={categories} />
        )}
      </div>
    );
  }

  // Mode "detail" (single lokasi atau all-detail).
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
          <div className="flex flex-wrap items-center gap-2">
            <LocationPicker
              locations={session.locations}
              selected={selectedLocation}
              includeAll={canSeeAll}
            />
            {isAllMode && (
              <ViewToggle view={view} loc="all" from={from} to={to} q={searchParams.q} />
            )}
          </div>
        }
      />

      <FiltersBar
        loc={selectedLocation ?? ""}
        from={from}
        to={to}
        q={searchParams.q ?? ""}
        view={view}
      />

      {/* === MODE: SEMUA LOKASI - DETAIL BATCH === */}
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

function ViewToggle({
  view,
  loc,
  from,
  to,
  q,
}: {
  view: "pivot" | "detail";
  loc: string;
  from: string;
  to: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (loc) params.set("loc", loc);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (q) params.set("q", q);

  const pivotHref = (() => {
    const sp = new URLSearchParams(params);
    sp.set("view", "pivot");
    return `/inventory?${sp.toString()}`;
  })();
  const detailHref = (() => {
    const sp = new URLSearchParams(params);
    sp.set("view", "detail");
    return `/inventory?${sp.toString()}`;
  })();

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
      <Link
        href={pivotHref}
        className={clsx(
          "px-3 py-1.5",
          view === "pivot"
            ? "bg-brand-600 text-white"
            : "text-slate-600 hover:bg-slate-50",
        )}
      >
        Pivot
      </Link>
      <Link
        href={detailHref}
        className={clsx(
          "border-l border-slate-200 px-3 py-1.5",
          view === "detail"
            ? "bg-brand-600 text-white"
            : "text-slate-600 hover:bg-slate-50",
        )}
      >
        Detail Batch
      </Link>
    </div>
  );
}

function FiltersBar({
  loc,
  from,
  to,
  q,
  view,
}: {
  loc: string;
  from: string;
  to: string;
  q: string;
  view: "pivot" | "detail";
}) {
  const isAll = loc === "all";
  return (
    <form className="mb-4 flex flex-wrap items-end gap-3" method="GET">
      <input type="hidden" name="loc" value={loc} />
      <input type="hidden" name="view" value={view} />
      {isAll && (
        <>
          <div>
            <label className="label">Dari Tanggal</label>
            <input type="date" name="from" defaultValue={from} className="input" />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              min={from}
              className="input"
            />
          </div>
        </>
      )}
      <div className="flex-1 min-w-[12rem]">
        <label className="label">Cari produk</label>
        <input
          name="q"
          defaultValue={q}
          placeholder="Nama atau SKU..."
          className="input"
        />
      </div>
      <button type="submit" className="btn-secondary">
        Terapkan
      </button>
    </form>
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
