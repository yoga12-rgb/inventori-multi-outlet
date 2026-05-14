ARCHITECTURE & BUSINESS LOGIC DOCUMENT (Backend-First)
Project: Sistem Inventori & Distribusi Multi-Outlet (PWA, Offline-First)
Phase 1 Target: Database Design (Supabase/PostgreSQL) & Backend Core Logic

1. Arsitektur Database (Rekomendasi Skema Relasional)
AI Agent wajib merancang skema database berikut di Supabase untuk mendukung logika bisnis:

RBAC (Role-Based Access Control):

roles: id, name (contoh: Super Admin, Kepala Gudang, Kasir Outlet).

permissions: id, module_name, action (Create, Read, Update, Delete).

role_permissions: role_id, permission_id.

users: id, role_id, location_id (lokasi default user bekerja), name, email.

Core Master Data:

locations: id, name, type (Gudang Produksi, Outlet). Contoh data: Gudang Pusat, Outlet Pamulang, Outlet Dago, Outlet Pajajaran, Outlet Sawangan.

products: id, name, sku. (Hanya barang jadi, tanpa bahan baku).

Inventory & Batches (Inti Aplikasi):

inventory_batches: id, product_id, location_id, production_date, expired_date, qty_available. (Stok dipisahkan per batch produksi).

Mutasi / Transfer (In-Transit Logic):

transfers: id, from_location_id, to_location_id, status (In-Transit, Completed, Cancelled), created_by, sent_at, received_at.

transfer_items: id, transfer_id, product_id, batch_id, qty.

Outbound / Barang Keluar (Kasir/Retur):

transactions: id, location_id, type (Penjualan, Complaiment, Retur, Rusak, Lainnya), created_at, created_by.

transaction_items: id, transaction_id, product_id, batch_id, qty.

2. Detail Logika Bisnis & Alur Aplikasi
A. Alur Mutasi Barang (Transfer & In-Transit Logic)
Konteks: Perpindahan barang antar entitas (Gudang ke Outlet, atau Outlet ke Outlet).
Logika Detail:

Pengirim (Gudang Pusat) membuat dokumen Transfer tujuan Outlet (misal: Outlet Pamulang).

Pengirim memilih produk dan batch produksi yang akan dikirim, lalu menekan "Kirim".

Sistem melakukan pengurangan stok (qty_available) pada inventory_batches di Gudang Pusat.

Sistem membuat record di tabel transfers dengan status In-Transit. Stok belum ditambahkan ke Outlet tujuan.

Penerima (Outlet Pamulang) melihat daftar barang yang sedang dalam perjalanan di dashboard mereka.

Penerima mengecek fisik barang. Jika sesuai, penerima menekan "Terima Barang".

Sistem mengubah status transfers menjadi Completed dan menambahkan stok ke inventory_batches milik Outlet Pamulang sesuai dengan batch tanggal produksi yang dikirim.

Cuplikan kode
sequenceDiagram
    participant P as Pengirim (Gudang)
    participant DB as Database (Supabase)
    participant T as Penerima (Outlet)

    P->>DB: 1. Create Transfer (Status: In-Transit)
    DB-->>DB: 2. Kurangi stok 'inventory_batches' di Gudang
    DB-->>T: 3. Notifikasi barang dalam perjalanan
    T->>DB: 4. Klik "Terima Barang"
    DB-->>DB: 5. Ubah Transfer Status -> Completed
    DB-->>DB: 6. Tambah stok 'inventory_batches' di Outlet tujuan (dengan batch sama)
    DB-->>T: 7. Stok Outlet Terupdate
B. Alur Pengeluaran Barang & Kasir (FIFO Auto-Deduct)
Konteks: Mengeluarkan barang untuk Penjualan, Retur, Complaiment, dll.
Logika Detail:

Kasir/Staf di Outlet memilih Produk, Jenis Pengeluaran (misal: Terjual), dan memasukkan Jumlah (qty).

Sistem mengecek ketersediaan total dari seluruh batch untuk produk tersebut di lokasi pengguna. Jika kurang, tolak transaksi.

