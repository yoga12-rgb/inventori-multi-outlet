-- =====================================================================
-- 07_auth_user_provisioning.sql
-- Bootstrap profil aplikasi dari Supabase Auth.
--
-- Trigger di auth.users: setiap signup baru akan otomatis dibuatkan
-- baris di public.users dengan role default.
--
--   - User PERTAMA (count = 0) → role 'Super Admin'.
--   - User selanjutnya          → role 'Staf Outlet' (paling minimum).
--
-- Aman dijalankan ulang. Aman juga di lingkungan test bootstrap
-- (00_bootstrap_test.sql) karena memakai ON CONFLICT DO NOTHING dan
-- skip kalau profil sudah ada.
-- =====================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id  uuid;
  v_count    integer;
  v_email    text;
  v_name     text;
begin
  -- Skip kalau sudah ada profil (mis. seed manual sudah membuatnya).
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  -- Pilih role default. User pertama menjadi Super Admin agar bisa
  -- bootstrap RBAC; user berikutnya dapat role minimum 'Staf Outlet'.
  select count(*) into v_count from public.users;
  if v_count = 0 then
    select id into v_role_id from public.roles where name = 'Super Admin' limit 1;
  else
    select id into v_role_id from public.roles where name = 'Staf Outlet' limit 1;
  end if;

  -- Tanpa role yang ter-seed, jangan paksakan baris profil agar tidak
  -- melanggar foreign key. Caller harus jalanin migrasi seed dulu.
  if v_role_id is null then
    return new;
  end if;

  v_email := coalesce(new.email, new.id::text || '@local.invalid');
  v_name  := coalesce(new.raw_user_meta_data->>'name',
                      split_part(coalesce(new.email,''), '@', 1));
  if v_name is null or v_name = '' then v_name := 'Pengguna Baru'; end if;

  begin
    insert into public.users(id, role_id, location_id, name, email)
    values (new.id, v_role_id, null, v_name, v_email)
    on conflict (id) do nothing;
  exception
    when unique_violation then
      -- email konflik atau race kondisi: abaikan, profil bisa dilengkapi
      -- manual oleh Super Admin.
      null;
  end;

  return new;
end$$;

-- Pasang trigger pada auth.users (tabel default Supabase Auth).
drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
