-- =====================================================================
-- test_fifo.sql
-- Smoke test untuk RPC FIFO + transfer.
-- Jalankan di SQL Editor setelah migrasi 01–06 terpasang.
-- Hasil pemeriksaan dicetak via RAISE NOTICE.
-- =====================================================================

do $$
declare
  v_gudang   uuid;
  v_outlet   uuid;
  v_product  uuid;
  v_admin    uuid;            -- bisa user dummy untuk testing
  v_cat      uuid;            -- kategori 'penjualan' (post migrasi 08)
  v_total    integer;
  v_tx       jsonb;
  v_tr       jsonb;
  v_batches  jsonb;
  v_b1       uuid;
  v_b2       uuid;
begin
  select id into v_gudang  from public.locations where name = 'Gudang Pusat';
  select id into v_outlet  from public.locations where name = 'Outlet Pamulang';
  select id into v_product from public.products  where sku  = 'SKU-001';

  -- Untuk test: pakai user pertama yang ada (kalau belum ada, lewati).
  select id into v_admin from public.users limit 1;
  if v_admin is null then
    raise notice 'Belum ada user di public.users. Lewati test yang butuh created_by.';
    return;
  end if;

  select id into v_cat from public.transaction_categories where code = 'penjualan';
  if v_cat is null then
    raise exception 'Kategori penjualan tidak ditemukan; pastikan migrasi 08 sudah dijalankan.';
  end if;

  -- Stok awal di Gudang
  select sum(qty_available) into v_total
  from public.inventory_batches
  where location_id = v_gudang and product_id = v_product;
  raise notice 'Stok awal Gudang Pusat untuk SKU-001 = %', v_total;

  -- ==========================================================
  -- 1. fifo_preview: minta 45 → harus ambil seluruh batch tertua (30)
  --    + 15 dari batch berikutnya.
  -- ==========================================================
  raise notice '--- FIFO preview qty=45 ---';
  for v_batches in
    select jsonb_agg(row_to_json(p))
    from public.fifo_preview(v_gudang, v_product, 45) p
  loop
    raise notice 'preview = %', v_batches;
  end loop;

  -- ==========================================================
  -- 2. transaction_create FIFO default qty=45 → seharusnya pakai
  --    batch tertua dulu.
  -- ==========================================================
  v_tx := public.transaction_create(
    p_location_id => v_gudang,
    p_category_id => v_cat,
    p_items       => jsonb_build_array(
      jsonb_build_object('product_id', v_product, 'qty', 45)
    ),
    p_notes       => 'Test FIFO default',
    p_client_uuid => gen_random_uuid(),
    p_created_by  => v_admin
  );
  raise notice 'TX FIFO default = %', v_tx;

  select sum(qty_available) into v_total
  from public.inventory_batches
  where location_id = v_gudang and product_id = v_product;
  raise notice 'Stok setelah TX 45 = % (harusnya awal-45)', v_total;

  -- ==========================================================
  -- 3. transfer_send: kirim 20 dari batch tertua (yang masih sisa) ke Outlet Pamulang
  -- ==========================================================
  select id into v_b1
  from public.inventory_batches
  where location_id = v_gudang and product_id = v_product and qty_available > 0
  order by production_date asc
  limit 1;

  v_tr := public.transfer_send(
    p_from_location_id => v_gudang,
    p_to_location_id   => v_outlet,
    p_items            => jsonb_build_array(
      jsonb_build_object('batch_id', v_b1, 'qty', 20)
    ),
    p_notes            => 'Test transfer',
    p_created_by       => v_admin
  );
  raise notice 'Transfer send = %', v_tr;

  -- ==========================================================
  -- 4. transfer_receive
  -- ==========================================================
  perform public.transfer_receive(
    p_transfer_id => (v_tr->>'transfer_id')::uuid,
    p_received_by => v_admin
  );
  raise notice 'Transfer received';

  -- Stok di outlet harus 20 untuk produk tersebut
  select sum(qty_available) into v_total
  from public.inventory_batches
  where location_id = v_outlet and product_id = v_product;
  raise notice 'Stok Outlet Pamulang SKU-001 = % (harusnya 20)', v_total;

  -- ==========================================================
  -- 5. Idempotent: kirim transaksi dengan client_uuid sama 2x
  -- ==========================================================
  declare v_cid uuid := gen_random_uuid();
  begin
    v_tx := public.transaction_create(
      p_location_id => v_outlet,
      p_category_id => v_cat,
      p_items       => jsonb_build_array(
        jsonb_build_object('product_id', v_product, 'qty', 5)
      ),
      p_client_uuid => v_cid,
      p_created_by  => v_admin
    );
    raise notice 'TX outlet pertama = %', v_tx;

    v_tx := public.transaction_create(
      p_location_id => v_outlet,
      p_category_id => v_cat,
      p_items       => jsonb_build_array(
        jsonb_build_object('product_id', v_product, 'qty', 5)
      ),
      p_client_uuid => v_cid,
      p_created_by  => v_admin
    );
    raise notice 'TX outlet replay = % (idempotent_replay harus true)', v_tx;
  end;
end$$;
