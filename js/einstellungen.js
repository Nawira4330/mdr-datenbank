document.addEventListener('DOMContentLoaded', init);

let currentUserId = null;

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  currentUserId = session.user.id;

  await populateBreedCheckboxes();
  await loadCurrentSettings();

  document.getElementById('save-settings-btn').addEventListener('click', onSave);
}

// Rassen-Liste aus den tatsächlich vorkommenden Werten ableiten (wie
// list.js/populateFilterOptions), damit hier keine Rasse fehlt oder eine
// längst nicht mehr vorkommende angeboten wird.
async function populateBreedCheckboxes() {
  const container = document.getElementById('breed-checkboxes');
  const { data, error } = await supabaseClient.from('horses').select('breed');
  if (error || !data) {
    container.innerHTML = '<p class="error">Rassen konnten nicht geladen werden.</p>';
    return;
  }
  const breeds = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
  breeds.add('Rasselos');
  container.innerHTML = [...breeds].sort().map((b) =>
    `<label><input type="checkbox" value="${escapeHtml(b)}" /> ${escapeHtml(b)}</label>`
  ).join('');
}

async function loadCurrentSettings() {
  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('preferred_breeds, verpaarung_enabled, page_zoom')
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (error || !data) return;
  if (data.preferred_breeds?.length) {
    const selected = new Set(data.preferred_breeds);
    document.querySelectorAll('#breed-checkboxes input[type="checkbox"]').forEach((cb) => {
      cb.checked = selected.has(cb.value);
    });
  }
  // "verpaarung_enabled" fehlt in der Zeile nur, wenn noch nie gespeichert
  // wurde (Spalte ist NOT NULL DEFAULT true) - dann bleibt die Checkbox
  // bei ihrem HTML-Standard (checked).
  if (data.verpaarung_enabled !== undefined && data.verpaarung_enabled !== null) {
    document.getElementById('verpaarung-enabled-checkbox').checked = data.verpaarung_enabled;
  }
  // "page_zoom" ist NULL, solange nie gespeichert wurde - dann bleibt die
  // Auswahl beim App-Standard (80%, siehe --zoom in style.css).
  document.getElementById('page-zoom-select').value = data.page_zoom || 80;
}

async function onSave() {
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Speichere…';
  const selected = [...document.querySelectorAll('#breed-checkboxes input[type="checkbox"]:checked')].map((cb) => cb.value);
  const verpaarungEnabled = document.getElementById('verpaarung-enabled-checkbox').checked;
  const pageZoom = Number(document.getElementById('page-zoom-select').value);
  // Leere Rassen-Auswahl als NULL statt leerem Array speichern - beides
  // bedeutet "keine Einschränkung", NULL ist aber eindeutiger als Zustand
  // "bewusst nichts ausgewählt" vs. "Feld nie gesetzt".
  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({ user_id: currentUserId, preferred_breeds: selected.length ? selected : null, verpaarung_enabled: verpaarungEnabled, page_zoom: pageZoom });
  statusEl.textContent = error ? 'Speichern fehlgeschlagen: ' + error.message : 'Gespeichert.';
  // Sofort anwenden, ohne dass die Seite neu geladen werden muss (siehe
  // applyPageZoom in auth.js - dieselbe Logik, die jede geschützte Seite
  // nach requireSession() ausführt).
  if (!error) document.documentElement.style.setProperty('--zoom', pageZoom / 100);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
