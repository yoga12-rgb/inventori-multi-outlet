-- =====================================================================
-- setup_admin_rpc.sql
-- RPC bantuan untuk halaman master Users di UI.
-- Tujuan: memungkinkan Super Admin mengelola profil di public.users
-- (termasuk discovery auth.users yang belum di-link) tanpa harus pakai
-- service_role key di sisi client.
--
-- Idempotent. Jalankan di Supabase SQL Editor setelah setup_supabase.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- admin_unlinked_users()
-- Kembalikan auth.users yang belum punya profil di public.users.
-- Dipakai UI untuk menampilkan kandidat user baru yang siap di-link
-- ke role/lokasi.
-- ---------------------------------------------------------------------
create or replace function public.admin_unlinked_users()
returns table (
  id         uuid,
  email      text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'Super Admin' then
    raise exception 'Hanya Super Admin yang dapat memakai admin_unlinked_users'
      using errcode = '42501';
  end if;

  return query
    select au.id, au.email::text, au.created_at
    from auth.users au
    left join public.users pu on pu.id = au.id
    where pu.id is null
    order by au.created_at desc;
end$$;

-- ---------------------------------------------------------------------
-- admin_user_upsert(...)
-- Insert / update profil di public.users.
-- - Email selalu disinkronkan dari auth.users (single source of truth).
-- - Role wajib, lokasi opsional (null = lintas-lokasi untuk Super Admin
--   atau belum ditugaskan).
-- ---------------------------------------------------------------------
create or replace function public.admin_user_upsert(
  p_auth_user_id uuid,
  p_role_id      uuid,
  p_location_id  uuid,
  p_name         text,
  p_is_active    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.current_user_role() is distinct from 'Super Admin' then
    raise exception 'Hanya Super Admin yang dapat memakai admin_user_upsert'
      using errcode = '42501';
  end if;

  if p_auth_user_id is null then
    raise exception 'auth_user_id wajib diisi' using errcode = '22023';
  end if;
  if p_role_id is null then
    raise exception 'role_id wajib diisi' using errcode = '22023';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name wajib diisi' using errcode = '22023';
  end if;

  select email::text into v_email from auth.users where id = p_auth_user_id;
  if v_email is null then
    raise exception 'Auth user % tidak ditemukan', p_auth_user_id
      using errcode = 'P0002';
  end if;

  insert into public.users(id, role_id, location_id, name, email, is_active)
  values (p_auth_user_id, p_role_id, p_location_id, btrim(p_name), v_email, coalesce(p_is_active, true))
  on conflict (id) do update
    set role_id     = excluded.role_id,
        location_id = excluded.location_id,
        name        = excluded.name,
        email       = excluded.email,
        is_active   = excluded.is_active,
        updated_at  = now();

  return jsonb_build_object('id', p_auth_user_id, 'email', v_email);
end$$;



-- =====================================================================
-- production_in
-- Tambah stok awal / hasil produksi ke lokasi (umumnya gudang produksi).
-- Bisa juga dipakai sebagai stock-adjustment (penambahan stok).
--
-- Untuk batch yang sudah ada (kombinasi product+location+production_date),
-- qty_available diakumulasi. Kalau belum ada, batch baru dibuat.
--
-- Akses: hanya Super Admin / Kepala Gudang yang dapat menambah stok.
-- (RPC security definer; guard dilakukan via current_user_role.)
--
-- Parameter p_items: jsonb array
--   [
--     {
--       "product_id": "uuid",
--       "production_date": "YYYY-MM-DD",
--       "expired_date": "YYYY-MM-DD",   // optional
--       "qty": 100
--     },
--     ...
--   ]
-- =====================================================================
create or replace function public.production_in(
  p_location_id uuid,
  p_items       jsonb,
  p_notes       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.current_user_role();
  v_loc_type location_type;
  v_added    integer := 0;
  v_item     jsonb;
  v_qty      integer;
  v_product  uuid;
  v_prod_dt  date;
  v_exp_dt   date;
begin
  if v_role is null or v_role not in ('Super Admin', 'Kepala Gudang') then
    raise exception 'Hanya Super Admin / Kepala Gudang yang dapat menambah stok produksi'
      using errcode = '42501';
  end if;

  if p_location_id is null then
    raise exception 'location_id wajib diisi' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items tidak boleh kosong' using errcode = '22023';
  end if;

  -- Tipe lokasi tidak dibatasi (boleh outlet juga, untuk koreksi stok),
  -- tapi default expectation-nya gudang_produksi.
  select type into v_loc_type from public.locations where id = p_location_id;
  if v_loc_type is null then
    raise exception 'Lokasi % tidak ditemukan', p_location_id using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product := nullif((v_item->>'product_id'), '')::uuid;
    v_prod_dt := nullif((v_item->>'production_date'), '')::date;
    v_exp_dt  := nullif((v_item->>'expired_date'), '')::date;
    v_qty     := nullif((v_item->>'qty'), '')::int;

    if v_product is null then
      raise exception 'product_id wajib diisi pada setiap item' using errcode = '22023';
    end if;
    if v_prod_dt is null then
      raise exception 'production_date wajib diisi pada setiap item' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'qty harus > 0' using errcode = '22023';
    end if;
    if v_exp_dt is not null and v_exp_dt < v_prod_dt then
      raise exception 'expired_date tidak boleh sebelum production_date' using errcode = '22023';
    end if;

    if not exists (select 1 from public.products where id = v_product) then
      raise exception 'Produk % tidak ditemukan', v_product using errcode = 'P0002';
    end if;

    insert into public.inventory_batches(
      product_id, location_id, production_date, expired_date, qty_available
    ) values (
      v_product, p_location_id, v_prod_dt, v_exp_dt, v_qty
    )
    on conflict (product_id, location_id, production_date) do update
      set qty_available = public.inventory_batches.qty_available + excluded.qty_available,
          expired_date  = coalesce(excluded.expired_date, public.inventory_batches.expired_date),
          updated_at    = now();

    v_added := v_added + 1;
  end loop;

  return jsonb_build_object(
    'location_id', p_location_id,
    'items_processed', v_added,
    'notes', p_notes
  );
end$$;
