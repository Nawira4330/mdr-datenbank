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

-- Verpaarungs-Log: Decksprung-Eintraege (Deckhengst, Stute, Datum,
-- ob das Fohlen behalten werden soll, Notizen). Gleiches Zugriffsmodell
-- wie horses (geteilte Datenbank fuer alle eingeloggten Nutzer*innen) -
-- die Einschraenkung auf "nur eigene Verpaarungen sehen" passiert nicht
-- ueber RLS, sondern nur als Standard-Filter in verpaarung.html (per
-- "owner"-Feld gegen den Benutzernamen), damit man bei Bedarf trotzdem
-- die Verpaarungen anderer einsehen kann (siehe UI).
create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  -- Anders als bei horses bewusst NICHT "not null": ein kuenftiger
  -- "Decksprung"-Button im Zucht-/Turnierplaner (mdr-planer, anderes
  -- Repo) soll Verpaarungen automatisch eintragen koennen, ohne dort in
  -- dieser App eingeloggt zu sein (anonymer Insert, siehe
  -- "pairings_insert_public" weiter unten) - dabei gibt es kein
  -- auth.uid().
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,

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

-- Vorbereitet fuer eine kuenftige Automatik im Zucht-/Turnierplaner
-- (mdr-planer, anderes Repo): ein dortiger "Decksprung"-Button soll
-- Verpaarungen hier automatisch eintragen koennen, ohne dass diese App
-- dort eingeloggt ist - analog zum anonymen Lesezugriff auf horses
-- (migration_005). Nur INSERT, kein SELECT/UPDATE/DELETE fuer anon -
-- Lesen/Aendern/Loeschen bleibt exklusiv eingeloggten Nutzer*innen
-- vorbehalten.
grant insert on public.pairings to anon;

drop policy if exists "pairings_insert_public" on public.pairings;
create policy "pairings_insert_public" on public.pairings
  for insert to anon with check (true);

-- Referenzdaten fuer die Fohlenwert-Schaetzung im Zucht-/Turnierplaner
-- (mdr-Planer): jedes ueber das Verpaarungs-Log-Popup erfasste Fohlen
-- landet hier - sowohl behaltene (kept = true, zusaetzlich als echtes
-- Pferd in "horses") als auch nicht behaltene (kept = false, nur hier).
-- "horse_id" ist absichtlich OHNE Fremdschluessel-Constraint (nur lose
-- referenzierend): wird das zugehoerige Pferd in "horses" spaeter
-- geloescht, bleibt der Referenzdatensatz hier unveraendert erhalten -
-- das ist der ganze Zweck dieser Tabelle.
create table if not exists public.foal_reference_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,

  -- Herkunft (lose, siehe oben - kein on delete cascade)
  pairing_id uuid,
  horse_id uuid,
  kept boolean not null,

  -- gleiche Datenfelder wie horses, fuer die Schaetzung im mdr-Planer
  name text,
  gender text,
  breed text,
  purebred_pct numeric,
  coat_color text,
  disease_free boolean,
  owner text,
  breeding_allowed boolean,
  hlp_slp text,
  ico numeric,
  genetic_diseases jsonb,
  colors jsonb,
  exterior_genetics jsonb,
  exterior_descriptive jsonb,
  temperament jsonb,
  disciplines jsonb,
  traits jsonb,
  tournament_potential jsonb,
  pedigree jsonb,
  raw_text text,
  notes text,
  image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ein Pferd hat hoechstens einen Referenzdatensatz - wird es bearbeitet
-- (z.B. spaeter nachgetestet), aktualisiert der Trigger unten den
-- bestehenden Referenzdatensatz per Upsert statt einen weiteren
-- anzulegen.
create unique index if not exists foal_reference_data_horse_id_idx
  on public.foal_reference_data (horse_id) where horse_id is not null;
create index if not exists foal_reference_data_pairing_id_idx on public.foal_reference_data (pairing_id);

