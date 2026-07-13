-- Migration: neue Tabelle foal_reference_data + automatischer Trigger auf
-- horses. Im Supabase Dashboard unter "SQL Editor" einfuegen und
-- ausfuehren.
--
-- Referenzdaten fuer die Fohlenwert-Schaetzung im Zucht-/Turnierplaner
-- (mdr-Planer): jedes ueber das Verpaarungs-Log-Popup erfasste Fohlen
-- landet hier - sowohl behaltene (kept = true, zusaetzlich als echtes
-- Pferd in "horses") als auch nicht behaltene (kept = false, nur hier).
-- "horse_id" ist absichtlich OHNE Fremdschluessel-Constraint (nur lose
-- referenzierend): wird das zugehoerige Pferd in "horses" spaeter
-- geloescht, bleibt der Referenzdatensatz hier unveraendert erhalten.

create table if not exists public.foal_reference_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,

  pairing_id uuid,
  horse_id uuid,
  kept boolean not null,

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

create unique index if not exists foal_reference_data_horse_id_idx
  on public.foal_reference_data (horse_id) where horse_id is not null;
create index if not exists foal_reference_data_pairing_id_idx on public.foal_reference_data (pairing_id);

drop trigger if exists foal_reference_data_set_updated_at on public.foal_reference_data;
create trigger foal_reference_data_set_updated_at
before update on public.foal_reference_data
for each row execute function public.set_updated_at();

-- Kopiert JEDES in "horses" gespeicherte Pferd automatisch (kept = true)
-- nach foal_reference_data - unabhaengig davon, ueber welche Seite/welchen
-- Weg es angelegt wurde, damit wirklich alle Pferde als Referenz zur
-- Verfuegung stehen, auch wenn sie spaeter geloescht werden.
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
