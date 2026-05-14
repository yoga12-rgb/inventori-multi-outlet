# Requirements Document

## Introduction

Fitur ini mempertegas perilaku **manual override batch** pada RPC `transaction_create` (lihat `supabase/migrations/03_functions_fifo.sql`). RPC sudah mengimplementasikan jalur override (kasir mengirim daftar `{batch_id, qty}` sendiri ketimbang FIFO otomatis), tetapi belum punya:

1. Test SQL deterministik yang mengunci perilakunya, dan
2. Dokumentasi yang menyebut secara eksplisit aturan validasi & matriks error code.

Spec ini **tidak mengubah kontrak API publik** dan tidak mengubah seed (`06_seed_data.sql`). Jika selama menulis test ditemukan bug nyata di RPC, perbaikan boleh dilakukan di `03_functions_fifo.sql` selama tanda tangan fungsi & enum tidak berubah. Lingkup keluaran:

- File baru `supabase/tests/test_manual_override.sql` berisi 7 skenario terkait override (sukses, gagal validasi, idempotent).
- Perubahan `supabase/tests/run_tests.ps1` agar test baru ikut dieksekusi setelah `test_fifo.sql`.
- Penajaman `docs/API.md` bagian `transaction_create` (aturan override + tabel matriks error code).

## Glossary

- **RPC_Transaction_Create**: Fungsi PostgreSQL `public.transaction_create(p_location_id, p_type, p_items, p_notes, p_client_uuid, p_created_by)` di `supabase/migrations/03_functions_fifo.sql`.
- **Manual_Override**: Mode pemakaian RPC_Transaction_Create di mana setiap entri `p_items[i]` menyertakan field `override` berupa array `{ "batch_id": uuid, "qty": int }` sehingga kasir menentukan sendiri batch mana yang dipotong (bukan FIFO otomatis).
- **Test_Suite**: Kumpulan skrip SQL pada `supabase/tests/` yang dijalankan oleh `run_tests.ps1` di Postgres 16 (container `kiro-pg-test`, port host 55432).
- **Test_Override_File**: File SQL baru `supabase/tests/test_manual_override.sql` yang berisi DO block per skenario override.
- **API_Documentation**: File `docs/API.md` bagian `transaction_create`.
- **Idempotent_Replay**: Perilaku RPC_Transaction_Create yang mengembalikan `{ idempotent_replay: true, transaction_id }` ketika `p_client_uuid` sama dengan call sebelumnya, tanpa menambah baris di `transactions` / `transaction_items` dan tanpa mengubah `inventory_batches`.
- **Error_22023**: SQLSTATE `22023` — input tidak valid (mis. total qty override tidak sama dengan qty produk).
- **Error_P0001**: SQLSTATE `P0001` — stok batch tidak mencukupi.
- **Error_P0002**: SQLSTATE `P0002` — batch tidak ditemukan / tidak dimiliki lokasi atau produk yang dipilih.
- **Test_Location**: Lokasi `Outlet Dago` yang dipakai test ini agar tidak bertabrakan dengan `test_fifo.sql` (yang memakai `Gudang Pusat` dan `Outlet Pamulang`).
- **Test_Product_A**: Produk dengan SKU `SKU-001` (dari seed `06_seed_data.sql`).
- **Test_Product_B**: Produk dengan SKU `SKU-002` (dari seed `06_seed_data.sql`).

## Requirements

### Requirement 1 — Cakupan skenario test override

**User Story:** Sebagai engineer backend, saya ingin satu file test SQL yang mengeksekusi seluruh jalur kode `Manual_Override` di RPC_Transaction_Create, sehingga regresi pada cabang override langsung tertangkap saat `run_tests.ps1` dijalankan.

#### Acceptance Criteria

