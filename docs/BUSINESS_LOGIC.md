# Business Logic Reference

> Dokumen ini fokus pada **invariants** dan **alasan keputusan**. Untuk implementasi detail, lihat file SQL/TS yang disebut.

## Invariants Stok

1. **`inventory_batches.qty_available >= 0`** — dijaga oleh CHECK constraint dan UPDATE bersyarat (`update ... where qty_available >= n returning ...`). Race condition antar transaksi konkuren ditangkis dengan `FOR UPDATE` row lock.
2. **Satu kombinasi `(product_id, location_id, production_date)` = satu baris batch** — UNIQUE constraint. Setiap `transfer_receive` dan `production_in` melakukan UPSERT (`ON CONFLICT ... DO UPDATE SET qty_available = qty_available + EXCLUDED.qty_available`).
3. **Batch hanya bisa dipotong di lokasi pemilik dan produk yang sama**. Validasi ada di `transaction_create` (manual override) dan `transfer_send`.
4. **Stok hanya bisa berubah lewat path tervalidasi**: `transaction_create` (out), `transfer_send`/`receive`/`cancel` (move), `production_in` (in). RLS membatasi WRITE langsung ke `inventory_batches` hanya untuk Super Admin (last resort).

## Alur Bisnis Lengkap

### A. FIFO Pengeluaran (`transaction_create`)

```
1. validate input (qty>0, items not empty, created_by)
2. if client_uuid sudah pernah → return { idempotent_replay: true }
3. insert public.transactions (transaction_number generated)
4. for each item:
   - if has override:
     - SUM(override.qty) must equal item.qty (else 22023)
     - alloc = item.override
   - else:
     - alloc = fifo_allocate(loc, product, qty)  // ASC by production_date, created_at
   - for each (batch_id, qty) in alloc:
     - SELECT FOR UPDATE batch (validate location & product)
     - UPDATE qty_available -= qty WHERE qty_available >= qty
     - INSERT transaction_items
5. return { transaction_id, transaction_number, idempotent_replay: false }
```

**Error code:**

| Kondisi | SQLSTATE |
| --- | --- |
| `created_by` null & `auth.uid()` null | `22023` |
| `items` kosong / `qty <= 0` | `22023` |
| `sum(override.qty) ≠ item.qty` | `22023` |
| Batch tidak ada / lokasi salah / produk salah | `P0002` |
| Stok kurang (FIFO total atau override per batch) | `P0001` |

Detail acceptance dan test: `.kiro/specs/manual-override-batch/`.

### B. Transfer In-Transit

```
transfer_send:
  1. validate from ≠ to, items not empty
  2. INSERT transfers (status='in_transit')
  3. for each item:
     - SELECT FOR UPDATE batch (location must = from)
     - check qty_available >= qty
     - UPDATE qty_available -= qty
     - INSERT transfer_items (snapshot production_date, expired_date, source_batch_id)
  4. return { transfer_id, status='in_transit' }

transfer_receive:
  1. SELECT FOR UPDATE transfer; status must be 'in_transit' (else P0003)
  2. group transfer_items by (product_id, production_date, expired_date), sum(qty)
  3. UPSERT into inventory_batches dengan ON CONFLICT akumulasi qty
  4. UPDATE transfers status='completed', received_at=now()

transfer_cancel:
  1. SELECT FOR UPDATE transfer; status must be 'in_transit'
  2. group transfer_items by source_batch_id
  3. UPDATE inventory_batches qty_available += sum(qty) (kembali ke batch asal)
  4. UPDATE transfers status='cancelled', cancelled_at=now()
```

**Catatan:**
- Status transition diawasi ketat: `in_transit → completed | cancelled`. Tidak ada path balik.
- Snapshot `production_date` & `expired_date` di `transfer_items` memastikan walau batch asal dimodifikasi, transfer tetap akurat untuk audit.

### C. Production In

```
1. role check: must be Super Admin or Kepala Gudang (else 42501)
2. validate location exists, items not empty
3. for each item:
   - product_id, production_date, qty wajib (else 22023)
   - expired_date >= production_date (else 22023)
   - product exists (else P0002)
   - UPSERT inventory_batches: ON CONFLICT akumulasi qty
4. return { location_id, items_processed }
```

### D. Idempotent Sync

```
Client (offline):
  - submit kasir → enqueueTransaction(payload) → IndexedDB tx_queue
  - generate client_uuid sekali, simpan di item antrean

Client (online):
  - OfflineFlusher (interval 30s + event 'online') call rpc transaction_create
    dengan client_uuid yang sama
  - jika response idempotent_replay = true → tetap removeQueueItem (sudah tercatat)
  - jika error 22023/P0001/P0002 → simpan last_error, jangan retry otomatis
  - jika error transient (network/5xx) → biarkan, retry berikutnya
```

**Pengaman idempotent:** `public.transactions.client_uuid` UNIQUE. Saat replay, RPC return `{ transaction_id (existing), idempotent_replay: true }` tanpa insert ulang & tanpa potong stok.

## RBAC & RLS

### Helper functions (`02_rls_policies.sql`)

```
current_user_role() → text  -- nama role profil user (auth.uid())
current_user_location() → uuid -- lokasi default profil
is_global_user() → bool  -- (Super Admin OR Kepala Gudang)
```

