-- Migration: Schlagwoerter je Pferd (Verkauf/Reserviert/Bleibt/...,
-- siehe HORSE_TAG_OPTIONS in js/parser.js) - Array aus
-- {label, note} Objekten, "note" optional (z.B. "Reserviert" + "fuer
-- Lisa"). Feste, vordefinierte Label-Liste im Code, nicht frei
-- eintippbar, damit Filter/Farben eindeutig bleiben.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  add column if not exists tags jsonb not null default '[]'::jsonb;
