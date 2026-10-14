// Holt das Pferdebild vom Spiel, verkleinert es und legt es im Storage-Bucket
// "horse-images" ab (siehe supabase/migration_049_pferdebilder_speicher.sql).
//
// Aufruf (eingeloggt, per supabaseClient.functions.invoke):
//   { horse_id: "<uuid>" }
// Antwort: { status: "stored" | "already-own" | "no-image" | "fetch-failed" | ... , ... }
//
// Ablauf je Pferd:
//   1. image_url lesen. Zeigt sie schon in den eigenen Bucket -> nichts zu tun.
//   2. Nur Bilder der Spiel-Domain werden geholt (kein beliebiger Abruf).
//   3. Bild dekodieren, auf max. 360 px (lange Kante) verkleinern, Vorschau 96 px.
//      Mit Transparenz -> PNG (Farben leicht gerundet, halbiert die Dateigroesse
//      ohne sichtbaren Unterschied), ohne Transparenz -> JPEG.
//   4. Hochladen nach <pferde-id>/<zeitstempel>.<ext> und <zeitstempel>_t.<ext>
//      (neuer Name je Version, daher darf der Browser 1 Jahr zwischenspeichern).
//   5. image_url auf die neue Datei setzen, image_source_url = Spiel-Adresse,
//      danach alle aelteren Dateien dieses Pferds im Ordner loeschen.
// Schlaegt das Holen fehl (z.B. 404), bleibt image_url unveraendert (Spiel-Link).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const BUCKET = 'horse-images';
const ALLOWED_HOSTS = new Set(['www.morning-dust-ranch.de', 'morning-dust-ranch.de']);
const MAIN_MAX = 360;
const THUMB_MAX = 96;
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const COLOR_STEP = 8; // Rundung der Farbkanaele (siehe Kopfkommentar)
const CACHE_CONTROL = '31536000';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function hasTransparency(img: Image): boolean {
  const b = img.bitmap;
  for (let i = 3; i < b.length; i += 4) if (b[i] < 250) return true;
  return false;
}

function fitted(img: Image, max: number): Image {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  return img.clone().resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
}

function roundColors(img: Image): Image {
  const b = img.bitmap;
  for (let i = 0; i < b.length; i += 4) {
    b[i] = Math.min(255, Math.round(b[i] / COLOR_STEP) * COLOR_STEP);
    b[i + 1] = Math.min(255, Math.round(b[i + 1] / COLOR_STEP) * COLOR_STEP);
    b[i + 2] = Math.min(255, Math.round(b[i + 2] / COLOR_STEP) * COLOR_STEP);
  }
  return img;
}

async function encodeVariant(img: Image, max: number, png: boolean): Promise<Uint8Array> {
  const small = fitted(img, max);
  return png ? await roundColors(small).encode(3) : await small.encodeJPEG(82);
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array } | { error: string }> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { error: 'ungueltige Adresse' }; }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return { error: 'Adresse nicht vom Spiel' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(parsed.href, { signal: ctrl.signal, redirect: 'error' });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES) return { error: 'Bild zu gross' };
    return { bytes: buf };
  } catch (e) {
    return { error: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST erwartet' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Nur eingeloggte Konten (der anon-Schluessel allein genuegt nicht).
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: 'nicht angemeldet' }, 401);

  let horseId: string | undefined;
  try { horseId = (await req.json())?.horse_id; } catch { /* leer */ }
  if (!horseId || typeof horseId !== 'string') return json({ error: 'horse_id fehlt' }, 400);

  const { data: horse, error: horseError } = await supabase
    .from('horses').select('id, image_url, image_source_url').eq('id', horseId).maybeSingle();
  if (horseError) return json({ status: 'error', error: horseError.message }, 500);
  if (!horse) return json({ status: 'no-horse' });
  const sourceUrl: string | null = horse.image_url;
  if (!sourceUrl) return json({ status: 'no-image' });

  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (sourceUrl.startsWith(publicPrefix)) return json({ status: 'already-own' });

  const downloaded = await downloadImage(sourceUrl);
  if ('error' in downloaded) return json({ status: 'fetch-failed', error: downloaded.error });

  let img: Image;
  try {
    const decoded = await Image.decode(downloaded.bytes);
    // Animierte GIFs: nur das erste Bild (Pferdebilder sind statisch).
    img = decoded instanceof Image ? decoded : (decoded as unknown as Image[])[0];
  } catch (e) {
    return json({ status: 'decode-failed', error: String((e as Error)?.message || e) });
  }

  const png = hasTransparency(img);
  const ext = png ? 'png' : 'jpg';
  const contentType = png ? 'image/png' : 'image/jpeg';
  const main = await encodeVariant(img, MAIN_MAX, png);
  const thumb = await encodeVariant(img, THUMB_MAX, png);

  const stamp = Date.now();
  const mainPath = `${horse.id}/${stamp}.${ext}`;
  const thumbPath = `${horse.id}/${stamp}_t.${ext}`;
  const storage = supabase.storage.from(BUCKET);
  const upMain = await storage.upload(mainPath, main, { contentType, cacheControl: CACHE_CONTROL });
  if (upMain.error) return json({ status: 'upload-failed', error: upMain.error.message }, 500);
  const upThumb = await storage.upload(thumbPath, thumb, { contentType, cacheControl: CACHE_CONTROL });
  if (upThumb.error) {
    await storage.remove([mainPath]);
    return json({ status: 'upload-failed', error: upThumb.error.message }, 500);
  }

  // Nur setzen, solange sich image_url zwischenzeitlich nicht geaendert hat
  // (z.B. jemand hat im Formular schon wieder ein anderes Bild eingetragen).
  const { data: updated, error: updError } = await supabase
    .from('horses')
    .update({ image_url: `${publicPrefix}${mainPath}`, image_source_url: sourceUrl })
    .eq('id', horse.id).eq('image_url', sourceUrl)
    .select('id');
  if (updError || !updated?.length) {
    await storage.remove([mainPath, thumbPath]);
    return json({ status: 'changed-meanwhile', error: updError?.message });
  }

  // Aeltere Dateien dieses Pferds entfernen (Bild wurde ersetzt).
  const { data: files } = await storage.list(horse.id);
  const stale = (files || [])
    .map((f) => `${horse.id}/${f.name}`)
    .filter((p) => p !== mainPath && p !== thumbPath);
  if (stale.length) await storage.remove(stale);

  return json({ status: 'stored', bytes: main.length, thumbBytes: thumb.length, format: ext, removedOld: stale.length });
});
