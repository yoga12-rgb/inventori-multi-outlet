-- =====================================================================
-- test_rls_per_location.sql
-- Verifikasi RLS membatasi data inventory & transactions per lokasi user,
-- kecuali Super Admin / Kepala Gudang.
--
-- Prasyarat:
--   - Bootstrap test (00_bootstrap_test.sql / bootstrap_supabase_roles.sql)
--     sudah membuat role 'authenticated' & schema auth.
--   - Migrasi 01..06 + 07_auth_user_provisioning + setup_admin_rpc terpasang.
--
-- Strategi:
--   1. Buat 3 user dummy: 1 Super Admin, 1 Kasir Outlet Pamulang,
--      1 Kasir Outlet Sawangan.
--   2. Buat batch di Pamulang & Sawangan + 1 transaksi di Pamulang.
--   3. Override fungsi auth.uid() untuk membaca dari custom GUC.
--      (Ini hanya dipakai di lingkungan test lokal — di Supabase asli,
--       auth.uid() sudah benar.)
--   4. SET LOCAL ROLE authenticated → simulasi user lewat RLS.
--   5. Verifikasi tiap user hanya melihat lokasinya, kecuali Super Admin
--      yang lintas lokasi.
-- =====================================================================

-- 0) Stub auth.uid() yang bisa dikontrol via current_setting.
create or replace function auth.uid()
returns uuid
language sql
stable
security definer
as $$
  select nullif(current_setting('app.test_uid', true), '')::uuid
$$;

-- Helper: jalankan blok dengan role 'authenticated' + auth.uid()=v_uid,
-- lalu kembali ke role semula.
do $$
declare
  v_admin_id  uuid := gen_random_uuid();
  v_kasir_p   uuid := gen_random_uuid();
  v_kasir_s   uuid := gen_random_uuid();
  v_role_sa   uuid;
  v_role_ko   uuid;
  v_loc_pam   uuid;
  v_loc_saw   uuid;
  v_pa        uuid;

  v_n_inv     integer;
  v_n_tx      integer;
