-- Seed brands + 3 warehouses (edit names as needed)

insert into public.brands (name)
values
  ('Zahabiya'),
  ('Akfix'),
  ('Alyaf'),
  ('Intrade chemicals'),
  ('Polycraft'),
  ('Technobit'),
  ('Khambati impex')
on conflict (name) do nothing;

insert into public.warehouses (name)
values
  ('Main Warehouse'),
  ('Warehouse 2'),
  ('Warehouse 3')
on conflict (name) do nothing;

