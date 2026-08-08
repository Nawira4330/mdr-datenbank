-- Migration: oeffentlicher Lesezugriff (ohne Login) fuer Zuchtplaner und
-- Turnierplaner - diese neuen Seiten fragen die Pferdedaten nur lesend ab
-- (select) und bieten keine Bearbeiten-/Loeschen-Funktion. Schreibzugriff
-- bleibt weiterhin ausschliesslich eingeloggten Konten vorbehalten (siehe
-- migration_003_shared_access.sql, unveraendert).
--
-- Hinweis: Der "anon" Key steht ohnehin oeffentlich im Frontend-Code (GitHub
-- Pages). Mit dieser Migration sind die Pferdedaten damit lesend fuer
-- jede*n mit diesem (bereits oeffentlichen) Key abrufbar, nicht nur ueber
-- die neuen Seiten.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

grant select on public.horses to anon;

drop policy if exists "horses_select_public" on public.horses;
create policy "horses_select_public" on public.horses
  for select to anon using (true);
