-- Migration: Favoriten-Herz und anpassbare Dashboard-Kacheln in der
-- Uebersicht (siehe js/list.js, einstellungen.html/js/einstellungen.js) -
-- ergaenzt migration_017_user_settings.sql um zwei weitere Spalten in
-- derselben Tabelle, analog zu migration_027_compare_tolerances.sql.
--
-- favorite_horse_ids: Liste von Pferde-IDs, die dieses Konto als Favorit
-- markiert hat (rein persoenlich, nicht kontouebergreifend sichtbar) -
-- leeres Array = keine Favoriten.
--
-- dashboard_tiles: Reihenfolge + Sichtbarkeit der Kennzahlen-Kacheln oben
-- in der Uebersicht, als Array von {id, visible} in der gewuenschten
-- Anzeige-Reihenfolge, z.B. [{"id":"total","visible":true}, ...]. NULL/
-- leeres Array = Standardauswahl (siehe DEFAULT_DASHBOARD_TILES in
-- js/list.js).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists favorite_horse_ids jsonb not null default '[]'::jsonb;

alter table public.user_settings
  add column if not exists dashboard_tiles jsonb not null default '[]'::jsonb;
