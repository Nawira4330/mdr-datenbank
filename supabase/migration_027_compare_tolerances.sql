-- Migration: persoenliche Toleranzwerte fuer den Ø-Vergleich in der
-- Uebersicht (Einstellungen, siehe js/list.js cmpClass) - ergaenzt
-- migration_017_user_settings.sql um eine weitere Spalte in derselben
-- Tabelle. {gp, ext, extPercent, int} als Zahlen, jeweils "wie viel
-- schlechter als der Durchschnitt zaehlt noch als akzeptabel" (0 oder
-- fehlender Wert = wie bisher, keine Toleranz).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists compare_tolerances jsonb not null default '{}'::jsonb;
