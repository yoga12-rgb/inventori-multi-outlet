"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import type { TransferStatus } from "@/lib/supabase/types";

type Props = {
  transferId: string;
  status: TransferStatus;
};

export function TransferActions({ transferId, status }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"receive" | "cancel" | null>(null);

  if (status !== "in_transit") return null;
  const supabase = getSupabaseBrowserClient();

  async function receive() {
    setBusy("receive");
    const { error } = await supabase.rpc("transfer_receive", {
      p_transfer_id: transferId,
    });
    setBusy(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast("Transfer diterima. Stok tujuan diperbarui.", "success");
    router.refresh();
  }

  async function cancel() {
    if (!confirm("Batalkan transfer ini? Stok akan dikembalikan ke lokasi asal.")) {
      return;
    }
    setBusy("cancel");
    const { error } = await supabase.rpc("transfer_cancel", {
      p_transfer_id: transferId,
    });
    setBusy(null);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    toast("Transfer dibatalkan dan stok dikembalikan.", "info");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button onClick={receive} className="btn-primary" disabled={busy !== null}>
        {busy === "receive" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Terima Barang
      </button>
      <button onClick={cancel} className="btn-secondary text-red-600" disabled={busy !== null}>
        {busy === "cancel" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
        Batalkan
      </button>
    </div>
  );
}
