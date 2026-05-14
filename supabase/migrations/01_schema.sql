-- =====================================================================
-- 01_schema.sql
-- Skema inti: enum, tabel, foreign key, index, trigger updated_at.
-- Idempotent: aman dijalankan ulang (DROP TYPE/TABLE IF EXISTS dipakai
-- hanya di lingkungan dev; untuk production cukup gunakan migration baru).
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- email case-insensitive

-- ---------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_type') then
    create type location_type as enum ('gudang_produksi', 'outlet');
  end if;

  if not exists (select 1 from pg_type where typname = 'transfer_status') then
    create type transfer_status as enum ('in_transit', 'completed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type transaction_type as enum ('penjualan', 'complaiment', 'retur', 'rusak', 'lainnya');
  end if;

  if not exists (select 1 from pg_type where typname = 'permission_action') then
    create type permission_action as enum ('create', 'read', 'update', 'delete');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- Helper: trigger updated_at
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end$$;

-- ---------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  module_name text not null,
  action      permission_action not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (module_name, action)
);

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  type       location_type not null,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  sku        text not null unique,
  name       text not null,
  unit       text not null default 'pcs',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile user, dipisah dari auth.users (Supabase Auth) supaya bisa
-- referensi role & lokasi tanpa mengubah skema auth.
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role_id     uuid not null references public.roles(id),
  location_id uuid references public.locations(id),
  name        text not null,
  email       citext not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Inventory & batch
-- ---------------------------------------------------------------------
create table if not exists public.inventory_batches (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete restrict,
  location_id     uuid not null references public.locations(id) on delete restrict,
  production_date date not null,
  expired_date    date,
  qty_available   integer not null default 0 check (qty_available >= 0),
  batch_code      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Satu kombinasi (product, location, production_date) = satu batch logis
  unique (product_id, location_id, production_date)
);

create index if not exists idx_inventory_batches_lookup
  on public.inventory_batches (location_id, product_id, production_date asc);

create index if not exists idx_inventory_batches_expired
  on public.inventory_batches (expired_date)
  where expired_date is not null;

-- ---------------------------------------------------------------------
-- Transfer (mutasi antar lokasi)
-- ---------------------------------------------------------------------
create table if not exists public.transfers (
  id               uuid primary key default gen_random_uuid(),
  transfer_number  text not null unique,
  from_location_id uuid not null references public.locations(id),
  to_location_id   uuid not null references public.locations(id),
  status           transfer_status not null default 'in_transit',
  notes            text,
  created_by       uuid not null references public.users(id),
  sent_at          timestamptz not null default now(),
  received_by      uuid references public.users(id),
  received_at      timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create index if not exists idx_transfers_to_status
  on public.transfers (to_location_id, status);

create index if not exists idx_transfers_from_status
  on public.transfers (from_location_id, status);

create table if not exists public.transfer_items (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references public.transfers(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  -- Snapshot batch asal (di lokasi pengirim).
  source_batch_id uuid not null references public.inventory_batches(id),
  production_date date not null,
  expired_date    date,
  qty             integer not null check (qty > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_transfer_items_transfer
  on public.transfer_items (transfer_id);

-- ---------------------------------------------------------------------
-- Transactions (pengeluaran barang)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  location_id        uuid not null references public.locations(id),
  type               transaction_type not null,
  notes              text,
  -- Dipakai untuk de-duplikasi dari sinkronisasi offline.
  client_uuid        uuid unique,
  created_by         uuid not null references public.users(id),
  created_at         timestamptz not null default now()
);

create index if not exists idx_transactions_location_created
  on public.transactions (location_id, created_at desc);

create table if not exists public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  batch_id       uuid not null references public.inventory_batches(id),
  qty            integer not null check (qty > 0),
  created_at     timestamptz not null default now()
);

create index if not exists idx_transaction_items_transaction
  on public.transaction_items (transaction_id);

create index if not exists idx_transaction_items_batch
  on public.transaction_items (batch_id);

-- ---------------------------------------------------------------------
-- Trigger updated_at untuk tabel yang punya kolom tersebut
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'roles','locations','products','users',
      'inventory_batches','transfers'
    ])
  loop
    execute format(
      'drop trigger if exists trg_set_updated_at on public.%I;', t
    );
    execute format(
      'create trigger trg_set_updated_at
         before update on public.%I
         for each row execute function public.tg_set_updated_at();', t
    );
  end loop;
end$$;
