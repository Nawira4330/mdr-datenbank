-- Migration: Sicherheits-Haertung (Supabase Security Advisor)
--
-- Das Zugriffsmodell selbst bleibt bewusst wie in schema.sql dokumentiert:
-- eine geteilte Datenbank fuer alle eingeloggten (manuell im Dashboard
-- angelegten, vertrauenswuerdigen) Zuchtclub-Mitglieder - "authenticated
-- using (true)" auf horses/pairings/tag_suggestions/foal_reference_data
-- ist damit kein Versehen, sondern Absicht (siehe schema.sql-Kommentare),
-- und wird hier NICHT auf ein user_id-Owner-Modell umgestellt, da das die
-- Kernfunktion der App braeche (Mitglieder pflegen auch fremde Pferde).
--
-- Diese Migration haertet stattdessen die tatsaechlichen Randrisiken:
-- 1. Mutable search_path in SECURITY-relevanten Funktionen
-- 2. Anonyme (nicht eingeloggte) Insert-Endpunkte ohne jede Validierung
--    (fuer die MDR-Planer-Integration weiterhin offen, aber nicht mehr
--    komplett leer einfuegbar)
-- 3. Storage-Listing ueber die "horse_images_select_public"-Policy
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_036_best_child_badges_toggle.sql).

-- 1. Mutable search_path absichern (siehe Supabase Security Advisor
-- "Function Search Path Mutable") - ohne fest gesetzten search_path
-- koennte eine Rolle mit CREATE-Recht auf einem anderen Schema in der
-- eigenen search_path eine gleichnamige Funktion/Tabelle unterschieben,
-- die diese SECURITY DEFINER-artig laufenden Trigger-Funktionen dann
-- unerwartet aufrufen. "SET search_path = public" fixiert das Schema
-- unabhaengig von der Aufrufumgebung.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.copy_horse_to_reference_data()
returns trigger
language plpgsql
set search_path = public
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

-- 2a. Anonymer Insert auf "pairings" (siehe migration_010, fuer einen
-- kuenftigen "Decksprung"-Button im MDR-Planer ohne eigenen Login) -
-- bisher komplett ungeprueft (with check (true)), jetzt mindestens
-- Deckhengst UND Stute als echte, nicht-leere Werte verlangt. Verhindert
-- leere/muell Datensaetze ueber den oeffentlichen anon-Key, aendert aber
-- nichts an eingeloggten Nutzer*innen (eigene Policy, siehe unten
-- unveraendert) oder an legitimen MDR-Planer-Inserts.
drop policy if exists "pairings_insert_public" on public.pairings;
create policy "pairings_insert_public" on public.pairings
  for insert to anon with check (
    stallion is not null and length(trim(stallion)) > 0
    and mare is not null and length(trim(mare)) > 0
  );

-- 2b. Anonymer Insert auf "tag_suggestions" (siehe migration_023, fuer
-- Vorschlaege aus dem MDR-Planer ohne eigenen Login) - horse_id ist zwar
-- bereits per Fremdschluessel-Constraint auf ein existierendes Pferd
-- begrenzt, label war aber bisher ungeprueft leer/NULL einfuegbar.
drop policy if exists "tag_suggestions_insert_public" on public.tag_suggestions;
create policy "tag_suggestions_insert_public" on public.tag_suggestions
  for insert to anon with check (
    label is not null and length(trim(label)) > 0
  );

-- 3. Storage-Listing ueber "horse_images_select_public" einschraenken:
-- der Bucket ist bereits public (siehe migration_019), oeffentliche
-- Bild-URLs (getPublicUrl(), von supabaseClient.storage...upload()
-- zurueckgegeben) werden ueber den /storage/v1/object/public/-Endpunkt
-- ausgeliefert, der OHNE SELECT-Policy auf storage.objects auskommt (RLS
-- greift dort nicht, das ist der Zweck eines public Buckets). Die
-- SELECT-Policy wird ausschliesslich fuer listing/Abfragen auf
-- storage.objects gebraucht (z.B. supabase.storage.from(...).list()) -
-- im Code (js/*.js, discord-bot/) wird das nirgends verwendet, deshalb
-- kann die Policy ersatzlos entfernt werden, ohne dass Bilder in der App
-- oder im Discord-Bot aufhoeren zu laden.
drop policy if exists "horse_images_select_public" on storage.objects;
