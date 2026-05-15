import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="max-w-xl">
        <CardSkeleton rows={5} />
      </div>
    </div>
  );
}
