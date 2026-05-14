"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, Trash2, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { enqueueTransaction } from "@/lib/offline/queue";
import type {
  AppLocation,
  AppProduct,
  FifoPreviewRow,
  InventoryBatch,
  TransactionType,
} from "@/lib/supabase/types";
import { formatDate, formatNumber, locationTypeLabel } from "@/lib/format";

type Props = {
  locations: AppLocation[];
  products: AppProduct[];
  defaultLocationId: string | null;
};

type Allocation = {
  batch_id: string;
  qty: number;
  // metadata batch (dari fifo_preview untuk display)
  production_date?: string | null;
  expired_date?: string | null;
  qty_available?: number;
};

type LineItem = {
  rowId: string;
  product_id: string;
  qty: number;
  override_enabled: boolean;
  allocations: Allocation[];
  loadingPreview: boolean;
  error: string | null;
};

const TX_TYPES: { value: TransactionType; label: string }[] = [
  { value: "penjualan", label: "Penjualan" },
  { value: "complaiment", label: "Complaiment" },
  { value: "retur", label: "Retur" },
  { value: "rusak", label: "Rusak" },
  { value: "lainnya", label: "Lainnya" },
];

function newRow(): LineItem {
  return {
    rowId: crypto.randomUUID(),
    product_id: "",
    qty: 1,
    override_enabled: false,
    allocations: [],
    loadingPreview: false,
    error: null,
  };
}

