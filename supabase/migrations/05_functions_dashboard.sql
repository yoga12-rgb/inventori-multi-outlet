-- =====================================================================
-- 05_functions_dashboard.sql
-- View & RPC ringkasan stok untuk dashboard.
-- Dirancang untuk dipanggil oleh PWA setiap ~10 menit (bisa lebih jarang
-- saat offline). RLS sudah memfilter data per lokasi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- View ringkasan stok per (lokasi, produk).
-- ---------------------------------------------------------------------
create or replace view public.v_stock_by_location as
select
  ib.location_id,
  l.name              as location_name,
  l.type              as location_type,
  ib.product_id,
  p.sku               as product_sku,
  p.name              as product_name,
  p.unit              as product_unit,
  sum(ib.qty_available)                                  as qty_total,
  count(*) filter (where ib.qty_available > 0)           as batch_count,
  min(ib.production_date) filter (where ib.qty_available > 0) as oldest_production_date,
  min(ib.expired_date)    filter (where ib.qty_available > 0) as nearest_expired_date
from public.inventory_batches ib
join public.locations l on l.id = ib.location_id
join public.products  p on p.id = ib.product_id
group by ib.location_id, l.name, l.type, ib.product_id, p.sku, p.name, p.unit;

comment on view public.v_stock_by_location is
  'Ringkasan stok per lokasi & produk untuk dashboard. Tunduk RLS inventory_batches.';

grant select on public.v_stock_by_location to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: ringkasan dashboard satu lokasi (default = lokasi user).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stock(
  p_location_id uuid default null
)
returns table (
  product_id              uuid,
  product_sku             text,
  product_name            text,
  qty_total               integer,
  batch_count             bigint,
  oldest_production_date  date,
  nearest_expired_date    date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.product_id,
    v.product_sku,
    v.product_name,
    v.qty_total::integer,
    v.batch_count,
    v.oldest_production_date,
    v.nearest_expired_date
  from public.v_stock_by_location v
  where v.location_id = coalesce(p_location_id, public.current_user_location())
  order by v.product_name;
$$;

-- ---------------------------------------------------------------------
-- RPC: daftar in-transit yang menuju lokasi tertentu (default = lokasi user)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_incoming_transfers(
  p_location_id uuid default null
)
returns table (
  transfer_id      uuid,
  transfer_number  text,
  from_location_id uuid,
  from_location    text,
  sent_at          timestamptz,
  total_qty        bigint,
  product_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select coalesce(p_location_id, public.current_user_location()) as loc
  )
  select
    t.id,
    t.transfer_number,
    t.from_location_id,
    l.name,
    t.sent_at,
    coalesce(sum(ti.qty), 0),
    count(distinct ti.product_id)
  from public.transfers t
  join target on t.to_location_id = target.loc
  join public.locations l on l.id = t.from_location_id
  left join public.transfer_items ti on ti.transfer_id = t.id
  where t.status = 'in_transit'
  group by t.id, l.name
  order by t.sent_at desc;
$$;
