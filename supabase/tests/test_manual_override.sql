-- =====================================================================
-- test_manual_override.sql
-- Smoke test untuk cabang Manual Override pada RPC transaction_create.
--
-- Mengunci 7 skenario:
--   1. OVERRIDE_2_BATCH      (sukses, 2 batch)
--   2. OVERRIDE_1_BATCH      (sukses, 1 batch)
--   3. QTY_MISMATCH          (error 22023)
--   4. BATCH_LOCATION_MISMATCH (error P0002)
--   5. BATCH_PRODUCT_MISMATCH  (error P0002)
--   6. QTY_EXCEEDS_AVAILABLE   (error P0001)
--   7. IDEMPOTENT_REPLAY       (panggilan ke-2 idempotent)
--
-- Dijalankan setelah test_fifo.sql oleh run_tests.ps1.
-- File ini self-contained: pakai lokasi "Outlet Dago" supaya tidak
-- bertabrakan dengan fixture test_fifo.sql (Gudang Pusat / Outlet Pamulang).
-- =====================================================================

do $$
declare
  v_outlet_dago uuid;
  v_gudang      uuid;
  v_pa          uuid;     -- product A: SKU-001
  v_pb          uuid;     -- product B: SKU-002
  v_admin       uuid;
  v_b1          uuid;     -- batch SKU-001 @ Outlet Dago, current_date - 30, qty 20
  v_b2          uuid;     -- batch SKU-001 @ Outlet Dago, current_date - 20, qty 30
  v_b3          uuid;     -- batch SKU-001 @ Outlet Dago, current_date - 10, qty 50
  v_b_pb        uuid;     -- batch SKU-002 @ Outlet Dago, current_date - 15, qty 25
  v_b_gudang    uuid;     -- batch SKU-001 @ Gudang Pusat (read-only utk skenario 4)
  v_qty_before  integer;
  v_qty_after   integer;
  v_tx          jsonb;
  v_cid         uuid;
  v_count       integer;
