-- =====================================================================
-- 00_bootstrap_test.sql
-- HANYA UNTUK TESTING DI POSTGRES POLOS (tanpa Supabase Auth).
-- - Bikin schema "auth" + tabel "auth.users" minimum.
-- - Bikin fungsi auth.uid() supaya RPC yang refer ke auth.uid() tidak gagal.
-- Di Supabase asli, jangan jalankan file ini.
-- =====================================================================

-- Roles yang biasanya disediakan Supabase. Buat dulu sebelum grant.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit bypassrls;
  end if;
end$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Selalu pastikan kolom raw_user_meta_data ada (kalau bootstrap lama dipakai
-- ulang, table kemungkinan belum punya kolom ini).
alter table auth.users
  add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;

-- auth.uid() default null → memaksa kita pakai p_created_by saat memanggil RPC.
-- security definer + grant execute supaya bisa dipanggil saat role authenticated.
create or replace function auth.uid()
returns uuid
language sql
stable
security definer
as $$
  select null::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