1. THE Test_Override_File SHALL berisi skenario override sukses dengan 2 batch berbeda (di Test_Location, Test_Product_A) yang setelah eksekusi mengurangi `qty_available` masing-masing batch tepat sebesar `qty` yang dikirim di `override[i].qty`.
2. THE Test_Override_File SHALL berisi skenario override sukses dengan 1 batch tunggal yang setelah eksekusi mengurangi `qty_available` batch tersebut tepat sebesar `qty` yang dikirim.
3. WHEN total dari `override[*].qty` tidak sama dengan `p_items[i].qty`, THE Test_Override_File SHALL memanggil RPC_Transaction_Create di dalam sub-block `BEGIN ... EXCEPTION WHEN sqlstate '22023'` dan memverifikasi bahwa Error_22023 ter-raise.
4. IF Error_22023 ter-raise pada skenario di Acceptance Criteria 1.3, THEN THE Test_Override_File SHALL memverifikasi bahwa `qty_available` seluruh batch yang disebut di payload tidak berubah dibanding sebelum panggilan, dan tidak ada baris baru di `public.transactions` / `public.transaction_items` yang berasal dari panggilan tersebut.
5. WHEN `override[k].batch_id` mereferensikan batch yang `location_id`-nya tidak sama dengan `p_location_id`, THE Test_Override_File SHALL memanggil RPC_Transaction_Create di dalam sub-block `BEGIN ... EXCEPTION WHEN sqlstate 'P0002'` dan memverifikasi bahwa Error_P0002 ter-raise.
6. WHEN `override[k].batch_id` mereferensikan batch yang `product_id`-nya tidak sama dengan `p_items[i].product_id`, THE Test_Override_File SHALL memanggil RPC_Transaction_Create di dalam sub-block `BEGIN ... EXCEPTION WHEN sqlstate 'P0002'` dan memverifikasi bahwa Error_P0002 ter-raise.
7. WHEN `override[k].qty` melebihi `qty_available` batch yang dirujuk **dan** total `override[*].qty` tetap sama dengan `p_items[i].qty` (sehingga validasi 22023 dilewati lebih dulu), THE Test_Override_File SHALL memanggil RPC_Transaction_Create di dalam sub-block `BEGIN ... EXCEPTION WHEN sqlstate 'P0001'` dan memverifikasi bahwa Error_P0001 ter-raise; jika data fixture tidak memungkinkan kondisi ini, THE Test_Override_File SHALL melewati skenario tersebut dengan `RAISE NOTICE`.
8. IF Error_P0002 atau Error_P0001 ter-raise pada skenario 1.5–1.7, THEN THE Test_Override_File SHALL memverifikasi bahwa `qty_available` batch yang dirujuk tidak berubah dibanding sebelum panggilan.
9. WHEN RPC_Transaction_Create dipanggil dua kali dengan `p_client_uuid` yang sama dan payload override yang valid, THE Test_Override_File SHALL memverifikasi bahwa panggilan kedua mengembalikan `idempotent_replay = true`, `transaction_id` yang sama dengan panggilan pertama, jumlah baris `public.transactions` dengan `client_uuid` tersebut tetap 1, dan `qty_available` batch yang dipotong hanya berkurang sebanyak satu kali.

### Requirement 2 — Integrasi test ke pipeline `run_tests.ps1`

**User Story:** Sebagai engineer yang menjalankan `run_tests.ps1`, saya ingin test override otomatis dieksekusi setelah `test_fifo.sql`, sehingga tidak ada langkah manual tambahan untuk memvalidasi cabang override.

#### Acceptance Criteria

1. THE `run_tests.ps1` SHALL memanggil `Invoke-Sql` pada `test_manual_override.sql` setelah pemanggilan `Invoke-Sql` pada `test_fifo.sql`.
2. WHEN salah satu pernyataan dalam `test_manual_override.sql` gagal (psql exit code ≠ 0), THE `run_tests.ps1` SHALL berhenti dengan exit code non-zero (mengikuti pola `throw "psql failed on $file"` yang sudah ada).
3. WHEN seluruh skenario di `test_manual_override.sql` lulus, THE `run_tests.ps1` SHALL menyelesaikan eksekusi dengan pesan `==> All scripts executed` (perilaku akhir tidak berubah).

### Requirement 3 — Test self-contained dan re-runnable

**User Story:** Sebagai engineer yang sedang debugging, saya ingin test override bisa dijalankan berulang tanpa bergantung pada side-effect test sebelumnya, sehingga hasilnya deterministik di run pertama maupun rerun.

#### Acceptance Criteria