Logika FIFO (Default): Sistem melakukan query ke inventory_batches dan mengurutkan berdasarkan production_date terlama (ASC).

Sistem mengalokasikan pengurangan stok mulai dari batch tertua. Jika qty pengeluaran lebih besar dari stok batch tertua, sistem akan menghabiskan batch tertua, lalu mengambil sisanya dari batch tertua kedua, dan seterusnya.

Manual Override: Pada UI (dirender dari response backend), kasir melihat rincian pemotongan batch ini. Kasir bisa mengintervensi dengan mengubah ID batch secara manual sebelum menyimpan transaksi akhir.

Sistem menyimpan ke transactions dan transaction_items, lalu memperbarui qty_available di inventory_batches.

Cuplikan kode
flowchart TD
    A[Mulai Transaksi Pengeluaran] --> B{Pilih Produk & Qty Out}
    B --> C[Query inventory_batches di Lokasi User]
    C --> D[Urutkan berdasarkan production_date ASC / Terlama]
    D --> E{Apakah total stok cukup?}
    E -- Tidak --> F[Tolak Transaksi: Stok Kurang]
    E -- Ya --> G[Terapkan Logika FIFO Auto-Deduct]
    G --> H[Tampilkan Rincian Potong Batch ke Kasir]
    H --> I{Kasir Ingin Ubah Batch Manual?}
    I -- Ya --> J[Kasir Pilih Batch Spesifik] --> K
    I -- Tidak --> K[Simpan Transaksi ke Database]
    K --> L[Kurangi qty_available di inventory_batches]
    L --> M[Selesai]
C. Alur Sinkronisasi Offline (Offline-First Logic)
Konteks: Menjaga transaksi (mutasi/pengeluaran) tetap berjalan saat koneksi internet mati.
Logika Detail:

Aplikasi menggunakan Local Database (IndexedDB) via Service Worker untuk menyimpan cache Master Data (Produk, Lokasi) dan Stok Terakhir (berdasarkan sinkronisasi terakhir).

Saat perangkat Offline, aksi pengguna (seperti transaksi kasir) divalidasi menggunakan data cache stok lokal.

Transaksi yang berhasil di-generate secara offline akan disimpan ke dalam queue (antrean) di IndexedDB lokal dengan status Pending Sync.

Stok lokal dikurangi secara visual agar kasir tidak menjual barang yang sama dua kali.

Saat event listener mendeteksi perangkat kembali Online (navigator.onLine == true), aplikasi secara sekuensial (satu per satu) mengirim data di queue ke endpoint Backend (Supabase).

Backend memvalidasi ulang transaksi terhadap stok real-time di server. Jika berhasil, record lokal dihapus. Jika gagal (misal: stok server ternyata sudah habis oleh user lain), berikan notifikasi konflik.

3. Instruksi Pelaksanaan untuk AI Agent
Karena kita menggunakan pendekatan Backend & Database First, urutan pengerjaan yang WAJIB Anda lakukan adalah:

Inisialisasi Database: Tulis skrip SQL (untuk Supabase) yang mencakup pembuatan tabel, relasi (Foreign Keys), dan tipe data untuk skema di atas.

Pembuatan RPC / Edge Functions: Karena logika FIFO memanipulasi banyak baris batch sekaligus dalam satu transaksi keluar, buatkan fungsi khusus di Supabase (seperti Stored Procedure / RPC) untuk menangani pemotongan FIFO ini secara aman (menggunakan Database Transactions / BEGIN...COMMIT).

Dokumentasi API: Buat spesifikasi endpoint atau format query Supabase JS Client yang akan digunakan oleh Frontend nantinya (termasuk query untuk menarik dashboard real-time dengan sinkronisasi setiap 10 menit).

TIDAK ADA UI DULU: Jangan menulis kode Next.js (React components/UI) sampai struktur database dan logika fungsi FIFO di sisi backend sudah tervalidasi dan diuji dengan data sampel.