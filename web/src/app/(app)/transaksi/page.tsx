import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPicker } from "@/components/shell/location-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, transactionTypeLabel } from "@/lib/format";
import { OfflineQueuePanel } from "./offline-queue-panel";
import { TransaksiFilters } from "./filters";
import type {
  TransactionRecord,
  TransactionItemRecord,
  TransactionType,
} from "@/lib/supabase/types";

export const metadata = { title: "Transaksi · Riwayat Pengeluaran" };

type SearchParams = {
  loc?: string;
  type?: string;
  from?: string;
  to?: string;
  q?: string;
};

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const selectedLocation =
    searchParams.loc || session.defaultLocationId || session.locations[0]?.id || null;

  const validTypes: TransactionType[] = [
    "penjualan",
    "complaiment",
    "retur",
    "rusak",
    "lainnya",
  ];
  const filterType =
    searchParams.type && (validTypes as string[]).includes(searchParams.type)
      ? (searchParams.type as TransactionType)
      : null;
  const filterFrom = searchParams.from?.trim() || null;
  const filterTo = searchParams.to?.trim() || null;
  const filterQ = searchParams.q?.trim() || null;

  let query = supabase
    .from("transactions")
    .select(
      "id, transaction_number, location_id, type, notes, created_at, location:locations(id, name, type, is_active), items:transaction_items(id, qty, product_id, batch_id, product:products(id, sku, name, unit, is_active))"
    )
    .eq("location_id", selectedLocation ?? "")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filterType) query = query.eq("type", filterType);
  if (filterFrom) query = query.gte("created_at", `${filterFrom}T00:00:00`);
  if (filterTo) query = query.lte("created_at", `${filterTo}T23:59:59.999`);
  if (filterQ) {
    query = query.or(
      `transaction_number.ilike.%${filterQ}%,notes.ilike.%${filterQ}%`
    );
  }

  const { data: rows } = await query;

  const transactions = (rows ?? []) as unknown as (TransactionRecord & {
    items: (TransactionItemRecord & {
      product?: { id: string; name: string; sku: string };
    })[];
  })[];

  return (
    <div>
      <PageHeader
        title="Riwayat Transaksi"
        description="Hingga 100 transaksi pengeluaran di lokasi yang dipilih, dengan filter tanggal, tipe, dan pencarian. Antrean offline ditampilkan di panel kanan."
        actions={
          <LocationPicker
            locations={session.locations}
            selected={selectedLocation}
          />
        }
      />

      <TransaksiFilters />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="card-body">
            {transactions.length === 0 ? (
              <EmptyState
                title="Belum ada transaksi"
                description="Transaksi pengeluaran akan tampil di sini setelah disimpan, atau filter tidak menemukan kecocokan."
                action={
                  <Link href="/kasir" className="btn-primary">
                    Buka Kasir
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>No. Transaksi</th>
                      <th>Tipe</th>
                      <th>Tanggal</th>
                      <th>Produk</th>
                      <th className="text-right">Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const totalQty = t.items.reduce((s, it) => s + it.qty, 0);
                      const productNames = Array.from(
                        new Set(t.items.map((i) => i.product?.name).filter(Boolean))
                      );
                      return (
                        <tr key={t.id}>
                          <td>
                            <span className="font-mono text-xs">
                              {t.transaction_number}
                            </span>
                            {t.notes && (
                              <p className="text-xs text-slate-500">{t.notes}</p>
                            )}
                          </td>
                          <td>
                            <span className="badge-blue">
                              {transactionTypeLabel[t.type]}
                            </span>
                          </td>
                          <td>{formatDateTime(t.created_at)}</td>
                          <td className="max-w-xs truncate">
                            {productNames.join(", ") || "-"}
                          </td>
                          <td className="text-right font-medium">
                            {formatNumber(totalQty)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div>
          <OfflineQueuePanel />
        </div>
      </div>
    </div>
  );
}
