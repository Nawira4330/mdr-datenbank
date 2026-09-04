-- Migration: "Bestes Kind"-Funktion in der Uebersicht abschaltbar (siehe
-- js/list.js bestChildBadgesEnabled) - blendet Spalte/Filter/Legende aus
-- und ueberspringt die Berechnung komplett, falls gewuenscht (z.B. bei
-- sehr grossem Bestand aus Performance-Gruenden, oder weil die Funktion
-- schlicht nicht gebraucht wird). NOT NULL DEFAULT true, damit sie ohne
-- Migration/fuer alle bisherigen Konten weiterhin wie gewohnt sichtbar
-- bleibt.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists best_child_badges_enabled boolean not null default true;