export function KasirForm({ locations, products, defaultLocationId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [locationId, setLocationId] = useState<string | "">(
    defaultLocationId ?? locations[0]?.id ?? ""
  );
  const [type, setType] = useState<TransactionType>("penjualan");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [batchesByProduct, setBatchesByProduct] = useState<
    Record<string, InventoryBatch[]>
  >({});

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  // Muat batch milik lokasi (untuk dropdown override).
  useEffect(() => {
    if (!locationId) {
      setBatchesByProduct({});
      return;
    }
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(
          "id, product_id, location_id, production_date, expired_date, qty_available"
        )
        .eq("location_id", locationId)
        .gt("qty_available", 0)
        .order("production_date", { ascending: true });
      if (cancel) return;
      if (error) {
        toast(humanizeSupabaseError(error), "error");
        setBatchesByProduct({});
        return;
      }
      const grouped: Record<string, InventoryBatch[]> = {};
      for (const b of (data ?? []) as InventoryBatch[]) {
        (grouped[b.product_id] ??= []).push(b);
      }
      setBatchesByProduct(grouped);
    })();
    return () => {
      cancel = true;
    };
  }, [locationId, supabase, toast]);

  function updateItem(rowId: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it) => (it.rowId === rowId ? { ...it, ...patch } : it))
    );
  }

  async function previewFifo(rowId: string) {
    const it = items.find((x) => x.rowId === rowId);
    if (!it) return;
    if (!locationId || !it.product_id || it.qty <= 0) return;

    updateItem(rowId, { loadingPreview: true, error: null });
    const { data, error } = await supabase.rpc("fifo_preview", {
      p_location_id: locationId,
      p_product_id: it.product_id,
      p_qty: it.qty,
    });
    if (error) {
      updateItem(rowId, {
        loadingPreview: false,
        allocations: [],
        error: humanizeSupabaseError(error),
      });
      return;
    }
    const rows = (data ?? []) as FifoPreviewRow[];
    updateItem(rowId, {
      loadingPreview: false,
      error: null,
      allocations: rows.map((r) => ({
        batch_id: r.batch_id,
        qty: r.qty_take,
        production_date: r.production_date,
        expired_date: r.expired_date,
        qty_available: r.qty_available,
      })),
    });
  }

  // Trigger preview otomatis ketika produk/qty berubah & override OFF.
  useEffect(() => {
    items.forEach((it) => {
      if (
        !it.override_enabled &&
        it.product_id &&
        it.qty > 0 &&
        locationId &&
        it.allocations.length === 0 &&
        !it.loadingPreview &&
        !it.error
      ) {
        previewFifo(it.rowId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, locationId]);

  function addRow() {
    setItems((prev) => [...prev, newRow()]);
  }

  function removeRow(rowId: string) {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((x) => x.rowId !== rowId)
    );
  }

  function changeProduct(rowId: string, product_id: string) {
    updateItem(rowId, {
      product_id,
      allocations: [],
      override_enabled: false,
      error: null,
    });
  }

  function changeQty(rowId: string, qty: number) {
    updateItem(rowId, { qty, allocations: [], error: null });
  }

  function toggleOverride(rowId: string) {
    const it = items.find((x) => x.rowId === rowId);
    if (!it) return;
    if (!it.override_enabled) {
      // pindah ke mode override: copy alokasi FIFO terbaru sebagai starter.
      const allocations = it.allocations.length
        ? it.allocations
        : (batchesByProduct[it.product_id] ?? []).slice(0, 1).map((b) => ({
            batch_id: b.id,
            qty: it.qty,
            production_date: b.production_date,
            expired_date: b.expired_date,
            qty_available: b.qty_available,
          }));
      updateItem(rowId, { override_enabled: true, allocations });
    } else {
      updateItem(rowId, {
        override_enabled: false,
        allocations: [],
        error: null,
      });
    }
  }

  function updateAllocation(
    rowId: string,
    index: number,
    patch: Partial<Allocation>
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.rowId !== rowId) return it;
        const allocations = it.allocations.map((a, i) =>
          i === index ? { ...a, ...patch } : a
        );
        return { ...it, allocations };
      })
    );
  }

  function addAllocation(rowId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.rowId !== rowId) return it;
        const used = new Set(it.allocations.map((a) => a.batch_id));
        const candidates = (batchesByProduct[it.product_id] ?? []).filter(
          (b) => !used.has(b.id)
        );
        const pick = candidates[0];
        if (!pick) return it;
        return {
          ...it,
          allocations: [
            ...it.allocations,
            {
              batch_id: pick.id,
              qty: 0,
              production_date: pick.production_date,
              expired_date: pick.expired_date,
              qty_available: pick.qty_available,
            },
          ],
        };
      })
    );
  }

  function removeAllocation(rowId: string, index: number) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.rowId !== rowId) return it;
        return {
          ...it,
          allocations: it.allocations.filter((_, i) => i !== index),
        };
      })
    );
  }

  function validate(): string | null {
    if (!locationId) return "Pilih lokasi terlebih dahulu.";
    if (items.length === 0) return "Minimal satu produk.";
    for (const it of items) {
      const p = productMap[it.product_id];
      if (!p) return "Setiap baris harus memilih produk.";
      if (!Number.isFinite(it.qty) || it.qty <= 0)
        return `Qty produk ${p.name} harus > 0.`;
      if (it.override_enabled) {
        const total = it.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
        if (total !== it.qty)
          return `Total qty override (${total}) untuk ${p.name} tidak sama dengan qty produk (${it.qty}).`;
        const seen = new Set<string>();
        for (const a of it.allocations) {
          if (!a.batch_id) return `Pilih batch untuk ${p.name}.`;
          if (seen.has(a.batch_id))
            return `Batch duplikat pada ${p.name}.`;
          seen.add(a.batch_id);
          if (a.qty <= 0)
            return `Qty alokasi pada ${p.name} harus > 0.`;
          const stock = (batchesByProduct[it.product_id] ?? []).find(
            (b) => b.id === a.batch_id
          );
          if (stock && a.qty > stock.qty_available)
            return `Qty melebihi stok batch (tersedia ${stock.qty_available}) pada ${p.name}.`;
        }
      }
    }
    // Cek total qty per produk vs total stok lokal (validasi cepat sebelum ke server).
    const productSum: Record<string, number> = {};
    for (const it of items) {
      productSum[it.product_id] = (productSum[it.product_id] ?? 0) + it.qty;
    }
    for (const [pid, qty] of Object.entries(productSum)) {
      const total = (batchesByProduct[pid] ?? []).reduce(
        (s, b) => s + b.qty_available,
        0
      );
      if (qty > total) {
        return `Stok produk ${productMap[pid]?.name ?? ""} tidak cukup (tersedia ${total}, diminta ${qty}).`;
      }
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

    const payload = {
      p_location_id: locationId,
      p_type: type,
      p_notes: notes || null,
      p_items: items.map((it) => {
        const base = { product_id: it.product_id, qty: it.qty };
        if (it.override_enabled) {
          return {
            ...base,
            override: it.allocations.map((a) => ({
              batch_id: a.batch_id,
              qty: a.qty,
            })),
          };
        }
        return base;
      }),
    };

    setSubmitting(true);

    // Offline-first: kalau navigator offline, langsung enqueue.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueTransaction({ ...payload, p_type: type });
        toast(
          "Anda offline. Transaksi disimpan ke antrean dan akan dikirim saat online.",
          "info"
        );
        resetAfterSuccess();
      } catch (e2) {
        toast(humanizeSupabaseError(e2), "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const client_uuid = crypto.randomUUID();
    const { data, error } = await supabase.rpc("transaction_create", {
      p_location_id: payload.p_location_id,
      p_type: payload.p_type,
      p_items: payload.p_items,
      p_notes: payload.p_notes,
      p_client_uuid: client_uuid,
    });

    setSubmitting(false);

    if (error) {
      const code = (error as { code?: string }).code;
      // Untuk error transient/konflik, simpan ke antrean supaya tidak hilang.
      if (code && !["22023", "P0001", "P0002"].includes(code)) {
        await enqueueTransaction({ ...payload, p_type: type });
        toast(
          `Gagal mengirim ke server (${code}). Disimpan di antrean offline.`,
          "info"
        );
      } else {
        toast(humanizeSupabaseError(error), "error");
      }
      return;
    }

    const replay = (data as unknown as { idempotent_replay?: boolean })?.idempotent_replay;
    toast(
      replay ? "Transaksi sudah pernah tercatat (idempotent)." : "Transaksi tersimpan.",
      "success"
    );
    resetAfterSuccess();
  }

  function resetAfterSuccess() {
    setItems([newRow()]);
    setNotes("");
    router.refresh();
    // refresh batch lokasi
    if (locationId) {
      supabase
        .from("inventory_batches")
        .select(
          "id, product_id, location_id, production_date, expired_date, qty_available"
        )
        .eq("location_id", locationId)
        .gt("qty_available", 0)
        .then(({ data }) => {
          const grouped: Record<string, InventoryBatch[]> = {};
          for (const b of (data ?? []) as InventoryBatch[]) {
            (grouped[b.product_id] ??= []).push(b);
          }
          setBatchesByProduct(grouped);
        });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card">
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">Lokasi</label>
            <select
              className="input"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.length === 0 && <option value="">Tidak ada lokasi</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {locationTypeLabel[l.type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipe Pengeluaran</label>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
            >
              {TX_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Catatan (opsional)</label>
            <input
              className="input"
              placeholder="Mis. invoice #123 / nama pembeli"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {items.map((it, idx) => {
          const product = productMap[it.product_id];
          const productBatches = batchesByProduct[it.product_id] ?? [];
          const overrideTotal = it.allocations.reduce(
            (s, a) => s + (Number(a.qty) || 0),
            0
          );
          const overrideMismatch = it.override_enabled && overrideTotal !== it.qty;

          return (
            <div className="card" key={it.rowId}>
              <div className="card-header">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Produk #{idx + 1}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mode:{" "}
                    {it.override_enabled ? (
                      <span className="badge-blue">Manual override</span>
                    ) : (
                      <span className="badge-slate">FIFO otomatis</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleOverride(it.rowId)}
                    className={clsx(
                      "btn-secondary",
                      it.override_enabled && "bg-brand-50 text-brand-700"
                    )}
                    disabled={!it.product_id || !locationId}
                  >
                    <WandSparkles className="h-4 w-4" />
                    {it.override_enabled ? "Pakai FIFO" : "Override Batch"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(it.rowId)}
                    className="btn-ghost text-red-600"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
                <div>
                  <label className="label">Produk</label>
                  <select
                    className="input"
                    value={it.product_id}
                    onChange={(e) => changeProduct(it.rowId, e.target.value)}
                    required
                  >
                    <option value="">Pilih produk...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  {it.product_id && (
                    <p className="mt-1 text-xs text-slate-500">
                      Total stok lokasi:{" "}
                      <span className="font-medium text-slate-700">
                        {formatNumber(
                          productBatches.reduce((s, b) => s + b.qty_available, 0)
                        )}
                      </span>{" "}
                      · {productBatches.length} batch tersedia
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="input"
                    value={it.qty}
                    onChange={(e) =>
                      changeQty(it.rowId, Math.max(1, Number(e.target.value) || 0))
                    }
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Rincian Pemotongan Batch
                  </h4>
                  {!it.override_enabled && (
                    <button
                      type="button"
                      onClick={() => previewFifo(it.rowId)}
                      className="btn-ghost text-xs"
                      disabled={
                        !it.product_id || it.qty <= 0 || it.loadingPreview
                      }
                    >
                      {it.loadingPreview ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Preview ulang
                    </button>
                  )}
                </div>

                {it.error && (
                  <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {it.error}
                  </div>
                )}

                {it.allocations.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Pilih produk dan qty terlebih dahulu untuk melihat alokasi
                    FIFO. Sumber:{" "}
                    <code className="rounded bg-slate-100 px-1">fifo_preview</code>
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Batch (Tanggal Produksi)</th>
                          <th>Expired</th>
                          <th className="text-right">Stok Tersedia</th>
                          <th className="text-right">Qty Diambil</th>
                          {it.override_enabled && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {it.allocations.map((a, i) => {
                          const stock = productBatches.find(
                            (b) => b.id === a.batch_id
                          );
                          return (
                            <tr key={`${it.rowId}-${i}`}>
                              <td>
                                {it.override_enabled ? (
                                  <select
                                    className="input"
                                    value={a.batch_id}
                                    onChange={(e) => {
                                      const next = productBatches.find(
                                        (b) => b.id === e.target.value
                                      );
                                      updateAllocation(it.rowId, i, {
                                        batch_id: e.target.value,
                                        production_date:
                                          next?.production_date,
                                        expired_date: next?.expired_date,
                                        qty_available: next?.qty_available,
                                      });
                                    }}
                                  >
                                    {productBatches.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {formatDate(b.production_date)} · stok{" "}
                                        {formatNumber(b.qty_available)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span>{formatDate(a.production_date)}</span>
                                )}
                              </td>
                              <td>
                                {a.expired_date ? (
                                  <span className="badge-yellow">
                                    {formatDate(a.expired_date)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="text-right">
                                {formatNumber(stock?.qty_available ?? a.qty_available ?? 0)}
                              </td>
                              <td className="text-right">
                                {it.override_enabled ? (
                                  <input
                                    type="number"
                                    min={1}
                                    className="input w-24 text-right"
                                    value={a.qty}
                                    onChange={(e) =>
                                      updateAllocation(it.rowId, i, {
                                        qty: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                  />
                                ) : (
                                  <span className="font-medium">
                                    {formatNumber(a.qty)}
                                  </span>
                                )}
                              </td>
                              {it.override_enabled && (
                                <td>
                                  <button
                                    type="button"
                                    className="btn-ghost text-red-600"
                                    onClick={() => removeAllocation(it.rowId, i)}
                                    disabled={it.allocations.length === 1}
                                    aria-label="Hapus alokasi"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="text-right text-xs text-slate-500">
                            Total
                          </td>
                          <td className="text-right font-semibold">
                            <span
                              className={clsx(
                                overrideMismatch && "text-red-600"
                              )}
                            >
                              {formatNumber(
                                it.override_enabled
                                  ? overrideTotal
                                  : it.allocations.reduce((s, a) => s + a.qty, 0)
                              )}
                            </span>
                            {it.override_enabled && (
                              <span className="ml-2 text-xs text-slate-500">
                                / {formatNumber(it.qty)}
                              </span>
                            )}
                          </td>
                          {it.override_enabled && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {it.override_enabled && (
                  <button
                    type="button"
                    onClick={() => addAllocation(it.rowId)}
                    className="btn-secondary mt-3"
                    disabled={
                      productBatches.length <= it.allocations.length ||
                      !it.product_id
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Batch
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={addRow} className="btn-secondary">
          <Plus className="h-4 w-4" />
          Tambah Produk
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Transaksi
        </button>
      </div>
    </form>
  );
}
