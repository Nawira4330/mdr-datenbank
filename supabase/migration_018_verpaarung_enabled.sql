-- Migration: persoenlicher Ein/Aus-Schalter fuers Verpaarungs-Log im
-- Menue (Checkbox in einstellungen.html), ergaenzt migration_017_
-- user_settings.sql um eine weitere Spalte in derselben Tabelle.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists verpaarung_enabled boolean not null default true;
