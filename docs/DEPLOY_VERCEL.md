# Deploy ke Vercel

Repo ini punya struktur monorepo sederhana:

```
.
├── web/            ← Next.js app (yang akan di-deploy)
└── supabase/       ← migrasi & test SQL (tidak ikut deploy)
```

Vercel akan men-deploy dari folder `web/`. Backend tetap di Supabase; Vercel hanya hosting frontend + route handler.

> **PENTING — rotasi key dulu kalau service role pernah ter-commit.**
> Lihat bagian [Rotasi Service Role Key](#rotasi-service-role-key-jika-pernah-bocor) di bawah sebelum deploy.

## Prasyarat

- Repo sudah ter-push ke GitHub/GitLab/Bitbucket.
- Akun Vercel terhubung ke provider Git tersebut.
- Project Supabase sudah jalan dan migrasi `supabase/migrations/01..07` sudah di-apply (lihat `docs/SETUP_SUPABASE.md`).

## Langkah Deploy

### 1. Import project ke Vercel

1. https://vercel.com/new → pilih repo Anda.
2. **Root Directory:** klik **Edit** lalu pilih `web`. Ini wajib karena `package.json` Next.js berada di subfolder, bukan di root repo.
3. **Framework Preset:** Next.js (auto-detect setelah root directory benar).
4. **Build Command:** kosongkan / `next build` (default).
5. **Output Directory:** kosongkan (default `.next`).
6. **Install Command:** kosongkan / `npm install` (default).

> Kalau Anda lupa set Root Directory dan deploy menghasilkan **404: NOT_FOUND** di semua URL, masuk ke **Project Settings → Build and Deployment → Root Directory**, ubah ke `web`, klik **Save**, lalu trigger ulang deploy dari tab **Deployments**.

### 2. Set environment variables

Di tab **Environment Variables** saat import (atau Project Settings → Environment Variables setelah import). Berlakukan untuk **Production**, **Preview**, dan **Development**:

| Key | Value | Sensitif? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project, mis. `https://xxxx.supabase.co` | tidak |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | tidak (boleh ada di client) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **YA** — server-only, jangan tambahkan prefix `NEXT_PUBLIC_` |

> `DATABASE_URL` **tidak perlu** di-set di Vercel. Itu hanya dipakai skrip `npm run db:apply` di workstation Anda.

### 3. Deploy

Klik **Deploy**. Build akan berjalan ~1–2 menit. Vercel mengeluarkan domain `*.vercel.app`.

### 4. Hubungkan Supabase Auth ke domain Vercel

Tanpa ini, login berhasil di server tapi redirect ke Supabase email confirm akan gagal.

Di Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL** → `https://<project>.vercel.app` (atau custom domain Anda).
- **Redirect URLs** → tambahkan:
  - `https://<project>.vercel.app/**`
  - Domain Preview Vercel kalau perlu: `https://*-<team>.vercel.app/**`
  - `http://localhost:3000/**` (untuk dev lokal)

Save. Tidak perlu rebuild Vercel.

### 5. Smoke test produksi

1. Buka `https://<project>.vercel.app/signup` → daftar user pertama (otomatis Super Admin via trigger `07_auth_user_provisioning.sql`).
2. Login → atur lokasi default di `/profile`.
3. Buat satu transfer di `/transfers/new`, terima di `/transfers/[id]`.
4. Buat satu transaksi di `/kasir`. Cek stok berkurang di `/inventory`.
5. Buka DevTools → Network → Offline. Buat satu transaksi lagi → masuk antrean. Aktifkan koneksi → otomatis tersinkron.

## Otomatisasi CI/CD

Setelah project ter-import, setiap push ke branch yang Anda pilih (default: `main`) akan auto-trigger production deploy. Push ke branch lain memunculkan Preview Deployment dengan URL terpisah.

## Custom Domain

Project Settings → **Domains** → **Add**. Setelah DNS verified, masukkan domain produksi tersebut ke Site URL Supabase (langkah 4) supaya cookie auth berfungsi penuh.

## PWA & Service Worker

`public/sw.js` sudah di-bypass-kan untuk semua aset `/_next/*` agar deploy baru langsung memuat versi terbaru. `ServiceWorkerRegister` di sisi client otomatis memicu reload saat versi SW berubah.

Tidak ada konfigurasi tambahan yang dibutuhkan di Vercel.

## Rotasi Service Role Key (jika pernah bocor)

Jika `SUPABASE_SERVICE_ROLE_KEY` pernah ter-commit ke git publik (bahkan sekali, bahkan kalau commit sudah dihapus), key tersebut harus dianggap kompromi:

1. Supabase Dashboard → **Project Settings → API** → tombol **Reset** di samping `service_role`. Ini menggenerate JWT baru dan menonaktifkan yang lama.
2. Generate ulang **JWT secret** (Settings → API → JWT Settings → Reset). Catatan: ini akan mem-force semua user logout (semua access token sebelumnya invalid).
3. Update `SUPABASE_SERVICE_ROLE_KEY` di Vercel (Project Settings → Environment Variables → Edit → Save → Redeploy).
4. Update juga `.env.local` di workstation Anda. JANGAN commit nilai asli; gunakan `.env.local.example` (sudah berisi placeholder) sebagai template.
5. Jika berkenan, scrub history git agar key lama tidak ditemukan di commit lampau. Tools: `git filter-repo`, `bfg-repo-cleaner`. Setelah scrub, force-push.
6. Periksa audit log Supabase (Database → Logs) untuk aktivitas mencurigakan dari periode kebocoran.

> Anon key boleh public — itu memang dirancang untuk dipakai di browser dan tunduk RLS. Yang **tidak boleh** public adalah service_role key dan password DB di `DATABASE_URL`.

## Troubleshooting

| Gejala | Sebab umum | Solusi |
| --- | --- | --- |
| `Supabase env tidak terdeteksi` saat buka halaman | Env tidak ter-set di Vercel | Set di Project Settings → Environment Variables → Redeploy |
| Login berhasil tapi `/` 404 / redirect loop | Site URL Supabase belum cocok | Update di Auth → URL Configuration |
| `/api/admin/users` mengembalikan 500 | `SUPABASE_SERVICE_ROLE_KEY` belum di-set | Tambahkan env tanpa prefix `NEXT_PUBLIC_`, redeploy |
| CSS halaman kacau setelah deploy | Cache SW lama di browser | Buka DevTools → Application → Service Workers → Unregister → reload |
| Build fail di Vercel padahal lokal OK | Beda versi Node | Vercel pakai Node 20 LTS (Next 14 OK). Sinkronkan lokal dengan `nvm use 20` |
| Semua URL `404: NOT_FOUND` setelah deploy | **Root Directory** belum di-set ke `web` | Project Settings → Build and Deployment → **Root Directory** → ubah ke `web` → Save → Redeploy |
