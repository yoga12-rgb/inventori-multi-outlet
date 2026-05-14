# Implementation Plan: Manual Override Batch

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Implementasi terbagi atas:

1. Membuat file test SQL baru `supabase/tests/test_manual_override.sql` skenario demi skenario.
2. Menyambungkannya ke `run_tests.ps1`.
3. Menjalankan smoke test penuh dan, jika ada bug RPC yang ditemukan, memperbaikinya di `03_functions_fifo.sql` (dengan tetap mempertahankan signature publik).
4. Memperbarui `docs/API.md`.

Setiap sub-task yang ditandai `*` adalah opsional (test/dokumentasi pendukung). Sub-task tanpa `*` wajib dieksekusi.

## Tasks

- [ ] 1. Bootstrap file test override
  - [ ] 1.1 Buat skeleton `supabase/tests/test_manual_override.sql`
    - File baru berisi satu DO block `language plpgsql` mengikuti gaya `test_fifo.sql`.
    - Deklarasi variabel: `v_outlet_dago, v_gudang, v_pa, v_pb, v_admin, v_b1, v_b2, v_b3, v_b_pb, v_b_gudang, v_qty_before, v_qty_after, v_tx jsonb, v_cid uuid, v_count int`.
    - Lookup master via `select id into ... from public.locations / products`.
    - Early return + `RAISE NOTICE` jika `public.users` kosong (mengikuti pola `test_fifo.sql`).
    - _Requirements: 3.4, 3.5_

  - [ ] 1.2 Implementasi blok persiapan batch (idempotent)
    - `INSERT ... ON CONFLICT (product_id, location_id, production_date) DO UPDATE SET qty_available = EXCLUDED.qty_available` untuk:
      - `(SKU-001, Outlet Dago, current_date - 30, qty 20)` → `v_b1`
      - `(SKU-001, Outlet Dago, current_date - 20, qty 30)` → `v_b2`
      - `(SKU-001, Outlet Dago, current_date - 10, qty 50)` → `v_b3`
      - `(SKU-002, Outlet Dago, current_date - 15, qty 25)` → `v_b_pb`
    - Setelah upsert, `select id into v_b1 ...` (dst) untuk mengambil UUID-nya.
    - Lookup `v_b_gudang` dari batch `(SKU-001, Gudang Pusat)` paling tua yang qty_available-nya > 0; tidak diubah.
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 2. Skenario sukses
  - [ ] 2.1 Skenario OVERRIDE_2_BATCH (Acceptance 1.1)
    - Snapshot `v_qty_b1_before`, `v_qty_b2_before`, `v_qty_b3_before`.
    - Panggil `transaction_create(p_location_id=v_outlet_dago, p_type='penjualan', p_items=[{product_id:v_pa, qty:15, override:[{v_b1,5},{v_b2,10}]}], p_client_uuid=gen_random_uuid(), p_created_by=v_admin)`.
    - Assert `(v_tx->>'idempotent_replay')::bool = false` dan `v_tx ? 'transaction_id'`.
    - Assert delta: `v_b1 -= 5`, `v_b2 -= 10`, `v_b3` tidak berubah.
    - Pakai `RAISE EXCEPTION 'ASSERTION FAILED: ...'` saat tidak sesuai.
    - _Requirements: 1.1_

  - [ ] 2.2 Skenario OVERRIDE_1_BATCH (Acceptance 1.2)
    - Snapshot `v_qty_b3_before`.
    - Panggil RPC dengan `qty=7`, `override=[{v_b3,7}]`.
    - Assert `v_b3 -= 7`.
    - _Requirements: 1.2_

- [ ] 3. Skenario error path
  - [ ] 3.1 Skenario QTY_MISMATCH → 22023 (Acceptance 1.3, 1.4)
    - Snapshot qty awal `v_b1, v_b2`.
    - Hitung `count(*) from public.transactions` ke `v_count`.
    - `BEGIN ... PERFORM transaction_create(qty=10, override=[{v_b1,4},{v_b2,4}]); RAISE EXCEPTION 'ASSERTION FAILED: expected 22023'; EXCEPTION WHEN sqlstate '22023' THEN RAISE NOTICE 'OK 22023'; WHEN OTHERS THEN RAISE; END;`
    - Assert `v_b1, v_b2` tidak berubah dari snapshot.
    - Assert `count(*) from public.transactions` tetap = `v_count`.
    - _Requirements: 1.3, 1.4_

  - [ ] 3.2 Skenario BATCH_LOCATION_MISMATCH → P0002 (Acceptance 1.5, 1.8)
    - Snapshot `qty_available` `v_b_gudang`.
    - `BEGIN ... PERFORM transaction_create(p_location_id=v_outlet_dago, qty=3, override=[{v_b_gudang,3}]); ... EXCEPTION WHEN sqlstate 'P0002' THEN ... END;`
    - Assert `v_b_gudang` tidak berubah.
    - _Requirements: 1.5, 1.8_

  - [ ] 3.3 Skenario BATCH_PRODUCT_MISMATCH → P0002 (Acceptance 1.6, 1.8)
    - Snapshot `qty_available` `v_b_pb`.
    - Panggilan RPC: `product_id=v_pa, qty=2, override=[{v_b_pb,2}]` (batch milik produk B, tapi item produk A).
    - Tangkap sqlstate `P0002`. Re-raise `WHEN OTHERS`.
    - Assert `v_b_pb` tidak berubah.
    - _Requirements: 1.6, 1.8_

  - [ ] 3.4 Skenario QTY_EXCEEDS_AVAILABLE → P0001 (Acceptance 1.7, 1.8)
    - Setelah 2.1, `v_b1.qty_available` = 15 (deterministik). Snapshot ulang.
    - Panggil RPC dengan `qty=99, override=[{v_b1,99}]` (total override = 99 = qty, jadi melewati validasi 22023).
    - Tangkap sqlstate `P0001`. Re-raise `WHEN OTHERS`.
    - Assert `v_b1` tidak berubah dari snapshot pre-call.
    - Jika `v_b1.qty_available` ≥ 99 (mis. fixture berubah di masa depan), `RAISE NOTICE 'SKIP 1.7: fixture tidak memungkinkan'` dan keluar dari sub-block tanpa error.
    - _Requirements: 1.7, 1.8_

