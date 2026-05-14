// Pemetaan error code dari API.md ke pesan yang ramah.
const CODE_MESSAGES: Record<string, string> = {
  "22023": "Data input tidak valid.",
  P0001: "Stok tidak cukup.",
  P0002: "Data tidak ditemukan atau bukan milik lokasi ini.",
  P0003: "Aksi tidak diizinkan untuk status saat ini.",
};

export function humanizeSupabaseError(error: unknown): string {
  if (!error) return "Terjadi kesalahan tidak diketahui.";

  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  if (e.code && CODE_MESSAGES[e.code]) {
    return `${CODE_MESSAGES[e.code]}${e.message ? ` (${e.message})` : ""}`;
  }

  return e.message || e.details || e.hint || "Terjadi kesalahan tidak diketahui.";
}