begin
  select id into v_role_sa from public.roles where name = 'Super Admin';
  select id into v_role_ko from public.roles where name = 'Kasir Outlet';
  select id into v_loc_pam from public.locations where name = 'Outlet Pamulang';
  select id into v_loc_saw from public.locations where name = 'Outlet Sawangan';
  select id into v_pa      from public.products  where sku = 'SKU-001';

  -- Auth user dummy.
  insert into auth.users(id, email) values
    (v_admin_id, 'rls.admin@example.test'),
    (v_kasir_p,  'rls.kasir.pamulang@example.test'),
    (v_kasir_s,  'rls.kasir.sawangan@example.test')
  on conflict (id) do nothing;

  -- Profil aplikasi. Trigger handle_new_auth_user mungkin sudah membuat
  -- baris dengan role default; pakai DO UPDATE untuk menetapkan role/lokasi
  -- yang dimaksud test.
  insert into public.users(id, role_id, location_id, name, email, is_active) values
    (v_admin_id, v_role_sa, null,      'RLS Admin',          'rls.admin@example.test',          true),
    (v_kasir_p,  v_role_ko, v_loc_pam, 'RLS Kasir Pamulang', 'rls.kasir.pamulang@example.test', true),
    (v_kasir_s,  v_role_ko, v_loc_saw, 'RLS Kasir Sawangan', 'rls.kasir.sawangan@example.test', true)
  on conflict (id) do update
    set role_id     = excluded.role_id,
        location_id = excluded.location_id,
        name        = excluded.name,
        email       = excluded.email,
        is_active   = excluded.is_active;

  -- Pastikan ada batch di Pamulang & Sawangan.
  insert into public.inventory_batches(product_id, location_id, production_date, expired_date, qty_available)
  values
    (v_pa, v_loc_pam, current_date - 50, current_date + 30, 10),
    (v_pa, v_loc_saw, current_date - 49, current_date + 31, 12)
  on conflict (product_id, location_id, production_date) do update
    set qty_available = excluded.qty_available;

  -- Buat 1 transaksi di Pamulang (oleh kasir Pamulang).
  perform public.transaction_create(
    p_location_id => v_loc_pam,
    p_type        => 'penjualan',
    p_items       => jsonb_build_array(
      jsonb_build_object('product_id', v_pa, 'qty', 1)
    ),
    p_notes       => 'rls test seed pamulang',
    p_client_uuid => gen_random_uuid(),
    p_created_by  => v_kasir_p
  );

  -- =================================================================
  -- A. Sebagai Kasir Pamulang
  -- =================================================================
  raise notice '--- A. Kasir Pamulang ---';
  perform set_config('app.test_uid', v_kasir_p::text, true);
  set local role authenticated;

  -- Debug: konfirmasi context auth.uid() dan helper.
  raise notice 'debug auth.uid() = %, role = %, loc = %',
    auth.uid(),
    public.current_user_role(),
    public.current_user_location();

  -- Pamulang harus terlihat (≥1).
  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_pam;
  if v_n_inv < 1 then
    raise exception 'ASSERTION FAILED: kasir Pamulang TIDAK lihat batch Pamulang sendiri, got %', v_n_inv;
  end if;
  raise notice 'OK A1: kasir Pamulang lihat % batch di Pamulang (own)', v_n_inv;

  -- Sawangan TIDAK boleh terlihat (=0).
  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_saw;
  if v_n_inv <> 0 then
    raise exception 'ASSERTION FAILED: kasir Pamulang TIDAK boleh lihat batch Sawangan, got %', v_n_inv;
  end if;
  raise notice 'OK A2: kasir Pamulang tidak lihat batch Sawangan';

  select count(*) into v_n_tx
  from public.transactions
  where location_id in (v_loc_pam, v_loc_saw);

  if v_n_tx < 1 then
    raise exception 'ASSERTION FAILED: kasir Pamulang harusnya lihat tx-nya sendiri, got %', v_n_tx;
  end if;
  raise notice 'OK A3: kasir Pamulang lihat % transaksi (own location)', v_n_tx;

  reset role;

  -- =================================================================
  -- B. Sebagai Kasir Sawangan
  -- =================================================================
  raise notice '--- B. Kasir Sawangan ---';
  perform set_config('app.test_uid', v_kasir_s::text, true);
  set local role authenticated;

  -- Sawangan harus terlihat (≥1).
  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_saw;
  if v_n_inv < 1 then
    raise exception 'ASSERTION FAILED: kasir Sawangan TIDAK lihat batch Sawangan sendiri, got %', v_n_inv;
  end if;
  raise notice 'OK B1: kasir Sawangan lihat % batch di Sawangan (own)', v_n_inv;

  -- Pamulang TIDAK boleh terlihat.
  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_pam;
  if v_n_inv <> 0 then
    raise exception 'ASSERTION FAILED: kasir Sawangan TIDAK boleh lihat batch Pamulang, got %', v_n_inv;
  end if;
  raise notice 'OK B2: kasir Sawangan tidak lihat batch Pamulang';

  select count(*) into v_n_tx
  from public.transactions
  where location_id = v_loc_pam;

  if v_n_tx <> 0 then
    raise exception 'ASSERTION FAILED: kasir Sawangan TIDAK boleh lihat tx Pamulang, got %', v_n_tx;
  end if;
  raise notice 'OK B3: kasir Sawangan tidak lihat tx Pamulang';

  reset role;

  -- =================================================================
  -- C. Sebagai Super Admin
  -- =================================================================
  raise notice '--- C. Super Admin ---';
  perform set_config('app.test_uid', v_admin_id::text, true);
  set local role authenticated;

  -- Super Admin harus lihat batch dari KEDUA lokasi (≥1 di Pamulang DAN ≥1 di Sawangan).
  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_pam;
  if v_n_inv < 1 then
    raise exception 'ASSERTION FAILED: Super Admin tidak lihat batch Pamulang, got %', v_n_inv;
  end if;

  select count(*) into v_n_inv
  from public.inventory_batches
  where product_id = v_pa and location_id = v_loc_saw;
  if v_n_inv < 1 then
    raise exception 'ASSERTION FAILED: Super Admin tidak lihat batch Sawangan, got %', v_n_inv;
  end if;
  raise notice 'OK C: Super Admin lihat batch Pamulang & Sawangan (lintas)';

  reset role;

  raise notice '=== test_rls_per_location selesai ===';
end$$;
