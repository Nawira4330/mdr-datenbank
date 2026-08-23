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
  await renderSharedNav(session);

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
  document.getElementById('tag-badges').innerHTML = tagsBadgesHtml(extraData.tags);
  document.getElementById('last-edited').textContent = extraData.updated_at
    ? `Zuletzt bearbeitet: ${formatTimestamp(extraData.updated_at)}`
    : '';
  document.getElementById('horse-age').textContent = extraData.birthdate
    ? `Alter: ${formatAge(extraData.birthdate)}`
    : '';

  const name = document.getElementById('name').value;
  document.title = (name || 'Pferd') + ' – MDR Pferdedatenbank';
  renderProfileHeader(name);

  const externalId = document.getElementById('external_id').value;
  if (externalId) {
    const linkBtn = document.getElementById('mdr-link-btn');
    linkBtn.href = `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(externalId)}`;
    linkBtn.hidden = false;
  }

  await wireFavoriteButton(session);
}

// Großer Name + Unterzeile (Geschlecht/Rasse/Farbe/Alter) sowie die
// Kennzahlen-Kacheln (GP/Ext/Ext%/Int/ZZL) oben im Profilbereich - nutzt
// dieselben, bereits von loadHorse() befüllten Feld-Werte, berechnet die
// Turnierwerte aber selbst (computeDerived existiert nur in list.js, das
// hier nicht mitgeladen wird).
function renderProfileHeader(name) {
  document.getElementById('profile-name').textContent = name || '(ohne Name)';

  const gender = document.getElementById('gender').value;
  const breed = normalizeBreed(extraData.breed) || 'Rasselos';
  const color = extraData.coat_color || '';
  let age = '';
  if (extraData.birthdate) {
    const d = new Date(extraData.birthdate);
    const pad = (n) => String(n).padStart(2, '0');
    age = `geboren ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} (${formatAge(extraData.birthdate)})`;
  }
  document.getElementById('profile-sub').textContent = [gender, breed, color, age].filter(Boolean).join(' · ');

  const gpRaw = extraData.tournament_potential?.['Gesamtpotenzial'];
  const stats = [
    { k: 'GP', v: gpRaw != null && gpRaw !== '' ? String(Math.round(Number(gpRaw))) : '–' },
    { k: 'Ext', v: (() => { const v = averageScore(extraData.exterior_descriptive, scoreExteriorTerm); return v != null ? v.toFixed(2) : '–'; })() },
    { k: 'Ext%', v: extraData.exterior_genetics?.overall?.percent != null ? extraData.exterior_genetics.overall.percent + '%' : '–' },
    { k: 'Int', v: (() => { const v = averageScore(extraData.temperament, scoreTemperamentTerm); return v != null ? v.toFixed(2) : '–'; })() },
    { k: 'ZZL', v: extraData.breeding_allowed === true ? 'Ja' : extraData.breeding_allowed === false ? 'Nein' : '-' },
  ];
  document.getElementById('profile-stats').innerHTML = stats
    .map((s) => `<div class="statpill"><div class="v">${escapeHtml(s.v)}</div><div class="k">${escapeHtml(s.k)}</div></div>`)
    .join('');
}

// Favoriten-Herz auf der Ansichtsseite (siehe ♥/♡-Spalte in der
// Übersicht, migration_031_favorites_dashboard_tiles.sql) - eigenständig
// statt list.js' favoriteHorseIds/onToggleFavorite, da view.html list.js
// nicht mitlädt.
async function wireFavoriteButton(session) {
  const btn = document.getElementById('favorite-view-btn');
  const { data } = await supabaseClient
    .from('user_settings')
    .select('favorite_horse_ids')
    .eq('user_id', session.user.id)
    .maybeSingle();
  let favoriteIds = new Set(data?.favorite_horse_ids || []);
  const applyState = () => {
    const isFavorite = favoriteIds.has(viewHorseId);
    btn.classList.toggle('is-favorite', isFavorite);
    btn.textContent = isFavorite ? '♥' : '♡';
    btn.title = isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren';
  };
  applyState();
  btn.addEventListener('click', async () => {
    if (favoriteIds.has(viewHorseId)) favoriteIds.delete(viewHorseId);
    else favoriteIds.add(viewHorseId);
    applyState();
    const { error } = await supabaseClient
      .from('user_settings')
      .upsert({ user_id: session.user.id, favorite_horse_ids: [...favoriteIds] });
    if (error) alert('Favorit konnte nicht gespeichert werden: ' + error.message);
  });
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
