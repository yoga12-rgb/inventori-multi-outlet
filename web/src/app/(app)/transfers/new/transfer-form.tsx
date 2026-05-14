"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { formatDate, formatNumber, locationTypeLabel } from "@/lib/format";
import type {
  AppLocation,
  AppProduct,
  InventoryBatch,
} from "@/lib/supabase/types";

type Props = {
  locations: AppLocation[];
  products: AppProduct[];
  initialFromLocationId: string | null;
  initialBatches: InventoryBatch[];
};

type Line = {
  rowId: string;
  batch_id: string;
  qty: number;
};

export function TransferForm({
  locations,
  products,
  initialFromLocationId,
  initialBatches,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [fromLocationId, setFromLocationId] = useState(
    initialFromLocationId ?? ""
  );
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [batches, setBatches] = useState<InventoryBatch[]>(initialBatches);
  const [items, setItems] = useState<Line[]>([
    { rowId: crypto.randomUUID(), batch_id: "", qty: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );
  const batchMap = useMemo(
    () => Object.fromEntries(batches.map((b) => [b.id, b])),
    [batches]
  );

  // Refresh batches kalau lokasi asal berubah.
  useEffect(() => {
    if (!fromLocationId) {
      setBatches([]);
      return;
    }
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(
          "id, product_id, location_id, production_date, expired_date, qty_available"
        )
        .eq("location_id", fromLocationId)
        .gt("qty_available", 0)
        .order("production_date", { ascending: true });
      if (cancel) return;
      if (error) {
        toast(humanizeSupabaseError(error), "error");
        setBatches([]);
        return;
      }
      setBatches((data ?? []) as InventoryBatch[]);
    })();
    return () => {
      cancel = true;
    };
  }, [fromLocationId, supabase, toast]);

  function addRow() {
    setItems((prev) => [
      ...prev,
      { rowId: crypto.randomUUID(), batch_id: "", qty: 1 },
    ]);
  }
  function removeRow(rowId: string) {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((x) => x.rowId !== rowId)
    );
  }
  function updateRow(rowId: string, patch: Partial<Line>) {
    setItems((prev) =>
      prev.map((it) => (it.rowId === rowId ? { ...it, ...patch } : it))
    );
  }

  function validate(): string | null {
    if (!fromLocationId) return "Pilih lokasi asal.";
    if (!toLocationId) return "Pilih lokasi tujuan.";
    if (fromLocationId === toLocationId)
      return "Lokasi asal & tujuan tidak boleh sama.";
    if (items.length === 0) return "Minimal satu item.";
    const seen = new Map<string, number>();
    for (const it of items) {
      if (!it.batch_id) return "Pilih batch untuk semua baris.";
      if (it.qty <= 0) return "Qty harus > 0.";
      const stock = batchMap[it.batch_id];
      if (!stock) return "Batch tidak valid.";
      const accumulated = (seen.get(it.batch_id) ?? 0) + it.qty;
      if (accumulated > stock.qty_available) {
        return `Total qty pada batch ${formatDate(stock.production_date)} (${accumulated}) melebihi stok (${stock.qty_available}).`;
      }
      seen.set(it.batch_id, accumulated);
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast(err, "error");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("transfer_send", {
      p_from_location_id: fromLocationId,
      p_to_location_id: toLocationId,
      p_items: items.map((i) => ({ batch_id: i.batch_id, qty: i.qty })),
      p_notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }
    const transferId = (data as { transfer_id?: string })?.transfer_id;
    toast("Transfer terkirim. Status: In-Transit.", "success");
    router.replace(transferId ? `/transfers/${transferId}` : "/transfers");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card">
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">Lokasi Asal</label>
            <select
              className="input"
              value={fromLocationId}
              onChange={(e) => {
                setFromLocationId(e.target.value);
                setItems([
                  { rowId: crypto.randomUUID(), batch_id: "", qty: 1 },
                ]);
              }}
              required
            >
              <option value="">Pilih lokasi...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {locationTypeLabel[l.type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Lokasi Tujuan</label>
            <select
              className="input"
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              required
            >
              <option value="">Pilih lokasi...</option>
              {locations
                .filter((l) => l.id !== fromLocationId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {locationTypeLabel[l.type]}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Catatan (opsional)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mis. pengiriman pagi"
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-slate-900">Item Transfer</h2>
          <button type="button" onClick={addRow} className="btn-secondary">
            <Plus className="h-4 w-4" />
            Tambah Baris
          </button>
        </div>
        <div className="card-body">
          {batches.length === 0 && (
            <p className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Lokasi asal belum memiliki batch dengan stok &gt; 0. Pilih lokasi asal lain
              (mis. <strong>Gudang Pusat</strong>) atau lakukan transfer masuk dulu.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch (Produk · Tanggal Produksi)</th>
                  <th>Expired</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Qty Kirim</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const batch = batchMap[it.batch_id];
                  const product = batch
                    ? productMap[batch.product_id]
                    : undefined;
                  return (
                    <tr key={it.rowId}>
                      <td>
                        <select
                          className="input"
                          value={it.batch_id}
                          onChange={(e) =>
                            updateRow(it.rowId, { batch_id: e.target.value })
                          }
                          required
                        >
                          <option value="">Pilih batch...</option>
                          {batches.map((b) => {
                            const p = productMap[b.product_id];
                            return (
                              <option key={b.id} value={b.id}>
                                {p?.name ?? "-"} ({p?.sku ?? "-"}) ·{" "}
                                {formatDate(b.production_date)} · stok{" "}
                                {formatNumber(b.qty_available)}
                              </option>
                            );
                          })}
                        </select>
                        {product && (
                          <p className="mt-1 text-xs text-slate-500">
                            {product.name}
                          </p>
                        )}
                      </td>
                      <td>
                        {batch?.expired_date ? (
                          <span className="badge-yellow">
                            {formatDate(batch.expired_date)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="text-right">
                        {batch ? formatNumber(batch.qty_available) : "-"}
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min={1}
                          max={batch?.qty_available ?? undefined}
                          className="input w-24 text-right"
                          value={it.qty}
                          onChange={(e) =>
                            updateRow(it.rowId, {
                              qty: Math.max(1, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost text-red-600"
                          onClick={() => removeRow(it.rowId)}
                          disabled={items.length === 1}
                          aria-label={`Hapus baris ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || batches.length === 0}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Kirim Transfer
        </button>
      </div>
    </form>
  );
}
