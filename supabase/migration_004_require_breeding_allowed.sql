-- Migration: nur Pferde mit Zuchtzulassung duerfen gespeichert werden.
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.
--
-- NOT VALID: bereits gespeicherte Pferde ohne Zuchtzulassung bleiben
-- erhalten und loesen keinen Fehler aus. Die Regel greift ab sofort nur
-- fuer neue Eintraege sowie beim naechsten Speichern eines bestehenden
-- Pferdes (dann muss auch dort "Zuchtzulassung: Ja" gesetzt werden).

alter table public.horses
  drop constraint if exists horses_breeding_allowed_required;
alter table public.horses
  add constraint horses_breeding_allowed_required check (breeding_allowed = true) not valid;
