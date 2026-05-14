# Panduan Deploy ke Supabase

Dokumen ini menjelaskan cara membuat tabel, RPC, RLS, dan seed data di project Supabase, lalu menyambungkannya ke aplikasi Next.js (`web/`).

> Backend sudah teruji penuh di Postgres lokal (lihat `supabase/tests/run_tests.ps1`). Langkah di bawah hanya menyalin perubahan ke project Supabase Anda.

---

## 1. Siapkan Project Supabase

1. Buka [supabase.com](https://supabase.com) dan login.
2. **New project** → isi nama, password database (simpan baik-baik), dan region terdekat (mis. Singapore).
3. Tunggu provisioning sampai Dashboard project terbuka.

## 2. Jalankan Skema + RPC + RLS + Seed

File yang akan dipakai: [`supabase/setup_supabase.sql`](../supabase/setup_supabase.sql) (gabungan migrasi 01–06, ~700 baris).

1. Di Dashboard project: **SQL Editor** → **New query**.
2. Buka file `supabase/setup_supabase.sql` di editor lokal, salin **seluruh isinya**, tempel ke SQL Editor.
3. Klik **Run**. Dalam beberapa detik akan keluar pesan `Success. No rows returned`. Notice seperti `trigger "..." does not exist, skipping` aman diabaikan (run pertama).
4. (Opsional) Verifikasi: jalankan blok query di bagian akhir file (di-comment), atau langsung:
   ```sql
   select count(*) from public.roles;            -- 4
   select count(*) from public.permissions;      -- 13
   select count(*) from public.locations;        -- 5
   select count(*) from public.products;         -- 4
   select count(*) from public.inventory_batches;-- 4 (semua di Gudang Pusat)
   ```

File ini **idempotent**, aman dijalankan ulang kalau ada perubahan.

## 3. Buat User Pertama (Super Admin)

Supabase memisahkan **auth identity** (email + password) dan **profil aplikasi** (role + lokasi). Jadi ada dua langkah.

### 3a. Buat identity di Supabase Auth

1. **Authentication → Users → Add user → Create new user**.
2. Isi email + password yang kuat. Centang **Auto Confirm User** supaya bisa langsung login.
3. Klik **Create user**. Catat email tersebut.

### 3b. Link ke profil aplikasi

1. Buka file [`supabase/setup_first_user.sql`](../supabase/setup_first_user.sql).
2. Edit empat variabel di bagian atas (`v_email`, `v_role`, `v_location`, `v_name`). Untuk Super Admin biarkan `v_location := null`.
3. Salin ke SQL Editor → Run. Notice akhirnya: `OK: profil user ... ter-link ke role Super Admin lokasi (null)`.

> Untuk user outlet (Kasir/Staf), set `v_role := 'Kasir Outlet'` dan `v_location := 'Outlet Pamulang'` (atau lokasi sesuai).

## 4. Ambil Kredensial Project

Di Dashboard: **Project Settings → API**.

| Variable Next.js | Nilai dari Dashboard |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `Project URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon public` |

Jangan pakai `service_role key` di client — itu bypass RLS. Untuk PWA, hanya `anon` key yang dipakai.

## 5. Sambungkan Web App

```cmd
cd web
copy .env.local.example .env.local
```

Edit `web\.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Lalu:

```cmd
npm install
npm run dev
```

Buka http://localhost:3000, login dengan email/password yang dibuat di langkah 3.

## 6. Smoke Test End-to-End

1. **Login** sebagai Super Admin. Dashboard tampil dengan stok awal di Gudang Pusat (4 batch dari seed).
2. **Buat transfer** dari Gudang Pusat ke Outlet Pamulang (`/transfers/new`).
3. **Login ulang** sebagai Kasir Outlet Pamulang (buat user lagi via langkah 3, set lokasi). Lihat dashboard menampilkan transfer `in_transit`.
4. Buka detail transfer → **Terima**. Stok bertambah di Outlet Pamulang.
5. Buka **Kasir** (`/kasir`) → buat transaksi penjualan. Cek FIFO preview, lalu simpan.
6. Test offline: matikan Wi-Fi, buat transaksi, cek antrean di `/transaksi`. Hidupkan Wi-Fi → antrean otomatis flush.

---

## Apa yang Dideploy?

| Bagian | Isi | Sumber |
| --- | --- | --- |
| Enum | `location_type`, `transfer_status`, `transaction_type`, `permission_action` | `01_schema.sql` |
| Tabel | 11 tabel (RBAC, master, inventory, transfers, transactions) | `01_schema.sql` |
| Index | per-lokasi, per-produk, per-tanggal-produksi (FIFO), expired | `01_schema.sql` |
| Trigger | `updated_at` auto-update | `01_schema.sql` |
| RLS | filter per lokasi user, Super Admin / Kepala Gudang lintas | `02_rls_policies.sql` |
| RPC FIFO | `fifo_preview`, `fifo_allocate`, `transaction_create` | `03_functions_fifo.sql` |
| RPC Transfer | `transfer_send`, `transfer_receive`, `transfer_cancel` | `04_functions_transfer.sql` |
| View & RPC Dashboard | `v_stock_by_location`, `dashboard_stock`, `dashboard_incoming_transfers` | `05_functions_dashboard.sql` |
| Seed | 4 role, 13 permission, 5 lokasi, 4 produk, 4 batch awal | `06_seed_data.sql` |

Detail per RPC ada di [`docs/API.md`](API.md), penjelasan tabel di [`docs/SCHEMA.md`](SCHEMA.md).

## Troubleshooting

- **`relation "auth.users" does not exist`** saat menjalankan setup: ini hanya muncul di Postgres lokal, tidak di Supabase. Di Supabase, schema `auth` selalu tersedia.
- **Login berhasil tapi semua halaman kosong**: profil di `public.users` belum ada / `is_active = false`. Re-run `setup_first_user.sql` setelah memastikan email match dengan auth user.
- **`error.code = P0001`** saat transaksi: stok tidak cukup di lokasi user.
- **`error.code = P0002`** saat manual override: batch yang dipilih tidak milik lokasi/produk yang sama.
- **`error.code = 22023`** saat transaksi: input salah (qty <= 0, total override ≠ qty produk, dll). Lihat tabel matriks di `docs/API.md`.
- **Stok tidak terlihat untuk user outlet**: pastikan `public.users.location_id` user tersebut diisi (RLS memfilter berdasarkan lokasi user).

## Langkah Berikutnya

Lihat checklist di bagian akhir [README utama](../README.md). Setelah Supabase siap dan web app jalan, kandidat berikutnya:

1. Build PWA production: `cd web && npm run build && npm start`.
2. Deploy `web/` ke Vercel/Netlify (env var di-set lewat dashboard hosting).
3. Tambah skenario backend lain yang sebelumnya kita skip (concurrency, RLS per lokasi, dashboard agregasi).
4. Service worker untuk caching aset PWA (`public/sw.js`) — saat ini IndexedDB queue sudah jalan, tapi belum ada cache shell aset.
