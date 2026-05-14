import { format, formatDistanceToNow, parseISO } from "date-fns";
import { id } from "date-fns/locale";

export function formatDate(value: string | null | undefined, pattern = "dd MMM yyyy") {
  if (!value) return "-";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, pattern, { locale: id });
  } catch {
    return "-";
  }
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, "dd MMM yyyy HH:mm");
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: id });
  } catch {
    return "-";
  }
}

export function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("id-ID").format(n);
}

export const transactionTypeLabel: Record<string, string> = {
  penjualan: "Penjualan",
  complaiment: "Complaiment",
  retur: "Retur",
  rusak: "Rusak",
  lainnya: "Lainnya",
};

/**
 * Label fallback untuk kode kategori dinamis. Pakai `transactionTypeLabel`
 * saat memungkinkan; kalau code tidak terdaftar di sana, lakukan
 * Title-Case sederhana (mis. `bonus_karyawan` → `Bonus Karyawan`).
 */
export function categoryCodeLabel(code: string): string {
  if (transactionTypeLabel[code]) return transactionTypeLabel[code];
  return code
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export const transferStatusLabel: Record<string, string> = {
  in_transit: "Dalam Perjalanan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const locationTypeLabel: Record<string, string> = {
  gudang_produksi: "Gudang Produksi",
  outlet: "Outlet",
};
