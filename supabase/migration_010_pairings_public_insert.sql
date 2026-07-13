-- Migration: erlaubt anonymes Einfuegen in "pairings" - vorbereitet fuer
-- eine kuenftige Automatik im Zucht-/Turnierplaner (mdr-planer, anderes
-- Repo), dessen "Decksprung"-Button Verpaarungen hier automatisch
-- eintragen koennen soll, ohne dort in dieser App eingeloggt zu sein.
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.
--
-- Nur INSERT fuer anon - Lesen/Aendern/Loeschen bleibt exklusiv
-- eingeloggten Nutzer*innen vorbehalten.

alter table public.pairings alter column user_id drop not null;

grant insert on public.pairings to anon;

drop policy if exists "pairings_insert_public" on public.pairings;
create policy "pairings_insert_public" on public.pairings
  for insert to anon with check (true);
