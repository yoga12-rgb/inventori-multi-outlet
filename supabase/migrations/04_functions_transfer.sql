-- =====================================================================
-- 04_functions_transfer.sql
-- RPC mutasi barang antar lokasi (in-transit pattern).
--
--   transfer_send(...)     → gudang/outlet asal mengirim batch tertentu.
--                            Stok di lokasi asal langsung dikurangi.
--                            Status: in_transit.
--
--   transfer_receive(...)  → lokasi tujuan menerima. Status: completed.
--                            Stok ditambahkan ke lokasi tujuan dengan
--                            production_date & expired_date yang sama.
--
--   transfer_cancel(...)   → batalkan saat masih in_transit. Stok lokasi
--                            asal dikembalikan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- transfer_send
-- p_items: jsonb array
--   [
--     {"batch_id":"uuid","qty":10},
--     ...
--   ]
-- ---------------------------------------------------------------------
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

    -- Kurangi stok di lokasi asal
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

    -- Catat detail transfer (snapshot batch asal)
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

-- ---------------------------------------------------------------------
-- transfer_receive
-- ---------------------------------------------------------------------
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

  -- Tambahkan stok ke lokasi tujuan: gabung ke batch existing
  -- (product_id + location_id + production_date) atau buat baru.
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

-- ---------------------------------------------------------------------
-- transfer_cancel: kembalikan stok ke lokasi asal
-- ---------------------------------------------------------------------
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

  -- Kembalikan ke batch asli (source_batch_id)
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
