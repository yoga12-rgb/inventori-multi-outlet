-- =====================================================================
-- setup_supabase.sql
-- File gabungan untuk men-deploy seluruh skema + RPC + RLS + seed
-- ke project Supabase via SQL Editor (Dashboard → SQL → New query).
--
-- Urutan eksekusi sama dengan migrations/01..06:
--   1. Schema (enum, tabel, FK, index, trigger updated_at)
--   2. RLS policies
--   3. RPC FIFO
--   4. RPC Transfer
--   5. View & RPC Dashboard
--   6. Seed data (role, permission, lokasi, produk, batch awal)
--
-- Idempotent: aman dijalankan beberapa kali. Re-run hanya akan menimpa
-- definisi fungsi/policy/trigger; data master & batch tidak diduplikasi
-- (pakai ON CONFLICT DO NOTHING).
--
-- Setelah file ini sukses, lanjut ke:
--   - supabase/setup_first_user.sql  (buat user admin pertama)
-- =====================================================================



-- =====================================================================
-- BAGIAN 1 — SCHEMA (asal: migrations/01_schema.sql)
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

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

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end$$;

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
  unique (product_id, location_id, production_date)
);

create index if not exists idx_inventory_batches_lookup
  on public.inventory_batches (location_id, product_id, production_date asc);

create index if not exists idx_inventory_batches_expired
  on public.inventory_batches (expired_date)
  where expired_date is not null;

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
  source_batch_id uuid not null references public.inventory_batches(id),
  production_date date not null,
  expired_date    date,
  qty             integer not null check (qty > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_transfer_items_transfer
  on public.transfer_items (transfer_id);

create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  location_id        uuid not null references public.locations(id),
  type               transaction_type not null,
  notes              text,
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

do $$
declare
  t text;
begin
  for t in
    select unnest(array['roles','locations','products','users','inventory_batches','transfers'])
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at
         before update on public.%I
         for each row execute function public.tg_set_updated_at();', t);
  end loop;
end$$;



-- =====================================================================
-- BAGIAN 2 — RLS POLICIES (asal: migrations/02_rls_policies.sql)
-- =====================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_location()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.is_global_user()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() in ('Super Admin', 'Kepala Gudang'), false);
$$;

-- Grant tabel ke role 'authenticated' & 'service_role' (idempotent;
-- biasanya sudah default di Supabase).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.roles, public.permissions, public.role_permissions,
  public.locations, public.products, public.users,
  public.inventory_batches, public.transfers, public.transfer_items,
  public.transactions, public.transaction_items
to anon, authenticated, service_role;

alter table public.roles              enable row level security;
alter table public.permissions        enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.locations          enable row level security;
alter table public.products           enable row level security;
alter table public.users              enable row level security;
alter table public.inventory_batches  enable row level security;
alter table public.transfers          enable row level security;
alter table public.transfer_items     enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_items  enable row level security;

drop policy if exists "read_roles_all"           on public.roles;
drop policy if exists "read_permissions_all"     on public.permissions;
drop policy if exists "read_role_permissions"    on public.role_permissions;
drop policy if exists "read_locations_all"       on public.locations;
drop policy if exists "read_products_all"        on public.products;

create policy "read_roles_all"        on public.roles            for select to authenticated using (true);
create policy "read_permissions_all"  on public.permissions      for select to authenticated using (true);
create policy "read_role_permissions" on public.role_permissions for select to authenticated using (true);
create policy "read_locations_all"    on public.locations        for select to authenticated using (true);
create policy "read_products_all"     on public.products         for select to authenticated using (true);

drop policy if exists "admin_write_locations" on public.locations;
create policy "admin_write_locations" on public.locations
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "admin_write_products" on public.products;
create policy "admin_write_products" on public.products
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "users_self_or_admin_read" on public.users;
create policy "users_self_or_admin_read" on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'Super Admin');

