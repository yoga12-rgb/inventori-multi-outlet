-- Stub Supabase-only objects untuk validasi setup_supabase.sql di Postgres polos.
-- TIDAK perlu dijalankan di Supabase asli (sudah disediakan oleh platform).

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
security definer
as $$ select null::uuid $$;

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

-- Supabase secara default memberi USAGE + table privileges ke 3 role di atas
-- untuk semua objek di schema public. Default privileges memastikan tabel
-- yang DIBUAT NANTI oleh setup_supabase.sql langsung ter-grant.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