Ketiganya `security definer` agar tidak terjebak RLS rekursif saat dipanggil dari policy lain.

### Policy (ringkas)

| Resource | Read | Write |
| --- | --- | --- |
| `roles`, `permissions`, `role_permissions` | semua authenticated | (RPC saja) |
| `locations`, `products` | semua authenticated | Super Admin |
| `users` | self atau Super Admin | Super Admin |
| `inventory_batches` | global user atau lokasi user | Super Admin (jalur normal lewat RPC) |
| `transfers`, `transfer_items` | global user atau lokasi asal/tujuan | Super Admin (RPC) |
| `transactions`, `transaction_items` | global user atau lokasi user | Super Admin (RPC) |

> Mutasi via RPC `security definer` mem-bypass RLS karena dia berjalan sebagai owner. Akses dibatasi via guard role di dalam fungsi.

### Mengapa RLS kasih WRITE ke Super Admin saja?

Sebagai pengaman terakhir kalau ada bug menyebabkan client mencoba mutasi langsung ke tabel. Alur normal **tidak akan** menyentuh policy WRITE — selalu lewat RPC.

## Pemetaan Error Code → UI

| SQLSTATE | UI message (`humanizeSupabaseError`) | Asal |
| --- | --- | --- |
| `22023` | "Data input tidak valid" | validasi input RPC |
| `P0001` | "Stok tidak cukup" | FIFO/transfer/manual override |
| `P0002` | "Data tidak ditemukan atau bukan milik lokasi ini" | batch lookup |
| `P0003` | "Aksi tidak diizinkan untuk status saat ini" | transfer FSM |
| `42501` | (default `error.message`) | guard role di RPC admin / production_in |
| `23505` | (default; UI kasir/master tangani spesifik) | unique violation (mis. SKU duplicate) |

UI bisa membaca `error.code` dan menampilkan pesan yang lebih spesifik kalau perlu (contoh: dialog produk override 23505 → "SKU sudah dipakai produk lain").

## Konkurensi & Race Condition

### Skenario: dua kasir potong stok yang sama
- Setiap iterasi alokasi memakai `SELECT ... FOR UPDATE` pada `inventory_batches.id`.
- `UPDATE qty_available -= qty WHERE qty_available >= qty RETURNING 1` memastikan: jika stok sudah dipotong oleh transaksi lain di antara SELECT dan UPDATE, baris ini akan **tidak match** dan RPC raise `P0001`.
- Hasil: salah satu transaksi sukses, yang lain gagal dengan pesan stok tidak cukup. Tidak ada double-spend.

### Skenario: transfer_send & transaction_create di batch sama
Sama seperti di atas. Lock per row. Yang duluan commit menang.

## Snapshot vs Live Data

| Tempat | Snapshot? | Alasan |
| --- | --- | --- |
| `transfer_items.production_date / expired_date` | YA | jejak pengiriman tetap akurat walau batch asal diutak-atik |
| `transaction_items.batch_id` | TIDAK (FK ke batch) | batch ID stabil; qty_available bukan snapshot karena `transactions` immutable |
| `transactions` (tidak ada `updated_at`) | TIDAK | transaksi immutable; koreksi pakai retur (transaksi baru) |

## Konvensi Nomor Dokumen

- `transaction_number` = `TX-YYYYMMDD-HHMMSS-<6hex>` (di-generate di RPC).
- `transfer_number` = `TR-YYYYMMDD-HHMMSS-<6hex>`.
- Aman secara unique karena pakai timestamp + random hex; UNIQUE constraint sebagai safety net.

## Hal yang Tidak Ada (deliberate)

- **History stok per batch**: belum ada audit log siapa-mengubah-apa-kapan untuk `inventory_batches`. Bisa direkonstruksi dari `transactions`, `transfers`, `production_in` event. Kalau perlu real audit, tambah tabel `inventory_audit`.
- **Multi-currency / harga**: di luar scope Phase 1.
- **Bahan baku**: hanya `products` (barang jadi). Jika perlu BOM, tambah tabel terpisah.
- **Multi-tenant**: project ini single-tenant per Supabase project. Kalau perlu multi-tenant, tambah `tenant_id` di semua tabel + policies.

## Kalau Mau Menambah Fitur Mutasi Baru

Checklist:
1. Tulis migrasi SQL: tabel/kolom baru + index + RLS.
2. Tulis RPC `security definer` dengan:
   - guard role via `current_user_role()`.
   - validasi input (raise `22023` untuk yang invalid).
   - locking via `FOR UPDATE` saat menyentuh stok.
   - update bersyarat (`WHERE qty_available >= n`) lalu raise `P0001` kalau tidak match.
3. Update `docs/API.md` dengan signature & error code.
4. Tambah test SQL di `supabase/tests/test_<fitur>.sql` mengikuti pola `test_fifo.sql`. Append ke `run_tests.ps1`.
5. Update `docs/SCHEMA.md`, `docs/BUSINESS_LOGIC.md`, dan `docs/FEATURES.md`.
6. Bangun UI di `web/src/app/(app)/...`. Dipanggil via `supabase.rpc(...)`.
7. Run `npm run typecheck && npm run lint && npm run build`.
