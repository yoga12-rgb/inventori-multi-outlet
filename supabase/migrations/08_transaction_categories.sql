-- =====================================================================
-- 08_transaction_categories.sql
-- Migrasi enum transaction_type → tabel transaction_categories supaya
-- Super Admin bisa menambah/mengubah kategori pengeluaran tanpa migrasi DDL.
--
-- Strategi:
--   1. Buat tabel transaction_categories (code = nilai enum lama).
--   2. Seed 5 kategori default (penjualan/complaiment/retur/rusak/lainnya)
--      sebagai is_system=true (tidak boleh dihapus oleh UI).
--   3. Tambah kolom transactions.category_id (nullable dulu).
--   4. Backfill dari kolom type lama.
--   5. Set NOT NULL + FK.
--   6. Drop kolom transactions.type (enum tetap ada di DB tapi tidak dipakai).
--   7. Re-create RPC transaction_create dengan parameter baru p_category_id.
--
-- Idempotent. Aman re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel kategori
-- ---------------------------------------------------------------------
create table if not exists public.transaction_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_set_updated_at on public.transaction_categories;
create trigger trg_set_updated_at
  before update on public.transaction_categories
  for each row execute function public.tg_set_updated_at();

-- Grant + RLS sama dengan master lain.
grant select, insert, update, delete on public.transaction_categories
  to anon, authenticated, service_role;

alter table public.transaction_categories enable row level security;

drop policy if exists "read_categories_all" on public.transaction_categories;
create policy "read_categories_all" on public.transaction_categories
  for select to authenticated using (true);

drop policy if exists "admin_write_categories" on public.transaction_categories;
create policy "admin_write_categories" on public.transaction_categories
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

-- ---------------------------------------------------------------------
-- 2. Seed kategori default (mirror enum lama)
-- ---------------------------------------------------------------------
insert into public.transaction_categories(code, name, description, is_system, sort_order)
values
  ('penjualan',  'Penjualan',   'Barang terjual ke pelanggan',                 true, 10),
  ('complaiment','Complaiment', 'Pengganti / kompensasi ke pelanggan',         true, 20),
  ('retur',      'Retur',       'Pengembalian dari pelanggan / outlet',        true, 30),
  ('rusak',      'Rusak',       'Stok rusak yang harus dikeluarkan',           true, 40),
  ('lainnya',    'Lainnya',     'Pengeluaran lain di luar kategori utama',     true, 90)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Tambah kolom category_id (nullable dulu)
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists category_id uuid references public.transaction_categories(id);

-- ---------------------------------------------------------------------
-- 4. Backfill dari enum type lama
--    Hanya jalan kalau kolom 'type' (enum) masih ada.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='transactions' and column_name='type'
  ) then
    update public.transactions t
       set category_id = c.id
      from public.transaction_categories c
     where t.category_id is null
       and c.code = t.type::text;
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 5. Set NOT NULL setelah backfill (kalau aman).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='transactions'
      and column_name='category_id' and is_nullable='YES'
  ) then
    if not exists (select 1 from public.transactions where category_id is null) then
      alter table public.transactions alter column category_id set not null;
    end if;
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 6. Drop kolom type lama (kalau ada). Aman karena tidak ada FK.
--    Enum public.transaction_type dibiarkan exist (tidak mengganggu).
-- ---------------------------------------------------------------------
alter table public.transactions
  drop column if exists type;

-- ---------------------------------------------------------------------
-- 7. RPC transaction_create versi BARU dengan p_category_id
--    Drop dulu signature lama (yang pakai p_type transaction_type) supaya
--    tidak ada dua varian yang bingung dipanggil.
-- ---------------------------------------------------------------------
drop function if exists public.transaction_create(
  uuid, transaction_type, jsonb, text, uuid, uuid
);

create or replace function public.transaction_create(
  p_location_id uuid,
  p_category_id uuid,
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
  v_cat_active     boolean;
begin
  if v_user_id is null then
    raise exception 'created_by tidak boleh null' using errcode = '22023';
  end if;
  if p_category_id is null then
    raise exception 'category_id tidak boleh null' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items tidak boleh kosong' using errcode = '22023';
  end if;

  -- Validasi kategori valid & aktif
  select is_active into v_cat_active
  from public.transaction_categories
  where id = p_category_id;
  if v_cat_active is null then
    raise exception 'Kategori % tidak ditemukan', p_category_id using errcode = 'P0002';
  end if;
  if not v_cat_active then
    raise exception 'Kategori sudah dinonaktifkan' using errcode = '22023';
  end if;

  -- Idempotent
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
    transaction_number, location_id, category_id, notes, client_uuid, created_by, created_at
  )
  values (
    v_tx_number, p_location_id, p_category_id, p_notes, p_client_uuid, v_user_id, now()
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