begin
  -- -------------------------------------------------------------------
  -- Lookup master data
  -- -------------------------------------------------------------------
  select id into v_outlet_dago from public.locations where name = 'Outlet Dago';
  select id into v_gudang      from public.locations where name = 'Gudang Pusat';
  select id into v_pa          from public.products  where sku  = 'SKU-001';
  select id into v_pb          from public.products  where sku  = 'SKU-002';

  -- Pakai user pertama (di-seed oleh 99_seed_test_user.sql).
  select id into v_admin from public.users limit 1;
  if v_admin is null then
    raise notice 'Belum ada user di public.users. Lewati test_manual_override.';
    return;
  end if;

  -- -------------------------------------------------------------------
  -- Persiapan batch fixture (idempotent via ON CONFLICT)
  -- Tanggal -30 / -20 / -10 / -15 sengaja di luar rentang seed (-5..-1)
  -- supaya tidak bertabrakan dengan UNIQUE (product_id, location_id, production_date).
  -- -------------------------------------------------------------------
  insert into public.inventory_batches(product_id, location_id, production_date, expired_date, qty_available)
  values
    (v_pa, v_outlet_dago, current_date - 30, current_date,        20),
    (v_pa, v_outlet_dago, current_date - 20, current_date + 10,   30),
    (v_pa, v_outlet_dago, current_date - 10, current_date + 20,   50),
    (v_pb, v_outlet_dago, current_date - 15, current_date + 15,   25)
  on conflict (product_id, location_id, production_date) do update
    set qty_available = excluded.qty_available;

  select id into v_b1
  from public.inventory_batches
  where location_id = v_outlet_dago and product_id = v_pa and production_date = current_date - 30;

  select id into v_b2
  from public.inventory_batches
  where location_id = v_outlet_dago and product_id = v_pa and production_date = current_date - 20;

  select id into v_b3
  from public.inventory_batches
  where location_id = v_outlet_dago and product_id = v_pa and production_date = current_date - 10;

  select id into v_b_pb
  from public.inventory_batches
  where location_id = v_outlet_dago and product_id = v_pb and production_date = current_date - 15;

  -- v_b_gudang: batch SKU-001 di Gudang Pusat paling tua dengan qty_available > 0.
  -- TIDAK dimodifikasi; hanya dipakai sebagai "batch milik lokasi lain" di skenario 4.
  select b.id into v_b_gudang
  from public.inventory_batches b
  where b.location_id = v_gudang
    and b.product_id  = v_pa
    and b.qty_available > 0
  order by b.production_date asc, b.created_at asc
  limit 1;

  raise notice '--- Fixture siap: v_b1=% v_b2=% v_b3=% v_b_pb=% v_b_gudang=%',
    v_b1, v_b2, v_b3, v_b_pb, v_b_gudang;

  -- ===================================================================
  -- SKENARIO 1: OVERRIDE_2_BATCH (sukses)
  -- qty=15, override [{v_b1,5},{v_b2,10}].
  -- Ekspektasi: v_b1 20->15, v_b2 30->20, v_b3 tetap 50.
  -- ===================================================================
  raise notice '--- SKENARIO 1: OVERRIDE_2_BATCH ---';
  declare
    v_b1_before integer;
    v_b2_before integer;
    v_b3_before integer;
    v_b1_after  integer;
    v_b2_after  integer;
    v_b3_after  integer;
  begin
    select qty_available into v_b1_before from public.inventory_batches where id = v_b1;
    select qty_available into v_b2_before from public.inventory_batches where id = v_b2;
    select qty_available into v_b3_before from public.inventory_batches where id = v_b3;

    v_tx := public.transaction_create(
      p_location_id => v_outlet_dago,
      p_type        => 'penjualan',
      p_items       => jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pa,
          'qty', 15,
          'override', jsonb_build_array(
            jsonb_build_object('batch_id', v_b1, 'qty', 5),
            jsonb_build_object('batch_id', v_b2, 'qty', 10)
          )
        )
      ),
      p_notes       => 'test override 2 batch',
      p_client_uuid => gen_random_uuid(),
      p_created_by  => v_admin
    );
    raise notice 'TX OVERRIDE_2_BATCH = %', v_tx;

    if (v_tx->>'idempotent_replay')::boolean <> false then
      raise exception 'ASSERTION FAILED: expected idempotent_replay=false, got %', v_tx->>'idempotent_replay';
    end if;
    if not (v_tx ? 'transaction_id') or (v_tx->>'transaction_id') is null then
      raise exception 'ASSERTION FAILED: transaction_id missing in %', v_tx;
    end if;

    select qty_available into v_b1_after from public.inventory_batches where id = v_b1;
    select qty_available into v_b2_after from public.inventory_batches where id = v_b2;
    select qty_available into v_b3_after from public.inventory_batches where id = v_b3;

    if v_b1_after <> v_b1_before - 5 then
      raise exception 'ASSERTION FAILED: v_b1 expected %->%, got %->%',
        v_b1_before, v_b1_before - 5, v_b1_before, v_b1_after;
    end if;
    if v_b2_after <> v_b2_before - 10 then
      raise exception 'ASSERTION FAILED: v_b2 expected %->%, got %->%',
        v_b2_before, v_b2_before - 10, v_b2_before, v_b2_after;
    end if;
    if v_b3_after <> v_b3_before then
      raise exception 'ASSERTION FAILED: v_b3 changed unexpectedly %->%', v_b3_before, v_b3_after;
    end if;

    raise notice 'OK SKENARIO 1: v_b1 %->%, v_b2 %->%, v_b3 % (tetap)',
      v_b1_before, v_b1_after, v_b2_before, v_b2_after, v_b3_after;
  end;

  -- ===================================================================
  -- SKENARIO 2: OVERRIDE_1_BATCH (sukses)
  -- qty=7, override [{v_b3,7}]. Ekspektasi v_b3 berkurang tepat 7.
  -- ===================================================================
  raise notice '--- SKENARIO 2: OVERRIDE_1_BATCH ---';
  declare
    v_b3_before integer;
    v_b3_after  integer;
  begin
    select qty_available into v_b3_before from public.inventory_batches where id = v_b3;

    v_tx := public.transaction_create(
      p_location_id => v_outlet_dago,
      p_type        => 'penjualan',
      p_items       => jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pa,
          'qty', 7,
          'override', jsonb_build_array(
            jsonb_build_object('batch_id', v_b3, 'qty', 7)
          )
        )
      ),
      p_notes       => 'test override 1 batch',
      p_client_uuid => gen_random_uuid(),
      p_created_by  => v_admin
    );
    raise notice 'TX OVERRIDE_1_BATCH = %', v_tx;

    if (v_tx->>'idempotent_replay')::boolean <> false then
      raise exception 'ASSERTION FAILED: expected idempotent_replay=false, got %', v_tx->>'idempotent_replay';
    end if;

    select qty_available into v_b3_after from public.inventory_batches where id = v_b3;
    if v_b3_after <> v_b3_before - 7 then
      raise exception 'ASSERTION FAILED: v_b3 expected %->%, got %->%',
        v_b3_before, v_b3_before - 7, v_b3_before, v_b3_after;
    end if;

    raise notice 'OK SKENARIO 2: v_b3 %->%', v_b3_before, v_b3_after;
  end;

  -- ===================================================================
  -- SKENARIO 3: QTY_MISMATCH -> 22023
  -- qty=10, override total = 8. Harus raise 22023.
  -- Assert: v_b1, v_b2 tidak berubah; count(transactions) tidak bertambah.
  -- ===================================================================
  raise notice '--- SKENARIO 3: QTY_MISMATCH (22023) ---';
  declare
    v_b1_before integer;
    v_b2_before integer;
    v_b1_after  integer;
    v_b2_after  integer;
    v_count_before integer;
    v_count_after  integer;
  begin
    select qty_available into v_b1_before from public.inventory_batches where id = v_b1;
    select qty_available into v_b2_before from public.inventory_batches where id = v_b2;
    select count(*) into v_count_before from public.transactions;

    begin
      perform public.transaction_create(
        p_location_id => v_outlet_dago,
        p_type        => 'penjualan',
        p_items       => jsonb_build_array(
          jsonb_build_object(
            'product_id', v_pa,
            'qty', 10,
            'override', jsonb_build_array(
              jsonb_build_object('batch_id', v_b1, 'qty', 4),
              jsonb_build_object('batch_id', v_b2, 'qty', 4)
            )
          )
        ),
        p_notes       => 'test qty mismatch',
        p_client_uuid => gen_random_uuid(),
        p_created_by  => v_admin
      );
      raise exception 'ASSERTION FAILED: expected sqlstate 22023 but RPC succeeded';
    exception
      when sqlstate '22023' then
        raise notice 'OK 22023 (QTY_MISMATCH)';
      when others then
        raise;
    end;

    select qty_available into v_b1_after from public.inventory_batches where id = v_b1;
    select qty_available into v_b2_after from public.inventory_batches where id = v_b2;
    select count(*) into v_count_after from public.transactions;

    if v_b1_after <> v_b1_before then
      raise exception 'ASSERTION FAILED: v_b1 changed after rollback %->%', v_b1_before, v_b1_after;
    end if;
    if v_b2_after <> v_b2_before then
      raise exception 'ASSERTION FAILED: v_b2 changed after rollback %->%', v_b2_before, v_b2_after;
    end if;
    if v_count_after <> v_count_before then
      raise exception 'ASSERTION FAILED: transactions count changed %->%', v_count_before, v_count_after;
    end if;

    raise notice 'OK SKENARIO 3: state stok & transactions tidak berubah';
  end;

  -- ===================================================================
  -- SKENARIO 4: BATCH_LOCATION_MISMATCH -> P0002
  -- p_location_id=Outlet Dago, override pakai v_b_gudang (Gudang Pusat).
  -- Total override = qty supaya validasi 22023 dilewati.
  -- ===================================================================
  raise notice '--- SKENARIO 4: BATCH_LOCATION_MISMATCH (P0002) ---';
  if v_b_gudang is null then
    raise notice 'SKIP SKENARIO 4: tidak ada batch SKU-001 di Gudang Pusat dengan stok > 0';
  else
    declare
      v_g_before integer;
      v_g_after  integer;
    begin
      select qty_available into v_g_before from public.inventory_batches where id = v_b_gudang;

      begin
        perform public.transaction_create(
          p_location_id => v_outlet_dago,
          p_type        => 'penjualan',
          p_items       => jsonb_build_array(
            jsonb_build_object(
              'product_id', v_pa,
              'qty', 3,
              'override', jsonb_build_array(
                jsonb_build_object('batch_id', v_b_gudang, 'qty', 3)
              )
            )
          ),
          p_notes       => 'test location mismatch',
          p_client_uuid => gen_random_uuid(),
          p_created_by  => v_admin
        );
        raise exception 'ASSERTION FAILED: expected sqlstate P0002 but RPC succeeded';
      exception
        when sqlstate 'P0002' then
          raise notice 'OK P0002 (BATCH_LOCATION_MISMATCH)';
        when others then
          raise;
      end;

      select qty_available into v_g_after from public.inventory_batches where id = v_b_gudang;
      if v_g_after <> v_g_before then
        raise exception 'ASSERTION FAILED: v_b_gudang changed %->%', v_g_before, v_g_after;
      end if;

      raise notice 'OK SKENARIO 4: v_b_gudang tetap %', v_g_after;
    end;
  end if;

  -- ===================================================================
  -- SKENARIO 5: BATCH_PRODUCT_MISMATCH -> P0002
  -- product=SKU-001 (v_pa) tapi batch_id menunjuk batch SKU-002 (v_b_pb).
  -- ===================================================================
  raise notice '--- SKENARIO 5: BATCH_PRODUCT_MISMATCH (P0002) ---';
  declare
    v_pb_before integer;
    v_pb_after  integer;
  begin
    select qty_available into v_pb_before from public.inventory_batches where id = v_b_pb;

    begin
      perform public.transaction_create(
        p_location_id => v_outlet_dago,
        p_type        => 'penjualan',
        p_items       => jsonb_build_array(
          jsonb_build_object(
            'product_id', v_pa,
            'qty', 2,
            'override', jsonb_build_array(
              jsonb_build_object('batch_id', v_b_pb, 'qty', 2)
            )
          )
        ),
        p_notes       => 'test product mismatch',
        p_client_uuid => gen_random_uuid(),
        p_created_by  => v_admin
      );
      raise exception 'ASSERTION FAILED: expected sqlstate P0002 but RPC succeeded';
    exception
      when sqlstate 'P0002' then
        raise notice 'OK P0002 (BATCH_PRODUCT_MISMATCH)';
      when others then
        raise;
    end;

    select qty_available into v_pb_after from public.inventory_batches where id = v_b_pb;
    if v_pb_after <> v_pb_before then
      raise exception 'ASSERTION FAILED: v_b_pb changed %->%', v_pb_before, v_pb_after;
    end if;

    raise notice 'OK SKENARIO 5: v_b_pb tetap %', v_pb_after;
  end;

  -- ===================================================================
  -- SKENARIO 6: QTY_EXCEEDS_AVAILABLE -> P0001
  -- Setelah skenario 1, v_b1.qty_available = 15. qty=99 melebihi.
  -- Total override = qty supaya validasi 22023 dilewati lebih dulu.
  -- Jika fixture berubah dan v_b1.qty_available >= 99, skip dengan NOTICE.
  -- ===================================================================
  raise notice '--- SKENARIO 6: QTY_EXCEEDS_AVAILABLE (P0001) ---';
  declare
    v_b1_before integer;
    v_b1_after  integer;
  begin
    select qty_available into v_b1_before from public.inventory_batches where id = v_b1;
    if v_b1_before >= 99 then
      raise notice 'SKIP 1.7: fixture tidak memungkinkan (v_b1.qty_available=% >= 99)', v_b1_before;
    else
      begin
        perform public.transaction_create(
          p_location_id => v_outlet_dago,
          p_type        => 'penjualan',
          p_items       => jsonb_build_array(
            jsonb_build_object(
              'product_id', v_pa,
              'qty', 99,
              'override', jsonb_build_array(
                jsonb_build_object('batch_id', v_b1, 'qty', 99)
              )
            )
          ),
          p_notes       => 'test qty exceeds',
          p_client_uuid => gen_random_uuid(),
          p_created_by  => v_admin
        );
        raise exception 'ASSERTION FAILED: expected sqlstate P0001 but RPC succeeded';
      exception
        when sqlstate 'P0001' then
          raise notice 'OK P0001 (QTY_EXCEEDS_AVAILABLE)';
        when others then
          raise;
      end;

      select qty_available into v_b1_after from public.inventory_batches where id = v_b1;
      if v_b1_after <> v_b1_before then
        raise exception 'ASSERTION FAILED: v_b1 changed %->%', v_b1_before, v_b1_after;
      end if;

      raise notice 'OK SKENARIO 6: v_b1 tetap %', v_b1_after;
    end if;
  end;

  -- ===================================================================
  -- SKENARIO 7: IDEMPOTENT_REPLAY
  -- Panggilan #1 qty=4 di v_b3, panggilan #2 dengan p_client_uuid sama
  -- harus return idempotent_replay=true & transaction_id sama, tanpa
  -- mengurangi v_b3 lagi. count(transactions where client_uuid=v_cid) = 1.
  -- ===================================================================
  raise notice '--- SKENARIO 7: IDEMPOTENT_REPLAY ---';
  declare
    v_b3_before integer;
    v_b3_after  integer;
    v_tx2       jsonb;
    v_tx_count  integer;
  begin
    v_cid := gen_random_uuid();

    select qty_available into v_b3_before from public.inventory_batches where id = v_b3;

    v_tx := public.transaction_create(
      p_location_id => v_outlet_dago,
      p_type        => 'penjualan',
      p_items       => jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pa,
          'qty', 4,
          'override', jsonb_build_array(
            jsonb_build_object('batch_id', v_b3, 'qty', 4)
          )
        )
      ),
      p_notes       => 'test idempotent #1',
      p_client_uuid => v_cid,
      p_created_by  => v_admin
    );
    raise notice 'TX call#1 = %', v_tx;

    if (v_tx->>'idempotent_replay')::boolean <> false then
      raise exception 'ASSERTION FAILED: call#1 idempotent_replay should be false, got %',
        v_tx->>'idempotent_replay';
    end if;

    -- Panggilan kedua: payload identik, p_client_uuid sama.
    v_tx2 := public.transaction_create(
      p_location_id => v_outlet_dago,
      p_type        => 'penjualan',
      p_items       => jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pa,
          'qty', 4,
          'override', jsonb_build_array(
            jsonb_build_object('batch_id', v_b3, 'qty', 4)
          )
        )
      ),
      p_notes       => 'test idempotent #2',
      p_client_uuid => v_cid,
      p_created_by  => v_admin
    );
    raise notice 'TX call#2 = %', v_tx2;

    if (v_tx2->>'idempotent_replay')::boolean <> true then
      raise exception 'ASSERTION FAILED: call#2 idempotent_replay should be true, got %',
        v_tx2->>'idempotent_replay';
    end if;
    if (v_tx2->>'transaction_id') <> (v_tx->>'transaction_id') then
      raise exception 'ASSERTION FAILED: transaction_id mismatch call#1=% call#2=%',
        v_tx->>'transaction_id', v_tx2->>'transaction_id';
    end if;

    select count(*) into v_tx_count from public.transactions where client_uuid = v_cid;
    if v_tx_count <> 1 then
      raise exception 'ASSERTION FAILED: expected 1 transaction with client_uuid, got %', v_tx_count;
    end if;

    select qty_available into v_b3_after from public.inventory_batches where id = v_b3;
    if v_b3_after <> v_b3_before - 4 then
      raise exception 'ASSERTION FAILED: v_b3 expected delta -4, got %->%', v_b3_before, v_b3_after;
    end if;

    raise notice 'OK SKENARIO 7: idempotent_replay=true, transaction_id sama, v_b3 %->% (delta 4)',
      v_b3_before, v_b3_after;
  end;

  raise notice '=== test_manual_override selesai: 7 skenario lulus ===';
end$$;
