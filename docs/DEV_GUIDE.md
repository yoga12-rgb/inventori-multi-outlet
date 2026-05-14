# Developer Guide

Cara setup, run, dan kontribusi di repo ini.

## Setup Awal

### 1. Tools yang dibutuhkan
- Node 20+ (Next.js 14)
- Docker Desktop (untuk smoke test backend)
- Browser modern dengan IndexedDB & service worker (Chromium-based / Firefox)
- Akses Supabase project (atau Postgres lokal)

### 2. Clone & install

```cmd
cd "d:\WEB APP\web"
npm install
```

### 3. Konfigurasi environment

`web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=                          # opsional, untuk apply-sql.mjs
```

`NEXT_PUBLIC_*` dipakai di browser & SSR. `DATABASE_URL` hanya dibaca skrip Node, tidak di-bundle ke client.

### 4. Apply skema ke Supabase

Lihat `docs/SETUP_SUPABASE.md` untuk detail. Tiga cara:

| Cara | Kapan dipilih |
| --- | --- |
| SQL Editor (manual) | Tidak ingin install apa-apa; satu-kali setup |
| `web/scripts/apply-sql.mjs` | Punya `DATABASE_URL` & `pg` package; mau otomatis dari terminal |
| Supabase CLI (`supabase db push`) | Sudah pakai migrasi resmi & link project |

**Urutan eksekusi:**

1. `supabase/setup_supabase.sql` (gabungan migrasi 01–06).
2. `supabase/setup_admin_rpc.sql` (RPC tambahan untuk halaman master & produksi).
3. `supabase/migrations/07_auth_user_provisioning.sql` (trigger auto-create profil).
4. `supabase/setup_first_user.sql` (kalau user pertama belum punya profil — sekarang trigger di no.3 sudah meng-handle).

> File `01_schema.sql`–`06_seed_data.sql` di `supabase/migrations/` adalah *split version* dari `setup_supabase.sql`. Untuk Supabase, lebih nyaman pakai file gabungan. Untuk test lokal Docker, harness `run_tests.ps1` pakai migrasi terpisah.

## Run Dev

```cmd
cd "d:\WEB APP\web"
npm run dev
```

Buka http://localhost:3000.

> Service worker **tidak aktif** di dev mode. Untuk test PWA, gunakan production build (`npm run build && npm run start`).

## Skrip NPM

