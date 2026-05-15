import {
  CardSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-9 w-full max-w-md" />
      <div className="space-y-4">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
        <CardSkeleton rows={3} />
      </div>
    </div>
  );
}
