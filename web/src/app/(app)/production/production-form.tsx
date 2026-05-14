"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Plus, Save, Trash2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";
import { locationTypeLabel } from "@/lib/format";
import type { AppLocation, AppProduct } from "@/lib/supabase/types";

type Line = {
  rowId: string;
  productId: string;
  productionDate: string;
  expiredDate: string;
  qty: number;
};

type Props = {
  locations: AppLocation[];
  products: AppProduct[];
  defaultLocationId: string | null;
};

export function ProductionForm({
  locations,
  products,
  defaultLocationId,
}: Props) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Line[]>([
    {
      rowId: crypto.randomUUID(),
      productId: products[0]?.id ?? "",
      productionDate: today,
      expiredDate: "",
      qty: 1,
    },
  ]);
  const [busy, setBusy] = useState(false);

  function addRow() {
    setItems((prev) => [
      ...prev,
      {
        rowId: crypto.randomUUID(),
        productId: products[0]?.id ?? "",
        productionDate: today,
        expiredDate: "",
        qty: 1,
      },
    ]);
  }

  function removeRow(id: string) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((x) => x.rowId !== id)));
  }

  function updateRow(id: string, patch: Partial<Line>) {
    setItems((prev) =>
      prev.map((it) => (it.rowId === id ? { ...it, ...patch } : it))
    );
  }

  function validate(): string | null {
    if (!locationId) return "Pilih lokasi.";
    if (items.length === 0) return "Minimal satu item.";
    for (const it of items) {
      if (!it.productId) return "Pilih produk untuk semua baris.";
      if (!it.productionDate) return "Tanggal produksi wajib diisi.";
      if (it.qty <= 0) return "Qty harus > 0.";
      if (it.expiredDate && it.expiredDate < it.productionDate) {
        return "Tanggal kedaluwarsa tidak boleh sebelum tanggal produksi.";
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

    setBusy(true);
    const { error } = await supabase.rpc("production_in", {
      p_location_id: locationId,
      p_items: items.map((it) => ({
        product_id: it.productId,
        production_date: it.productionDate,
        expired_date: it.expiredDate || null,
        qty: it.qty,
      })),
      p_notes: notes || null,
    });
    setBusy(false);

    if (error) {
      toast(humanizeSupabaseError(error), "error");
      return;
    }

    toast(
      `${items.length} batch berhasil ditambahkan ke stok.`,
      "success"
    );
    router.push(`/inventory?loc=${locationId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card">
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Lokasi Tujuan</label>
            <select
              className="input"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              <option value="">Pilih lokasi...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {locationTypeLabel[l.type]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Disarankan Gudang Produksi. Outlet juga boleh untuk koreksi stok.
            </p>
          </div>
          <div>
            <label className="label">Catatan (opsional)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mis. produksi pagi shift 1"
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Item Produksi
            </h2>
          </div>
          <button type="button" onClick={addRow} className="btn-secondary">
            <Plus className="h-4 w-4" />
            Tambah Baris
          </button>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Tanggal Produksi</th>
                <th>Tanggal Expired</th>
                <th className="text-right">Qty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.rowId}>
                  <td>
                    <select
                      className="input"
                      value={it.productId}
                      onChange={(e) =>
                        updateRow(it.rowId, { productId: e.target.value })
                      }
                      required
                    >
                      <option value="">Pilih produk...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input"
                      value={it.productionDate}
                      onChange={(e) =>
                        updateRow(it.rowId, { productionDate: e.target.value })
                      }
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input"
                      value={it.expiredDate}
                      onChange={(e) =>
                        updateRow(it.rowId, { expiredDate: e.target.value })
                      }
                      min={it.productionDate || undefined}
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      min={1}
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Produksi
        </button>
      </div>
    </form>
  );
}
