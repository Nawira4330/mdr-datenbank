-- Migration: "updated_at" bei Pferden (und deren Referenzkopie) nur noch bei
-- ECHTEN Aenderungen setzen.
--
-- Problem: Die Trigger setzen updated_at bei JEDEM Update, auch bei rein
-- technischen Hintergrund-Schreibvorgaengen:
--   - mark_relatedness_stale() (migration_039) setzt nach jedem Speichern eines
--     Namens/Stammbaums relatedness_stale = true bei ALLEN Pferden,
--   - apply_relatedness_updates() (Cron alle 5 Minuten, migration_044) schreibt
--     Verwandtschafts-/Turnierwert-Cache wieder bei allen Pferden zurueck,
--   - copy_horse_to_reference_data() (migration_011) ueberschreibt bei JEDEM
--     Pferde-Update die Zeile in foal_reference_data (auch mit identischen
--     Werten) und setzt dort ebenfalls updated_at neu.
-- Dadurch steht updated_at praktisch bei allen ~1200 Pferden auf "gerade eben".
-- Folgen: (1) der Hinweis "Pferd ist 3 Jahre alt geworden" (js/list.js,
-- checkAgeNotices) erscheint nie, weil er nur Pferde zeigt, die seit dem 3.
-- Geburtstag nicht gespeichert wurden; (2) updated_at taugt nicht mehr als
-- Aenderungssignal (der Zwischenspeicher im MDR-Planer, js/horsesCache.js,
-- wuerde bei jedem Hintergrund-Lauf ungueltig und die grossen Datensaetze
-- muessten jedes Mal neu geladen werden).
--
-- Loesung: updated_at bleibt unveraendert, wenn sich nichts geaendert hat
-- oder AUSSCHLIESSLICH Spalten, die als Argument des Triggers angegeben sind
-- (bei horses: die Hintergrund-Cache-Spalten relatedness_cache,
-- relatedness_stale, relatedness_updated_at, computed_tournament_values,
-- computed_lp_result). Wird updated_at ausdruecklich im UPDATE mitgegeben
-- (z.B. fuer die einmalige Korrektur unten), gilt dieser Wert.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create or replace function public.set_updated_at_nur_bei_aenderung()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ignoriert text[] := array['updated_at'] || coalesce(TG_ARGV, array[]::text[]);
begin
  if new.updated_at is distinct from old.updated_at then
    -- ausdruecklich gesetzt (z.B. Korrektur-Skript): respektieren
    return new;
  end if;
  if (to_jsonb(new) - ignoriert) is not distinct from (to_jsonb(old) - ignoriert) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists horses_set_updated_at on public.horses;
create trigger horses_set_updated_at
before update on public.horses
for each row execute function public.set_updated_at_nur_bei_aenderung(
  'relatedness_cache', 'relatedness_stale', 'relatedness_updated_at',
  'computed_tournament_values', 'computed_lp_result'
);

drop trigger if exists foal_reference_data_set_updated_at on public.foal_reference_data;
create trigger foal_reference_data_set_updated_at
before update on public.foal_reference_data
for each row execute function public.set_updated_at_nur_bei_aenderung();

-- ---------------------------------------------------------------------------
-- OPTIONAL, einmalig - nur nach bewusster Entscheidung ausfuehren:
-- Die bisherigen updated_at-Werte sind durch die Hintergrund-Laeufe oben bei
-- fast allen Pferden wertlos ("heute"). Damit der Hinweis "3 Jahre alt
-- geworden" fuer die aktuell dreijaehrigen Pferde wieder erscheint, kann
-- updated_at einmalig auf created_at zurueckgesetzt werden (= "seit dem
-- Anlegen nicht gespeichert"). Der Hinweis zeigt dann alle eigenen Pferde im
-- 4. Spieljahr, die VOR ihrem 3. Geburtstag angelegt wurden. Der Vorgang
-- ueberschreibt updated_at (die alten Werte sind ohnehin nicht mehr
-- aussagekraeftig) - einfach die folgende Zeile ohne "--" ausfuehren:
--
-- update public.horses set updated_at = created_at where updated_at > created_at;
-- ---------------------------------------------------------------------------
