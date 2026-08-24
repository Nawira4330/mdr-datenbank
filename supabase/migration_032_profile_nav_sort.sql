-- Migration: Standard-Sortierung fuer die Pferd-Blaettern-Navigation
-- (<-/-> auf der Ansichtsseite, siehe view.html/js/horseView.js) je Konto -
-- nach welchem Kriterium (Name/Alter/Zuletzt bearbeitet/GP) durch ALLE
-- Pferde geblaettert wird. NULL/leer = Standard (Name, alphabetisch).
-- Geraete-lokal (localStorage) bleibt weiterhin die sofortige Umschaltung
-- ohne Speichern; dieses Feld ist nur der optionale, kontoweite Standard
-- beim ersten Aufruf einer Profil-Seite.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_017_user_settings.sql).

alter table public.user_settings
  add column if not exists profile_nav_sort text;
