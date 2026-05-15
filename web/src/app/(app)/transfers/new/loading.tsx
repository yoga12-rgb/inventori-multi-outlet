import {
  CardSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="card mb-6">
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
      <CardSkeleton rows={5} />
      <div className="mt-4 flex justify-end">
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}
