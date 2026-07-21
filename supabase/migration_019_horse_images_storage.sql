-- Migration: Storage-Bucket fuer per Zwischenablage eingefuegte Bilder
-- (Bild-URL-Feld in horse.html/verpaarung.html, siehe js/horseForm.js).
-- Ersetzt die bisherige Speicherung als data:-URL direkt im Feld durch
-- eine echte oeffentliche URL - eine data:-URL kann z.B. der Discord-Bot
-- nicht als Bild-Embed laden (embed.setImage() braucht eine echte
-- http(s)-Adresse), eine Storage-URL schon.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

insert into storage.buckets (id, name, public)
values ('horse-images', 'horse-images', true)
on conflict (id) do nothing;

-- Hochladen bleibt eingeloggten Konten vorbehalten (analog zu
-- horses_insert_authenticated), Lesen ist oeffentlich - genau wie bei
-- horses selbst (migration_005_public_read_access.sql), da die
-- resultierende URL auch z.B. im Discord-Bot ohne Login funktionieren
-- muss.
drop policy if exists "horse_images_insert_authenticated" on storage.objects;
create policy "horse_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'horse-images');

drop policy if exists "horse_images_select_public" on storage.objects;
create policy "horse_images_select_public" on storage.objects
  for select to public
  using (bucket_id = 'horse-images');
