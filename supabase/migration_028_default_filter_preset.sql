-- Migration: Standard-Filtervorlage je Konto (Einstellungen, siehe
-- einstellungen.html/js/list.js) - welche gespeicherte Filter-Vorlage
-- (migration_022_filter_presets.sql) beim Öffnen der Übersicht automatisch
-- angewendet werden soll. NULL = keine (Übersicht startet wie bisher ohne
-- Filter). "on delete set null" statt cascade, da das Löschen der
-- referenzierten Vorlage nicht auch noch diese Einstellungszeile mit
-- löschen soll - die Auswahl fällt dann einfach auf "keine" zurück.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_017_user_settings.sql und migration_022_filter_presets.sql).

alter table public.user_settings
  add column if not exists default_filter_preset_id uuid references public.filter_presets(id) on delete set null;
