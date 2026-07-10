-- Morning Dust Ranch Datenbank - Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" komplett einfügen und ausführen.

create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- Stammdaten
  name text not null,
  gender text,
  breed text,
  purebred_pct numeric,
  coat_color text,
  disease_free boolean,

  -- Verwaltung
  owner text,

  -- Papiere / Zucht
  breeding_allowed boolean,
  hlp_slp text,
  ico numeric,

  -- Strukturierte Detaildaten (aus dem Text-Parser)
  genetic_diseases jsonb,       -- Erbkrankheiten-Tabelle
  colors jsonb,                 -- Farbgenetik-Tabelle
  exterior_genetics jsonb,      -- Exterieur Genotyp-Tabelle + Gesamtwert
  exterior_descriptive jsonb,   -- Körperbau (Beschreibung je Körperteil)
  temperament jsonb,            -- Interieur / Mentalität
  disciplines jsonb,            -- Disziplin-Werte, gruppiert (Western, Englisch, ...)
  traits jsonb,                 -- Eigenschaften, gruppiert (Grundlagen, Gangarten)
  tournament_potential jsonb,   -- Begabung, Gesamtpotenzial, Erfahrung, ...
  pedigree jsonb,               -- Stammbaum, unsortierte Liste (siehe README)

  -- Sonstiges
  raw_text text,                -- Original eingefügter Text (Fallback / Re-Parsing)
  notes text,
  image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verhindert doppelte Pferdenamen auf DB-Ebene (zusaetzlich zur Pruefung
-- im Formular, damit es auch bei gleichzeitigen Speicherversuchen keine
-- Dopplung gibt - das Formular aktualisiert bei einem bereits
-- vorhandenen Namen stattdessen den bestehenden Datensatz). Groß-/
-- Kleinschreibung wird dabei ignoriert (lower(name)).
create unique index if not exists horses_name_unique_idx on public.horses (lower(name));

create index if not exists horses_user_id_idx on public.horses (user_id);
create index if not exists horses_breed_idx on public.horses (breed);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists horses_set_updated_at on public.horses;
create trigger horses_set_updated_at
before update on public.horses
for each row execute function public.set_updated_at();

-- Row Level Security: alle eingeloggten Nutzer*innen (Admin- wie
-- Benutzername-Konten) duerfen alle Pferde sehen und bearbeiten - geteilte
-- Datenbank statt privater Bestaende pro Konto. "user_id" wird beim
-- Anlegen weiterhin gesetzt (haelt fest, wer das Pferd angelegt hat),
-- ist aber keine Zugriffsschranke mehr. Wer neue Konten anlegen darf,
-- wird nicht hierueber geregelt, sondern bleibt exklusiv im
-- Supabase-Dashboard (siehe verwaltung.html).
alter table public.horses enable row level security;

drop policy if exists "horses_select_own" on public.horses;
drop policy if exists "horses_insert_own" on public.horses;
drop policy if exists "horses_update_own" on public.horses;
drop policy if exists "horses_delete_own" on public.horses;

drop policy if exists "horses_select_authenticated" on public.horses;
create policy "horses_select_authenticated" on public.horses
  for select to authenticated using (true);

drop policy if exists "horses_insert_authenticated" on public.horses;
create policy "horses_insert_authenticated" on public.horses
  for insert to authenticated with check (true);

drop policy if exists "horses_update_authenticated" on public.horses;
create policy "horses_update_authenticated" on public.horses
  for update to authenticated using (true);

drop policy if exists "horses_delete_authenticated" on public.horses;
create policy "horses_delete_authenticated" on public.horses
  for delete to authenticated using (true);

-- Oeffentlicher Lesezugriff (ohne Login) fuer Zuchtplaner und
-- Turnierplaner (siehe migration_005_public_read_access.sql). Der
-- "anon"-Key steht ohnehin oeffentlich im Frontend-Code - diese Policy
-- macht die Pferdedaten damit lesend fuer jede*n mit diesem Key abrufbar.
-- Schreiben (insert/update/delete) bleibt ausschliesslich authenticated
-- vorbehalten (siehe oben).
grant select on public.horses to anon;

drop policy if exists "horses_select_public" on public.horses;
create policy "horses_select_public" on public.horses
  for select to anon using (true);
