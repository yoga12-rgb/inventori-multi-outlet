# Peta Halaman (Routes Next.js)

Aplikasi memakai App Router (`web/src/app/`). Group `(auth)` untuk halaman publik, `(app)` untuk halaman setelah login (di-wrap `requireSession`).

Format tabel:
- **Path** = rute URL.
- **File** = file utama (page.tsx).
- **Auth** = siapa yang boleh akses (di luar middleware).
- **Data** = sumber data (RPC, tabel, helper).
- **Mutasi** = RPC/tabel yang dipanggil saat user submit.

## Public

| Path | File | Fungsi |
| --- | --- | --- |
| `/login` | `(auth)/login/page.tsx` + `login-form.tsx` | Sign in via `supabase.auth.signInWithPassword`. |
| `/signup` | `(auth)/signup/page.tsx` + `signup-form.tsx` | Sign up; trigger DB membuat profil otomatis. |
| `/offline` | `app/offline/page.tsx` | Fallback halaman saat offline (di-cache SW). |

Middleware: `/_next`, `/favicon.ico`, `/manifest.webmanifest`, `/sw.js`, `/login`, `/signup`, `/offline` ada di `PUBLIC_PATHS`.

## App Shell

`(app)/layout.tsx` me-render Sidebar, Header (ConnectionPill + UserMenu), MobileNav, dan **OfflineFlusher** (auto sync queue).

## Setelah Login

### Dashboard

| Item | Detail |
| --- | --- |
| Path | `/` |
| File | `(app)/page.tsx` + `dashboard-auto-refresh.tsx` |
| Auth | Semua role |
| Data | `rpc dashboard_stock(loc?)`, `rpc dashboard_incoming_transfers(loc?)`. Loc bisa di-override via `?loc=`. |
| Mutasi | Tidak ada |
| Catatan | Polling client-side 10 menit via `router.refresh()` |

### Kasir

| Item | Detail |
| --- | --- |
| Path | `/kasir` |
| File | `(app)/kasir/page.tsx` (server) + `kasir-form.tsx` (client) |
| Auth | Permission `transaction.create` |
| Data | `select products`, `select inventory_batches` per lokasi |
| Mutasi | `rpc fifo_preview` (preview) → `rpc transaction_create` (commit). Saat offline → `enqueueTransaction` ke IndexedDB |
| Catatan | Mendukung manual override per batch |

### Transaksi (riwayat)

| Item | Detail |
| --- | --- |
| Path | `/transaksi` |
| File | `(app)/transaksi/page.tsx` + `filters.tsx` + `offline-queue-panel.tsx` |
| Auth | Permission `transaction.read` |
| Data | `select transactions` (join `transaction_items` & `products`), filter via query params (`type`, `from`, `to`, `q`) |
| Mutasi | Hanya untuk antrean offline: `rpc transaction_create` (kirim manual), atau hapus item antrean |
| Catatan | Limit 100 baris |

### Transfer

| Item | Detail |
| --- | --- |
| Path | `/transfers` |
| File | `(app)/transfers/page.tsx` |
| Auth | Permission `transfer.read` |
| Data | `select transfers` (join `from_location`, `to_location`); filter masuk/keluar berdasarkan lokasi terpilih |
| Mutasi | Tidak ada |

| Path | `/transfers/new` |
| --- | --- |
| File | `(app)/transfers/new/page.tsx` + `transfer-form.tsx` |
| Auth | Permission `transfer.create` |
| Data | `select locations`, `select products`, `select inventory_batches` per lokasi asal |
| Mutasi | `rpc transfer_send` |
| Catatan | Default lokasi asal = `gudang_produksi` pertama jika user tidak punya lokasi |

| Path | `/transfers/[id]` |
| --- | --- |
| File | `(app)/transfers/[id]/page.tsx` + `actions.tsx` |
| Auth | Permission `transfer.read` (untuk lokasi asal/tujuan) |
| Data | `select transfers` + `select transfer_items` |
| Mutasi | `rpc transfer_receive` atau `rpc transfer_cancel` (saat status `in_transit`) |

### Produksi

| Item | Detail |
| --- | --- |
| Path | `/production` |
| File | `(app)/production/page.tsx` + `production-form.tsx` |
| Auth | `Super Admin` atau `Kepala Gudang` (guard di server + RPC) |
| Data | `select locations`, `select products` (active only) |
| Mutasi | `rpc production_in` |
| Catatan | Setelah simpan → redirect ke `/inventory?loc=...` |

### Inventory

| Item | Detail |
| --- | --- |
| Path | `/inventory` |
| File | `(app)/inventory/page.tsx` |
| Auth | Permission `inventory.read` (filter RLS per lokasi) |
| Data | `select inventory_batches` per lokasi + `select products` |
| Mutasi | Tidak ada |
| Catatan | Search by SKU/nama (client-side filter) + indikator expired |

### Master Data

| Path | File | Auth | Mutasi |
| --- | --- | --- | --- |
| `/master` | `(app)/master/page.tsx` | semua | tidak ada (read-only ringkasan) |
| `/master/products` | `(app)/master/products/page.tsx` + `products-table.tsx` + `product-dialog.tsx` | Super Admin | `from('products').insert/update/delete` |
| `/master/locations` | `(app)/master/locations/...` | Super Admin | `from('locations').insert/update/delete` |
| `/master/users` | `(app)/master/users/page.tsx` + `users-manager.tsx` + `user-dialog.tsx` | Super Admin | `rpc admin_unlinked_users`, `rpc admin_user_upsert`, `from('users').update` (toggle aktif) |

### Profil

| Item | Detail |
| --- | --- |
| Path | `/profile` |
| File | `(app)/profile/page.tsx` + `profile-form.tsx` |
| Auth | Diri sendiri |
| Data | dari `requireSession()` |
| Mutasi | `from('users').update` (kolom `name`, `location_id`) |

## Komponen UI Bersama

- `components/ui/page-header.tsx` — header per halaman.
- `components/ui/empty-state.tsx` — pesan kosong dengan ikon.
- `components/ui/status-badge.tsx` — badge untuk status transfer.
- `components/ui/toast.tsx` — provider toast (di root layout).
- `components/shell/sidebar.tsx`, `mobile-nav.tsx` — navigasi.
- `components/shell/connection-pill.tsx` — indikator online + jumlah antrean.
- `components/shell/location-picker.tsx` — dropdown filter lokasi (sinkron ke `?loc=`).
- `components/shell/user-menu.tsx` — menu user (logout).
- `components/shell/offline-flusher.tsx` — listener `online` + interval flush.
- `components/shell/sw-register.tsx` — daftarkan service worker (production only).

## Helper

- `lib/session.ts` — `requireSession()` redirect ke `/login` kalau belum auth.
- `lib/format.ts` — formatter `id-ID`.
- `lib/errors.ts` — `humanizeSupabaseError`.
- `lib/supabase/client.ts` — browser client (singleton).
- `lib/supabase/server.ts` — server client per request.
- `lib/offline/queue.ts` — IndexedDB queue (open/list/enqueue/remove/update/count + event bus).
