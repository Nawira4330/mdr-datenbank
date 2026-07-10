-- Migration: entfernt die Pflicht-Zuchtzulassung fuers Speichern.
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  drop constraint if exists horses_breeding_allowed_required;
