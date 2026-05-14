"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { transactionTypeLabel } from "@/lib/format";
import type { TransactionType } from "@/lib/supabase/types";

const TYPE_OPTIONS: TransactionType[] = [
  "penjualan",
  "complaiment",
  "retur",
  "rusak",
  "lainnya",
];

export function TransaksiFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState(params.get("type") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");

  // Sinkronkan ke URL (debounced).
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      const setOrDel = (k: string, v: string) => {
        if (v) next.set(k, v);
        else next.delete(k);
      };
      setOrDel("type", type);
      setOrDel("from", from);
      setOrDel("to", to);
      setOrDel("q", q);
      startTransition(() => {
        router.replace(`/transaksi?${next.toString()}`);
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, from, to, q]);

  function clearAll() {
    setType("");
    setFrom("");
    setTo("");
    setQ("");
  }

  const hasFilter = !!(type || from || to || q);

  return (
    <div className="card mb-4">
      <div className="card-body grid grid-cols-1 gap-3 md:grid-cols-5">
        <div>
          <label className="label">Tipe</label>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Semua</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {transactionTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Dari Tanggal</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Sampai Tanggal</label>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from || undefined}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Cari (no. transaksi / catatan)</label>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="TX-2026..., produksi pagi, dst."
          />
        </div>
      </div>
      <div className="card-footer flex items-center justify-end gap-2 px-4 pb-3">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {hasFilter && (
          <button
            type="button"
            className="btn-ghost text-slate-600"
            onClick={clearAll}
            aria-label="Reset filter"
          >
            <X className="h-4 w-4" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
