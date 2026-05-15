import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <TableSkeleton cols={3} rows={8} />
    </div>
  );
}
