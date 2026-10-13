-- Migration: Hintergrund-Updates ueber alle Pferde guenstig halten
-- (behebt "canceling statement due to statement timeout" beim Speichern).
--
-- Problem: Wird beim Speichern eines Pferds Name/Stammbaum geaendert (oder ein
-- Pferd angelegt/geloescht), markiert mark_relatedness_stale() (migration_039/047)
-- in DERSELBEN Anweisung alle ~1250 Pferde als "veraltet" (UPDATE ... SET
-- relatedness_stale = true). Dieser interne UPDATE loeste je Zeile aus:
--   1. horses_set_updated_at (migration_046): to_jsonb() der GANZEN Zeile (inkl. ca.
--      40 KB Verwandten-Cache) fuer NEW und OLD und Vergleich - 2x je Zeile,
--   2. horses_copy_to_reference_data (migration_011): ein Upsert in
--      foal_reference_data je Zeile (dort wieder der 046-Trigger je Zeile).
-- Zusammen kostet das mehrere Sekunden und kann das Statement-Timeout (authenticated:
-- 8 s) ueberschreiten - dann scheitert das Speichern des Pferds komplett.
--
-- Loesung: beide Trigger feuern nur noch, wenn im UPDATE eine INHALTLICHE Spalte
-- gesetzt wird ("BEFORE/AFTER UPDATE OF <Spalten>"). Die Hintergrund-Updates
-- (relatedness_stale markieren, Verwandten-/Turnierwerte-Cache schreiben) setzen
-- nur Cache-Spalten und loesen deshalb weder den to_jsonb-Vergleich noch den
-- Upsert in die Referenztabelle aus. Verhalten fuer normale Speichervorgaenge
-- (Formular, Sammelzuweisung, Bot) bleibt unveraendert.
--
-- Hinweis: Die Spaltenliste fuer horses_set_updated_at wird beim Ausfuehren aus
-- dem aktuellen Tabellenschema gebildet. Kommt spaeter eine neue Spalte zu horses
-- hinzu, diese Migration (den DO-Block) erneut ausfuehren, sonst bumpt ein UPDATE,
-- das NUR diese neue Spalte setzt, updated_at nicht.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (setzt 039,
-- 046 und 047 voraus).

do $$
declare
  spalten text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into spalten
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'horses'
    and column_name not in (
      'updated_at', 'relatedness_cache', 'relatedness_stale', 'relatedness_updated_at',
      'computed_tournament_values', 'computed_lp_result'
    );

  execute 'drop trigger if exists horses_set_updated_at on public.horses';
  execute format(
    'create trigger horses_set_updated_at
       before update of %s on public.horses
       for each row execute function public.set_updated_at_nur_bei_aenderung(
         %L, %L, %L, %L, %L)',
    spalten,
    'relatedness_cache', 'relatedness_stale', 'relatedness_updated_at',
    'computed_tournament_values', 'computed_lp_result'
  );
end;
$$;

-- Genau die Spalten, die copy_horse_to_reference_data() in foal_reference_data
-- uebernimmt (siehe schema.sql): nur wenn eine davon gesetzt wird, ist ein
-- Upsert in die Referenztabelle noetig.
drop trigger if exists horses_copy_to_reference_data on public.horses;
create trigger horses_copy_to_reference_data
after insert or update of
  user_id, name, external_id, gender, breed, purebred_pct, breed_composition, coat_color,
  disease_free, owner, breeding_allowed, hlp_slp, ico, genetic_diseases, disease_gene_overrides,
  colors, color_gene_overrides, exterior_genetics, exterior_descriptive, temperament,
  disciplines, traits, tournament_potential, pedigree, raw_text, notes, image_url
on public.horses
for each row execute function public.copy_horse_to_reference_data();
