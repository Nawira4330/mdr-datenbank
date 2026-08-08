-- Migration: Geburtsdatum je Pferd - fuer die Altersanzeige auf der
-- Ansichtsseite (view.html, siehe formatAge in js/parser.js). Manuell
-- im Formular einzutragen, kein automatisches Auslesen aus dem
-- kopierten Spieltext (Format im Spiel noch nicht bekannt).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  add column if not exists birthdate date;
