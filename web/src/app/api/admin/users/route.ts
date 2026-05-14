import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Catatan keamanan:
// - Endpoint ini berjalan di server (route handler), bukan di browser.
// - Service role key dibaca dari env SERVER-ONLY (tanpa prefix NEXT_PUBLIC_),
//   jadi tidak akan ter-bundle ke client.
// - Sebelum memakai service role, kita verifikasi caller adalah Super Admin
//   lewat session Supabase + cek role di public.users.

export const runtime = "nodejs";

type CreatePayload = {
  email?: string;
  password?: string;
  name?: string;
  role_id?: string;
  location_id?: string | null;
  is_active?: boolean;
};

function badRequest(message: string, code = 400) {
  return NextResponse.json({ error: message }, { status: code });
}

export async function POST(req: NextRequest) {
  // 1) Verifikasi caller authenticated.
  const userClient = getSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return badRequest("Tidak terautentikasi.", 401);

  // 2) Verifikasi caller adalah Super Admin (dari profil public.users).
  const { data: profile, error: profileErr } = await userClient
    .from("users")
    .select("id, role:roles(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) return badRequest(profileErr.message, 500);
  const callerRole = (profile?.role as unknown as { name?: string } | null)?.name;
  if (callerRole !== "Super Admin") {
    return badRequest("Hanya Super Admin yang dapat membuat user.", 403);
  }

  // 3) Validasi payload.
  let body: CreatePayload = {};
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return badRequest("Payload bukan JSON yang valid.");
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim() ?? "";
  const role_id = body.role_id;
  const location_id = body.location_id ?? null;
  const is_active = body.is_active ?? true;

  if (!email) return badRequest("Email wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return badRequest("Format email tidak valid.");
  if (!password || password.length < 6)
    return badRequest("Password minimal 6 karakter.");
  if (!name) return badRequest("Nama wajib diisi.");
  if (!role_id) return badRequest("Role wajib dipilih.");

  // 4) Pastikan service role key tersedia.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return badRequest(
      "Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY). Tambahkan di .env.local lalu restart.",
      500,
    );
  }

  // 5) Buat akun di Supabase Auth via admin API (butuh service role).
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created.user) {
    return badRequest(
      createErr?.message ?? "Gagal membuat user di Auth.",
      400,
    );
  }
  const newAuthId = created.user.id;

  // 6) Sinkronkan profil ke public.users via RPC admin_user_upsert
  //    (RPC ini punya guard role + email selalu disinkronkan dari auth.users).
  const { error: linkErr } = await userClient.rpc("admin_user_upsert", {
    p_auth_user_id: newAuthId,
    p_role_id: role_id,
    p_location_id: location_id,
    p_name: name,
    p_is_active: is_active,
  });
  if (linkErr) {
    // Roll back auth user supaya tidak ada zombie account.
    await admin.auth.admin.deleteUser(newAuthId).catch(() => {});
    return badRequest(`Gagal menugaskan profil: ${linkErr.message}`, 400);
  }

  return NextResponse.json({
    id: newAuthId,
    email,
    ok: true,
  });
}
