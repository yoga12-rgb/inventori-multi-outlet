import Link from "next/link";
import { ArrowRight, Boxes, CalendarClock, ShoppingCart, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPicker } from "@/components/shell/location-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { TransferStatusBadge } from "@/components/ui/status-badge";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DashboardStockRow,
  IncomingTransferRow,
  TransferStatus,
} from "@/lib/supabase/types";
import { formatDate, formatNumber, timeAgo } from "@/lib/format";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";

type SearchParams = { loc?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const selectedLocation =
    searchParams.loc || session.defaultLocationId || session.locations[0]?.id || null;

  const [stockRes, incomingRes] = await Promise.all([
    supabase.rpc("dashboard_stock", {
      p_location_id: selectedLocation ?? undefined,
    }),
    supabase.rpc("dashboard_incoming_transfers", {
      p_location_id: selectedLocation ?? undefined,
    }),
  ]);

  const stocks = (stockRes.data ?? []) as DashboardStockRow[];
  const incoming = (incomingRes.data ?? []) as IncomingTransferRow[];

  const totalQty = stocks.reduce((sum, r) => sum + (r.qty_total || 0), 0);
  const totalProducts = stocks.length;
  const totalIncomingQty = incoming.reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const oldestProductionDate = stocks
    .map((r) => r.oldest_production_date)
    .filter(Boolean)
    .sort()
    .at(0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan stok lokasi dan barang yang sedang dalam perjalanan. Polling otomatis setiap 10 menit."
        actions={
          <LocationPicker
            locations={session.locations}
            selected={selectedLocation}
          />
        }
      />

      <DashboardAutoRefresh />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          label="Total Stok"
          value={formatNumber(totalQty)}
          hint={`${formatNumber(totalProducts)} produk aktif`}
        />
        <StatCard
          icon={<Truck className="h-5 w-5" />}
          label="In-Transit Masuk"
          value={formatNumber(incoming.length)}
          hint={`${formatNumber(totalIncomingQty)} unit menunggu`}
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Batch Tertua"
          value={oldestProductionDate ? formatDate(oldestProductionDate) : "-"}
          hint="Diutamakan oleh FIFO"
        />
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="Mulai Transaksi"
          value="Kasir"
          hint="Pengeluaran barang FIFO"
          action={
            <Link href="/kasir" className="btn-primary mt-2 w-full">
              Buka Kasir
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="card-header">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Stok per Produk
              </h2>
              <p className="text-xs text-slate-500">
                Disusun berdasarkan nama produk · sumber: <code>dashboard_stock</code>
              </p>
            </div>
            <Link href="/inventory" className="btn-ghost">
              Detail batch
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="card-body">
            {stocks.length === 0 ? (
              <EmptyState
                title="Belum ada stok"
                description="Lokasi ini belum memiliki batch dengan qty > 0."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th className="text-right">Qty Total</th>
                      <th className="text-right">Batch</th>
                      <th>Produksi Tertua</th>
                      <th>Expired Terdekat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.map((r) => (
                      <tr key={r.product_id}>
                        <td>
                          <div className="font-medium text-slate-900">
                            {r.product_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {r.product_sku}
                          </div>
                        </td>
                        <td className="text-right font-medium">
                          {formatNumber(r.qty_total)}
                        </td>
                        <td className="text-right">{formatNumber(r.batch_count)}</td>
                        <td>
                          {r.oldest_production_date ? (
                            formatDate(r.oldest_production_date)
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td>
                          {r.nearest_expired_date ? (
                            <span className="badge-yellow">
                              {formatDate(r.nearest_expired_date)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Barang Dalam Perjalanan
              </h2>
              <p className="text-xs text-slate-500">
                <code>dashboard_incoming_transfers</code>
              </p>
            </div>
            <Link href="/transfers" className="btn-ghost">
              Kelola
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="card-body space-y-3">
            {incoming.length === 0 ? (
              <EmptyState
                title="Tidak ada in-transit"
                description="Belum ada transfer aktif menuju lokasi ini."
                icon={Truck}
              />
            ) : (
              incoming.map((t) => (
                <Link
                  key={t.transfer_id}
                  href={`/transfers/${t.transfer_id}`}
                  className="block rounded-lg border border-slate-200 px-3 py-3 hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {t.transfer_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        Dari {t.from_location} · {timeAgo(t.sent_at)}
                      </p>
                    </div>
                    <TransferStatusBadge status={"in_transit" as TransferStatus} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      {formatNumber(Number(t.product_count))} produk · {" "}
                      {formatNumber(Number(t.total_qty))} unit
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-700">{icon}</span>
        <span className="text-xs uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}
