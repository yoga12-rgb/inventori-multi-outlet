# Sistem Inventori & Distribusi Multi-Outlet

PWA offline-first untuk manajemen stok, mutasi antar lokasi, dan pengeluaran barang per outlet, didukung Supabase/PostgreSQL.

## Mulai dari mana?

| Kalau kamu... | Buka |
| --- | --- |
| Baru kenal repo ini | [`docs/OVERVIEW.md`](docs/OVERVIEW.md) |
| Mau setup Supabase project baru | [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) |
| Mau lihat halaman/fitur yang sudah ada | [`docs/FEATURES.md`](docs/FEATURES.md) & [`docs/PAGES.md`](docs/PAGES.md) |
| Mau paham invariants & rule bisnis | [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) |
| Mau setup environment dev | [`docs/DEV_GUIDE.md`](docs/DEV_GUIDE.md) |
| Cari kontrak RPC | [`docs/API.md`](docs/API.md) |
| Cari bentuk tabel / enum | [`docs/SCHEMA.md`](docs/SCHEMA.md) |
| Mau eksekusi spec yang ada | [`.kiro/specs/`](.kiro/specs/) |

## Struktur Folder Singkat

```
.
├── agent.md                          # spec asli, keputusan bisnis Phase 1
├── docs/                             # dokumentasi lengkap
├── supabase/
│   ├── migrations/                   # 01..07: skema, RLS, RPC, seed, trigger
│   ├── setup_supabase.sql            # gabungan migrasi 01-06 untuk SQL Editor
│   ├── setup_admin_rpc.sql           # RPC tambahan untuk halaman master & produksi
│   ├── setup_first_user.sql          # link auth ↔ public.users (opsional, ada trigger otomatis)
│   └── tests/                        # smoke test SQL + run_tests.ps1
└── web/                              # Next.js 14 App Router (PWA)
    ├── public/sw.js                  # service worker shell-cache
    ├── scripts/apply-sql.mjs         # apply SQL via DATABASE_URL
    └── src/...                       # halaman, komponen, helper
```

## Run Cepat

```cmd
cd "d:\WEB APP\web"
copy .env.local.example .env.local
:: edit .env.local: NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
```

Smoke test backend (butuh Docker Desktop):

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_tests.ps1
```

## Kontribusi

1. Spec dulu di `.kiro/specs/<feature>/` (Requirements → Design → Tasks).
2. Implementasi mengikuti tasks. Jangan menambah RPC tanpa update `docs/API.md`.
3. Setiap perubahan SQL: jalankan `run_tests.ps1` lokal.
4. Setiap perubahan TS: `npm run typecheck && npm run lint && npm run build`.
