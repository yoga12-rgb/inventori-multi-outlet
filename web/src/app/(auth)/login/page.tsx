import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { Boxes } from "lucide-react";

export const metadata = {
  title: "Masuk · Sistem Inventori Multi-Outlet",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3 text-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-500">Sistem Inventori</p>
            <p className="text-base font-semibold text-slate-900">
              Multi-Outlet Distribusi
            </p>
          </div>
        </div>
        <div className="card">
          <div className="px-6 py-5">
            <h1 className="text-xl font-semibold text-slate-900">
              Masuk ke akun Anda
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Gunakan email & password Supabase. Akses RBAC menyesuaikan role
              yang sudah disetel admin.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Belum punya akun?{" "}
          <Link className="text-brand-700 hover:underline" href="/signup">
            Daftar di sini
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
