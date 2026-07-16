// Reine Ansichtsseite (view.html) - laedt horseForm.js mit, um dessen
// loadHorse/fillForm/renderDetailTables wiederzuverwenden (dieselben
// Feld-IDs, nur alle readonly/disabled), aber mit eigenem, unabhaengigem
// Wiring statt horseForm.js' eigenem init() (das wegen des page-title-
// Guards dort ohnehin nicht laeuft, siehe view.html).

let viewHorseId = null;

document.addEventListener('DOMContentLoaded', initView);

async function initView() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const params = new URLSearchParams(window.location.search);
  viewHorseId = params.get('id');
  if (!viewHorseId) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('edit-link').href = `horse.html?id=${viewHorseId}`;
  document.getElementById('delete-btn').addEventListener('click', onDeleteView);
  document.getElementById('prev-horse-btn').addEventListener('click', () => onNavigateView('prev'));
  document.getElementById('next-horse-btn').addEventListener('click', () => onNavigateView('next'));
  wireTabs();

  await loadHorse(viewHorseId);

  const name = document.getElementById('name').value;
  document.getElementById('page-heading').textContent = '🐴 ' + (name || '(ohne Name)');
  document.title = (name || 'Pferd') + ' – MDR Pferdedatenbank';

  const externalId = document.getElementById('external_id').value;
  if (externalId) {
    const linkBtn = document.getElementById('mdr-link-btn');
    linkBtn.href = `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(externalId)}`;
    linkBtn.hidden = false;
  }
}

async function onDeleteView() {
  if (!confirm('Dieses Pferd wirklich unwiderruflich löschen?')) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', viewHorseId);
  if (error) {
    document.getElementById('form-error').textContent = 'Löschen fehlgeschlagen: ' + error.message;
    return;
  }
  window.location.href = 'index.html';
}

// Navigiert alphabetisch durch ALLE Pferde - anders als beim Bearbeiten
// (horseForm.js/findAdjacentHorseId, dort auf die eigenen Pferde
// eingeschraenkt), da man beim reinen Ansehen durch die komplette Liste
// blättern koennen soll, nicht nur durch die eigenen.
async function onNavigateView(direction) {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const { data, error } = await supabaseClient.from('horses').select('id, name');
  if (error || !data) {
    errorEl.textContent = 'Navigation fehlgeschlagen.';
    return;
  }
  data.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase(), 'de'));
  const idx = data.findIndex((h) => h.id === viewHorseId);
  if (idx === -1) return;

  const adjacent = data[direction === 'next' ? idx + 1 : idx - 1];
  if (!adjacent) {
    errorEl.textContent = direction === 'next'
      ? 'Kein weiteres Pferd (Ende der alphabetischen Liste).'
      : 'Kein vorheriges Pferd (Anfang der alphabetischen Liste).';
    return;
  }
  window.location.href = `view.html?id=${adjacent.id}`;
}
