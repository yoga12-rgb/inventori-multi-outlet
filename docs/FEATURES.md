# Daftar Fitur

Setiap fitur menyebut: **siapa yang berhak**, **alur singkat**, **RPC/tabel yang dipakai**, dan **tautan halaman**.

## 1. Otentikasi & Onboarding

### Login
- Akses: semua user terdaftar.
- Halaman: `/login` (`web/src/app/(auth)/login/`).
- Alur: `supabase.auth.signInWithPassword` → middleware redirect ke `next` atau `/`.
- Catatan: middleware (`web/src/middleware.ts`) menjaga semua rute non-public. Cookie session di-set oleh `@supabase/ssr` createServerClient.

### Signup self-service
- Akses: publik. Hanya untuk membuat akun di Supabase Auth.
- Halaman: `/signup` (`web/src/app/(auth)/signup/`).
- Alur:
  1. `supabase.auth.signUp({ email, password, options: { data: { name } } })`.
  2. Trigger DB `handle_new_auth_user` (migrasi `07_auth_user_provisioning.sql`) otomatis membuat baris di `public.users`.
  3. **User pertama** → role `Super Admin`. **User berikutnya** → role `Staf Outlet` (paling minimum).
- Penyesuaian role/lokasi setelahnya: lewat halaman `/master/users` (oleh Super Admin).

### Profil saya
- Akses: semua user terautentikasi.
- Halaman: `/profile`.
- Bisa: ganti nama dan **lokasi default** (untuk filter RLS). Email & role read-only.

## 2. Dashboard

- Akses: semua role.
- Halaman: `/`.
- Sumber data: RPC `dashboard_stock` & `dashboard_incoming_transfers`.
- Stat cards: total stok, in-transit menuju lokasi, batch tertua, shortcut Kasir.
- Auto refresh: `DashboardAutoRefresh` memanggil `router.refresh()` tiap 10 menit (skip kalau `navigator.onLine === false`).

## 3. Master Data

### Produk (CRUD)
- Akses CRUD: **Super Admin**. Read: semua (RLS `read_products_all`).
- Halaman: `/master/products`.
- Tabel target: `public.products`.
- Aksi: tambah, edit, soft-delete (`is_active`), hard-delete (gagal kalau dipakai FK).
- Validasi UI: SKU otomatis uppercase, error 23505 → toast "SKU sudah dipakai".

### Lokasi (CRUD)
- Akses CRUD: **Super Admin**.
- Halaman: `/master/locations`.
- Tabel target: `public.locations`.
- Field: nama (unik), tipe (`gudang_produksi` / `outlet`), alamat opsional, `is_active`.
- Soft & hard delete sama dengan produk.

### Pengguna
- Akses: **Super Admin**.
- Halaman: `/master/users`.
- Section atas: **akun Auth belum ditugaskan** (sumber: RPC `admin_unlinked_users`). Klik "Tugaskan" untuk link ke role + lokasi via RPC `admin_user_upsert`.
- Section bawah: daftar profil aktif. Bisa edit (role, lokasi, nama, status) dan toggle aktif.
- Pengaman: tidak bisa menonaktifkan diri sendiri.

### Master Data (rekap)
- Halaman: `/master`. Read-only ringkasan dengan tombol "Kelola" ke detail per modul.

## 4. Inventory & Produksi

### Inventory per batch
- Akses: per lokasi yang dimiliki user (RLS `inv_read_by_location`).
- Halaman: `/inventory`.
- Sumber: query langsung `public.inventory_batches` + filter via search input.
- Indikator: `Fresh / ≤7 hari / ≤3 hari / Kedaluwarsa / Tanpa expired`.

### Produksi (Production In)
- Akses: **Super Admin** atau **Kepala Gudang** (guard di RPC `production_in`).
- Halaman: `/production`.
- RPC: `production_in(p_location_id, p_items, p_notes)`.
- Behavior: insert batch baru di lokasi target. Kalau kombinasi `(product, location, production_date)` sudah ada, qty diakumulasi (UPSERT).
- Validasi: qty>0, expired_date >= production_date, produk aktif (cek di RPC).

## 5. Kasir & Pengeluaran

### Kasir (Transaction Create)
- Akses: **Super Admin**, **Kepala Gudang**, **Kasir Outlet** (lihat seed permissions).
- Halaman: `/kasir`.
- RPC: `transaction_create`.
- Mode:
  - **FIFO otomatis** (default): klien panggil `fifo_preview` untuk menampilkan rincian. Server tetap re-allokasi via `fifo_allocate` untuk anti race-condition.
  - **Manual override batch**: kasir memilih batch & qty per batch. Aturan: `sum(override.qty) === item.qty`.
