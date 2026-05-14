-- =====================================================================
-- 06_seed_data.sql
-- Data sampel untuk pengujian Phase 1.
-- Aman dijalankan ulang (ON CONFLICT DO NOTHING).
-- =====================================================================

-- Roles
insert into public.roles(name, description) values
  ('Super Admin',     'Akses penuh ke seluruh sistem'),
  ('Kepala Gudang',   'Kelola produksi & mutasi gudang pusat'),
  ('Kasir Outlet',    'Transaksi pengeluaran di outlet'),
  ('Staf Outlet',     'Bantu kasir / terima mutasi')
on conflict (name) do nothing;

-- Permissions (modul:aksi)
insert into public.permissions(module_name, action) values
  ('inventory',  'read'),
  ('inventory',  'create'),
  ('inventory',  'update'),
  ('inventory',  'delete'),
  ('transfer',   'read'),
  ('transfer',   'create'),
  ('transfer',   'update'),
  ('transaction','read'),
  ('transaction','create'),
  ('master',     'read'),
  ('master',     'create'),
  ('master',     'update'),
  ('master',     'delete')
on conflict (module_name, action) do nothing;

-- Super Admin punya semua permission
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Super Admin'
on conflict do nothing;

-- Kepala Gudang: master(read), inventory(*), transfer(*)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master' and p.action = 'read') or
  (p.module_name in ('inventory','transfer'))
where r.name = 'Kepala Gudang'
on conflict do nothing;

-- Kasir Outlet: master(read), inventory(read), transaction(read,create), transfer(read,update)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master'      and p.action = 'read') or
  (p.module_name = 'inventory'   and p.action = 'read') or
  (p.module_name = 'transaction' and p.action in ('read','create')) or
  (p.module_name = 'transfer'    and p.action in ('read','update'))
where r.name = 'Kasir Outlet'
on conflict do nothing;

-- Staf Outlet: subset Kasir tanpa transaction.create
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (p.module_name = 'master'      and p.action = 'read') or
  (p.module_name = 'inventory'   and p.action = 'read') or
  (p.module_name = 'transaction' and p.action = 'read') or
  (p.module_name = 'transfer'    and p.action in ('read','update'))
where r.name = 'Staf Outlet'
on conflict do nothing;

-- Lokasi
insert into public.locations(name, type) values
  ('Gudang Pusat',      'gudang_produksi'),
  ('Outlet Pamulang',   'outlet'),
  ('Outlet Dago',       'outlet'),
  ('Outlet Pajajaran',  'outlet'),
  ('Outlet Sawangan',   'outlet')
on conflict (name) do nothing;

-- Produk (barang jadi)
insert into public.products(sku, name, unit) values
  ('SKU-001', 'Roti Coklat',    'pcs'),
  ('SKU-002', 'Roti Keju',      'pcs'),
  ('SKU-003', 'Roti Sosis',     'pcs'),
  ('SKU-004', 'Donat Original', 'pcs')
on conflict (sku) do nothing;

-- Stok awal di Gudang Pusat: 3 batch berbeda untuk uji FIFO
do $$
declare
  v_gudang  uuid;
  v_p1 uuid;
  v_p2 uuid;
begin
  select id into v_gudang from public.locations where name = 'Gudang Pusat';
  select id into v_p1 from public.products where sku = 'SKU-001';
  select id into v_p2 from public.products where sku = 'SKU-002';

  insert into public.inventory_batches(product_id, location_id, production_date, expired_date, qty_available)
  values
    (v_p1, v_gudang, current_date - 5, current_date + 25, 30),
    (v_p1, v_gudang, current_date - 3, current_date + 27, 50),
    (v_p1, v_gudang, current_date - 1, current_date + 29, 40),
    (v_p2, v_gudang, current_date - 4, current_date + 26, 60)
  on conflict (product_id, location_id, production_date) do update
    set qty_available = excluded.qty_available;
end$$;
