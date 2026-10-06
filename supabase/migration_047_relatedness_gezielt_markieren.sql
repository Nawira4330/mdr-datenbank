-- Migration: Verwandtschafts-Neuberechnung nur noch bei Bedarf und nur fuer
-- betroffene Pferde anstossen.
--
-- Problem (migration_039): Der Trigger horses_mark_relatedness_stale feuert bei
-- JEDEM Update, in dem name oder pedigree in der SET-Liste steht - das Formular
-- schreibt immer alle Spalten, also loest JEDES Speichern eines Pferds aus (auch
-- ohne Aenderung, auch nur fuer Bild/Notizen) die Markierung ALLER ~1200 Pferde
-- als "veraltet" aus. Danach arbeitet die Edge Function recompute-relatedness
-- (alle 5 Minuten, migration_044) den Bestand in 15-30 Laeufen ab, und jeder Lauf
-- laedt den kompletten Pferdebestand (~11 MB, gemessen) - ca. 170-330 MB je
-- Speichervorgang, bei haeufigem Speichern bis zu ~3 GB pro Tag.
--
-- Loesung:
--   1. INSERT/DELETE markieren weiterhin pauschal alle (unveraendert).
--   2. UPDATE: Aendert sich name oder pedigree WIRKLICH, werden weiterhin alle
--      markiert (jede Verwandtschaft kann sich dadurch aendern).
--   3. Aendern sich nur Angaben, die im Cache der VERWANDTEN angezeigt werden
--      (owner, gender, tags sowie die Werte GP/Ext/Ext%/Int, siehe RelatedEntry in
--      supabase/functions/recompute-relatedness), werden nur die Pferde markiert,
--      die das geaenderte Pferd in ihrer Verwandtenliste (relatedness_cache) haben
--      - in EINEM Durchlauf je Speichervorgang, auch bei Sammel-Aenderungen.
--   4. Alles andere (Bild, Notizen, Geburtsdatum, Farben ...) loest keine
--      Neuberechnung mehr aus.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (setzt
-- migration_039 voraus).

drop trigger if exists horses_mark_relatedness_stale on public.horses;
create trigger horses_mark_relatedness_stale
after insert or delete on public.horses
for each statement execute function public.mark_relatedness_stale();

create or replace function public.mark_relatedness_stale_nach_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  geaenderte text[];
begin
  -- Die Markierung unten ist selbst ein Update auf horses und loest diesen
  -- Trigger erneut aus - dort ist nichts mehr zu tun.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- 1) Name oder Stammbaum wirklich geaendert: pauschal alle (wie bisher).
  if exists (
    select 1 from new_rows n join old_rows o on o.id = n.id
    where n.name is distinct from o.name or n.pedigree is distinct from o.pedigree
  ) then
    update public.horses set relatedness_stale = true where relatedness_stale = false;
    return null;
  end if;

  -- 2) Nur im Verwandten-Cache angezeigte Angaben geaendert: gezielt.
  select array_agg(n.id::text) into geaenderte
  from new_rows n join old_rows o on o.id = n.id
  where n.owner is distinct from o.owner
     or n.gender is distinct from o.gender
     or n.tags is distinct from o.tags
     or n.tournament_potential is distinct from o.tournament_potential
     or n.exterior_descriptive is distinct from o.exterior_descriptive
     or n.exterior_genetics is distinct from o.exterior_genetics
     or n.temperament is distinct from o.temperament;

  if geaenderte is null then
    return null;
  end if;

  update public.horses h
  set relatedness_stale = true
  where h.relatedness_stale = false
    and h.relatedness_cache is not null
    and exists (
      select 1 from jsonb_array_elements(h.relatedness_cache) e
      where e ->> 'id' = any (geaenderte)
    );
  return null;
end;
$$;

drop trigger if exists horses_mark_relatedness_stale_update on public.horses;
create trigger horses_mark_relatedness_stale_update
after update on public.horses
referencing old table as old_rows new table as new_rows
for each statement execute function public.mark_relatedness_stale_nach_update();
