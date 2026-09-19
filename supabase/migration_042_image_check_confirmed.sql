-- Migration: manuelles "Erledigt" beim "3 Jahre alt geworden"-Hinweis
-- (Uebersicht, siehe js/list.js checkAgeNotices/onConfirmAgeNotice) -
-- ersetzt die bisherige, unzuverlaessige Erkennung ueber "updated_at":
-- vorher verschwand der Hinweis schon, wenn das Pferd aus IRGENDEINEM
-- Grund erneut gespeichert wurde (z.B. ein Text-Reimport fuer neue
-- Turnierwerte, oder ein Massen-Besitzerwechsel z.B. im Bestandsabgleich)
-- - unabhaengig davon, ob das Bild dabei tatsaechlich geprueft wurde.
-- Dadurch verschwanden echte, noch offene "Bild pruefen"-Hinweise
-- faelschlich aus der Liste (Nutzerfeedback: Hinweise "nicht aktuell").
--
-- Analog zu foal_stall_confirmed (migration_035): das Spieljahr eines
-- Pferds steigt nur, der Hinweis kann fuer dasselbe Pferd nie wieder
-- erscheinen, sobald es aelter als 3 Jahre ist - das Feld muss also nie
-- wieder auf false zurueckgesetzt werden.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  add column if not exists image_check_confirmed boolean not null default false;
