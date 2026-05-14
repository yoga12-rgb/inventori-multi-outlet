# Web (Next.js 14 · App Router)

UI untuk **Sistem Inventori & Distribusi Multi-Outlet**. PWA-ready, offline-first untuk transaksi kasir.

## Quick Start

```powershell
cd web
copy .env.local.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Untuk apply migrasi SQL ke database tanpa Supabase CLI:

```powershell
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
npm run db:apply
```

Detail lengkap, termasuk mode lokal, ada di [`docs/SETUP_SUPABASE.md`](../docs/SETUP_SUPABASE.md).

## Halaman Utama

| Path | Fungsi | RPC / view |
| --- | --- | --- |
| `/login`, `/signup` | Auth Supabase. User pertama otomatis Super Admin. | `auth.signInWithPassword`, `auth.signUp` |
| `/` | Dashboard ringkasan stok & in-transit | `dashboard_stock`, `dashboard_incoming_transfers` |
| `/kasir` | Pengeluaran barang, FIFO + manual override | `fifo_preview`, `transaction_create` |
| `/transaksi` | 50 transaksi terbaru + antrean offline | `select transactions` + IndexedDB |
| `/transfers` | Transfer in/out | `select transfers` |
| `/transfers/new` | Buat transfer | `transfer_send` |
| `/transfers/[id]` | Detail + aksi terima/batal | `transfer_receive`, `transfer_cancel` |
| `/inventory` | Detail batch per produk | `select inventory_batches` |
| `/master` | Master data (read-only) | `select locations / products / roles` |
| `/profile` | Atur lokasi default user | `update users` |

## Offline-First

- Antrean transaksi disimpan di IndexedDB store `tx_queue` (DB `inventori-pwa`). Setiap item membawa `client_uuid`; idempotent saat di-replay (lihat `transaction_create` di `docs/API.md`).
- `OfflineFlusher` mendengar event `online` dan mem-flush tiap 30 detik.
- Indikator online/offline + jumlah antrean tampil di header.
- Saat user offline, payload langsung masuk antrean tanpa kontak server.

## Polling Dashboard

`DashboardAutoRefresh` memanggil `router.refresh()` setiap 10 menit (per `docs/API.md`). Polling dilewati saat `navigator.onLine === false`.

## Scripts

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm run start      # serve production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run db:apply   # jalankan supabase/migrations/*.sql via DATABASE_URL
```
