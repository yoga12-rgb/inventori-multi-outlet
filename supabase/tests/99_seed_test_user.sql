-- =====================================================================
-- 99_seed_test_user.sql
-- Buat user dummy untuk testing test_fifo.sql.
-- =====================================================================

do $$
declare
  v_role  uuid;
  v_admin uuid;
begin
  select id into v_role from public.roles where name = 'Super Admin';

  -- Buat 1 user di auth.users dan profil di public.users.
  insert into auth.users(email) values ('admin@example.test') returning id into v_admin;

  insert into public.users(id, role_id, location_id, name, email)
  values (v_admin, v_role, null, 'Admin Test', 'admin@example.test')
  on conflict (id) do nothing;
end$$;
