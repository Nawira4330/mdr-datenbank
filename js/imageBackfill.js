// Nachträgliche Komprimierung der Bestandsbilder (Verwaltung, Egress) -
// siehe fieldset "Bestandsbilder komprimieren" in verwaltung.html. Nutzt
// dieselbe compressImageFile()-Funktion wie der normale Bild-Upload beim
// Pferd selbst (siehe js/horseForm.js/js/parser.js), wendet sie aber
// rückwirkend auf bereits gespeicherte Bilder an.
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

  // Nur Bilder im EIGENEN Speicher (nicht extern verlinkte, z.B. direkt
  // vom Spiel) - erkennbar am gemeinsamen Präfix der öffentlichen Bucket-URL.
  const bucketUrlPrefix = supabaseClient.storage.from('horse-images').getPublicUrl('').data.publicUrl;
  const byUrl = new Map();
  for (const h of horses) {
    if (!h.image_url || !h.image_url.startsWith(bucketUrlPrefix)) continue;
    const list = byUrl.get(h.image_url) || [];
    list.push(h.id);
    byUrl.set(h.image_url, list);
  }

  const urls = [...byUrl.keys()];
  const total = urls.length;
  backfillLog(`${total} eigene Bild-URL(s) gefunden (${horses.length} Pferde insgesamt).`);
  progressBar.hidden = false;
  progressBar.max = total;
  progressBar.value = 0;

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
    const horseIds = byUrl.get(url);
    statusEl.textContent = `${i + 1}/${total} …`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Download fehlgeschlagen (HTTP ' + resp.status + ')');
      const blob = await resp.blob();
      if (blob.type === 'image/gif' || blob.size < BACKFILL_SKIP_THRESHOLD_BYTES) {
        skippedCount++;
      } else {
        const file = new File([blob], 'bestand', { type: blob.type });
        const compressed = await compressImageFile(file);
        if (compressed.size < blob.size) {
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
          savedBytes += blob.size - compressed.size;
          compressedCount++;
          backfillLog(`✅ ${formatBytes(blob.size)} → ${formatBytes(compressed.size)} (${horseIds.length} Pferd${horseIds.length === 1 ? '' : 'e'})`);
        } else {
          skippedCount++;
        }
      }
    } catch (e) {
      failedCount++;
      backfillLog(`❌ Fehler bei einem Bild (${horseIds.length} Pferd${horseIds.length === 1 ? '' : 'e'}): ${e.message}`);
    }
    progressBar.value = i + 1;
  }

  statusEl.textContent = `Fertig: ${compressedCount} komprimiert (${formatBytes(savedBytes)} gespart), ${skippedCount} übersprungen (schon klein), ${failedCount} fehlgeschlagen.`;
  backfillLog(`--- Durchlauf beendet: ${compressedCount} komprimiert, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen, ${formatBytes(savedBytes)} gespart. ---`);
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
