"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TransferStatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/errors";
import type { TransferRecord } from "@/lib/supabase/types";

type ItemRow = {
  id: string;
  qty: number;
  production_date: string;
  expired_date: string | null;
  product_name: string;
  product_sku: string;
};

type Props = {
  transfer: TransferRecord;
  direction: "in" | "out";
};

// Cache lintas-komponen (per page load) supaya hover berulang tidak fetch ulang.
const cache = new Map<string, ItemRow[]>();
const inflight = new Map<string, Promise<ItemRow[]>>();

async function loadItems(transferId: string): Promise<ItemRow[]> {
  const cached = cache.get(transferId);
  if (cached) return cached;
  const existing = inflight.get(transferId);
  if (existing) return existing;

  const supabase = getSupabaseBrowserClient();
  const promise = (async () => {
    const { data, error } = await supabase
      .from("transfer_items")
      .select(
        "id, qty, production_date, expired_date, product:products(name, sku)"
      )
      .eq("transfer_id", transferId);
    if (error) throw error;
    const rows = ((data ?? []) as unknown as Array<{
      id: string;
      qty: number;
      production_date: string;
      expired_date: string | null;
      product?: { name: string; sku: string } | null;
    }>).map((r) => ({
      id: r.id,
      qty: r.qty,
      production_date: r.production_date,
      expired_date: r.expired_date,
      product_name: r.product?.name ?? "-",
      product_sku: r.product?.sku ?? "-",
    }));
    cache.set(transferId, rows);
    return rows;
  })();

  inflight.set(transferId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(transferId);
  }
}

// Estimasi tinggi popover untuk perhitungan flip.
// Header (~36px) + max-h-72 (288px) + padding/border ≈ 340px.
const POPOVER_ESTIMATED_HEIGHT = 340;

export function TransferRow({ transfer, direction }: Props) {
  const partner =
    direction === "in"
      ? transfer.from_location?.name
      : transfer.to_location?.name;

  const liRef = useRef<HTMLLIElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  // Tentukan apakah popover muat di bawah row; kalau tidak, flip ke atas.
  useLayoutEffect(() => {
    if (!open || !liRef.current) return;
    const compute = () => {
      const rect = liRef.current!.getBoundingClientRect();
      const popoverEl = popoverRef.current;
      const measured = popoverEl?.offsetHeight ?? POPOVER_ESTIMATED_HEIGHT;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < measured && spaceAbove > spaceBelow) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, items, loading]);

  function show() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (enterTimer.current || open) return;
    enterTimer.current = setTimeout(async () => {
      enterTimer.current = null;
      setOpen(true);
      const cached = cache.get(transfer.id);
      if (cached) {
        setItems(cached);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await loadItems(transfer.id);
        setItems(data);
      } catch (err) {
        setError(humanizeSupabaseError(err));
      } finally {
        setLoading(false);
      }
    }, 180);
  }

  function hide() {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      setOpen(false);
    }, 120);
  }

  const totalQty = items?.reduce((s, r) => s + r.qty, 0) ?? 0;
  const productCount = items
    ? new Set(items.map((r) => r.product_sku)).size
    : 0;

  return (
    <li
      ref={liRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Link
        href={`/transfers/${transfer.id}`}
        className="flex items-start justify-between gap-3 py-3 hover:bg-slate-50"
        aria-describedby={open ? `tr-pop-${transfer.id}` : undefined}
      >
        <div>
          <p className="font-mono text-sm">{transfer.transfer_number}</p>
          <p className="text-xs text-slate-500">
            {direction === "in" ? "Dari" : "Ke"} {partner ?? "-"} ·{" "}
            {formatDateTime(transfer.sent_at)}
          </p>
          {transfer.notes && (
            <p className="mt-1 text-xs text-slate-500">{transfer.notes}</p>
          )}
        </div>
        <TransferStatusBadge status={transfer.status} />
      </Link>

      {open && (
        // Wrapper popover:
        //   - posisi absolute relatif terhadap <li>
        //   - padding (pt-1 / pb-1) bertindak sebagai "hover bridge" supaya
        //     gap visual antara row dan popover tetap masuk dalam hit-test
        //     elemen ini, mencegah mouseleave terpicu saat kursor melintas.
        //   - TIDAK lagi memakai pointer-events-none: popover sendiri jadi
        //     hit target, sehingga hover di area popover dianggap masih
        //     berada di dalam <li> (karena popover adalah turunannya) dan
        //     popover tidak hilang-timbul, terutama untuk row paling bawah.
        <div
          className={clsx(
            "absolute left-2 right-2 z-30 sm:left-auto sm:right-0 sm:w-96",
            placement === "bottom"
              ? "top-full pt-1"
              : "bottom-full pb-1"
          )}
        >
          <div
            ref={popoverRef}
            id={`tr-pop-${transfer.id}`}
            role="tooltip"
            className="origin-top rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Package className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Daftar Produk
                </span>
              </div>
              {items && (
                <span className="badge-slate">
                  {formatNumber(productCount)} produk · {formatNumber(totalQty)} unit
                </span>
              )}
            </div>

            {loading && (
              <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat detail item...
              </div>
            )}

            {error && (
              <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                {error}
              </p>
            )}

            {items && items.length === 0 && !loading && (
              <p className="text-xs text-slate-500">
                Transfer ini tidak memiliki item.
              </p>
            )}

            {items && items.length > 0 && (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {r.product_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.product_sku} · Produksi{" "}
                        {formatDate(r.production_date)}
                        {r.expired_date
                          ? ` · Exp ${formatDate(r.expired_date)}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {formatNumber(r.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
