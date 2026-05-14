import clsx from "clsx";
import { formatNumber, locationTypeLabel } from "@/lib/format";
import type { AppLocation } from "@/lib/supabase/types";

export type PivotRow = {
  location_id: string;
  location_name: string;
  location_type: AppLocation["type"];
  product_id: string;
  product_sku: string;
  product_name: string;
  product_unit: string;
  qty_akhir: number;
  qty_oper_in: number;
  qty_oper_out: number;
  qty_terjual: number;
  qty_retur: number;
  qty_comp: number;
  qty_rusak: number;
  qty_lainnya: number;
};

type Metric = {
  key:
    | "qty_oper_in"
    | "qty_oper_out"
    | "qty_terjual"
    | "qty_retur"
    | "qty_comp"
    | "qty_rusak"
    | "qty_lainnya"
    | "qty_akhir";
  label: string;
  /** style header sel */
  hClass: string;
  /** style cell value */
  cClass?: string;
};

const METRICS: Metric[] = [
  { key: "qty_oper_in",  label: "oper in",   hClass: "bg-blue-600 text-white" },
  { key: "qty_oper_out", label: "oper out",  hClass: "bg-rose-300 text-rose-900" },
  { key: "qty_terjual",  label: "terjual",   hClass: "bg-teal-700 text-white" },
  { key: "qty_retur",    label: "retur",     hClass: "bg-orange-400 text-orange-950" },
  { key: "qty_comp",     label: "comp",      hClass: "bg-rose-700 text-white" },
  { key: "qty_rusak",    label: "rusak",     hClass: "bg-stone-500 text-white" },
  { key: "qty_lainnya",  label: "lainnya",   hClass: "bg-stone-700 text-white" },
  { key: "qty_akhir",    label: "stok akhir",hClass: "bg-amber-500 text-amber-950" },
];

export function InventoryPivotTable({ rows }: { rows: PivotRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Belum ada data untuk ditampilkan.
      </p>
    );
  }

  // Susun: produk unik (rows) × lokasi (group of metric columns).
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

  const lookup = new Map<string, PivotRow>();
  for (const r of rows) {
    lookup.set(`${r.location_id}|${r.product_id}`, r);
  }

  // Total terjual per lokasi (subtitle "TERJUAL N BOX").
  const sumTerjualPerLoc = new Map<string, number>();
  for (const l of locations) {
    let sum = 0;
    for (const p of products) {
      const cell = lookup.get(`${l.id}|${p.id}`);
      sum += cell?.qty_terjual ?? 0;
    }
    sumTerjualPerLoc.set(l.id, sum);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          {/* Baris 1: nama lokasi + total terjual */}
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
                colSpan={METRICS.length}
                className={clsx(
                  "border-r-2 border-slate-200 px-2 py-2 text-center text-base font-extrabold uppercase tracking-wide text-white",
                  idx % 2 === 0 ? "bg-rose-700" : "bg-rose-900",
                )}
              >
                <div className="flex items-center justify-center gap-3">
                  <span>{l.name}</span>
                  <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-950">
                    Terjual {formatNumber(sumTerjualPerLoc.get(l.id) ?? 0)} box
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-100">
                  {locationTypeLabel[l.type]}
                </p>
              </th>
            ))}
          </tr>

          {/* Baris 2: kolom metrik per lokasi */}
          <tr>
            {locations.map((l) =>
              METRICS.map((m, i) => (
                <th
                  key={`${l.id}-${m.key}`}
                  className={clsx(
                    "border-b border-l border-slate-300 px-2 py-1 text-center text-[10px] font-bold uppercase",
                    m.hClass,
                    i === METRICS.length - 1 && "border-r-2",
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
            <tr
              key={p.id}
              className={clsx(pi % 2 === 1 && "bg-slate-50/60")}
            >
              <td className="sticky left-0 z-10 min-w-[14rem] border-r border-slate-200 bg-amber-50 px-3 py-1.5 font-semibold text-slate-900">
                {p.name}
                <span className="ml-2 font-mono text-[10px] font-normal text-slate-500">
                  {p.sku}
                </span>
              </td>
              {locations.map((l) => {
                const cell = lookup.get(`${l.id}|${p.id}`);
                return METRICS.map((m, i) => {
                  const v = cell ? cell[m.key] : 0;
                  const isLast = i === METRICS.length - 1;
                  return (
                    <td
                      key={`${l.id}-${p.id}-${m.key}`}
                      className={clsx(
                        "border-l border-slate-200 px-2 py-1.5 text-center tabular-nums",
                        isLast && "border-r-2 font-semibold text-slate-900",
                        v === 0 && !isLast && "text-slate-300",
                        isLast && v === 0 && "bg-rose-50 text-rose-700",
                      )}
                    >
                      {v === 0 ? (isLast ? "0" : "") : formatNumber(v)}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
