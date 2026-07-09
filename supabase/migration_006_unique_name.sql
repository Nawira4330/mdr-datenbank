-- Migration: verhindert doppelte Pferdenamen (zusaetzlich zur Pruefung im
-- Formular). Im Supabase Dashboard unter "SQL Editor" einfügen und
-- ausführen.
--
-- WICHTIG: Falls bereits zwei oder mehr Pferde mit demselben Namen
-- (Groß-/Kleinschreibung egal) gespeichert sind, schlägt dieser Befehl mit
-- einem Fehler fehl. In dem Fall zuerst die doppelten Eintraege im
-- SQL Editor finden:
--
--   select name, count(*) from public.horses group by lower(name) having count(*) > 1;
--
-- und einen der beiden Eintraege umbenennen oder loeschen, bevor die
-- Migration erneut ausgefuehrt wird.

drop index if exists public.horses_name_idx;
create unique index if not exists horses_name_unique_idx on public.horses (lower(name));
