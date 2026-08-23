-- Migration: Standard-Sortierung je Konto (Einstellungen, siehe
-- einstellungen.html/js/list.js) - welche gespeicherte Sortier-Vorlage
-- (migration_029_sort_presets.sql) beim Öffnen der Übersicht automatisch
-- angewendet werden soll, falls KEINE Standard-Filtervorlage
-- (migration_028_default_filter_preset.sql) gesetzt ist - eine gesetzte
-- Standard-Filtervorlage hat Vorrang, da sie ihre eigene Sortierung schon
-- mitbringt. NULL = keine (dann greift höchstens noch die zuletzt manuell
-- gewählte, geräte-lokal gemerkte Sortierung, siehe LAST_SORT_STORAGE_KEY
-- in js/list.js). "on delete set null" statt cascade, analog zu
-- migration_028.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_017_user_settings.sql und migration_029_sort_presets.sql).

alter table public.user_settings
  add column if not exists default_sort_preset_id uuid references public.sort_presets(id) on delete set null;
