-- Migration: neue Tabelle fuer den Verpaarungs-Log.
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  owner text,
  stallion text,
  mare text,
  pairing_date date,
  keep_foal boolean,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pairings_owner_idx on public.pairings (owner);
create index if not exists pairings_user_id_idx on public.pairings (user_id);

drop trigger if exists pairings_set_updated_at on public.pairings;
create trigger pairings_set_updated_at
before update on public.pairings
for each row execute function public.set_updated_at();

alter table public.pairings enable row level security;

drop policy if exists "pairings_select_authenticated" on public.pairings;
create policy "pairings_select_authenticated" on public.pairings
  for select to authenticated using (true);

drop policy if exists "pairings_insert_authenticated" on public.pairings;
create policy "pairings_insert_authenticated" on public.pairings
  for insert to authenticated with check (true);

drop policy if exists "pairings_update_authenticated" on public.pairings;
create policy "pairings_update_authenticated" on public.pairings
  for update to authenticated using (true);

drop policy if exists "pairings_delete_authenticated" on public.pairings;
create policy "pairings_delete_authenticated" on public.pairings
  for delete to authenticated using (true);
