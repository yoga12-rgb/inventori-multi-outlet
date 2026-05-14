-- =====================================================================
-- 02_rls_policies.sql
-- Row Level Security: user hanya boleh melihat data terkait lokasinya,
-- kecuali Super Admin / Kepala Gudang yang dapat melihat lintas lokasi.
--
-- Asumsi: profil user disimpan di public.users dan id = auth.uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (security definer agar bisa baca public.users tanpa
-- terjebak rekursi RLS pada tabel itu sendiri).
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_location()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.is_global_user()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() in ('Super Admin', 'Kepala Gudang'), false);
$$;

-- ---------------------------------------------------------------------
-- Grant tabel ke role 'authenticated' & 'service_role'.
-- Di Supabase ini biasanya sudah default; idempotent kalau di-run ulang.
-- Penting di lingkungan test lokal supaya RLS bekerja (tanpa grant,
-- 'authenticated' kena permission denied bahkan sebelum RLS dievaluasi).
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.roles, public.permissions, public.role_permissions,
  public.locations, public.products, public.users,
  public.inventory_batches, public.transfers, public.transfer_items,
  public.transactions, public.transaction_items
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Aktifkan RLS
-- ---------------------------------------------------------------------
alter table public.roles              enable row level security;
alter table public.permissions        enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.locations          enable row level security;
alter table public.products           enable row level security;
alter table public.users              enable row level security;
alter table public.inventory_batches  enable row level security;
alter table public.transfers          enable row level security;
alter table public.transfer_items     enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_items  enable row level security;

-- ---------------------------------------------------------------------
-- Master data: semua user ter-autentikasi boleh BACA, hanya admin yang
-- bisa MUTATE. Logika mutasi rinci disarankan dilakukan via RPC.
-- ---------------------------------------------------------------------
drop policy if exists "read_roles_all"           on public.roles;
drop policy if exists "read_permissions_all"     on public.permissions;
drop policy if exists "read_role_permissions"    on public.role_permissions;
drop policy if exists "read_locations_all"       on public.locations;
drop policy if exists "read_products_all"        on public.products;

create policy "read_roles_all"        on public.roles            for select to authenticated using (true);
create policy "read_permissions_all"  on public.permissions      for select to authenticated using (true);
create policy "read_role_permissions" on public.role_permissions for select to authenticated using (true);
create policy "read_locations_all"    on public.locations        for select to authenticated using (true);
create policy "read_products_all"     on public.products         for select to authenticated using (true);

-- Hanya Super Admin yang boleh insert/update/delete master data dari client.
drop policy if exists "admin_write_locations" on public.locations;
create policy "admin_write_locations" on public.locations
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "admin_write_products" on public.products;
create policy "admin_write_products" on public.products
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

-- ---------------------------------------------------------------------
-- Profil user
-- ---------------------------------------------------------------------
drop policy if exists "users_self_or_admin_read" on public.users;
create policy "users_self_or_admin_read" on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'Super Admin');

drop policy if exists "users_admin_write" on public.users;
create policy "users_admin_write" on public.users
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

-- ---------------------------------------------------------------------
-- Inventory: hanya boleh dilihat oleh user di lokasi yang sama, atau
-- user global. Mutasi sebaiknya selalu lewat RPC (security definer)
-- sehingga policy write boleh ketat.
-- ---------------------------------------------------------------------
drop policy if exists "inv_read_by_location" on public.inventory_batches;
create policy "inv_read_by_location" on public.inventory_batches
  for select to authenticated
  using (
    public.is_global_user()
    or location_id = public.current_user_location()
  );

drop policy if exists "inv_no_direct_write" on public.inventory_batches;
create policy "inv_no_direct_write" on public.inventory_batches
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

-- ---------------------------------------------------------------------
-- Transfers: terlihat oleh lokasi asal & tujuan
-- ---------------------------------------------------------------------
drop policy if exists "transfer_read_involved" on public.transfers;
create policy "transfer_read_involved" on public.transfers
  for select to authenticated
  using (
    public.is_global_user()
    or from_location_id = public.current_user_location()
    or to_location_id   = public.current_user_location()
  );

drop policy if exists "transfer_no_direct_write" on public.transfers;
create policy "transfer_no_direct_write" on public.transfers
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "transfer_items_read" on public.transfer_items;
create policy "transfer_items_read" on public.transfer_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transfers t
      where t.id = transfer_items.transfer_id
        and (
          public.is_global_user()
          or t.from_location_id = public.current_user_location()
          or t.to_location_id   = public.current_user_location()
        )
    )
  );

drop policy if exists "transfer_items_no_direct_write" on public.transfer_items;
create policy "transfer_items_no_direct_write" on public.transfer_items
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

-- ---------------------------------------------------------------------
-- Transactions: hanya lokasi yang sama
-- ---------------------------------------------------------------------
drop policy if exists "tx_read_by_location" on public.transactions;
create policy "tx_read_by_location" on public.transactions
  for select to authenticated
  using (
    public.is_global_user()
    or location_id = public.current_user_location()
  );

drop policy if exists "tx_no_direct_write" on public.transactions;
create policy "tx_no_direct_write" on public.transactions
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');

drop policy if exists "tx_items_read" on public.transaction_items;
create policy "tx_items_read" on public.transaction_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_items.transaction_id
        and (
          public.is_global_user()
          or t.location_id = public.current_user_location()
        )
    )
  );

drop policy if exists "tx_items_no_direct_write" on public.transaction_items;
create policy "tx_items_no_direct_write" on public.transaction_items
  for all to authenticated
  using (public.current_user_role() = 'Super Admin')
  with check (public.current_user_role() = 'Super Admin');
