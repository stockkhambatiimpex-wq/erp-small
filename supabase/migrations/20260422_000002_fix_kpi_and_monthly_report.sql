-- Fix KPI and monthly report to work with global products (no products.warehouse_id)

create or replace function public.kpi_overview()
returns table (
  products bigint,
  brands bigint,
  warehouses bigint,
  units bigint,
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
  brand_name text,
  qty_in bigint,
  qty_out bigint,
  net bigint
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
  group by p.id, p.sku, p.name, p.category, p.unit, b.name
  order by p.name asc;
$$;

