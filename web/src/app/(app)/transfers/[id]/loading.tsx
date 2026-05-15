import {
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-44" />
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-6">
        <TableSkeleton cols={4} rows={5} />
      </div>
    </div>
  );
}
