// Reine Ansichtsseite (view.html) - laedt horseForm.js mit, um dessen
// loadHorse/fillForm/renderDetailTables wiederzuverwenden (dieselben
// Feld-IDs, nur alle readonly/disabled), aber mit eigenem, unabhaengigem
// Wiring statt horseForm.js' eigenem init() (das wegen des page-title-
// Guards dort ohnehin nicht laeuft, siehe view.html).

let viewHorseId = null;

// Sortierkriterium für das <-/->-Blättern (siehe #nav-sort-field) -
// geräte-lokal gemerkt (wie LAST_SORT_STORAGE_KEY in list.js), sofern in
// den Einstellungen kein kontoweiter Standard (user_settings.
// profile_nav_sort) gesetzt ist - dieser hat beim ersten Aufruf Vorrang,
// siehe initNavSortField().
const NAV_SORT_STORAGE_KEY = 'mdr_profile_nav_sort';

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
  await initNavSortField(session);
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
  if (!(await showConfirmModal('Pferd löschen', 'Dieses Pferd wirklich unwiderruflich löschen?', 'Löschen'))) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', viewHorseId);
  if (error) {
    document.getElementById('form-error').textContent = 'Löschen fehlgeschlagen: ' + error.message;
    return;
  }
  window.location.href = 'index.html';
}

// Setzt #nav-sort-field beim Laden: kontoweiter Standard (Einstellungen,
// siehe migration_032_profile_nav_sort.sql) hat Vorrang vor der zuletzt
// auf diesem Gerät gewählten Sortierung (analog zu applyInitialFilterState
// in list.js) - Änderungen am Dropdown selbst werden nur geräte-lokal
// gemerkt, den kontoweiten Standard ändert man bewusst separat in den
// Einstellungen.
async function initNavSortField(session) {
  const select = document.getElementById('nav-sort-field');
  const { data } = await supabaseClient
    .from('user_settings')
    .select('profile_nav_sort')
    .eq('user_id', session.user.id)
    .maybeSingle();
  let field = data?.profile_nav_sort;
  if (!field) {
    try { field = localStorage.getItem(NAV_SORT_STORAGE_KEY); } catch { /* siehe list.js saveLastSort */ }
  }
  if (field && [...select.options].some((o) => o.value === field)) select.value = field;

  select.addEventListener('change', () => {
    try { localStorage.setItem(NAV_SORT_STORAGE_KEY, select.value); } catch { /* siehe list.js saveLastSort */ }
  });
}

// Navigiert per Auswahl in #nav-sort-field (Name/Alter/Zuletzt bearbeitet/
// GP) durch ALLE Pferde - anders als beim Bearbeiten (horseForm.js/
// findAdjacentHorseId, dort immer alphabetisch und auf die eigenen Pferde
// eingeschraenkt), da man beim reinen Ansehen durch die komplette Liste
// blättern koennen soll, nicht nur durch die eigenen.
const NAV_SORT_LABELS = {
  name: 'alphabetischen',
  birthdate: 'nach Alter sortierten',
  updated_at: 'nach Bearbeitungsdatum sortierten',
  gp: 'nach GP sortierten',
  ext: 'nach Ext sortierten',
  extpct: 'nach Ext% sortierten',
  int: 'nach Int sortierten',
};
// Wie SORT_FIELDS_DESC_FIRST in list.js - "zuletzt bearbeitet" beginnt
// sinnvollerweise mit dem neuesten Eintrag zuerst.
const NAV_SORT_DESC_FIRST = new Set(['updated_at']);
// Ext/Ext%/Int sind wie GP berechnete Werte ohne eigene DB-Spalte (siehe
// computeDerived in list.js) - hier eigene, kleine Zuordnung statt list.js
// mitzuladen (dessen DOMContentLoaded-Handler geht von Tabellen-/
// Filterelementen aus, die auf dieser Seite nicht existieren).
const NAV_SORT_COLUMNS = {
  gp: 'tournament_potential',
  ext: 'exterior_descriptive',
  extpct: 'exterior_genetics',
  int: 'temperament',
};

async function onNavigateView(direction) {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const field = document.getElementById('nav-sort-field').value || 'name';
  const columns = NAV_SORT_COLUMNS[field] ? `id, name, ${NAV_SORT_COLUMNS[field]}` : `id, name, ${field}`;
  // fetchAllRows statt einer einzelnen .select() - der Gesamtbestand kann
  // über dem serverseitigen Standardlimit (1000 Zeilen je Anfrage) liegen,
  // sonst fehlten die hintersten Pferde beim Blättern stillschweigend.
  const { data, error } = await fetchAllRows(supabaseClient.from('horses').select(columns));
  if (error || !data) {
    errorEl.textContent = 'Navigation fehlgeschlagen.';
    return;
  }

  const sortValue = (h) => {
    if (field === 'name') return (h.name || '').toLowerCase();
    if (field === 'gp') {
      const raw = h.tournament_potential?.['Gesamtpotenzial'];
      return raw != null && raw !== '' ? Number(raw) : null;
    }
    if (field === 'ext') return averageScore(h.exterior_descriptive, scoreExteriorTerm);
    if (field === 'extpct') return h.exterior_genetics?.overall?.percent ?? null;
    if (field === 'int') return averageScore(h.temperament, scoreTemperamentTerm);
    return h[field] || null;
  };
  // Pferde ohne Wert (z.B. kein Geburtsdatum) ans Ende, unabhängig von der
  // Richtung - sonst würden sie bei absteigender Sortierung fälschlich
  // ganz vorne einsortiert (null/undefined vor jedem echten Wert).
  const desc = NAV_SORT_DESC_FIRST.has(field);
  data.sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (field === 'name') return va.localeCompare(vb, 'de') * (desc ? -1 : 1);
    return (va < vb ? -1 : va > vb ? 1 : 0) * (desc ? -1 : 1);
  });

  const idx = data.findIndex((h) => h.id === viewHorseId);
  if (idx === -1) return;

  const adjacent = data[direction === 'next' ? idx + 1 : idx - 1];
  const listLabel = NAV_SORT_LABELS[field] || 'alphabetischen';
  if (!adjacent) {
    errorEl.textContent = direction === 'next'
      ? `Kein weiteres Pferd (Ende der ${listLabel} Liste).`
      : `Kein vorheriges Pferd (Anfang der ${listLabel} Liste).`;
    return;
  }
  window.location.href = `view.html?id=${adjacent.id}`;
}
