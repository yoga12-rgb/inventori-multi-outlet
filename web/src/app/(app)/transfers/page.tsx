import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPicker } from "@/components/shell/location-picker";
import { TransferStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { TransferRecord } from "@/lib/supabase/types";

export const metadata = { title: "Transfer · Mutasi Antar Lokasi" };

type SearchParams = { loc?: string };

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const selectedLocation =
    searchParams.loc || session.defaultLocationId || session.locations[0]?.id || null;

  const [incomingRes, outgoingRes] = await Promise.all([
    supabase
      .from("transfers")
      .select(
        "id, transfer_number, from_location_id, to_location_id, status, notes, sent_at, received_at, cancelled_at, created_at, from_location:locations!transfers_from_location_id_fkey(id, name, type, is_active), to_location:locations!transfers_to_location_id_fkey(id, name, type, is_active)"
      )
      .eq("to_location_id", selectedLocation ?? "")
      .order("sent_at", { ascending: false })
      .limit(30),
    supabase
      .from("transfers")
      .select(
        "id, transfer_number, from_location_id, to_location_id, status, notes, sent_at, received_at, cancelled_at, created_at, from_location:locations!transfers_from_location_id_fkey(id, name, type, is_active), to_location:locations!transfers_to_location_id_fkey(id, name, type, is_active)"
      )
      .eq("from_location_id", selectedLocation ?? "")
      .order("sent_at", { ascending: false })
      .limit(30),
  ]);

  const incoming = (incomingRes.data ?? []) as unknown as TransferRecord[];
  const outgoing = (outgoingRes.data ?? []) as unknown as TransferRecord[];

  return (
    <div>
      <PageHeader
        title="Mutasi / Transfer"
        description="Transfer barang antar lokasi memakai pola in-transit. Stok dipotong saat pengiriman dan ditambah ke tujuan saat diterima."
        actions={
          <div className="flex items-center gap-2">
            <LocationPicker
              locations={session.locations}
              selected={selectedLocation}
            />
            <Link href="/transfers/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              Transfer Baru
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TransferList
          title="Masuk"
          subtitle="Transfer menuju lokasi ini"
          icon={<ArrowDownToLine className="h-4 w-4" />}
          rows={incoming}
          direction="in"
        />
        <TransferList
          title="Keluar"
          subtitle="Transfer dari lokasi ini"
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          rows={outgoing}
          direction="out"
        />
      </div>
    </div>
  );
}

function TransferList({
  title,
  subtitle,
  icon,
  rows,
  direction,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: TransferRecord[];
  direction: "in" | "out";
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 p-1.5 text-slate-700">
            {icon}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className="badge-slate">{rows.length}</span>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <EmptyState
            title="Tidak ada transfer"
            description="Transfer akan muncul di sini setelah dibuat."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => {
              const partner =
                direction === "in" ? t.from_location?.name : t.to_location?.name;
              return (
                <li key={t.id}>
                  <Link
                    href={`/transfers/${t.id}`}
                    className="flex items-start justify-between gap-3 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-mono text-sm">{t.transfer_number}</p>
                      <p className="text-xs text-slate-500">
                        {direction === "in" ? "Dari" : "Ke"} {partner ?? "-"} ·{" "}
                        {formatDateTime(t.sent_at)}
                      </p>
                      {t.notes && (
                        <p className="mt-1 text-xs text-slate-500">{t.notes}</p>
                      )}
                    </div>
                    <TransferStatusBadge status={t.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
