import Link from "next/link";
import { Boxes } from "lucide-react";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Daftar · Sistem Inventori Multi-Outlet" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3 text-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-500">Sistem Inventori</p>
            <p className="text-base font-semibold text-slate-900">Multi-Outlet</p>
          </div>
        </div>
        <div className="card">
          <div className="px-6 py-5">
            <h1 className="text-xl font-semibold text-slate-900">Daftar akun</h1>
            <p className="mt-1 text-sm text-slate-500">
              User pertama otomatis menjadi Super Admin. User berikutnya akan
              dibuat dengan role minimum dan harus dilengkapi lokasinya oleh
              Super Admin.
            </p>
          </div>
          <SignupForm />
          <div className="border-t border-slate-100 px-6 py-3 text-center text-sm text-slate-500">
            Sudah punya akun?{" "}
            <Link className="text-brand-700 hover:underline" href="/login">
              Masuk
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
