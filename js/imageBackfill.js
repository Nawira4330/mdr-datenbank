// Nachträgliche Komprimierung UND Migration der Bestandsbilder (Verwaltung,
// Egress) - siehe fieldset "Bestandsbilder komprimieren & migrieren" in
// verwaltung.html. Nutzt dieselbe compressImageFile()-Funktion wie der
// normale Bild-Upload beim Pferd selbst (siehe js/horseForm.js/
// js/parser.js), wendet sie aber rückwirkend auf bereits gespeicherte
// Bilder an.
//
// Läuft komplett im Browser des Admins (kein eigenes Backend nötig) -
// dieselben Supabase-Berechtigungen wie der normale Bild-Upload reichen
// aus (storage insert + horses/foal_reference_data update, beides für
// "authenticated" bereits vorhanden). Alte, größere Originaldateien werden
// NICHT gelöscht (keine eigene delete-Policy auf storage.objects nötig) -
// sie liegen einfach ungenutzt im Speicher weiter, was nichts kostet
// (Egress zählt nur tatsächliche Abrufe, nicht belegten Speicherplatz).

// Bilder unterhalb dieser Größe gelten als "schon klein genug" und werden
// übersprungen - sowohl für bereits komprimierte Bilder aus einem früheren
// Durchlauf (macht die Funktion beliebig unterbrechbar/fortsetzbar, ohne
// eigene Fortschritts-Tabelle) als auch für ursprünglich schon kleine
// Originalbilder. Deutlich über der typischen Zielgröße nach Kompression
// (siehe compressImageFile, meist 100-300KB), damit nichts fälschlich als
// "schon erledigt" durchrutscht.
const BACKFILL_SKIP_THRESHOLD_BYTES = 400 * 1024;

let backfillRunning = false;
let backfillStopRequested = false;

