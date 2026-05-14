-- =====================================================================
-- setup_first_user.sql
-- Buat profil aplikasi (public.users) untuk user yang sudah dibuat
-- lewat Supabase Auth (Dashboard → Authentication → Users → Add user).
--
-- Cara pakai:
--   1. Di Supabase Dashboard, Authentication → Users → "Add user".
--      Set email + password. Centang "Auto Confirm User" supaya bisa
--      langsung login tanpa email verification.
--   2. Ganti dua placeholder di bawah:
--        :email_param      → email user
--        :role_param       → 'Super Admin' / 'Kepala Gudang' / 'Kasir Outlet' / 'Staf Outlet'
--        :location_param   → 'Gudang Pusat' / 'Outlet Pamulang' / dst.
--                             ATAU NULL (untuk Super Admin yang lintas-lokasi).
--        :name_param       → nama lengkap user.
--   3. Jalankan blok DO $$ ... $$ di SQL Editor.
--
-- Idempotent: aman dijalankan ulang. Akan UPDATE jika baris sudah ada.
-- =====================================================================

-- ===== EDIT BAGIAN INI =====
do $$
declare
  v_email    text := 'yoga.septriana@gmail.com';        -- sesuaikan
  v_role     text := 'Super Admin';              -- sesuaikan
  v_location text := null;                       -- isi nama lokasi atau biarkan null
  v_name     text := 'Admin';                    -- sesuaikan

  v_auth_id  uuid;
  v_role_id  uuid;
  v_loc_id   uuid;
begin
  -- 0. Precheck: pastikan setup_supabase.sql sudah dijalankan.
  if to_regclass('public.roles')     is null
     or to_regclass('public.users')  is null
     or to_regclass('public.locations') is null then
    raise exception
      'Tabel public.roles / public.users / public.locations belum ada. Jalankan supabase/setup_supabase.sql DULU sebelum file ini.';
  end if;

  -- 1. Cari user di auth.users berdasarkan email.
  select id into v_auth_id
  from auth.users
  where email = v_email
  limit 1;

  if v_auth_id is null then
    raise exception 'User dengan email % belum ada di auth.users. Buat dulu via Authentication → Users → Add user.', v_email;
  end if;

  -- 2. Cari role.
  select id into v_role_id from public.roles where name = v_role;
  if v_role_id is null then
    raise exception 'Role "%" tidak ditemukan. Pastikan setup_supabase.sql sudah dijalankan.', v_role;
  end if;

  -- 3. Cari lokasi (boleh null).
  if v_location is not null then
    select id into v_loc_id from public.locations where name = v_location;
    if v_loc_id is null then
      raise exception 'Lokasi "%" tidak ditemukan.', v_location;
    end if;
  end if;

  -- 4. Insert / update profil di public.users.
  insert into public.users(id, role_id, location_id, name, email, is_active)
  values (v_auth_id, v_role_id, v_loc_id, v_name, v_email, true)
  on conflict (id) do update
    set role_id     = excluded.role_id,
        location_id = excluded.location_id,
        name        = excluded.name,
        email       = excluded.email,
        is_active   = true,
        updated_at  = now();

  raise notice 'OK: profil user % ter-link ke role % lokasi %',
    v_email, v_role, coalesce(v_location, '(null)');
end$$;
