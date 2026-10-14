-- Migration: Pferdebilder im eigenen Speicher ablegen und mitloeschen.
--
-- Bisher zeigte image_url bei den meisten Pferden direkt auf eine Bilddatei des
-- Spiels. Wird die dort geloescht/ersetzt (ca. 13 % sind schon tot), ist das Bild
-- weg - im Bot und in der Datenbank. Die Edge Function store-horse-image holt das
-- Bild jetzt beim Speichern einmalig ab, verkleinert es und legt es im Bucket
-- "horse-images" unter <pferde-id>/<zeitstempel>.(png|jpg) ab (plus eine kleine
-- Vorschau <zeitstempel>_t.(png|jpg) fuer die Uebersichtstabelle). image_url zeigt
-- danach auf diese Datei, die urspruengliche Spiel-Adresse steht in
-- image_source_url. Nur wenn sich die Spiel-Adresse aendert, wird neu geholt.
--
-- 1. Spalte image_source_url (Spiel-Adresse, von der das gespeicherte Bild stammt).
-- 2. Loeschrecht fuer eingeloggte Konten im Bucket (Bilder werden beim Loeschen eines
--    Pferds und beim Ersetzen des Bilds entfernt). Die Dateien selbst muessen ueber
--    die Storage-Schnittstelle geloescht werden (macht die App) - ein DELETE per SQL
--    auf storage.objects wuerde die Datei im Hintergrundspeicher liegen lassen.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren. Zusaetzlich
-- einmalig die Edge Function bereitstellen (siehe CLAUDE.md):
--   supabase functions deploy store-horse-image

alter table public.horses add column if not exists image_source_url text;

drop policy if exists "horse_images_delete_authenticated" on storage.objects;
create policy "horse_images_delete_authenticated" on storage.objects
  for delete to authenticated
  using (bucket_id = 'horse-images');

-- image_source_url ist nur eine Hilfsangabe fuer die Bildspeicherung und soll in
-- der Referenzkopie (foal_reference_data) nicht auftauchen: dort gibt es die Spalte
-- nicht, und die Kopier-Funktion uebernimmt nur ihre feste Spaltenliste. Der
-- Trigger "BEFORE UPDATE OF <Spalten>" aus Migration 048 kennt die neue Spalte
-- nicht - ein UPDATE, das NUR image_source_url setzt, aendert deshalb weder
-- updated_at noch die Referenzkopie (gewollt: das passiert immer zusammen mit
-- einer image_url-Aenderung).
