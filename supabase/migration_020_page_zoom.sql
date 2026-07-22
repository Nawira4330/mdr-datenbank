-- Migration: persoenliche Seitengroesse (Zoom in %, siehe
-- einstellungen.html/js/auth.js), ergaenzt migration_017_user_settings.sql
-- um eine weitere Spalte in derselben Tabelle. NULL = App-Standard (siehe
-- --zoom in css/style.css).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists page_zoom smallint;