- [ ] 4. Skenario idempotensi
  - [ ] 4.1 Skenario IDEMPOTENT_REPLAY (Acceptance 1.9)
    - Set `v_cid := gen_random_uuid()`.
    - Snapshot `v_qty_b3_before`.
    - Panggilan #1: `qty=4, override=[{v_b3,4}], p_client_uuid=v_cid`. Simpan `v_tx`.
    - Panggilan #2: payload identik, `p_client_uuid=v_cid`. Simpan `v_tx2`.
    - Assert `(v_tx2->>'idempotent_replay')::bool = true`.
    - Assert `v_tx2->>'transaction_id' = v_tx->>'transaction_id'`.
    - Assert `(select count(*) from public.transactions where client_uuid = v_cid) = 1`.
    - Assert `v_b3` hanya berkurang 4 (bukan 8) dibanding snapshot.
    - _Requirements: 1.9_

- [ ] 5. Wire ke pipeline
  - [ ] 5.1 Tambah `Invoke-Sql` untuk file test baru di `run_tests.ps1`
    - Insert satu baris `Invoke-Sql (Join-Path $tst "test_manual_override.sql")` tepat setelah baris `Invoke-Sql (Join-Path $tst "test_fifo.sql")`.
    - Tidak menyentuh parameter, urutan migrasi, atau `Write-Host "==> All scripts executed"`.
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 6. Checkpoint — Smoke test penuh
  - Jalankan `powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_tests.ps1` dari root repo.
  - Pastikan exit code 0 dan output memuat baris `==> Running ...test_manual_override.sql`.
  - Jika ada skenario yang gagal karena bug RPC nyata, lanjut ke task 7. Jika lulus, lompat ke task 8.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 6.1, 6.2_

- [ ] 7. (Kondisional) Perbaikan bug RPC jika ditemukan
  - [ ] 7.1 Ubah `supabase/migrations/03_functions_fifo.sql` minimal-invasive
    - Hanya patch logika di dalam fungsi `transaction_create`. Signature parameter & bentuk return TIDAK boleh berubah.
    - Tambah komentar singkat di header file menjelaskan perubahan dan referensi spec ini.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 7.2 Jalankan ulang `run_tests.ps1` sampai semua skenario lulus
    - Iterasi sampai exit code 0 + semua skenario di test override mencetak `OK ...` notice.
    - _Requirements: 6.1_

- [ ] 8. Update dokumentasi `docs/API.md`
  - [ ] 8.1 Tambah daftar 4 aturan validasi `Manual_Override`
    - Letakkan tepat di bawah blok JSON `p_items` di section `transaction_create`.
    - Tulis dalam bahasa Indonesia mengikuti gaya dokumen yang sudah ada.
    - Sebut SQLSTATE per aturan: `22023`, `P0002`, `P0002`, `P0001`.
    - _Requirements: 4.1_

  - [ ] 8.2 Tambah tabel matriks error spesifik `transaction_create`
    - Mencakup minimal 9 kondisi: total override mismatch (`22023`), batch lokasi salah (`P0002`), batch produk salah (`P0002`), batch tidak ditemukan (`P0002`), stok batch tidak cukup (`P0001`), `qty <= 0` (`22023`), `items` kosong/null (`22023`), `created_by` null (`22023`), FIFO total stok kurang (`P0001`).
    - _Requirements: 4.2_

  - [ ] 8.3 Pertegas klausa idempotensi saat override dipakai
    - Satu kalimat eksplisit: "Idempotensi via `p_client_uuid` tetap berlaku saat `override` digunakan".
    - _Requirements: 4.3_

- [ ] 9. Final checkpoint — Verifikasi tidak ada perubahan kontrak publik
  - Diff cek: `supabase/migrations/03_functions_fifo.sql` signature `transaction_create` tetap `(p_location_id, p_type, p_items, p_notes, p_client_uuid, p_created_by)` dan return `{transaction_id, transaction_number, idempotent_replay}`.
  - Diff cek: tidak ada perubahan di `01_schema.sql`, `06_seed_data.sql`, atau enum `transaction_type`.
  - Jalankan ulang `run_tests.ps1` sekali lagi sebagai konfirmasi akhir.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 5.1, 5.2, 5.3, 6.1_

## Notes

- Tasks marked with `*` are optional. Spec ini sengaja tidak menandai ada sub-task `*`; semua langkah dianggap wajib karena lingkupnya sudah minimal.
- Tasks 7 hanya dieksekusi jika smoke test di task 6 menemukan bug nyata. Kalau tidak ditemukan, lompat ke task 8.
- Task 6 dan 9 adalah checkpoint—wajib lulus sebelum melangkah.
- Sub-agent yang menjalankan tasks ini boleh menggabungkan task 8.1–8.3 dalam satu edit `docs/API.md` (satu file).
