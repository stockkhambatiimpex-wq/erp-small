-- Seed initial brands (idempotent).

insert into public.brands (name)
values
  ('Gold star'),
  ('Maars'),
  ('Juckson')
on conflict (name) do nothing;

