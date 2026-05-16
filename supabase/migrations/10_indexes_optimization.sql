-- =====================================================================
-- 10_indexes_optimization.sql
-- Indeks tambahan untuk pola query yang sudah dipakai oleh UI & RPC.
-- Aman dijalankan ulang: semua memakai IF NOT EXISTS dan tidak mengubah
-- data. Tidak men-DROP index yang ada.
--
-- Ringkasan dampak:
--   - inventory_pivot (RPC) → join transaction_items / transfer_items
--     berdasarkan product_id sekarang punya akses indeks.
--   - /transaksi dengan filter kategori → memakai komposit baru.
--   - dashboard_incoming_transfers → partial index khusus in_transit.
--   - transfer_cancel → group by source_batch_id terindeks.
--
-- Jika di masa depan tabel master_data tumbuh besar, tambahan
-- pg_trgm + GIN index untuk pencarian ilike '%kata%' bisa
-- dipertimbangkan; saat ini belum dibutuhkan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- transaction_items
-- ---------------------------------------------------------------------
-- Group/lookup per produk pada laporan inventory_pivot serta query
-- analitik lainnya. transaction_id sudah punya indeks; product_id belum.
create index if not exists idx_transaction_items_product
  on public.transaction_items (product_id);

-- ---------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------
-- Filter cepat per kategori (UI: /transaksi → dropdown kategori).
create index if not exists idx_transactions_category
  on public.transactions (category_id);

-- Komposit untuk halaman /transaksi saat filter kategori dipakai.
-- (location_id, category_id, created_at desc) memungkinkan planner
-- memenuhi WHERE location_id = ? AND category_id = ? lalu langsung
-- mengikuti urutan ORDER BY tanpa sort tambahan.
create index if not exists idx_transactions_location_category_created
  on public.transactions (location_id, category_id, created_at desc);

-- ---------------------------------------------------------------------
-- transfer_items
-- ---------------------------------------------------------------------
-- inventory_pivot mem-group transfer_items per product_id untuk
-- agregasi mutasi keluar/masuk per kategori operasional.
create index if not exists idx_transfer_items_product
  on public.transfer_items (product_id);

-- transfer_cancel mengembalikan stok berdasarkan source_batch_id
-- (group by source_batch_id). Mendukung audit "berapa kali batch X
-- dikirim?" tanpa scan penuh.
create index if not exists idx_transfer_items_source_batch
  on public.transfer_items (source_batch_id);

-- ---------------------------------------------------------------------
-- transfers
-- ---------------------------------------------------------------------
-- dashboard_incoming_transfers (RPC) memfilter status='in_transit'
-- dan mengurutkan terbaru. Index parsial sangat ramping karena
-- mayoritas transfer akan ter-completed; baris in-transit selalu
-- jumlah kecil.
create index if not exists idx_transfers_in_transit_recent
  on public.transfers (sent_at desc)
  where status = 'in_transit';

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
-- current_user_role() join roles via role_id setiap kali RLS
-- mengevaluasi policy. PK pada users.id sudah cepat (1 baris), tetapi
-- index ini juga membantu laporan "user per role" jika ditambahkan.
create index if not exists idx_users_role
  on public.users (role_id);