drop policy if exists "users_admin_write" on public.users;
create policy "users_admin_write" on public.users
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "inv_read_by_location" on public.inventory_batches;
create policy "inv_read_by_location" on public.inventory_batches
  for select to authenticated
  using (
    public.is_global_user()
    or location_id = public.current_user_location()
  );

drop policy if exists "inv_no_direct_write" on public.inventory_batches;
create policy "inv_no_direct_write" on public.inventory_batches
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "transfer_read_involved" on public.transfers;
create policy "transfer_read_involved" on public.transfers
  for select to authenticated
  using (
    public.is_global_user()
    or from_location_id = public.current_user_location()
    or to_location_id   = public.current_user_location()
  );

drop policy if exists "transfer_no_direct_write" on public.transfers;
create policy "transfer_no_direct_write" on public.transfers
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "transfer_items_read" on public.transfer_items;
create policy "transfer_items_read" on public.transfer_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transfers t
      where t.id = transfer_items.transfer_id
        and (
          public.is_global_user()
          or t.from_location_id = public.current_user_location()
          or t.to_location_id   = public.current_user_location()
        )
    )
  );

drop policy if exists "transfer_items_no_direct_write" on public.transfer_items;
create policy "transfer_items_no_direct_write" on public.transfer_items
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "tx_read_by_location" on public.transactions;
create policy "tx_read_by_location" on public.transactions
  for select to authenticated
  using (
    public.is_global_user()
    or location_id = public.current_user_location()
  );

drop policy if exists "tx_no_direct_write" on public.transactions;
create policy "tx_no_direct_write" on public.transactions
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "tx_items_read" on public.transaction_items;
create policy "tx_items_read" on public.transaction_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_items.transaction_id
        and (
          public.is_global_user()
          or t.location_id = public.current_user_location()
        )
    )
  );

drop policy if exists "tx_items_no_direct_write" on public.transaction_items;
create policy "tx_items_no_direct_write" on public.transaction_items
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');



-- =====================================================================
-- BAGIAN 3 — RPC FIFO (asal: migrations/03_functions_fifo.sql)
-- =====================================================================

