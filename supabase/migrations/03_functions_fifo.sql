-- =====================================================================
-- 03_functions_fifo.sql
-- RPC FIFO untuk pengeluaran barang.
--
-- Dua fungsi:
--   1. fifo_preview(location, product, qty)
--      → return rincian pengurangan batch (tanpa mengubah data).
--      Dipakai UI untuk menampilkan rincian sebelum kasir konfirmasi.
--
--   2. transaction_create(...)
--      → simpan transaksi + transaction_items + kurangi qty_available
--      dalam satu transaksi DB. Mendukung:
--        - mode default FIFO (override_items NULL)
--        - mode manual override (kasir kirim daftar batch & qty sendiri)
--        - idempotent via client_uuid (untuk sinkronisasi offline)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Preview FIFO (read-only)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. Helper internal: alokasikan FIFO dan kembalikan array (batch_id, qty)
--    Tidak mengubah stok, hanya menghitung. Digunakan oleh transaction_create.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. Buat transaksi pengeluaran (FIFO atau manual override)
--
-- Parameter p_items berbentuk JSONB array:
--   [
--     {
--       "product_id": "uuid",
--       "qty": 5,
--       "override": [                      // optional, manual override
--         {"batch_id":"uuid","qty":3},
--         {"batch_id":"uuid","qty":2}
--       ]
--     },
--     ...
--   ]
--
-- p_client_uuid: dipakai untuk idempotent insert (offline sync).
-- ---------------------------------------------------------------------
create or replace function public.transaction_create(
  p_location_id uuid,
  p_type        transaction_type,
  p_items       jsonb,
  p_notes       text default null,
  p_client_uuid uuid default null,
  p_created_by  uuid default null   -- override (untuk testing); null = auth.uid()
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

  -- Idempotent: kalau client_uuid sudah pernah masuk, kembalikan record lama.
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

  -- Iterasi tiap item produk
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Validasi qty total
    v_qty_check := (v_item->>'qty')::int;
    if v_qty_check is null or v_qty_check <= 0 then
      raise exception 'qty produk harus > 0' using errcode = '22023';
    end if;

    if (v_item ? 'override') and jsonb_array_length(v_item->'override') > 0 then
      -- ----- Manual override -----
      -- Cek total qty override == qty produk
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
      -- ----- FIFO default -----
      v_alloc := public.fifo_allocate(
        p_location_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'qty')::int
      );
    end if;

    -- Insert items + kurangi stok
    for v_alloc_item in select * from jsonb_array_elements(v_alloc)
    loop
      -- Validasi batch milik lokasi & produk yang sama (terutama untuk manual override)
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
