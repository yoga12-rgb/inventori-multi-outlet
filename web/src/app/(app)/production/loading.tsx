import {
  CardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <CardSkeleton rows={5} />
        <div className="xl:col-span-2">
          <TableSkeleton cols={4} rows={6} />
        </div>
      </div>
    </div>
  );
}
