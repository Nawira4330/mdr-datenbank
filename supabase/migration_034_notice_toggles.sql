-- Migration: einzeln abschaltbare Hinweise in der Uebersicht
-- (Einstellungen, siehe js/list.js checkAgeNotices) - ergaenzt
-- migration_017_user_settings.sql um eine weitere Spalte. Enthaelt die
-- Keys der AUSGEBLENDETEN Hinweise ("foalStall"/"age3"/"age25"), leeres
-- Array = alle sichtbar (wie bisher). "Fehlende Daten" und
-- "Vorgeschlagene Schlagwoerter" sind bewusst NICHT abschaltbar (direkt
-- handlungsrelevant) und stehen deshalb nie in dieser Liste. Betrifft
-- nur die ANZEIGE - die automatische GBH-Vergabe bei "Ueber 25 Jahre"
-- laeuft unabhaengig davon weiter.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists hidden_notices jsonb not null default '[]'::jsonb;