drop trigger if exists foal_reference_data_set_updated_at on public.foal_reference_data;
create trigger foal_reference_data_set_updated_at
before update on public.foal_reference_data
for each row execute function public.set_updated_at();

-- Kopiert JEDES in "horses" gespeicherte Pferd automatisch (kept = true)
-- nach foal_reference_data - unabhaengig davon, ueber welche Seite/welchen
-- Weg es angelegt wurde (horse.html direkt oder das Verpaarungs-Log-
-- Popup), damit wirklich alle Pferde als Referenz zur Verfuegung stehen,
-- auch wenn sie spaeter geloescht werden.
create or replace function public.copy_horse_to_reference_data()
returns trigger
language plpgsql
as $$
begin
  insert into public.foal_reference_data (
    horse_id, kept, user_id, name, gender, breed, purebred_pct, coat_color,
    disease_free, owner, breeding_allowed, hlp_slp, ico, genetic_diseases, colors,
    exterior_genetics, exterior_descriptive, temperament, disciplines, traits,
    tournament_potential, pedigree, raw_text, notes, image_url
  ) values (
    new.id, true, new.user_id, new.name, new.gender, new.breed, new.purebred_pct, new.coat_color,
    new.disease_free, new.owner, new.breeding_allowed, new.hlp_slp, new.ico, new.genetic_diseases, new.colors,
    new.exterior_genetics, new.exterior_descriptive, new.temperament, new.disciplines, new.traits,
    new.tournament_potential, new.pedigree, new.raw_text, new.notes, new.image_url
  )
  on conflict (horse_id) where horse_id is not null
  do update set
    kept = true,
    name = excluded.name, gender = excluded.gender, breed = excluded.breed,
    purebred_pct = excluded.purebred_pct, coat_color = excluded.coat_color,
    disease_free = excluded.disease_free, owner = excluded.owner, breeding_allowed = excluded.breeding_allowed,
    hlp_slp = excluded.hlp_slp, ico = excluded.ico, genetic_diseases = excluded.genetic_diseases,
    colors = excluded.colors, exterior_genetics = excluded.exterior_genetics,
    exterior_descriptive = excluded.exterior_descriptive, temperament = excluded.temperament,
    disciplines = excluded.disciplines, traits = excluded.traits,
    tournament_potential = excluded.tournament_potential, pedigree = excluded.pedigree,
    raw_text = excluded.raw_text, notes = excluded.notes, image_url = excluded.image_url;
  return new;
end;
$$;

drop trigger if exists horses_copy_to_reference_data on public.horses;
create trigger horses_copy_to_reference_data
after insert or update on public.horses
for each row execute function public.copy_horse_to_reference_data();

alter table public.foal_reference_data enable row level security;

drop policy if exists "foal_reference_data_select_authenticated" on public.foal_reference_data;
create policy "foal_reference_data_select_authenticated" on public.foal_reference_data
  for select to authenticated using (true);

drop policy if exists "foal_reference_data_insert_authenticated" on public.foal_reference_data;
create policy "foal_reference_data_insert_authenticated" on public.foal_reference_data
  for insert to authenticated with check (true);

drop policy if exists "foal_reference_data_update_authenticated" on public.foal_reference_data;
create policy "foal_reference_data_update_authenticated" on public.foal_reference_data
  for update to authenticated using (true);

drop policy if exists "foal_reference_data_delete_authenticated" on public.foal_reference_data;
create policy "foal_reference_data_delete_authenticated" on public.foal_reference_data
  for delete to authenticated using (true);

-- Oeffentlicher Lesezugriff fuer den mdr-Planer (Fohlenwert-Schaetzung),
-- analog zu horses/pairings.
grant select on public.foal_reference_data to anon;

drop policy if exists "foal_reference_data_select_public" on public.foal_reference_data;
create policy "foal_reference_data_select_public" on public.foal_reference_data
  for select to anon using (true);