function backfillLog(message) {
  const list = document.getElementById('backfill-log');
  const li = document.createElement('li');
  li.textContent = message;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function runImageBackfill() {
  const statusEl = document.getElementById('backfill-status');
  const progressBar = document.getElementById('backfill-progress-bar');
  document.getElementById('backfill-log').innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, image_url'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  // Bugreport: der Discord-Bot zeigt manche Bilder gar nicht an, obwohl sie
  // laut Datenbank vorhanden sind. Betroffen sind vermutlich Pferde, deren
  // image_url noch direkt auf die Spiel-Domain zeigt statt auf den eigenen
  // Speicher (siehe embeds.js: embed.setImage(horse.image_url)) - Discords
  // Server laedt das Bild beim Anzeigen selbst nach, und externe Spiel-
  // Bilder lassen sich von dort erfahrungsgemaess nicht immer zuverlaessig
  // laden (Hotlink-Schutz/instabile URLs), waehrend der eigene Supabase-
  // Speicher oeffentlich und stabil erreichbar ist. Diese Funktion migriert
  // deshalb jetzt ZUSAETZLICH zur bisherigen Komprimierung auch extern
  // verlinkte Bilder einmalig in den eigenen Speicher (unabhaengig von der
  // Dateigroesse, da hier die Verlagerung selbst der Zweck ist, nicht die
  // Groessenersparnis). Bereits im eigenen Speicher liegende Bilder werden
  // wie bisher nur bei Bedarf komprimiert.
  const bucketUrlPrefix = supabaseClient.storage.from('horse-images').getPublicUrl('').data.publicUrl;
  const byUrl = new Map();
  for (const h of horses) {
    if (!h.image_url) continue;
    const list = byUrl.get(h.image_url) || [];
    list.push(h.id);
    byUrl.set(h.image_url, list);
  }

  const urls = [...byUrl.keys()];
  const total = urls.length;
  const externalTotal = urls.filter((u) => !u.startsWith(bucketUrlPrefix)).length;
  backfillLog(`${total} Bild-URL(s) gefunden (${horses.length} Pferde insgesamt), davon ${externalTotal} extern verlinkt (z.B. direkt vom Spiel).`);
  progressBar.hidden = false;
  progressBar.max = total;
  progressBar.value = 0;

  let migratedCount = 0;
  let compressedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let savedBytes = 0;

  for (let i = 0; i < urls.length; i++) {
    if (backfillStopRequested) {
      backfillLog(`⏹️ Gestoppt nach ${i}/${total}.`);
      break;
    }
    const url = urls[i];
    const isOwn = url.startsWith(bucketUrlPrefix);
    const horseIds = byUrl.get(url);
    statusEl.textContent = `${i + 1}/${total} …`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Download fehlgeschlagen (HTTP ' + resp.status + ')');
      const blob = await resp.blob();
      const tooSmallToCompress = blob.type === 'image/gif' || blob.size < BACKFILL_SKIP_THRESHOLD_BYTES;

      if (isOwn && tooSmallToCompress) {
        skippedCount++;
      } else {
        const file = new File([blob], 'bestand', { type: blob.type });
        const compressed = tooSmallToCompress ? file : await compressImageFile(file);
        // Eigene Bilder nur ersetzen, wenn die Komprimierung tatsaechlich
        // etwas bringt (bisheriges Verhalten) - externe Bilder werden IMMER
        // migriert, auch ohne Groessengewinn, da hier die Verlagerung in den
        // eigenen, zuverlaessig erreichbaren Speicher selbst der Zweck ist.
        if (isOwn && compressed.size >= blob.size) {
          skippedCount++;
        } else {
          const ext = IMAGE_EXTENSION_BY_MIME_TYPE[compressed.type] || 'jpg';
          const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
          const { error: upErr } = await supabaseClient.storage.from('horse-images').upload(path, compressed, {
            contentType: compressed.type,
            cacheControl: '31536000',
          });
          if (upErr) throw upErr;
          const newUrl = supabaseClient.storage.from('horse-images').getPublicUrl(path).data.publicUrl;
          const { error: updErr } = await supabaseClient.from('horses').update({ image_url: newUrl }).in('id', horseIds);
          if (updErr) throw updErr;
          const horseWord = `${horseIds.length} Pferd${horseIds.length === 1 ? '' : 'e'}`;
          if (isOwn) {
            savedBytes += blob.size - compressed.size;
            compressedCount++;
            backfillLog(`✅ Komprimiert: ${formatBytes(blob.size)} → ${formatBytes(compressed.size)} (${horseWord})`);
          } else {
            migratedCount++;
            backfillLog(`📥 Extern migriert (jetzt im eigenen Speicher, Discord-fähig): ${formatBytes(blob.size)} → ${formatBytes(compressed.size)} (${horseWord})`);
          }
        }
      }
    } catch (e) {
      failedCount++;
      // Bei extern verlinkten Bildern scheitert der Download hier haeufig an
      // CORS (der Spiel-Server erlaubt keine browserseitigen Fremdabrufe) -
      // in dem Fall bleibt nur der manuelle Weg: Bild im Spiel oeffnen,
      // speichern, im Bearbeiten-Formular des Pferds per Zwischenablage neu
      // einfuegen (siehe horseForm.js, laedt automatisch in den eigenen
      // Speicher hoch).
      const hint = isOwn ? '' : ' - bei extern verlinkten Bildern oft ein CORS-Problem, dann hilft nur manuelles Neu-Einfügen im Bearbeiten-Formular des Pferds.';
      backfillLog(`❌ Fehler bei einem${isOwn ? '' : ' extern verlinkten'} Bild (${horseIds.length} Pferd${horseIds.length === 1 ? '' : 'e'}): ${e.message}${hint}`);
    }
    progressBar.value = i + 1;
  }

  statusEl.textContent = `Fertig: ${migratedCount} extern migriert, ${compressedCount} komprimiert (${formatBytes(savedBytes)} gespart), ${skippedCount} übersprungen (schon klein/eigener Speicher), ${failedCount} fehlgeschlagen.`;
  backfillLog(`--- Durchlauf beendet: ${migratedCount} migriert, ${compressedCount} komprimiert, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen, ${formatBytes(savedBytes)} gespart. ---`);
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session || !isAdminSession(session)) return;

  const startBtn = document.getElementById('backfill-start-btn');
  const stopBtn = document.getElementById('backfill-stop-btn');
  startBtn.addEventListener('click', async () => {
    if (backfillRunning) return;
    backfillRunning = true;
    backfillStopRequested = false;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    try {
      await runImageBackfill();
    } finally {
      backfillRunning = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });
  stopBtn.addEventListener('click', () => {
    backfillStopRequested = true;
    document.getElementById('backfill-status').textContent = 'Wird gestoppt…';
  });
});
