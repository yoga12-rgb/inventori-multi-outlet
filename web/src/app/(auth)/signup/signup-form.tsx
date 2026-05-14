"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { humanizeSupabaseError } from "@/lib/errors";

export function SignupForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;

      // Bila project membutuhkan konfirmasi email, session = null.
      if (!data.session) {
        toast(
          "Akun dibuat. Periksa email untuk verifikasi sebelum login.",
          "info"
        );
        router.replace("/login");
        return;
      }

      toast("Akun dibuat. Silakan lengkapi role/lokasi via Super Admin.", "success");
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast(humanizeSupabaseError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-6 pb-6">
      <div>
        <label htmlFor="name" className="label">
          Nama
        </label>
        <input
          id="name"
          required
          minLength={2}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama lengkap"
        />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="anda@perusahaan.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={6}
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 6 karakter"
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Daftar
      </button>
    </form>
  );
}
