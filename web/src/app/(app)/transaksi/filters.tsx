"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { TransactionCategory } from "@/lib/supabase/types";

type Props = {
  categories: TransactionCategory[];
};

export function TransaksiFilters({ categories }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Backward-compat: dulu memakai param `type` (enum code). Sekarang `category`
  // (UUID). Kalau URL lama masih membawa `type`, biarkan kosong (form tidak
  // mengisi otomatis ke UUID — user perlu memilih ulang).
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      const setOrDel = (k: string, v: string) => {
        if (v) next.set(k, v);
        else next.delete(k);
      };
      setOrDel("category", category);
      setOrDel("from", from);
      setOrDel("to", to);
      setOrDel("q", q);
      next.delete("type"); // bersihkan param lama
      startTransition(() => {
        router.replace(`/transaksi?${next.toString()}`);
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, from, to, q]);

  function clearAll() {
    setCategory("");
    setFrom("");
    setTo("");
    setQ("");
  }

  const hasFilter = !!(category || from || to || q);

  return (
    <div className="card mb-4">
      <div className="card-body grid grid-cols-1 gap-3 md:grid-cols-5">
        <div>
          <label className="label">Kategori</label>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Semua</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
