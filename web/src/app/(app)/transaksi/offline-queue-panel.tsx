"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  listQueue,
  removeQueueItem,
  subscribeQueue,
  type QueuedTransaction,
} from "@/lib/offline/queue";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { formatDateTime, formatNumber } from "@/lib/format";

export function OfflineQueuePanel() {
  const [items, setItems] = useState<QueuedTransaction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function load() {
    setItems(await listQueue());
  }

  useEffect(() => {
    load();
    const off = subscribeQueue(load);
    return off;
  }, []);

  async function retry(item: QueuedTransaction) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast("Anda masih offline.", "info");
      return;
    }
    setBusy(item.client_uuid);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("transaction_create", {
      p_location_id: item.payload.p_location_id,
      p_category_id: item.payload.p_category_id,
      p_items: item.payload.p_items,
      p_notes: item.payload.p_notes ?? null,
      p_client_uuid: item.client_uuid,
    });
    setBusy(null);
    const replay = (data as unknown as { idempotent_replay?: boolean })?.idempotent_replay;
    if (error && !replay) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    await removeQueueItem(item.client_uuid);
    toast("Transaksi tersinkron.", "success");
    router.refresh();
    load();
  }

  async function discard(item: QueuedTransaction) {
    if (!confirm("Hapus item antrean ini? Transaksi tidak akan dikirim ke server.")) {
      return;
    }
    await removeQueueItem(item.client_uuid);
    toast("Item antrean dihapus.", "info");
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-amber-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Antrean Offline
          </h2>
        </div>
        <span className="badge-slate">{items.length}</span>
      </div>
      <div className="card-body space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tidak ada transaksi yang menunggu sinkronisasi.
          </p>
        ) : (
          items.map((q) => {
            const totalQty = q.payload.p_items.reduce((s, it) => s + it.qty, 0);
            return (
              <div
                key={q.client_uuid}
                className="rounded-lg border border-slate-200 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      Pengeluaran · {formatNumber(totalQty)} unit
                    </p>
                    <p className="text-xs text-slate-500">
                      Dibuat {formatDateTime(new Date(q.enqueued_at).toISOString())}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      {q.client_uuid}
                    </p>
                    {q.last_error && (
                      <p className="mt-1 text-xs text-red-600">
                        Gagal: {q.last_error}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retry(q)}
                    className="btn-secondary text-xs"
                    disabled={busy === q.client_uuid}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Kirim sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => discard(q)}
                    className="btn-ghost text-xs text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
