-- Migration: gespeicherte, benannte Sortierungen je Konto (Übersicht,
-- siehe js/list.js) - unabhängig von den kompletten Filter-Vorlagen
-- (migration_022_filter_presets.sql), die neben der Sortierung immer auch
-- alle Filter-/Suchfelder mit speichern. Hier nur Feld + Richtung, damit
-- sich eine Sortierung auch ohne zugehörige Filterkombination benennen und
-- schnell wechseln lässt (Nutzerwunsch).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create table if not exists public.sort_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_field text not null,
  sort_dir text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.sort_presets enable row level security;

drop policy if exists "sort_presets_select_own" on public.sort_presets;
create policy "sort_presets_select_own" on public.sort_presets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "sort_presets_insert_own" on public.sort_presets;
create policy "sort_presets_insert_own" on public.sort_presets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "sort_presets_update_own" on public.sort_presets;
create policy "sort_presets_update_own" on public.sort_presets
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "sort_presets_delete_own" on public.sort_presets;
create policy "sort_presets_delete_own" on public.sort_presets
  for delete to authenticated using (auth.uid() = user_id);
