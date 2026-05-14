# Overview Sistem & Peta Dokumentasi

> Bacaan pertama untuk agent atau developer baru yang bekerja di repo ini.
> Dokumen ini sengaja singkat dan menunjuk ke file lain yang lebih detail.

## Tujuan Sistem

PWA offline-first untuk manajemen inventori multi-outlet dengan logika **batch + FIFO**, **transfer in-transit** antar lokasi, dan **idempotent sync** untuk transaksi kasir saat offline.

Sumber kebenaran arsitektur dan logika bisnis:

- `agent.md` — keputusan bisnis & arsitektur asli (Phase 1: backend-first).
- `docs/SCHEMA.md` — penjelasan tabel, enum, dan relasi.
- `docs/API.md` — kontrak RPC & contoh pemakaian Supabase JS.
- `docs/SETUP_SUPABASE.md` — langkah deploy ke Supabase project (manual atau via skrip).
- `docs/FEATURES.md` — daftar fitur fungsional + alur per role.
- `docs/PAGES.md` — daftar halaman (rute) Next.js + props/data fetch.
- `docs/BUSINESS_LOGIC.md` — invariants, validasi, error code, dan alasan keputusan.
- `docs/DEV_GUIDE.md` — cara setup dev, jalankan test, deploy SQL, dan konvensi kode.

## Stack

| Layer | Pilihan |
| --- | --- |
| DB | Supabase PostgreSQL 15+ (kompatibel `auth` schema bawaan) |
| Logika | RPC PL/pgSQL `security definer` dengan guard role di dalam fungsi |
| Auth | Supabase Auth (email + password) |
| Frontend | Next.js 14 App Router + `@supabase/ssr` + Tailwind |
| Offline | IndexedDB queue (`idb`) + service worker shell-cache |
| Test | psql DO blocks via `run_tests.ps1` (Postgres 16 di Docker) |

## Struktur Folder

```
.
├── agent.md                          # spec asli, keputusan bisnis
├── docs/                             # dokumentasi (kamu di sini)
├── supabase/
│   ├── migrations/                   # 01-07: skema, RLS, RPC, seed, trigger
│   ├── setup_supabase.sql            # gabungan migrasi 01-06 untuk SQL Editor
│   ├── setup_admin_rpc.sql           # RPC tambahan untuk halaman master
│   ├── setup_first_user.sql          # link auth ↔ public.users awal
│   └── tests/                        # test SQL + harness Docker
└── web/                              # Next.js
    ├── public/
    │   ├── manifest.webmanifest
    │   └── sw.js                     # service worker (shell cache)
    ├── scripts/apply-sql.mjs         # apply SQL via DATABASE_URL (alternatif SQL Editor)
    └── src/
        ├── app/
        │   ├── (app)/                # halaman setelah login
        │   ├── (auth)/               # login & signup
        │   └── offline/              # fallback PWA
        ├── components/
        ├── lib/
        │   ├── offline/queue.ts      # IndexedDB queue
        │   ├── supabase/             # client/server helper
        │   ├── session.ts            # require auth session helper
        │   ├── format.ts             # date/number formatter id-ID
        │   └── errors.ts             # mapping SQLSTATE → pesan
        └── middleware.ts             # auth gate per route
```

## Tiga Aturan Emas (jangan dilanggar tanpa alasan kuat)

1. **Mutasi data lewat RPC, bukan langsung ke tabel.** RLS membuka WRITE hanya untuk Super Admin sebagai pengaman akhir; alur normal (FIFO, transfer, produksi) menggunakan RPC `security definer`. Kalau perlu fitur mutasi baru, tambahkan RPC dengan guard role + idempotency.
2. **Stok hanya bisa berkurang/bertambah lewat path yang tervalidasi:** `transaction_create` (keluar), `transfer_send`/`receive`/`cancel` (mutasi), `production_in` (masuk). Semua atomic dalam satu transaksi DB.
3. **Setiap transaksi kasir harus idempotent.** UI **harus** mengirim `client_uuid`. Replay tidak menambah baris transaction & tidak memotong stok ulang. Lihat `transaction_create` di `docs/API.md`.

## Konvensi Tambahan

- **Bahasa**: dokumentasi & komentar SQL/UI dalam Bahasa Indonesia. Identifier kode (variabel, kolom, file) tetap English.
- **Tanggal**: kolom DB pakai `date` / `timestamptz`, format display via `lib/format.ts` (locale `id-ID`).
- **Angka**: `formatNumber` pakai `Intl.NumberFormat("id-ID")`.
- **Error → UI**: gunakan `humanizeSupabaseError` agar SQLSTATE diterjemahkan jadi pesan ramah.

## Peta Cepat (file mana untuk apa)

| Pertanyaan | Lihat |
| --- | --- |
| "Apa fitur yang sudah ada?" | `docs/FEATURES.md` |
| "Halaman X mengerjakan apa?" | `docs/PAGES.md` |
| "Apa rule bisnis di balik FIFO/transfer/production?" | `docs/BUSINESS_LOGIC.md` |
| "Bagaimana setup Supabase project baru?" | `docs/SETUP_SUPABASE.md` |
| "Bagaimana skema tabelnya?" | `docs/SCHEMA.md` |
| "Apa bentuk RPC dan error code-nya?" | `docs/API.md` |
| "Bagaimana cara dev/build/test?" | `docs/DEV_GUIDE.md` |
| "Spec fitur tertentu?" | `.kiro/specs/<feature>/` |
