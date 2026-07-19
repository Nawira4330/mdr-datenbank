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
    .select('preferred_breeds')
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (error || !data?.preferred_breeds?.length) return;
  const selected = new Set(data.preferred_breeds);
  document.querySelectorAll('#breed-checkboxes input[type="checkbox"]').forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });
}

async function onSave() {
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Speichere…';
  const selected = [...document.querySelectorAll('#breed-checkboxes input[type="checkbox"]:checked')].map((cb) => cb.value);
  // Leere Auswahl als NULL statt leerem Array speichern - beides bedeutet
  // "keine Einschränkung", NULL ist aber eindeutiger als Zustand "bewusst
  // nichts ausgewählt" vs. "Feld nie gesetzt".
  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({ user_id: currentUserId, preferred_breeds: selected.length ? selected : null });
  statusEl.textContent = error ? 'Speichern fehlgeschlagen: ' + error.message : 'Gespeichert.';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
