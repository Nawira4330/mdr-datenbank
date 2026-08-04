-- Nutzerwunsch: "Schlagwort vorschlagen" (js/tagSuggest.js im MDR-Planer)
-- soll nur fuer in der Pferdedatenbank eingeloggte Nutzer sichtbar/nutzbar
-- sein, nicht fuer jeden anonymen Besucher - ersetzt den bisherigen
-- anon-Insert aus migration_023 durch einen authenticated-Insert.
--
-- MDR-Planer selbst hat kein eigenes Login, erkennt aber ueber das
-- geteilte localStorage (beide Seiten unter nawira4330.github.io) eine
-- in der Pferdedatenbank bestehende Session automatisch mit (siehe
-- js/authStatus.js dort) und tritt dann als "authenticated" statt "anon"
-- auf.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

revoke insert on public.tag_suggestions from anon;
drop policy if exists "tag_suggestions_insert_public" on public.tag_suggestions;

grant insert on public.tag_suggestions to authenticated;
drop policy if exists "tag_suggestions_insert_authenticated" on public.tag_suggestions;
create policy "tag_suggestions_insert_authenticated" on public.tag_suggestions
  for insert to authenticated with check (true);

-- Der bestehende Decksprung-Button (js/zuchtplaner.js im MDR-Planer,
-- Tabelle "pairings", siehe migration_010) bleibt bewusst weiterhin ohne
-- Login nutzbar - der anon-Insert dort wird NICHT entfernt. Er wird hier
-- nur zusaetzlich auch fuer eingeloggte Nutzer freigeschaltet, falls
-- jemand im selben Browser gleichzeitig in der Pferdedatenbank
-- eingeloggt ist (vorher haette das faelschlich mit einer RLS-Meldung
-- fehlgeschlagen, weil "pairings" bisher nur die anon-Rolle erlaubte).
grant insert on public.pairings to authenticated;
drop policy if exists "pairings_insert_authenticated" on public.pairings;
create policy "pairings_insert_authenticated" on public.pairings
  for insert to authenticated with check (true);