1. THE Test_Override_File SHALL menyiapkan datanya sendiri di Test_Location dengan `INSERT ... ON CONFLICT (product_id, location_id, production_date) DO UPDATE SET qty_available = EXCLUDED.qty_available` sehingga setiap kali blok persiapan dijalankan (run pertama maupun rerun), `qty_available` setiap batch test kembali ke nilai awal yang diharapkan oleh skenario.
2. THE Test_Override_File SHALL TIDAK memodifikasi `06_seed_data.sql` atau bergantung pada batch yang dibuat oleh `test_fifo.sql` di `Gudang Pusat` / `Outlet Pamulang`.
3. THE Test_Override_File SHALL memilih `production_date` untuk batch test di Test_Location yang tidak bertabrakan dengan `production_date` apa pun di seed (yaitu menggunakan offset hari di luar `current_date - 5..current_date - 1`).
4. THE Test_Override_File SHALL membaca `created_by` dari `public.users` setelah `99_seed_test_user.sql` dijalankan oleh `run_tests.ps1` (mengikuti pola `select id into v_admin from public.users limit 1`); file ini tidak boleh membuat user dummy sendiri.
5. IF `public.users` kosong saat test dijalankan, THEN THE Test_Override_File SHALL menulis `RAISE NOTICE` peringatan dan keluar tanpa error (mengikuti pola `test_fifo.sql`).

### Requirement 4 — Penajaman dokumentasi `transaction_create`

**User Story:** Sebagai integrator frontend, saya ingin dokumentasi `transaction_create` di `docs/API.md` menjelaskan aturan validasi override dan setiap kemungkinan error code, sehingga UI bisa memetakan error ke pesan yang ramah tanpa membaca kode SQL.

#### Acceptance Criteria

1. THE API_Documentation SHALL memuat empat aturan validasi `Manual_Override` berikut sebagai daftar berbutir di bawah blok JSON `p_items`:
   1. Total `override[*].qty` harus sama dengan `p_items[i].qty` (jika tidak: `22023`).
   2. Setiap `override[k].batch_id` harus berada pada `p_location_id` (jika tidak: `P0002`).
   3. Setiap `override[k].batch_id` harus milik `p_items[i].product_id` (jika tidak: `P0002`).
   4. Setiap `override[k].qty` tidak boleh melebihi `qty_available` batch yang dirujuk (jika tidak: `P0001`).
2. THE API_Documentation SHALL memuat tabel matriks error untuk RPC_Transaction_Create yang memetakan kondisi → SQLSTATE, mencakup minimal: total override mismatch (`22023`), batch lokasi salah (`P0002`), batch produk salah (`P0002`), batch tidak ditemukan (`P0002`), stok batch tidak cukup (`P0001`), `qty <= 0` (`22023`), `items kosong` (`22023`), `created_by null` (`22023`).
3. THE API_Documentation SHALL menyatakan secara eksplisit bahwa idempotensi via `p_client_uuid` tetap berlaku saat `Manual_Override` dipakai.
4. THE API_Documentation SHALL TIDAK mengubah tanda tangan parameter atau bentuk return dari RPC_Transaction_Create yang sudah didokumentasikan.

### Requirement 5 — Tidak mengubah kontrak publik

**User Story:** Sebagai pengguna RPC, saya ingin tahu bahwa pekerjaan ini tidak memecahkan klien yang sudah memanggil `transaction_create`.

#### Acceptance Criteria

1. THE pekerjaan ini SHALL TIDAK mengubah signature parameter `transaction_create` (`p_location_id, p_type, p_items, p_notes, p_client_uuid, p_created_by`).
2. THE pekerjaan ini SHALL TIDAK mengubah bentuk JSON return (`{ transaction_id, transaction_number, idempotent_replay }`).
3. THE pekerjaan ini SHALL TIDAK mengubah enum `transaction_type` atau skema tabel `transactions` / `transaction_items` / `inventory_batches`.
4. WHERE selama menulis test ditemukan bug nyata di RPC_Transaction_Create, THE pekerjaan ini SHALL memperbaikinya di `supabase/migrations/03_functions_fifo.sql` tanpa melanggar Acceptance Criteria 5.1–5.3, dan menambahkan catatan singkat di header file SQL terkait perbaikan tersebut.

### Requirement 6 — Smoke test wajib lulus

**User Story:** Sebagai reviewer, saya ingin satu perintah memvalidasi bahwa semua test (lama maupun baru) lulus.

#### Acceptance Criteria

1. WHEN perintah `powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_tests.ps1` dijalankan dari root repo, THE Test_Suite SHALL menyelesaikan eksekusi dengan exit code 0.
2. WHEN perintah pada Acceptance Criteria 6.1 dijalankan, THE Test_Suite SHALL mencetak baris `==> Running ...test_manual_override.sql` di antara output.