- Idempotency: setiap submit punya `client_uuid` baru. Replay return `idempotent_replay: true` tanpa side effect.
- Offline-first:
  - Saat `navigator.onLine === false`, payload masuk ke IndexedDB queue (`tx_queue`).
  - Saat online, `OfflineFlusher` dan tombol "Kirim sekarang" di panel antrean menjalankan `transaction_create` dengan `client_uuid` yang sama.

### Riwayat transaksi
- Halaman: `/transaksi`.
- Filter: tipe (`penjualan`/`complaiment`/`retur`/`rusak`/`lainnya`), rentang tanggal, search nomor/notes (sinkron ke URL).
- Limit: 100 baris terbaru per filter.
- Panel **Antrean Offline**: list dari IndexedDB store `tx_queue`. Aksi: kirim ulang, hapus.

## 6. Transfer (mutasi antar lokasi)

### Daftar transfer
- Halaman: `/transfers`.
- Tampil dua kolom: **Masuk** (lokasi user sebagai tujuan) & **Keluar** (sebagai asal).
- LocationPicker memungkinkan Super Admin/Kepala Gudang lintas-lokasi.

### Buat transfer
- Halaman: `/transfers/new`.
- RPC: `transfer_send(p_from, p_to, p_items, p_notes)`.
- Form pilih batch yang ada di lokasi asal (`gt('qty_available',0)`).
- Default lokasi asal = `gudang_produksi` pertama atau lokasi user.
- Validasi: from ≠ to, total qty per batch ≤ stok.

### Detail transfer + aksi
- Halaman: `/transfers/[id]`.
- Aksi (saat status `in_transit`):
  - **Terima Barang** → `transfer_receive`: stok masuk ke lokasi tujuan, akumulasi pada `(product, location, production_date)` yang sudah ada.
  - **Batalkan** → `transfer_cancel`: stok dikembalikan ke `source_batch_id` asal.
- FSM ketat: completed/cancelled tidak bisa diterima/dibatalkan ulang (error `P0003`).

## 7. PWA Offline

### IndexedDB Queue
- Modul: `web/src/lib/offline/queue.ts`.
- DB: `inventori-pwa` versi 1, store `tx_queue` (keyPath `client_uuid`, index `enqueued_at`).
- Dipakai oleh: form kasir saat offline + tombol manual flush.

### OfflineFlusher
- Komponen `web/src/components/shell/offline-flusher.tsx` di-mount di `(app)/layout.tsx`.
- Memantau event `online` + interval 30 detik.
- Strategi error: SQLSTATE `P0001/22023/P0002` → simpan error di item antrean (jangan retry tanpa user). Selain itu (transient/network) → retry berikutnya.

### Connection Pill
- Komponen header menampilkan status online/offline + jumlah antrean.

### Service Worker
- File: `web/public/sw.js`. Cache: `inv-static-v1` (aset Next), `inv-pages-v1` (HTML).
- Strategi:
  - Aset statis Next/_next + ikon → **cache-first**.
  - Halaman HTML → **network-first** dengan fallback ke cache lalu `/offline`.
  - Origin lain (Supabase) dan `/api`, `/auth` → **bypass** (jangan cache data dinamis).
- Registrasi: `ServiceWorkerRegister` di `app/layout.tsx`. Hanya aktif di `process.env.NODE_ENV === 'production'`.

### Halaman /offline
- Halaman fallback dengan link "Coba Lagi" ke `/`. Public di middleware.

## 8. RBAC

| Role | Halaman utama | Bisa mutasi |
| --- | --- | --- |
| Super Admin | semua, termasuk `/master/*` | semua |
| Kepala Gudang | dashboard, inventory, transfer, produksi | inventory, transfer, produksi |
| Kasir Outlet | dashboard, kasir, transfer (terima), inventory | transaction.create, transfer.update |
| Staf Outlet | dashboard, transfer (terima), inventory | transfer.update |

Sumber detail: tabel `roles` & `role_permissions` (seed `06_seed_data.sql`).

## 9. Test & QA

- Smoke test backend: `supabase\tests\run_tests.ps1` (Docker Postgres 16). Mencakup FIFO, manual override, transfer, dan provisioning trigger.
- Detail spec: `.kiro/specs/manual-override-batch/`.
- TypeScript: `npm run typecheck`. ESLint: `npm run lint`. Build: `npm run build`.
