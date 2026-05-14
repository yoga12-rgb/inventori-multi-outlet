-- =====================================================================
-- 09_inventory_pivot_dynamic.sql
-- Refactor inventory_pivot agar mendukung kategori dinamis dari tabel
-- transaction_categories. Output sekarang LONG format:
--
--   - Untuk metric `stok_akhir` (snapshot saat ini): satu baris per
--     (lokasi, produk) dengan category_code = '__akhir__'.
--   - Untuk metric `oper_in` / `oper_out` (transfer dalam range):
--     category_code = '__oper_in__' / '__oper_out__'.
--   - Untuk tiap kategori transaksi: category_code = code asli kategori.
--
-- Frontend men-pivot ke (lokasi × kategori) di sisi UI.
-- =====================================================================

drop function if exists public.inventory_pivot(timestamptz, timestamptz);

create or replace function public.inventory_pivot(
  p_from timestamptz default date_trunc('day', now()),
  p_to   timestamptz default now()
)
returns table (
  location_id    uuid,
  location_name  text,
  location_type  location_type,
  product_id     uuid,
  product_sku    text,
  product_name   text,
  product_unit   text,
  category_code  text,
  category_name  text,
  category_sort  integer,
  qty            bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select l.id, l.name, l.type
    from public.locations l
    where l.is_active = true
      and (
        public.is_global_user()
        or l.id = public.current_user_location()
      )
  ),
  active_products as (
    select id, sku, name, unit from public.products where is_active = true
  ),
  -- 1) snapshot stok akhir
  rec_akhir as (
    select b.location_id, b.product_id,
           '__akhir__'::text as category_code,
           'Stok Akhir'::text as category_name,
           1000 as category_sort,
           sum(b.qty_available)::bigint as qty
    from public.inventory_batches b
    group by b.location_id, b.product_id
  ),
  -- 2) operasi transfer (in/out) dalam range
  rec_oper_in as (
    select t.to_location_id as location_id, ti.product_id,
           '__oper_in__'::text as category_code,
           'Oper In'::text as category_name,
           5 as category_sort,
           sum(ti.qty)::bigint as qty
    from public.transfer_items ti
    join public.transfers t on t.id = ti.transfer_id
    where t.status = 'completed'
      and t.received_at >= p_from
      and t.received_at <= p_to
    group by t.to_location_id, ti.product_id
  ),
  rec_oper_out as (
    select t.from_location_id as location_id, ti.product_id,
           '__oper_out__'::text as category_code,
           'Oper Out'::text as category_name,
           6 as category_sort,
           sum(ti.qty)::bigint as qty
    from public.transfer_items ti
    join public.transfers t on t.id = ti.transfer_id
    where t.status <> 'cancelled'
      and t.sent_at >= p_from
      and t.sent_at <= p_to
    group by t.from_location_id, ti.product_id
  ),
  -- 3) transaksi per kategori
  rec_tx as (
    select t.location_id, ti.product_id,
           c.code  as category_code,
           c.name  as category_name,
           c.sort_order as category_sort,
           sum(ti.qty)::bigint as qty
    from public.transaction_items ti
    join public.transactions t          on t.id = ti.transaction_id
    join public.transaction_categories c on c.id = t.category_id
    where t.created_at >= p_from
      and t.created_at <= p_to
    group by t.location_id, ti.product_id, c.code, c.name, c.sort_order
  )
  select
    l.id, l.name, l.type,
    p.id, p.sku, p.name, p.unit,
    r.category_code, r.category_name, r.category_sort,
    r.qty
  from allowed l
  cross join active_products p
  left join lateral (
    select category_code, category_name, category_sort, qty
    from rec_akhir   x where x.location_id = l.id and x.product_id = p.id
    union all
    select category_code, category_name, category_sort, qty
    from rec_oper_in x where x.location_id = l.id and x.product_id = p.id
    union all
    select category_code, category_name, category_sort, qty
    from rec_oper_out x where x.location_id = l.id and x.product_id = p.id
    union all
    select category_code, category_name, category_sort, qty
    from rec_tx      x where x.location_id = l.id and x.product_id = p.id
  ) r on true
  where r.qty is not null
  order by l.name, p.name, r.category_sort, r.category_code;
$$;
