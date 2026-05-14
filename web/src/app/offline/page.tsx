import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <div className="rounded-full bg-slate-200 p-4 text-slate-600">
        <CloudOff className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">
        Anda sedang offline
      </h1>
      <p className="max-w-md text-sm text-slate-600">
        Halaman ini belum sempat di-cache. Saat koneksi kembali, antrean
        transaksi yang sudah Anda buat akan disinkronkan otomatis. Anda tetap
        bisa membuka halaman <strong>Kasir</strong> untuk membuat transaksi
        baru selama Anda sudah pernah memuatnya saat online.
      </p>
      <Link href="/" className="btn-primary">
        Coba Lagi
      </Link>
    </main>
  );
}
