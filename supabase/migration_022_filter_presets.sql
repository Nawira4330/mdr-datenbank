-- Migration: gespeicherte Filter-/Sucheinstellungen je Konto ("Vorlagen"
-- in der Übersicht, siehe js/list.js). Anders als user_settings
-- (eine Zeile je Konto) hier eine eigene Tabelle, da mehrere benannte
-- Vorlagen pro Konto möglich sein sollen. Loeschbar ueber
-- einstellungen.html.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create table if not exists public.filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- Zustand aller Filter-/Suchfelder der Übersicht (siehe
  -- collectFilterState/applyFilterState in js/list.js).
  filters jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.filter_presets enable row level security;

drop policy if exists "filter_presets_select_own" on public.filter_presets;
create policy "filter_presets_select_own" on public.filter_presets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "filter_presets_insert_own" on public.filter_presets;
create policy "filter_presets_insert_own" on public.filter_presets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "filter_presets_update_own" on public.filter_presets;
create policy "filter_presets_update_own" on public.filter_presets
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "filter_presets_delete_own" on public.filter_presets;
create policy "filter_presets_delete_own" on public.filter_presets
  for delete to authenticated using (auth.uid() = user_id);
