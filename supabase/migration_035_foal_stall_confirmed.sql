-- Migration: manuelles "Erledigt" beim Fohlenstall-Hinweis (Uebersicht,
-- siehe js/list.js checkAgeNotices/onConfirmFoalStall) - blendet ein
-- einzelnes Fohlen sofort aus dem Hinweis "X Fohlen ist/sind 6 Monate
-- alt" aus (z.B. weil der Stall schon vergeben ist), ohne auf das
-- natuerliche Verschwinden mit 7 Monaten warten zu muessen. Da das
-- Spieljahr des Fohlens nur steigt, muss das Feld nie wieder auf false
-- zurueckgesetzt werden - der Hinweis kann fuer dasselbe Pferd ohnehin
-- nie wieder erscheinen, sobald es aelter als 6 Monate ist.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  add column if not exists foal_stall_confirmed boolean not null default false;
