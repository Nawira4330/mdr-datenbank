-- Migration: Eigene, angepinnte Dashboard-Kacheln je Konto (siehe
-- Dashboard-Kacheln-Bereich in einstellungen.html/js/einstellungen.js) -
-- zusaetzlich zu den 11 eingebauten Kacheln (dashboard_tiles, siehe
-- migration_031_favorites_dashboard_tiles.sql) koennen Nutzer eigene
-- Kacheln anlegen, die entweder das Ergebnis einer gespeicherten
-- Filter-Vorlage (filter_presets, migration_022) oder einfacher, direkt
-- gewaehlter Kriterien (Rasse/Geschlecht/ZZL/Alter) anzeigen - als Anzahl
-- passender Pferde oder als Ø-Wert (GP/Ext/Ext%/Int) NUR fuer diese
-- Teilmenge, unabhaengig vom gerade aktiven Tabellenfilter.
--
-- Jeder Eintrag: { id, label, metric: 'count'|'gp'|'ext'|'extpct'|'int',
-- source: 'preset'|'custom', presetId?, filters?: { breed, gender, zzl,
-- ageMin, ageMax } }
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists custom_dashboard_tiles jsonb;
