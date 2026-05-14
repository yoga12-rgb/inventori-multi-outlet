# Schema Reference

Dokumen ini menjelaskan tiap tabel, relasi, dan keputusan desain. Sumber kebenaran: file SQL di `supabase/migrations/`.

## Enum

| Enum | Nilai |
| --- | --- |
| `location_type` | `gudang_produksi`, `outlet` |
| `transfer_status` | `in_transit`, `completed`, `cancelled` |
| `transaction_type` | `penjualan`, `complaiment`, `retur`, `rusak`, `lainnya` |
| `permission_action` | `create`, `read`, `update`, `delete` |
## RBAC

### `roles`
`id (uuid)`, `name (unique)`, `description`, `created_at`, `updated_at`.

### `permissions`
`id`, `module_name`, `action (permission_action)`, `description`. Unique pada `(module_name, action)`.

### `role_permissions`
Join table `role_id` ↔ `permission_id`, primary key komposit.

### `users`
Profil aplikasi yang **mereferensikan `auth.users(id)`**. Wajib memiliki `role_id`; `location_id` opsional (Super Admin tidak terikat lokasi).

## Master Data

### `locations`
`name` unique, `type` enum. Seed: Gudang Pusat + 4 outlet.

### `products`
Hanya barang jadi. `sku` unique, `unit` default `pcs`.

## Inventory

### `inventory_batches`
Stok dipisah per batch produksi.

- Unique `(product_id, location_id, production_date)` — saat produksi atau penerimaan transfer di tanggal yang sama, stok diakumulasikan ke baris yang sudah ada (lihat `transfer_receive` `ON CONFLICT`).
- `qty_available >= 0` dijaga oleh CHECK constraint.
- Index `(location_id, product_id, production_date asc)` mendukung query FIFO.
- Index parsial pada `expired_date` untuk laporan kedaluwarsa.

## Transfer (mutasi)

### `transfers`
- `transfer_number` unik (di-generate RPC).
- `from_location_id <> to_location_id` dijaga CHECK.
- Status mengikuti FSM: `in_transit → completed | cancelled`.
- Index `(to_location_id, status)` & `(from_location_id, status)` untuk dashboard.

### `transfer_items`
Snapshot batch asal: `source_batch_id`, `production_date`, `expired_date`. Kalau saat penerimaan batch asal sudah berubah, snapshot tetap akurat untuk audit.

## Transactions (pengeluaran)

### `transactions`
- `client_uuid` unik (nullable). Dipakai sebagai **idempotency key** saat sinkronisasi offline.
- Tidak ada kolom `updated_at` — transaksi dianggap immutable; koreksi dilakukan via transaksi baru bertipe `retur`.

### `transaction_items`
Mengikat ke batch tertentu sehingga jejak pengurangan FIFO bisa dilihat di laporan.

## RLS Ringkas

| Resource | Read | Write |
| --- | --- | --- |
| Master (roles, perms, locations, products) | Semua user terautentikasi | Super Admin |
| `users` | Diri sendiri atau Super Admin | Super Admin |
| `inventory_batches` | Lokasi user atau global | Super Admin (mutasi via RPC `security definer`) |
| `transfers` / `transfer_items` | Lokasi asal/tujuan atau global | Super Admin (mutasi via RPC) |
| `transactions` / `transaction_items` | Lokasi user atau global | Super Admin (mutasi via RPC) |

> Semua mutasi data dilakukan lewat **RPC `security definer`** sehingga policy write boleh ketat tanpa membatasi alur normal aplikasi.
