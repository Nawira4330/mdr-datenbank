-- Morning Dust Ranch Datenbank - Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" komplett einfügen und ausführen.

create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- Stammdaten
  name text not null,
  external_id text,             -- freie ID (z.B. eine laengere Nummer), rein zur eigenen Zuordnung
  gender text,
  breed text,
  purebred_pct numeric,
  breed_composition text,       -- Rasseanteile (Zusammensetzung), falls rasselos und nicht 100% reinrassig
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
  disease_gene_overrides jsonb, -- manuelle Traeger/Betroffen-Bestaetigung je nicht getesteter Erbkrankheit (siehe js/horseForm.js)
  colors jsonb,                 -- Farbgenetik-Tabelle
  color_gene_overrides jsonb,   -- manuelle Gen-Bestaetigung je nicht getestetem Locus (siehe js/horseForm.js)
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
  external_id text,
  gender text,
  breed text,
  purebred_pct numeric,
  breed_composition text,
  coat_color text,
  disease_free boolean,
  owner text,
  breeding_allowed boolean,
  hlp_slp text,
  ico numeric,
  genetic_diseases jsonb,
  disease_gene_overrides jsonb,
  colors jsonb,
  color_gene_overrides jsonb,
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
    horse_id, kept, user_id, name, external_id, gender, breed, purebred_pct, breed_composition, coat_color,
    disease_free, owner, breeding_allowed, hlp_slp, ico, genetic_diseases, disease_gene_overrides, colors, color_gene_overrides,
    exterior_genetics, exterior_descriptive, temperament, disciplines, traits,
    tournament_potential, pedigree, raw_text, notes, image_url
  ) values (
    new.id, true, new.user_id, new.name, new.external_id, new.gender, new.breed, new.purebred_pct, new.breed_composition, new.coat_color,
    new.disease_free, new.owner, new.breeding_allowed, new.hlp_slp, new.ico, new.genetic_diseases, new.disease_gene_overrides, new.colors, new.color_gene_overrides,
    new.exterior_genetics, new.exterior_descriptive, new.temperament, new.disciplines, new.traits,
    new.tournament_potential, new.pedigree, new.raw_text, new.notes, new.image_url
  )
  on conflict (horse_id) where horse_id is not null
  do update set
    kept = true,
    name = excluded.name, external_id = excluded.external_id, gender = excluded.gender, breed = excluded.breed,
    purebred_pct = excluded.purebred_pct, breed_composition = excluded.breed_composition, coat_color = excluded.coat_color,
    disease_free = excluded.disease_free, owner = excluded.owner, breeding_allowed = excluded.breeding_allowed,
    hlp_slp = excluded.hlp_slp, ico = excluded.ico, genetic_diseases = excluded.genetic_diseases,
    disease_gene_overrides = excluded.disease_gene_overrides,
    colors = excluded.colors, color_gene_overrides = excluded.color_gene_overrides, exterior_genetics = excluded.exterior_genetics,
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

-- Persoenliche Einstellungen je Konto (aktuell: bevorzugte Rassen fuer
-- die Uebersicht, siehe einstellungen.html/js/list.js) - siehe
-- migration_017_user_settings.sql. Anders als horses/pairings NICHT
-- geteilt: jedes Konto sieht/aendert nur seine eigene Zeile.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- NULL oder leeres Array = keine Einschraenkung (alle Rassen sichtbar).
  preferred_breeds text[],
  -- Blendet den "Verpaarungs-Log"-Menuepunkt fuer dieses Konto aus, wenn
  -- false (siehe migration_018_verpaarung_enabled.sql).
  verpaarung_enabled boolean not null default true,
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

-- Storage-Bucket fuer per Zwischenablage eingefuegte Bilder (Bild-URL-Feld
-- in horse.html/verpaarung.html, siehe js/horseForm.js) - siehe
-- migration_019_horse_images_storage.sql. Hochladen bleibt eingeloggten
-- Konten vorbehalten, Lesen ist oeffentlich (die resultierende URL muss
-- z.B. im Discord-Bot ohne Login funktionieren, analog zu horses selbst).
insert into storage.buckets (id, name, public)
values ('horse-images', 'horse-images', true)
on conflict (id) do nothing;

drop policy if exists "horse_images_insert_authenticated" on storage.objects;
create policy "horse_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'horse-images');

drop policy if exists "horse_images_select_public" on storage.objects;
create policy "horse_images_select_public" on storage.objects
  for select to public
  using (bucket_id = 'horse-images');
