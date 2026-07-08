-- Migration: alle eingeloggten Nutzer*innen duerfen alle Pferde sehen und
-- bearbeiten (geteilte Datenbank statt privater Bestaende pro Konto). Die
-- Kontenverwaltung selbst bleibt exklusiv im Supabase-Dashboard (nur du
-- hast dort Zugriff) - siehe verwaltung.html in der App.
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.

drop policy if exists "horses_select_own" on public.horses;
drop policy if exists "horses_insert_own" on public.horses;
drop policy if exists "horses_update_own" on public.horses;
drop policy if exists "horses_delete_own" on public.horses;

drop policy if exists "horses_select_authenticated" on public.horses;
create policy "horses_select_authenticated" on public.horses
  for select to authenticated using (true);

drop policy if exists "horses_insert_authenticated" on public.horses;
create policy "horses_insert_authenticated" on public.horses
  for insert to authenticated with check (true);

drop policy if exists "horses_update_authenticated" on public.horses;
create policy "horses_update_authenticated" on public.horses
  for update to authenticated using (true);

drop policy if exists "horses_delete_authenticated" on public.horses;
create policy "horses_delete_authenticated" on public.horses
  for delete to authenticated using (true);
