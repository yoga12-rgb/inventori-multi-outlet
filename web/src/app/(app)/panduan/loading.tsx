import { CardSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_240px]">
        <div className="space-y-6">
          <CardSkeleton rows={5} />
          <CardSkeleton rows={5} />
          <CardSkeleton rows={5} />
        </div>
        <div className="hidden space-y-2 xl:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
