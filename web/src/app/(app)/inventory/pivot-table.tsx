import clsx from "clsx";
import { formatNumber, locationTypeLabel } from "@/lib/format";
import type {
  AppLocation,
  TransactionCategory,
} from "@/lib/supabase/types";

/**
 * Long-format row dari RPC public.inventory_pivot.
 * Satu baris = (lokasi × produk × kategori).
 */
export type PivotLongRow = {
  location_id: string;
  location_name: string;
  location_type: AppLocation["type"];
  product_id: string;
  product_sku: string;
  product_name: string;
  product_unit: string;
  category_code: string;
  category_name: string;
  category_sort: number;
  qty: number;
};

/** Definisi kolom metric yang muncul per lokasi. */
type Metric = {
  code: string;
  label: string;
  hClass: string;
  isStockEnd?: boolean; // highlight khusus stok akhir
};

/**
 * Susun kolom metric. Selalu ada Oper In / Oper Out / Stok Akhir; di antaranya
 * kategori dinamis dari tabel transaction_categories (urut sort_order).
 */
function buildMetrics(categories: TransactionCategory[]): Metric[] {
  // Palet warna dirotasi untuk kategori dinamis.
  const palette = [
    "bg-teal-700 text-white",
    "bg-orange-400 text-orange-950",
    "bg-rose-700 text-white",
    "bg-stone-500 text-white",
    "bg-stone-700 text-white",
    "bg-violet-700 text-white",
    "bg-emerald-700 text-white",
    "bg-fuchsia-700 text-white",
  ];

  const metrics: Metric[] = [
    { code: "__oper_in__",  label: "oper in",  hClass: "bg-blue-600 text-white" },
    { code: "__oper_out__", label: "oper out", hClass: "bg-rose-300 text-rose-900" },
  ];

  categories
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .forEach((c, i) => {
      metrics.push({
        code: c.code,
        label: c.name.toLowerCase(),
        hClass: palette[i % palette.length],
      });
    });

  metrics.push({
    code: "__akhir__",
    label: "stok akhir",
    hClass: "bg-amber-500 text-amber-950",
    isStockEnd: true,
  });

  return metrics;
}

type Props = {
  rows: PivotLongRow[];
  categories: TransactionCategory[];
  /** Code kategori yang dipakai untuk subtitle "TERJUAL N" di header lokasi. */
  highlightCategoryCode?: string;
};

export function InventoryPivotTable({
  rows,
  categories,
  highlightCategoryCode = "penjualan",
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Belum ada data untuk ditampilkan.
      </p>
    );
  }

  const metrics = buildMetrics(categories);

  // Kumpulkan produk & lokasi unik.
  const productMap = new Map<
    string,
    { id: string; sku: string; name: string; unit: string }
  >();
  const locationMap = new Map<
    string,
    { id: string; name: string; type: AppLocation["type"] }
  >();
  for (const r of rows) {
    if (!productMap.has(r.product_id)) {
      productMap.set(r.product_id, {
        id: r.product_id,
        sku: r.product_sku,
        name: r.product_name,
        unit: r.product_unit,
      });
    }
    if (!locationMap.has(r.location_id)) {
      locationMap.set(r.location_id, {
        id: r.location_id,
        name: r.location_name,
        type: r.location_type,
      });
    }
  }

  const products = [...productMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const locations = [...locationMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Lookup map[locId|prodId|catCode] → qty
  const lookup = new Map<string, number>();
  for (const r of rows) {
    lookup.set(
      `${r.location_id}|${r.product_id}|${r.category_code}`,
      Number(r.qty ?? 0),
    );
  }

  // Total kategori highlight per lokasi (mis. Penjualan).
  const sumHighlightPerLoc = new Map<string, number>();
  for (const l of locations) {
    let sum = 0;
    for (const p of products) {
      sum += lookup.get(`${l.id}|${p.id}|${highlightCategoryCode}`) ?? 0;
    }
    sumHighlightPerLoc.set(l.id, sum);
  }

  const highlightLabel =
    categories.find((c) => c.code === highlightCategoryCode)?.name ??
    highlightCategoryCode;

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-max border-collapse text-xs">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-20 min-w-[14rem] border-b-2 border-r border-slate-300 bg-amber-100 px-3 py-2 text-left font-bold uppercase text-amber-950"
            >
              Nama Produk
            </th>
            {locations.map((l, idx) => (
              <th
                key={l.id}
                colSpan={metrics.length}
                className={clsx(
                  "border-r-2 border-slate-200 px-2 py-2 text-center text-base font-extrabold uppercase tracking-wide text-white",
                  idx % 2 === 0 ? "bg-rose-700" : "bg-rose-900",
                )}
              >
                <div className="flex items-center justify-center gap-3">
                  <span>{l.name}</span>
                  <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-950">
                    {highlightLabel}{" "}
                    {formatNumber(sumHighlightPerLoc.get(l.id) ?? 0)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-100">
                  {locationTypeLabel[l.type]}
                </p>
              </th>
            ))}
          </tr>

          <tr>
            {locations.map((l) =>
              metrics.map((m, i) => (
                <th
                  key={`${l.id}-${m.code}`}
                  className={clsx(
                    "border-b border-l border-slate-300 px-2 py-1 text-center text-[10px] font-bold uppercase",
                    m.hClass,
                    i === metrics.length - 1 && "border-r-2",
                  )}
                  title={m.label}
                >
                  {m.label}
                </th>
              )),
            )}
          </tr>
        </thead>

        <tbody>
          {products.map((p, pi) => (
            <tr key={p.id} className={clsx(pi % 2 === 1 && "bg-slate-50/60")}>
              <td className="sticky left-0 z-10 min-w-[14rem] border-r border-slate-200 bg-amber-50 px-3 py-1.5 font-semibold text-slate-900">
                {p.name}
                <span className="ml-2 font-mono text-[10px] font-normal text-slate-500">
                  {p.sku}
                </span>
              </td>
              {locations.map((l) =>
                metrics.map((m, i) => {
                  const v = lookup.get(`${l.id}|${p.id}|${m.code}`) ?? 0;
                  const isLast = i === metrics.length - 1;
                  return (
                    <td
                      key={`${l.id}-${p.id}-${m.code}`}
                      className={clsx(
                        "border-l border-slate-200 px-2 py-1.5 text-center tabular-nums",
                        isLast && "border-r-2 font-semibold text-slate-900",
                        v === 0 && !isLast && "text-slate-300",
                        m.isStockEnd && v === 0 && "bg-rose-50 text-rose-700",
                      )}
                    >
                      {v === 0 ? (m.isStockEnd ? "0" : "") : formatNumber(v)}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
