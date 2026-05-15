import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
        <CardSkeleton rows={3} />
      </div>
    </div>
  );
}
