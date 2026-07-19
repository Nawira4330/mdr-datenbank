-- Migration: persoenliche Einstellungen je Konto (aktuell: bevorzugte
-- Rassen fuer die Uebersicht, siehe einstellungen.html/js/list.js).
-- Anders als bei horses/pairings (geteilte Datenbank fuer alle) ist
-- diese Tabelle bewusst NICHT geteilt - jedes Konto sieht/aendert nur
-- seine eigene Zeile (RLS ueber auth.uid() = user_id).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- NULL oder leeres Array = keine Einschraenkung (alle Rassen sichtbar),
  -- analog zu "keine Auswahl = keine Einschraenkung" bei /mdrdb-rassen im
  -- Discord-Bot.
  preferred_breeds text[],
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated using (auth.uid() = user_id);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