create or replace function public.fifo_preview(
  p_location_id uuid,
  p_product_id  uuid,
  p_qty         integer
)
returns table (
  batch_id        uuid,
  production_date date,
  expired_date    date,
  qty_available   integer,
  qty_take        integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_qty;
  v_total     integer;
  rec record;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty harus > 0' using errcode = '22023';
  end if;

  select coalesce(sum(b.qty_available), 0) into v_total
  from public.inventory_batches b
  where b.location_id = p_location_id and b.product_id = p_product_id;

  if v_total < p_qty then
    raise exception 'Stok tidak cukup. Tersedia %, diminta %', v_total, p_qty
      using errcode = 'P0001';
  end if;

  for rec in
    select b.id, b.production_date, b.expired_date, b.qty_available
    from public.inventory_batches b
    where b.location_id = p_location_id
      and b.product_id  = p_product_id
      and b.qty_available > 0
    order by b.production_date asc, b.created_at asc
  loop
    exit when v_remaining <= 0;

    batch_id        := rec.id;
    production_date := rec.production_date;
    expired_date    := rec.expired_date;
    qty_available   := rec.qty_available;
    qty_take        := least(rec.qty_available, v_remaining);

    v_remaining := v_remaining - qty_take;
    return next;
  end loop;
end$$;

create or replace function public.fifo_allocate(
  p_location_id uuid,
  p_product_id  uuid,
  p_qty         integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alloc jsonb := '[]'::jsonb;
  v_remaining integer := p_qty;
  rec record;
begin
  for rec in
    select id, qty_available
    from public.inventory_batches
    where location_id = p_location_id
      and product_id  = p_product_id
      and qty_available > 0
    order by production_date asc, created_at asc
  loop
    exit when v_remaining <= 0;
    declare v_take integer := least(rec.qty_available, v_remaining);
    begin
      v_alloc := v_alloc || jsonb_build_object('batch_id', rec.id, 'qty', v_take);
      v_remaining := v_remaining - v_take;
    end;
  end loop;

  if v_remaining > 0 then
    raise exception 'Stok tidak cukup untuk produk %', p_product_id
      using errcode = 'P0001';
  end if;

  return v_alloc;
end$$;

create or replace function public.transaction_create(
  p_location_id uuid,
  p_type        transaction_type,
  p_items       jsonb,
  p_notes       text default null,
  p_client_uuid uuid default null,
  p_created_by  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := coalesce(p_created_by, auth.uid());
  v_existing_id    uuid;
  v_transaction_id uuid;
  v_tx_number      text;
  v_item           jsonb;
  v_alloc          jsonb;
  v_alloc_item     jsonb;
  v_qty_check      integer;
  v_batch_loc      uuid;
  v_batch_prod     uuid;
  v_updated        integer;
begin
  if v_user_id is null then
    raise exception 'created_by tidak boleh null' using errcode = '22023';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items tidak boleh kosong' using errcode = '22023';
  end if;

  if p_client_uuid is not null then
    select id into v_existing_id from public.transactions where client_uuid = p_client_uuid;
    if v_existing_id is not null then
      return jsonb_build_object(
        'transaction_id', v_existing_id,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_tx_number := 'TX-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
                 substring(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.transactions(
    transaction_number, location_id, type, notes, client_uuid, created_by, created_at
  )
  values (
    v_tx_number, p_location_id, p_type, p_notes, p_client_uuid, v_user_id, now()
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty_check := (v_item->>'qty')::int;
    if v_qty_check is null or v_qty_check <= 0 then
      raise exception 'qty produk harus > 0' using errcode = '22023';
    end if;

    if (v_item ? 'override') and jsonb_array_length(v_item->'override') > 0 then
      select coalesce(sum((o->>'qty')::int), 0)
      into v_qty_check
      from jsonb_array_elements(v_item->'override') o;

      if v_qty_check <> (v_item->>'qty')::int then
        raise exception 'Total qty override (%) tidak sama dengan qty produk (%)',
          v_qty_check, (v_item->>'qty')::int
          using errcode = '22023';
      end if;

      v_alloc := v_item->'override';
    else
      v_alloc := public.fifo_allocate(
        p_location_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'qty')::int
      );
    end if;

    for v_alloc_item in select * from jsonb_array_elements(v_alloc)
    loop
      select location_id, product_id
        into v_batch_loc, v_batch_prod
      from public.inventory_batches
      where id = (v_alloc_item->>'batch_id')::uuid
      for update;

      if v_batch_loc is null then
        raise exception 'Batch % tidak ditemukan', v_alloc_item->>'batch_id'
          using errcode = 'P0002';
      end if;
      if v_batch_loc <> p_location_id then
        raise exception 'Batch % bukan milik lokasi ini', v_alloc_item->>'batch_id'
          using errcode = 'P0002';
      end if;
      if v_batch_prod <> (v_item->>'product_id')::uuid then
        raise exception 'Batch % bukan milik produk yang dipilih', v_alloc_item->>'batch_id'
          using errcode = 'P0002';
      end if;

      update public.inventory_batches
         set qty_available = qty_available - (v_alloc_item->>'qty')::int,
             updated_at    = now()
       where id = (v_alloc_item->>'batch_id')::uuid
         and qty_available >= (v_alloc_item->>'qty')::int
      returning 1 into v_updated;

      if v_updated is null then
        raise exception 'Stok batch % tidak mencukupi', v_alloc_item->>'batch_id'
          using errcode = 'P0001';
      end if;

      insert into public.transaction_items(transaction_id, product_id, batch_id, qty)
      values (
        v_transaction_id,
        (v_item->>'product_id')::uuid,
        (v_alloc_item->>'batch_id')::uuid,
        (v_alloc_item->>'qty')::int
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_tx_number,
    'idempotent_replay', false
  );
end$$;



-- =====================================================================
-- BAGIAN 4 — RPC TRANSFER (asal: migrations/04_functions_transfer.sql)
-- =====================================================================

create or replace function public.transfer_send(
  p_from_location_id uuid,
  p_to_location_id   uuid,
  p_items            jsonb,
  p_notes            text default null,
  p_created_by       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := coalesce(p_created_by, auth.uid());
  v_transfer_id uuid;
  v_number      text;
  v_item        jsonb;
  v_batch       record;
  v_updated     integer;
begin
  if v_user_id is null then
    raise exception 'created_by tidak boleh null' using errcode = '22023';
  end if;
  if p_from_location_id = p_to_location_id then
    raise exception 'Lokasi asal & tujuan tidak boleh sama' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items tidak boleh kosong' using errcode = '22023';
  end if;

  v_number := 'TR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
              substring(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.transfers(
    transfer_number, from_location_id, to_location_id, status,
    notes, created_by, sent_at
  ) values (
    v_number, p_from_location_id, p_to_location_id, 'in_transit',
    p_notes, v_user_id, now()
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'qty')::int is null or (v_item->>'qty')::int <= 0 then
      raise exception 'qty harus > 0' using errcode = '22023';
    end if;

    select id, product_id, location_id, production_date, expired_date, qty_available
      into v_batch
    from public.inventory_batches
    where id = (v_item->>'batch_id')::uuid
    for update;

    if v_batch.id is null then
      raise exception 'Batch % tidak ditemukan', v_item->>'batch_id'
        using errcode = 'P0002';
    end if;
    if v_batch.location_id <> p_from_location_id then
      raise exception 'Batch % bukan milik lokasi asal', v_item->>'batch_id'
        using errcode = 'P0002';
    end if;
    if v_batch.qty_available < (v_item->>'qty')::int then
      raise exception 'Stok batch % tidak cukup (tersedia %, diminta %)',
        v_batch.id, v_batch.qty_available, (v_item->>'qty')::int
        using errcode = 'P0001';
    end if;

    update public.inventory_batches
       set qty_available = qty_available - (v_item->>'qty')::int,
           updated_at    = now()
     where id = v_batch.id
       and qty_available >= (v_item->>'qty')::int
    returning 1 into v_updated;

    if v_updated is null then
      raise exception 'Gagal mengurangi stok batch %', v_batch.id
        using errcode = 'P0001';
    end if;

    insert into public.transfer_items(
      transfer_id, product_id, source_batch_id,
      production_date, expired_date, qty
    ) values (
      v_transfer_id, v_batch.product_id, v_batch.id,
      v_batch.production_date, v_batch.expired_date, (v_item->>'qty')::int
    );
  end loop;

  return jsonb_build_object(
    'transfer_id', v_transfer_id,
    'transfer_number', v_number,
    'status', 'in_transit'
  );
end$$;

create or replace function public.transfer_receive(
  p_transfer_id uuid,
  p_received_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := coalesce(p_received_by, auth.uid());
  v_transfer record;
  v_item     record;
begin
  if v_user_id is null then
    raise exception 'received_by tidak boleh null' using errcode = '22023';
  end if;

  select * into v_transfer
  from public.transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer % tidak ditemukan', p_transfer_id using errcode = 'P0002';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'Transfer % sudah % - tidak dapat diterima',
      p_transfer_id, v_transfer.status using errcode = 'P0003';
  end if;

  for v_item in
    select product_id, production_date, expired_date, sum(qty) as qty
    from public.transfer_items
    where transfer_id = p_transfer_id
    group by product_id, production_date, expired_date
  loop
    insert into public.inventory_batches(
      product_id, location_id, production_date, expired_date, qty_available
    )
    values (
      v_item.product_id, v_transfer.to_location_id,
      v_item.production_date, v_item.expired_date, v_item.qty
    )
    on conflict (product_id, location_id, production_date)
    do update set qty_available = public.inventory_batches.qty_available + excluded.qty_available,
                  updated_at    = now();
  end loop;

  update public.transfers
     set status      = 'completed',
         received_by = v_user_id,
         received_at = now(),
         updated_at  = now()
   where id = p_transfer_id;

  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'completed');
end$$;

create or replace function public.transfer_cancel(
  p_transfer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
  v_item     record;
begin
  select * into v_transfer
  from public.transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer % tidak ditemukan', p_transfer_id using errcode = 'P0002';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'Hanya transfer in_transit yang bisa dibatalkan' using errcode = 'P0003';
  end if;

  for v_item in
    select source_batch_id, sum(qty) as qty
    from public.transfer_items
    where transfer_id = p_transfer_id
    group by source_batch_id
  loop
    update public.inventory_batches
       set qty_available = qty_available + v_item.qty,
           updated_at    = now()
     where id = v_item.source_batch_id;
  end loop;

  update public.transfers
     set status       = 'cancelled',
         cancelled_at = now(),
         updated_at   = now()
   where id = p_transfer_id;

  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'cancelled');
end$$;



-- =====================================================================
-- BAGIAN 5 — VIEW & RPC DASHBOARD (asal: migrations/05_functions_dashboard.sql)
-- =====================================================================

create or replace view public.v_stock_by_location as
select
  ib.location_id,
  l.name              as location_name,
  l.type              as location_type,
  ib.product_id,
  p.sku               as product_sku,
  p.name              as product_name,
  p.unit              as product_unit,
  sum(ib.qty_available)                                  as qty_total,
  count(*) filter (where ib.qty_available > 0)           as batch_count,
  min(ib.production_date) filter (where ib.qty_available > 0) as oldest_production_date,
  min(ib.expired_date)    filter (where ib.qty_available > 0) as nearest_expired_date
from public.inventory_batches ib
join public.locations l on l.id = ib.location_id
join public.products  p on p.id = ib.product_id
group by ib.location_id, l.name, l.type, ib.product_id, p.sku, p.name, p.unit;

comment on view public.v_stock_by_location is
  'Ringkasan stok per lokasi & produk untuk dashboard. Tunduk RLS inventory_batches.';

grant select on public.v_stock_by_location to anon, authenticated, service_role;

create or replace function public.dashboard_stock(
  p_location_id uuid default null
)
returns table (
  product_id              uuid,
  product_sku             text,
  product_name            text,
  qty_total               integer,
  batch_count             bigint,
  oldest_production_date  date,
  nearest_expired_date    date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.product_id,
    v.product_sku,
    v.product_name,
    v.qty_total::integer,
    v.batch_count,
    v.oldest_production_date,
    v.nearest_expired_date
  from public.v_stock_by_location v
  where v.location_id = coalesce(p_location_id, public.current_user_location())
  order by v.product_name;
$$;

create or replace function public.dashboard_incoming_transfers(
  p_location_id uuid default null
)
returns table (
  transfer_id      uuid,
  transfer_number  text,
  from_location_id uuid,
  from_location    text,
  sent_at          timestamptz,
  total_qty        bigint,
  product_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select coalesce(p_location_id, public.current_user_location()) as loc
  )
  select
    t.id,
    t.transfer_number,
    t.from_location_id,
    l.name,
    t.sent_at,
    coalesce(sum(ti.qty), 0),
    count(distinct ti.product_id)
  from public.transfers t
  join target on t.to_location_id = target.loc
  join public.locations l on l.id = t.from_location_id
  left join public.transfer_items ti on ti.transfer_id = t.id
  where t.status = 'in_transit'
  group by t.id, l.name
  order by t.sent_at desc;
$$;


-- =====================================================================
-- BAGIAN 6 — SEED DATA (asal: migrations/06_seed_data.sql)
-- =====================================================================

insert into public.roles(name, description) values
  ('Super Admin',     'Akses penuh ke seluruh sistem'),
  ('Kepala Gudang',   'Kelola produksi & mutasi gudang pusat'),
  ('Kasir Outlet',    'Transaksi pengeluaran di outlet'),
  ('Staf Outlet',     'Bantu kasir / terima mutasi')
on conflict (name) do nothing;

insert into public.permissions(module_name, action) values
  ('inventory',  'read'),
  ('inventory',  'create'),
  ('inventory',  'update'),
  ('inventory',  'delete'),
  ('transfer',   'read'),
  ('transfer',   'create'),
  ('transfer',   'update'),
  ('transaction','read'),
  ('transaction','create'),
  ('master',     'read'),
  ('master',     'create'),
  ('master',     'update'),
  ('master',     'delete')
on conflict (module_name, action) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Super Admin'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master' and p.action = 'read') or
  (p.module_name in ('inventory','transfer'))
where r.name = 'Kepala Gudang'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master'      and p.action = 'read') or
  (p.module_name = 'inventory'   and p.action = 'read') or
  (p.module_name = 'transaction' and p.action in ('read','create')) or
  (p.module_name = 'transfer'    and p.action in ('read','update'))
where r.name = 'Kasir Outlet'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master'      and p.action = 'read') or
  (p.module_name = 'inventory'   and p.action = 'read') or
  (p.module_name = 'transaction' and p.action = 'read') or
  (p.module_name = 'transfer'    and p.action in ('read','update'))
where r.name = 'Staf Outlet'
on conflict do nothing;

insert into public.locations(name, type) values
  ('Gudang Pusat',      'gudang_produksi'),
  ('Outlet Pamulang',   'outlet'),
  ('Outlet Dago',       'outlet'),
  ('Outlet Pajajaran',  'outlet'),
  ('Outlet Sawangan',   'outlet')
on conflict (name) do nothing;

insert into public.products(sku, name, unit) values
  ('SKU-001', 'Roti Coklat',    'pcs'),
  ('SKU-002', 'Roti Keju',      'pcs'),
  ('SKU-003', 'Roti Sosis',     'pcs'),
  ('SKU-004', 'Donat Original', 'pcs')
on conflict (sku) do nothing;

do $$
declare
  v_gudang  uuid;
  v_p1 uuid;
  v_p2 uuid;
begin
  select id into v_gudang from public.locations where name = 'Gudang Pusat';
  select id into v_p1 from public.products where sku = 'SKU-001';
  select id into v_p2 from public.products where sku = 'SKU-002';

  insert into public.inventory_batches(product_id, location_id, production_date, expired_date, qty_available)
  values
    (v_p1, v_gudang, current_date - 5, current_date + 25, 30),
    (v_p1, v_gudang, current_date - 3, current_date + 27, 50),
    (v_p1, v_gudang, current_date - 1, current_date + 29, 40),
    (v_p2, v_gudang, current_date - 4, current_date + 26, 60)
  on conflict (product_id, location_id, production_date) do update
    set qty_available = excluded.qty_available;
end$$;


-- =====================================================================
-- VERIFIKASI CEPAT (opsional)
-- Jalankan sebagai query terpisah setelah file di atas selesai sukses.
-- =====================================================================

-- 1. Daftar tabel yang terbentuk
-- select table_name from information_schema.tables
-- where table_schema = 'public' order by table_name;

-- 2. Daftar RPC
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_type = 'FUNCTION'
-- order by routine_name;

-- 3. Cek seed
-- select count(*) from public.roles;        -- 4
-- select count(*) from public.permissions;  -- 13
-- select count(*) from public.locations;    -- 5
-- select count(*) from public.products;     -- 4
-- select count(*) from public.inventory_batches; -- 4 (Gudang Pusat)
