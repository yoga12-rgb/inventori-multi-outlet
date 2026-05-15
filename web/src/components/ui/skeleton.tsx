import clsx from "clsx";

type Props = {
  className?: string;
  /** Atur false untuk mematikan animasi shimmer (mis. di banyak baris tabel). */
  animate?: boolean;
};

/**
 * Placeholder berwarna abu-abu yang berdenyut. Dipakai sebagai bahan dasar
 * untuk skeleton di halaman loading.
 */
export function Skeleton({ className, animate = true }: Props) {
  return (
    <span
      aria-hidden
      className={clsx(
        "block rounded-md bg-slate-200/70",
        animate && "animate-pulse",
        className,
      )}
    />
  );
}

/** Skeleton placeholder untuk header halaman (judul + deskripsi). */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** Skeleton kartu generik. */
export function CardSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={clsx("card", className)}>
      <div className="card-header">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="card-body space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton tabel sederhana. */
export function TableSkeleton({
  cols = 4,
  rows = 6,
}: {
  cols?: number;
  rows?: number;
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="overflow-hidden rounded-md border border-slate-100">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {Array.from({ length: cols }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Grid kartu statistik (mis. dashboard). */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="mt-4 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
