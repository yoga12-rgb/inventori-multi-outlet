import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="card max-w-md text-center">
        <div className="card-body">
          <p className="text-xs uppercase tracking-wide text-slate-400">404</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Halaman tidak ditemukan
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            URL yang Anda buka tidak terdaftar di aplikasi.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