| Script | Fungsi |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/apply-sql.mjs --file <path>` | Apply file SQL via DATABASE_URL |

## Test Backend (smoke test SQL)

```cmd
cd "d:\WEB APP"
powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_tests.ps1
```

Yang dijalankan harness:
1. Spin up Postgres 16 di Docker (container `kiro-pg-test`, port host 55432).
2. Apply migrasi 01–07 + bootstrap auth stub.
3. Apply seed user untuk testing.
4. Jalankan SQL test berurutan:
   - `test_fifo.sql` — FIFO + idempotent.
   - `test_manual_override.sql` — 7 skenario manual override.
   - `test_dashboard_agg.sql` — agregasi `dashboard_stock` & `dashboard_incoming_transfers` lintas FIFO + transfer.
   - `test_rls_per_location.sql` — RLS membatasi data per lokasi user, Super Admin lintas.
   - `test_provisioning.sql` — trigger auto-create profil saat signup.
5. Jalankan **`test-concurrency.mjs`** (Node) — dua transaksi qty=8 paralel atas batch qty=10. Invariant: 1 sukses + 1 `P0001`, qty akhir ≥ 0.

Output yang diharapkan: exit code 0 + semua skenario `OK ...` di RAISE NOTICE, dan baris `==> All scripts executed`.

> Jika Node tidak terinstall, harness skip concurrency test (tidak gagal).

## Test Frontend

Project ini **belum** punya unit test framework di sisi web. Verifikasi pakai:
- `npm run typecheck` — type safety.
- `npm run lint` — gaya kode + hooks rules.
- `npm run build` — kompilasi production sukses.
- Manual smoke test melalui browser pakai akun seed.

## Direktori Penting (cheat sheet)

| Lokasi | Isi |
| --- | --- |
| `web/src/app/` | Halaman & layout (App Router) |
| `web/src/lib/` | Helper (session, format, errors, supabase, offline) |
| `web/src/components/` | UI shell + UI atom |
| `supabase/migrations/` | SQL bertingkat (01..07) |
| `supabase/setup_*.sql` | Versi gabungan untuk SQL Editor / setup awal |
| `supabase/tests/` | Smoke test SQL + harness PowerShell |
| `docs/` | Dokumentasi (kamu di sini) |
| `.kiro/specs/` | Spec fitur (Requirements/Design/Tasks) |

## Konvensi Kode

- **TypeScript**: `strict` aktif; jangan pakai `any`. Gunakan tipe domain di `lib/supabase/types.ts`.
- **Server vs client component**: gunakan server component (default) untuk fetch data; tandai `"use client"` hanya saat butuh hooks/event browser.
- **Mutasi**: lewat `supabase.rpc('...')`, bukan langsung `from(...).insert/update`.
- **Error handling**: bungkus dengan `humanizeSupabaseError` + `toast`.
- **Offline awareness**: gunakan `enqueueTransaction` di kasir saat `navigator.onLine === false`.
- **Param URL**: gunakan `useSearchParams` & `router.replace` untuk filter (bookmarkable).

## Konvensi SQL

- **Idempotent**: pakai `IF NOT EXISTS`, `ON CONFLICT`, `CREATE OR REPLACE`. Migrasi & setup file harus aman re-run.
- **Search path**: tambahkan `set search_path = public` di tiap RPC supaya tidak terkena perubahan global.
- **Locking**: `SELECT ... FOR UPDATE` saat membaca baris yang akan di-update di RPC mutasi stok.
- **UPDATE bersyarat**: untuk decrement stok, gunakan `UPDATE ... WHERE qty_available >= n RETURNING 1` lalu cek `IF NOT FOUND`.
- **Komentar**: bahasa Indonesia, berikan ringkasan di atas tiap fungsi (parameter, return, side effect).

## Workflow Spec → Implementasi

Repo memakai folder `.kiro/specs/<feature>/` dengan 3 file:
- `requirements.md` — user stories + acceptance criteria EARS.
- `design.md` — pendekatan teknis, mapping skenario → assertion.
- `tasks.md` — daftar task granular siap dispatch.

Spec menjadi acuan saat fitur dieksekusi. Hasil eksekusi (kode + test) divalidasi terhadap acceptance criteria di spec.

## Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `relation "public.X" does not exist` | Re-run `setup_supabase.sql` di SQL Editor |
| `type "citext" does not exist` di DO block | Jangan pakai `citext` sebagai variabel PL/pgSQL; cast otomatis saat insert ke kolom |
| `tenant/user not found` di pooler | Project paused; restore di Dashboard, atau ambil ulang connection string |
| Banner "lokasi belum punya stok" tetap muncul | Pilih lokasi asal manual; kalau profil user tidak punya `location_id`, default jatuh ke gudang produksi pertama |
| Build PWA gagal pakai SW di dev | Itu normal; SW hanya aktif di `npm run start` |
| `42501 Hanya Super Admin/Kepala Gudang` | Profil user tidak punya role yang diizinkan; cek `select * from public.users` |
| Antrean offline tidak ter-flush otomatis | Pastikan `OfflineFlusher` ter-mount (di `(app)/layout.tsx`); cek event `online` triggered |

## Cara Menambah Halaman Baru

1. Buat `web/src/app/<group>/<segment>/page.tsx`. Gunakan `requireSession()` untuk gate auth.
2. Kalau butuh data: fetch via `getSupabaseServerClient()` (server component).
3. Kalau butuh interaksi: bikin client component sibling dengan suffix `-form.tsx` / `-table.tsx` dan `"use client"` di atas.
4. Tambahkan ke `Sidebar` (`components/shell/sidebar.tsx`) jika perlu link.
5. Update `docs/PAGES.md` dan `docs/FEATURES.md`.

## Cara Menambah RPC Baru

1. Tambahkan fungsi di file SQL yang relevan (`setup_admin_rpc.sql` untuk admin/produksi, atau buat migrasi baru `08_*.sql`).
2. Pakai `security definer` + `set search_path = public`.
3. Tambah guard role bila perlu (`current_user_role()` cek).
4. Update `docs/API.md` (signature, parameters, return shape, error codes).
5. Tulis test SQL di `supabase/tests/test_<fitur>.sql`. Tambahkan ke `run_tests.ps1`.
6. Panggil via `supabase.rpc('<name>', { ... })` di client.

## Cara Apply Perubahan ke Production

1. Test dulu di Postgres lokal (`run_tests.ps1`).
2. Jalankan `setup_admin_rpc.sql` / file SQL baru di **SQL Editor** Supabase **atau** via `apply-sql.mjs`.
3. Verifikasi di SQL Editor: cek tabel/fungsi terbuat, jalankan query smoke.
4. Deploy frontend (Vercel / VPS / dll). Pastikan env `NEXT_PUBLIC_SUPABASE_*` ter-set di hosting.
5. Smoke test alur kritis: login, dashboard, kasir + offline, transfer round-trip, master data CRUD.

## Cara Roll-Back

- Database: tidak ada `down` script. Untuk roll-back, tulis SQL kompensasi (mis. `drop function ...`) sesuai perubahan terakhir.
- Frontend: rollback deployment (di Vercel / git revert).
- Service worker: bump versi `VERSION` di `web/public/sw.js`. Client lama akan otomatis bersihkan cache lama saat aktivasi versi baru.
