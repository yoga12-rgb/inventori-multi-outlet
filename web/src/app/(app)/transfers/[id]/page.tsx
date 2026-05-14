import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TransferStatusBadge } from "@/components/ui/status-badge";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { TransferRecord, TransferItemRecord } from "@/lib/supabase/types";
import { TransferActions } from "./actions";

export default async function TransferDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSession();
  const supabase = getSupabaseServerClient();
  const { data: header } = await supabase
    .from("transfers")
    .select(
      "id, transfer_number, from_location_id, to_location_id, status, notes, sent_at, received_at, cancelled_at, created_at, from_location:locations!transfers_from_location_id_fkey(id, name, type, is_active), to_location:locations!transfers_to_location_id_fkey(id, name, type, is_active)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!header) notFound();

  const { data: itemsRaw } = await supabase
    .from("transfer_items")
    .select(
      "id, transfer_id, product_id, source_batch_id, production_date, expired_date, qty, product:products(id, sku, name, unit, is_active)"
    )
    .eq("transfer_id", params.id);

  const transfer = header as unknown as TransferRecord;
  const items = (itemsRaw ?? []) as unknown as (TransferItemRecord & {
    product?: { id: string; name: string; sku: string };
  })[];

  const totalQty = items.reduce((s, it) => s + it.qty, 0);

  return (
    <div>
      <Link href="/transfers" className="btn-ghost mb-4 -ml-2 text-sm">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke daftar transfer
      </Link>

      <PageHeader
        title={transfer.transfer_number}
        description={transfer.notes ?? "Tidak ada catatan."}
        actions={
          <div className="flex items-center gap-3">
            <TransferStatusBadge status={transfer.status} />
            <TransferActions
              transferId={transfer.id}
              status={transfer.status}
            />
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Info label="Dari" value={transfer.from_location?.name ?? "-"} />
        <Info label="Ke" value={transfer.to_location?.name ?? "-"} />
        <Info label="Dikirim" value={formatDateTime(transfer.sent_at)} />
        <Info
          label={
            transfer.status === "completed"
              ? "Diterima"
              : transfer.status === "cancelled"
                ? "Dibatalkan"
                : "Status"
          }
          value={
            transfer.status === "completed"
              ? formatDateTime(transfer.received_at)
              : transfer.status === "cancelled"
                ? formatDateTime(transfer.cancelled_at)
                : "Menunggu penerimaan"
          }
        />
      </section>

      <section className="card mt-6">
        <div className="card-header">
          <h2 className="text-base font-semibold text-slate-900">Daftar Item</h2>
          <span className="badge-slate">
            Total {formatNumber(totalQty)} unit
          </span>
        </div>
        <div className="card-body">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Tanggal Produksi</th>
                  <th>Expired</th>
                  <th className="text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="font-medium text-slate-900">
                        {it.product?.name ?? "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {it.product?.sku}
                      </div>
                    </td>
                    <td>{formatDate(it.production_date)}</td>
                    <td>
                      {it.expired_date ? (
                        <span className="badge-yellow">
                          {formatDate(it.expired_date)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="text-right font-medium">
                      {formatNumber(it.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
