-- Migration: manuelle Gen-Bestaetigung je nicht getestetem Farbgenetik-
-- Locus (Klick-Buttons "1x vorhanden"/"2x vorhanden"/"nicht vorhanden"/
-- "unbekannt" in horse.html/verpaarung.html, siehe js/horseForm.js). Im
-- Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.
--
-- Ergaenzt die Spalte sowohl in horses als auch in foal_reference_data
-- (siehe migration_011) und aktualisiert den dortigen Kopier-Trigger
-- entsprechend, damit "Ja"-Fohlen (kept = true) das Feld ebenfalls
-- mitkopiert bekommen.

alter table public.horses
  add column if not exists color_gene_overrides jsonb;

alter table public.foal_reference_data
  add column if not exists color_gene_overrides jsonb;

create or replace function public.copy_horse_to_reference_data()
returns trigger
language plpgsql
as $$
begin
  insert into public.foal_reference_data (
    horse_id, kept, user_id, name, external_id, gender, breed, purebred_pct, breed_composition, coat_color,
    disease_free, owner, breeding_allowed, hlp_slp, ico, genetic_diseases, colors, color_gene_overrides,
    exterior_genetics, exterior_descriptive, temperament, disciplines, traits,
    tournament_potential, pedigree, raw_text, notes, image_url
  ) values (
    new.id, true, new.user_id, new.name, new.external_id, new.gender, new.breed, new.purebred_pct, new.breed_composition, new.coat_color,
    new.disease_free, new.owner, new.breeding_allowed, new.hlp_slp, new.ico, new.genetic_diseases, new.colors, new.color_gene_overrides,
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
    colors = excluded.colors, color_gene_overrides = excluded.color_gene_overrides, exterior_genetics = excluded.exterior_genetics,
    exterior_descriptive = excluded.exterior_descriptive, temperament = excluded.temperament,
    disciplines = excluded.disciplines, traits = excluded.traits,
    tournament_potential = excluded.tournament_potential, pedigree = excluded.pedigree,
    raw_text = excluded.raw_text, notes = excluded.notes, image_url = excluded.image_url;
  return new;
end;
$$;
