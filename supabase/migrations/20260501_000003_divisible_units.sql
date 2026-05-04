-- Add divisible unit support (Rolls -> Sq m) and allow decimal quantities.

alter table public.products
  add column if not exists is_divisible boolean not null default false,
  add column if not exists sub_unit text,
  add column if not exists sub_unit_per_unit numeric,
  alter column min_qty type numeric using min_qty::numeric,
  alter column min_qty set default 0;

alter table public.stock_movements
  alter column qty type numeric using qty::numeric;

drop view if exists public.v_current_stock;
create or replace view public.v_current_stock as
with ordered as (
  select
    m.*,
    row_number() over (partition by product_id, warehouse_id order by created_at asc, id asc) as rn
  from public.stock_movements m
),
calc as (
  select
    product_id,
    warehouse_id,
    created_at,
    id,
    case
      when type = 'set' then qty
      when type = 'add' then qty
      when type = 'sub' then -qty
    end as delta,
    case when type = 'set' then 1 else 0 end as is_set
  from public.stock_movements
),
grp as (
  select
    *,
    sum(is_set) over (partition by product_id, warehouse_id order by created_at asc, id asc) as set_group
  from calc
),
running as (
  select
    product_id,
    warehouse_id,
    set_group,
    created_at,
    id,
    sum(delta) over (partition by product_id, warehouse_id, set_group order by created_at asc, id asc) as running_qty
  from grp
)
select distinct on (product_id, warehouse_id)
  product_id,
  warehouse_id,
  running_qty as qty,
  created_at as as_of
from running
order by product_id, warehouse_id, created_at desc, id desc;

create or replace function public.kpi_overview()
returns table (
  products bigint,
  brands bigint,
  warehouses bigint,
  units numeric,
  low bigint
)
language sql
stable
as $$
  with s as (
    select
      p.id as product_id,
      coalesce(sum(cs.qty), 0) as total_qty,
      max(p.min_qty) as min_qty
    from public.products p
    left join public.v_current_stock cs
      on cs.product_id = p.id
    where p.active = true
    group by p.id
  )
  select
    (select count(*) from public.products where active = true),
    (select count(*) from public.brands),
    (select count(*) from public.warehouses),
    (select coalesce(sum(total_qty),0) from s),
    (select count(*) from s where total_qty < min_qty);
$$;

create or replace function public.monthly_movement_report(
  p_warehouse_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  product_id uuid,
  sku text,
  name text,
  category text,
  unit text,
  display_unit text,
  brand_name text,
  qty_in numeric,
  qty_out numeric,
  net numeric
)
language sql
stable
as $$
  select
    p.id as product_id,
    p.sku,
    p.name,
    p.category,
    p.unit,
    case when p.is_divisible then coalesce(p.sub_unit, p.unit) else p.unit end as display_unit,
    b.name as brand_name,
    coalesce(
      sum(
        case
          when m.type = 'add' then m.qty
          when m.type = 'set' then greatest(m.qty - coalesce(prev.qty,0), 0)
          else 0
        end
      ),
      0
    ) as qty_in,
    coalesce(
      sum(
        case
          when m.type = 'sub' then m.qty
          when m.type = 'set' then greatest(coalesce(prev.qty,0) - m.qty, 0)
          else 0
        end
      ),
      0
    ) as qty_out,
    coalesce(
      sum(
        case
          when m.type='add' then m.qty
          when m.type='sub' then -m.qty
          when m.type='set' then m.qty - coalesce(prev.qty,0)
        end
      ),
      0
    ) as net
  from public.products p
  left join public.brands b on b.id = p.brand_id
  left join public.stock_movements m
    on m.product_id = p.id
    and (p_warehouse_id is null or m.warehouse_id = p_warehouse_id)
    and m.created_at >= p_start
    and m.created_at < p_end
  left join lateral (
    select cs.qty
    from public.v_current_stock cs
    where cs.product_id = p.id
      and cs.warehouse_id = m.warehouse_id
      and cs.as_of < m.created_at
    order by cs.as_of desc
    limit 1
  ) prev on true
  where p.active = true
  group by p.id, p.sku, p.name, p.category, p.unit, p.is_divisible, p.sub_unit, b.name
  order by p.name asc;
$$;

