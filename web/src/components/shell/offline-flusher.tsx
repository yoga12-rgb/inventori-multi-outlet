"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  listQueue,
  removeQueueItem,
  updateQueueItem,
  type QueuedTransaction,
} from "@/lib/offline/queue";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { useRouter } from "next/navigation";

// Mendengarkan event "online" dan menjadwalkan flush antrean transaksi.
export function OfflineFlusher() {
  const { toast } = useToast();
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    async function flush() {
      if (running.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      running.current = true;
      try {
        const supabase = getSupabaseBrowserClient();
        const items: QueuedTransaction[] = await listQueue();
        if (items.length === 0) return;

        let success = 0;
        let conflicts = 0;
        for (const it of items) {
          const { error, data } = await supabase.rpc("transaction_create", {
            p_location_id: it.payload.p_location_id,
            p_category_id: it.payload.p_category_id,
            p_items: it.payload.p_items,
            p_notes: it.payload.p_notes ?? null,
            p_client_uuid: it.client_uuid,
          });

          const replay = (data as unknown as { idempotent_replay?: boolean })?.idempotent_replay;
          if (!error || replay) {
            await removeQueueItem(it.client_uuid);
            success++;
          } else {
            const code = (error as { code?: string }).code;
            // Stok kurang / data invalid: jangan retry tanpa intervensi user.
            if (code === "P0001" || code === "22023" || code === "P0002") {
              await updateQueueItem({
                ...it,
                last_error: humanizeSupabaseError(error),
                retry_count: (it.retry_count || 0) + 1,
              });
              conflicts++;
            } else {
              // network/transient: simpan error tapi biarkan di antrean
              await updateQueueItem({
                ...it,
                last_error: humanizeSupabaseError(error),
                retry_count: (it.retry_count || 0) + 1,
              });
            }
          }
        }

        if (success > 0) {
          toast(`${success} transaksi tersinkron ke server.`, "success");
          router.refresh();
        }
        if (conflicts > 0) {
          toast(
            `${conflicts} transaksi gagal sinkron. Cek menu Transaksi → Antrean Offline.`,
            "error"
          );
        }
      } finally {
        running.current = false;
      }
    }

    flush();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const interval = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [router, toast]);

  return null;
}
