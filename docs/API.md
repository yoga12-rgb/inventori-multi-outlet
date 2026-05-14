# API / RPC Contract

Semua mutasi dilakukan via Supabase RPC `security definer`. Frontend boleh `select` langsung pada tabel dan view (RLS-aware), tapi untuk `insert/update/delete` selalu pakai RPC di bawah.

## Konvensi Error

PostgreSQL error code yang dipakai RPC:

| Code | Arti aplikasi |
| --- | --- |
| `22023` | Input tidak valid (qty <= 0, items kosong, lokasi sama, dsb.) |
| `P0001` | Stok tidak cukup |
| `P0002` | Resource tidak ditemukan / tidak dimiliki lokasi |
| `P0003` | State transition ilegal (mis. menerima transfer yang sudah completed) |

Frontend bisa membaca `error.code` dari Supabase JS untuk pesan yang ramah.

## 1. FIFO

### `fifo_preview(p_location_id, p_product_id, p_qty)`
Read-only. Mengembalikan baris alokasi:
```ts
type FifoRow = {
  batch_id: string;
  production_date: string;        // ISO date
  expired_date: string | null;
  qty_available: number;          // sebelum dipotong
  qty_take: number;               // jumlah yang akan diambil
};
```

```ts
const { data, error } = await supabase.rpc('fifo_preview', {
  p_location_id: locationId,
  p_product_id: productId,
  p_qty: qty,
});
```

### `transaction_create(p_location_id, p_type, p_items, p_notes?, p_client_uuid?, p_created_by?)`
Membuat transaksi pengeluaran. Atomic: semua batch dipotong & semua item ter-insert atau gagal seluruhnya.

`p_items` JSON:
```jsonc
[
  {
    "product_id": "uuid",
    "qty": 45,
    // optional: kasir override batch alokasi (total qty harus = qty produk)
    "override": [
      { "batch_id": "uuid", "qty": 30 },
      { "batch_id": "uuid", "qty": 15 }
    ]
  }
]
```

**Aturan validasi `override`:**

1. Total `override[*].qty` harus sama dengan `p_items[i].qty`. Jika tidak: `22023`.
2. Setiap `override[k].batch_id` harus berada di `p_location_id`. Jika tidak: `P0002`.
3. Setiap `override[k].batch_id` harus milik `p_items[i].product_id`. Jika tidak: `P0002`.
4. Setiap `override[k].qty` tidak boleh melebihi `qty_available` batch yang dirujuk. Jika tidak: `P0001`.

Idempotency:
- Kirim `p_client_uuid` (UUID dari client / IndexedDB queue).
- Jika sudah pernah masuk, RPC mengembalikan `{ idempotent_replay: true, transaction_id }` tanpa membuat transaksi baru.
- Idempotensi via `p_client_uuid` tetap berlaku saat `override` digunakan: panggilan kedua dengan `p_client_uuid` yang sama mengembalikan `transaction_id` yang sama dan tidak memotong batch ulang.

Return:
```ts
{ transaction_id: string; transaction_number?: string; idempotent_replay: boolean }
```

**Matriks error `transaction_create`:**

| Kondisi | SQLSTATE |
| --- | --- |
| `p_created_by` null & `auth.uid()` null | `22023` |
| `p_items` kosong / null | `22023` |
| `p_items[i].qty <= 0` | `22023` |
| `sum(override[*].qty) <> p_items[i].qty` | `22023` |
| `override[k].batch_id` tidak ditemukan di DB | `P0002` |
| `override[k].batch_id` lokasi ≠ `p_location_id` | `P0002` |
| `override[k].batch_id` produk ≠ `p_items[i].product_id` | `P0002` |
| `override[k].qty` > `qty_available` batch yang dirujuk | `P0001` |
| Mode FIFO: total stok produk di lokasi < `p_items[i].qty` | `P0001` |

Contoh pemakaian (offline-first):
```ts
const clientUuid = crypto.randomUUID();         // simpan di queue lokal
queue.put({
  clientUuid,
  payload: { p_location_id, p_type: 'penjualan', p_items },
});

// flush saat online
const { data, error } = await supabase.rpc('transaction_create', {
  p_location_id,
  p_type: 'penjualan',
  p_items,
  p_client_uuid: clientUuid,
});
if (!error) queue.delete(clientUuid);
```

## 2. Transfer

### `transfer_send(p_from_location_id, p_to_location_id, p_items, p_notes?, p_created_by?)`
`p_items` JSON:
```jsonc
[
  { "batch_id": "uuid", "qty": 20 },
  { "batch_id": "uuid", "qty": 5 }
]
```
Stok di lokasi asal langsung dipotong; transfer berstatus `in_transit`.

