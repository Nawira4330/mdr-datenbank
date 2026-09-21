-- Migration: Basar-Verkaufsliste (siehe basar.html/js/basar.js).
--
-- Fotos handschriftlicher/gedruckter Verkaufslisten werden per
-- Texterkennung (Tesseract.js, im Browser) ausgelesen und als Artikel
-- angelegt - jeder Artikel bekommt hier eine eigene Zeile samt
-- Verlaufs-Historie (wer hat wann was gemacht), analog zum bestehenden
-- Zugriffsmodell von "horses" (geteilte Datenbank für alle eingeloggten
-- Konten, siehe schema.sql).
--
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.

create table if not exists public.basar_artikel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,

  verkaeufer_nr text not null,
  artikel_nr text not null,
  name text not null,
  beschreibung text,
  art text,
  preis numeric,
  -- Bei Status "preissenkung" der neue, gesenkte Preis - der ursprüngliche
  -- Preis bleibt zum Vergleich in "preis" erhalten (siehe Anzeige in
  -- basar.js: durchgestrichener alter Preis -> neuer Preis).
  reduzierter_preis numeric,
  status text not null default 'bestand'
    check (status in ('bestand', 'verkauft', 'preissenkung', 'verloren')),

  -- Rohtext der erkannten/eingefügten Zeile (Fallback, falls die
  -- Texterkennung mal daneben lag) sowie optional die fotografierte Liste
  -- selbst (siehe Storage-Bucket "basar-fotos" weiter unten).
  raw_text text,
  foto_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verhindert doppelte Artikelnummern innerhalb derselben Verkäufernummer
-- (unterschiedliche Verkäufer dürfen dieselbe Artikelnummer verwenden).
create unique index if not exists basar_artikel_verkaeufer_artikel_idx
  on public.basar_artikel (verkaeufer_nr, artikel_nr);

create index if not exists basar_artikel_status_idx on public.basar_artikel (status);
create index if not exists basar_artikel_verkaeufer_nr_idx on public.basar_artikel (verkaeufer_nr);

drop trigger if exists basar_artikel_set_updated_at on public.basar_artikel;
create trigger basar_artikel_set_updated_at
before update on public.basar_artikel
for each row execute function public.set_updated_at();

alter table public.basar_artikel enable row level security;

drop policy if exists "basar_artikel_select_authenticated" on public.basar_artikel;
create policy "basar_artikel_select_authenticated" on public.basar_artikel
  for select to authenticated using (true);

drop policy if exists "basar_artikel_insert_authenticated" on public.basar_artikel;
create policy "basar_artikel_insert_authenticated" on public.basar_artikel
  for insert to authenticated with check (true);

drop policy if exists "basar_artikel_update_authenticated" on public.basar_artikel;
create policy "basar_artikel_update_authenticated" on public.basar_artikel
  for update to authenticated using (true);

drop policy if exists "basar_artikel_delete_authenticated" on public.basar_artikel;
create policy "basar_artikel_delete_authenticated" on public.basar_artikel
  for delete to authenticated using (true);

-- Verlaufs-Log je Artikel: JEDE Statusänderung/Bearbeitung/Neuanlage
-- landet hier als unveränderlicher Eintrag (kein Update, kein Löschen
-- außer über die Kaskade beim Löschen des Artikels selbst) - Zeitstempel
-- kommt automatisch von "erstellt_at", Nutzername wird beim Insert vom
-- Frontend mitgegeben (aus der eingeloggten Session, siehe js/basar.js).
create table if not exists public.basar_verlauf (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.basar_artikel(id) on delete cascade,
  aktion text not null,
  benutzer text not null,
  erstellt_at timestamptz not null default now()
);

create index if not exists basar_verlauf_artikel_id_idx on public.basar_verlauf (artikel_id);

alter table public.basar_verlauf enable row level security;

drop policy if exists "basar_verlauf_select_authenticated" on public.basar_verlauf;
create policy "basar_verlauf_select_authenticated" on public.basar_verlauf
  for select to authenticated using (true);

drop policy if exists "basar_verlauf_insert_authenticated" on public.basar_verlauf;
create policy "basar_verlauf_insert_authenticated" on public.basar_verlauf
  for insert to authenticated with check (true);

drop policy if exists "basar_verlauf_delete_authenticated" on public.basar_verlauf;
create policy "basar_verlauf_delete_authenticated" on public.basar_verlauf
  for delete to authenticated using (true);

-- Storage-Bucket für die fotografierten Verkaufslisten selbst (Original-
-- Foto als Beleg, damit sich eine unklare Texterkennung später nachträglich
-- am Original prüfen lässt) - analog zu "horse-images"
-- (migration_019_horse_images_storage.sql). Hochladen bleibt eingeloggten
-- Konten vorbehalten, Lesen ist öffentlich (einfache Bild-URL wie bei
-- horse-images).
insert into storage.buckets (id, name, public)
values ('basar-fotos', 'basar-fotos', true)
on conflict (id) do nothing;

drop policy if exists "basar_fotos_insert_authenticated" on storage.objects;
create policy "basar_fotos_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'basar-fotos');

drop policy if exists "basar_fotos_select_public" on storage.objects;
create policy "basar_fotos_select_public" on storage.objects
  for select to public
  using (bucket_id = 'basar-fotos');
