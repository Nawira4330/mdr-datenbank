-- Migration: Eingeloggte Konten duerfen Dateien im Bucket "horse-images" sehen
-- (noetig zum Loeschen und Auflisten).
--
-- Hintergrund: migration_037_security_hardening.sql hat die oeffentliche
-- SELECT-Policy "horse_images_select_public" auf storage.objects entfernt (damit
-- niemand den Bucket auflisten kann). Bild-URLs funktionieren weiter, denn der
-- Endpunkt /storage/v1/object/public/ braucht keine Policy. Folge: fuer die App
-- liefert supabaseClient.storage.from('horse-images').list(...) immer eine leere
-- Liste, und .remove(...) loescht NICHTS (Postgres braucht fuer DELETE mit WHERE
-- auch eine SELECT-Policy; die Loesch-Policy aus migration_049 allein genuegt nicht).
-- Damit funktionierten das Mitloeschen der Pferdebilder, das Ersetzen von Bildern
-- und das Aufraeumen alter Share-Bilder (js/shareHorses.js) nicht.
--
-- Loesung: SELECT nur fuer "authenticated" (eingeloggte Konten), NICHT fuer
-- anonyme/oeffentliche Zugriffe - die Bild-URLs bleiben fuer alle abrufbar, das
-- Auflisten des Buckets ohne Login bleibt gesperrt.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

drop policy if exists "horse_images_select_authenticated" on storage.objects;
create policy "horse_images_select_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'horse-images');
