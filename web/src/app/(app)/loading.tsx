import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

// Skeleton dashboard (default untuk root /).
export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableSkeleton cols={5} rows={6} />
        </div>
        <TableSkeleton cols={2} rows={4} />
      </div>
    </div>
  );
}