Return: `{ transfer_id, transfer_number, status: 'in_transit' }`.

### `transfer_receive(p_transfer_id, p_received_by?)`
Outlet tujuan menerima. Stok ditambahkan ke lokasi tujuan dengan `production_date` & `expired_date` yang sama dengan batch asal (digabung jika ada batch produksi tanggal sama).

Return: `{ transfer_id, status: 'completed' }`.

### `transfer_cancel(p_transfer_id)`
Hanya saat status `in_transit`. Stok dikembalikan ke batch asal.

Return: `{ transfer_id, status: 'cancelled' }`.

## 3. Dashboard

### `dashboard_stock(p_location_id?)`
Default = lokasi user (`current_user_location()`). Mengembalikan ringkasan stok per produk.

```ts
type DashboardStock = {
  product_id: string;
  product_sku: string;
  product_name: string;
  qty_total: number;
  batch_count: number;
  oldest_production_date: string | null;
  nearest_expired_date: string | null;
};
```

### `dashboard_incoming_transfers(p_location_id?)`
Daftar transfer `in_transit` yang menuju lokasi tertentu.

```ts
type IncomingTransfer = {
  transfer_id: string;
  transfer_number: string;
  from_location_id: string;
  from_location: string;
  sent_at: string;
  total_qty: number;
  product_count: number;
};
```

## 4. View

`v_stock_by_location` bisa di-select langsung. Berguna untuk laporan lintas lokasi (Super Admin / Kepala Gudang).

## 5. Polling Dashboard

PWA disarankan polling `dashboard_stock` & `dashboard_incoming_transfers` setiap 10 menit. Saat offline, data terakhir di IndexedDB cukup. Saat kembali online:

1. Flush antrean `transaction_create` (idempotent via `p_client_uuid`).
2. Refresh `dashboard_stock`.

## 6. Kebijakan Sinkronisasi Offline (rangkuman)

| Tahap | Lokasi data | Keterangan |
| --- | --- | --- |
| Cache master | IndexedDB | `locations`, `products`, `inventory_batches` snapshot |
| Validasi offline | IndexedDB | UI menolak qty melebihi cache lokal |
| Queue | IndexedDB | `client_uuid + payload` |
| Flush | RPC | `transaction_create` dengan `p_client_uuid` |
| Konflik (stok server tidak cukup) | UI | Tampilkan notif dari `error.code = P0001` |


---

## RPC Tambahan (file `supabase/setup_admin_rpc.sql`)

### `production_in(p_location_id, p_items, p_notes?)`

Tambah stok ke lokasi (umumnya gudang produksi). UPSERT pada kombinasi `(product, location, production_date)`.

`p_items` JSON:
```jsonc
[
  {
    "product_id": "uuid",
    "production_date": "YYYY-MM-DD",
    "expired_date": "YYYY-MM-DD",   // optional
    "qty": 100
  }
]
```

Akses: hanya `Super Admin` atau `Kepala Gudang` (raise `42501` kalau bukan).

Error code:

| Kondisi | SQLSTATE |
| --- | --- |
| Bukan Super Admin / Kepala Gudang | `42501` |
| `location_id` null atau `items` kosong | `22023` |
| `qty <= 0` | `22023` |
| `expired_date < production_date` | `22023` |
| Lokasi/produk tidak ditemukan | `P0002` |

Return:
```ts
{ location_id: string; items_processed: number; notes: string | null }
```

### `admin_unlinked_users()`

Mengembalikan daftar `auth.users` yang belum punya profil di `public.users`. Dipakai halaman `/master/users` untuk menampilkan kandidat user yang siap di-link.

Akses: `Super Admin` saja (`42501`).

Return shape:
```ts
{ id: string; email: string; created_at: string }[]
```

### `admin_user_upsert(p_auth_user_id, p_role_id, p_location_id, p_name, p_is_active?)`

Insert / update profil di `public.users` dengan email yang selalu disinkronkan dari `auth.users`. Idempotent (re-call dengan parameter sama → update kolom).

Akses: `Super Admin`.

Error code:
| Kondisi | SQLSTATE |
| --- | --- |
| Bukan Super Admin | `42501` |
| `auth_user_id`, `role_id`, atau `name` kosong | `22023` |
| Auth user tidak ada di `auth.users` | `P0002` |

Return:
```ts
{ id: string; email: string }
```

## Trigger DB

### `trg_handle_new_auth_user`
- File: `supabase/migrations/07_auth_user_provisioning.sql`.
- Pasang di `auth.users AFTER INSERT FOR EACH ROW`.
- Membuat profil di `public.users` otomatis. Role default: user pertama → Super Admin, berikutnya → Staf Outlet.
- Skip kalau profil sudah ada.
