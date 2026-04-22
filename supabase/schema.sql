-- Khambati Impex Stock Manager (Supabase / Postgres)
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---- Roles / profiles ----
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null check (role in ('editor','viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

-- One editor max (enforced by unique partial index)
create unique index if not exists profiles_single_editor
  on public.profiles ((role))
  where role = 'editor';

-- Auto-create profile row for new users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---- Master data ----
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- When a warehouse is deleted, delete all products that have ever had stock movements there.
-- This matches the app requirement: removing a warehouse removes its products.
create or replace function public.delete_products_for_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.products p
  where p.id in (
    select distinct m.product_id
    from public.stock_movements m
    where m.warehouse_id = old.id
  );
  return old;
end;
$$;

drop trigger if exists warehouses_delete_products on public.warehouses;
create trigger warehouses_delete_products
  before delete on public.warehouses
  for each row execute procedure public.delete_products_for_warehouse();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  warehouse_id uuid references public.warehouses (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  category text,
  unit text not null default 'Pcs',
  min_qty integer not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists products_warehouse_idx on public.products (warehouse_id);
-- Helper: safe editor check for RLS (avoids infinite recursion)
-- SECURITY DEFINER lets the function read profiles without triggering its own RLS policies.
create or replace function public.is_editor(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_uid
      and role = 'editor'
  );
$$;

-- Allow all API roles to call it (RLS will still gate data access)
grant execute on function public.is_editor(uuid) to anon, authenticated;

create unique index if not exists products_sku_unique
  on public.products (lower(sku))
  where sku is not null and length(trim(sku)) > 0;

create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));

-- ---- Stock movements ----
create type if not exists public.movement_type as enum ('add','sub','set');

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  type public.movement_type not null,
  qty integer not null check (qty >= 0),
  remark text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_prod_wh_time
  on public.stock_movements (product_id, warehouse_id, created_at desc);

-- Helper view: current stock per product+warehouse
create or replace view public.v_current_stock as
with ordered as (
  select
    m.*,
    row_number() over (partition by product_id, warehouse_id order by created_at asc, id asc) as rn
  from public.stock_movements m
),
-- For each product+warehouse, compute running qty with "set" resetting baseline.
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

-- KPI function used by dashboard
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
    (select count(*) from s where total_qty < min_qty)
$$;

-- Monthly report RPC: grouped by product for one warehouse
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
    coalesce(sum(case when m.type = 'add' then m.qty when m.type = 'set' then greatest(m.qty - coalesce(prev.qty,0), 0) else 0 end),0) as qty_in,
    coalesce(sum(case when m.type = 'sub' then m.qty when m.type = 'set' then greatest(coalesce(prev.qty,0) - m.qty, 0) else 0 end),0) as qty_out,
    coalesce(sum(
      case
        when m.type='add' then m.qty
        when m.type='sub' then -m.qty
        when m.type='set' then m.qty - coalesce(prev.qty,0)
      end
    ),0) as net
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

-- ---- RLS ----
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.warehouses enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- Profiles: users can read their own; editor can read all
create policy "profiles_read_own" on public.profiles
  for select
  using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

-- Only editor can update profiles (to promote one editor)
create policy "profiles_editor_update" on public.profiles
  for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

-- Master tables: everyone can read
create policy "brands_read" on public.brands for select using (true);
create policy "warehouses_read" on public.warehouses for select using (true);
create policy "products_read" on public.products for select using (true);
create policy "movements_read" on public.stock_movements for select using (true);

-- Only editor can write master data and movements
create policy "brands_write_editor" on public.brands
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

create policy "warehouses_write_editor" on public.warehouses
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

create policy "products_write_editor" on public.products
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

create policy "movements_write_editor" on public.stock_movements
  for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='editor'));

