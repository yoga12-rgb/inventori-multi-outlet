import clsx from "clsx";
import { transferStatusLabel } from "@/lib/format";
import type { TransferStatus } from "@/lib/supabase/types";

const TRANSFER_CLASS: Record<TransferStatus, string> = {
  in_transit: "badge-yellow",
  completed: "badge-green",
  cancelled: "badge-red",
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span className={clsx(TRANSFER_CLASS[status])}>
      {transferStatusLabel[status]}
    </span>
  );
}
