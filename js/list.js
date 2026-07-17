let currentSort = { field: 'name', dir: 'asc' };
let selectedIds = new Set();
let lastRenderedRows = [];
let pendingDeleteIds = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  const admin = isAdminSession(session);
  const displayIdentity = admin ? session.user.email : session.user.email.split('@')[0];
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity}`;
  if (admin) {
    document.querySelector('#verwaltung-link').hidden = false;
  } else {
    // Löschen (einzeln wie mehrfach) bleibt in der Übersicht dem Admin
    // vorbehalten - versteckt per CSS (siehe style.css), damit rowHtml()
    // nicht zwei verschiedene Markup-Varianten pflegen muss.
    document.body.classList.add('hide-delete');
  }
  wireFilterForm();
  wireSortableHeaders();
  wireSelection();
  wireCheckDropdowns();
  wireDeleteModal();
  wireExportCsv();
  showFlashBanner();
  await showMissingDataNotice(session);
  await populateFilterOptions();
  await loadHorses();
}

// Zeigt einen Hinweis über den Filtern, wenn bei den EIGENEN Pferden
// (Besitzer-Feld entspricht dem eingeloggten Benutzernamen) noch Daten
// fehlen (siehe missingDataLabels in parser.js) - z.B. weil beim Kopieren
// aus dem Spiel nicht die ganze Seite markiert wurde. Andere Nutzer*innen
// sehen diesen Hinweis nur für ihre eigenen Pferde, nicht für die anderer.
async function showMissingDataNotice(session) {
  const identity = session.user.email.split('@')[0];
  const { data, error } = await supabaseClient
    .from('horses')
    .select('id, name, exterior_genetics, pedigree, tournament_potential, disciplines, breed, purebred_pct, breed_composition')
    .ilike('owner', identity);
  if (error || !data) return;

  const incomplete = data
    .map((h) => ({ id: h.id, name: h.name, missing: missingDataLabels(h) }))
    .filter((h) => h.missing.length);
  if (!incomplete.length) return;

  // Bearbeiten-Stift vor dem Namen (wie in der Uebersichtstabelle), damit
  // sich das betroffene Pferd direkt aus dem Hinweis heraus oeffnen laesst,
  // ohne erst in der Liste danach suchen zu muessen.
  const list = incomplete
    .map((h) => `<li><a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a> ${escapeHtml(h.name)} - ${escapeHtml(h.missing.join(', '))}</li>`)
    .join('');
  const notice = document.querySelector('#missing-data-notice');
  notice.innerHTML = `<summary><strong>Hinweis:</strong> Es fehlen noch Daten bei ${incomplete.length} Pferd${incomplete.length === 1 ? '' : 'en'}</summary><p>Es fehlen noch folgende Daten:</p><ul>${list}</ul>`;
  notice.hidden = false;
}

// Zeigt nach dem Anlegen/Aktualisieren eines Pferds (siehe horseForm.js)
// einmalig einen Banner mit dessen Namen. "Einmalig" heißt: sofort nach
// dem Anzeigen aus dem sessionStorage entfernt (ein erneutes Laden der
// Seite zeigt ihn also nicht nochmal), und zusätzlich bei der nächsten
// Interaktion (Filtern, Sortieren, Auswählen, Klick irgendwo) sofort
// ausgeblendet.
function showFlashBanner() {
  const raw = sessionStorage.getItem('mdr_flash');
  if (!raw) return;
  sessionStorage.removeItem('mdr_flash');

  let flash;
  try {
    flash = JSON.parse(raw);
  } catch {
    return;
  }
  const banner = document.querySelector('#flash-banner');
  const verb = flash.action === 'updated' ? 'aktualisiert' : 'neu angelegt';
  banner.textContent = `„${flash.name}" wurde ${verb}.`;
  banner.hidden = false;

  const dismiss = () => { banner.hidden = true; };
  document.addEventListener('click', dismiss, { once: true });
  document.addEventListener('change', dismiss, { once: true });
  document.addEventListener('submit', dismiss, { once: true });
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('owner, gender, breed, genetic_diseases, colors');
  if (error || !data) return;

  fillSelect('#f-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());
  fillSelect('#f-gender', [...new Set(data.map((d) => d.gender).filter(Boolean))].sort());
  // "American Paint Horse" und "Rasselos" stehen bereits fest im HTML
  // (Standardauswahl bzw. feste Option) - hier nur um weitere tatsächlich
  // vorkommende Rassen ergänzt. Kürzel wie "APH" werden zusätzlich auf den
  // vollen Namen normalisiert (siehe normalizeBreed), falls noch nicht
  // normalisierte Altdaten vorkommen.
  const breeds = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
  breeds.delete('American Paint Horse');
  breeds.delete('Rasselos');
  fillSelect('#f-breed', [...breeds].sort());

  const diseaseLabels = new Set();
  const locusLabels = new Set();
  for (const row of data) {
    for (const d of row.genetic_diseases || []) diseaseLabels.add(d.label);
    for (const c of row.colors || []) locusLabels.add(c.label);
  }
  populateCheckDropdown('f-ekh-drop', [...diseaseLabels].sort(), { noneOption: 'Keine' });
  // "KIT" selbst wird nicht als Option angeboten, da es ein Sammel-Locus
  // für mehrere unabhängige Merkmale (Tobiano/Sabino/Roan/Dominant White)
  // ist - stattdessen einzeln als Sabino/Roan/Tobiano weiter unten.
  locusLabels.delete('KIT');
  // Pearl und Flaxen sind Sonderfälle: Pearl teilt sich den Cream-Locus
  // (ein "pl" im Rohwert zeigt es auch mischerbig/als Träger an, anders
  // als der scharfe Sichtbarkeits-Check in LOCUS_DOMINANT_CHECK), und
  // Flaxen wird vom Spiel gar nicht als eigener Locus getestet, sondern
  // nur aus Fellfarbe/Notiz/Name abgeleitet (siehe hasPearlGene/
  // hasFlaxenGene) - daher als feste Zusatzoptionen statt aus den
  // vorhandenen "colors"-Labels abgeleitet.
  populateCheckDropdown('f-genetik-drop', [...locusLabels].sort(), {
    extra: [
      { value: '__pearl__', label: 'Pearl (auch Träger)' },
      { value: '__flaxen__', label: 'Flaxen (auch Träger)' },
      { value: '__kit_sb__', label: 'Sabino' },
      { value: '__kit_rn__', label: 'Roan' },
      { value: '__kit_to__', label: 'Tobiano' },
    ],
  });
}

function fillSelect(selector, values) {
  const sel = document.querySelector(selector);
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
}

function buildQuery() {
  let q = supabaseClient.from('horses').select('*');

  const name = document.querySelector('#f-name').value.trim();
  const owner = document.querySelector('#f-owner').value;
  const gender = document.querySelector('#f-gender').value;
  const breed = document.querySelector('#f-breed').value;
  const zzl = document.querySelector('#f-zzl').value;

  if (name) q = q.ilike('name', `%${name}%`);
  if (owner) q = q.eq('owner', owner);
  if (gender) q = q.eq('gender', gender);
  // "Rasselos" deckt zusätzlich Pferde ohne jeglichen Rasse-Eintrag mit ab
  // (null) - beides bedeutet praktisch dasselbe ("keine Rasse bekannt").
  if (breed === 'Rasselos') q = q.or('breed.eq.Rasselos,breed.is.null');
  else if (breed) q = q.eq('breed', breed);
  // "Nein" bedeutet hier "(noch) keine Zuchtzulassung" - das schließt
  // sowohl explizit "Nein" (false) als auch noch nicht gesetzt (null,
  // zeigt sich in der Tabelle als "-") mit ein, da beides in der Praxis
  // "noch keine ZZL" heißt. "Ja" bleibt dagegen strikt auf true begrenzt.
  if (zzl === 'true') q = q.eq('breeding_allowed', true);
  else if (zzl === 'false') q = q.or('breeding_allowed.eq.false,breeding_allowed.is.null');

  // Die eigentliche Sortierung passiert clientseitig in applySort(), da
  // GP/Ext/Ext%/Int/HLP-SLP berechnete Werte ohne eigene DB-Spalte sind
  // (siehe computeDerived) und ".order()" damit nicht arbeiten kann.
  return q.order('name', { ascending: true });
}

function colorCodeOf(row) {
  return (row.colors || []).map((c) => c.value).join(' ');
}

// GP/Ext/Ext%/Int existieren nicht als eigene Spalten in der Datenbank,
// sondern werden aus den bereits geladenen JSON-Feldern berechnet - hier
// zentral, damit Anzeige (rowHtml) und Filterung (applyClientFilters)
// exakt dieselben Werte verwenden.
function computeDerived(h) {
  const gpRaw = h.tournament_potential?.['Gesamtpotenzial'];
  const genes = presentGenesSummary(h.colors, h.coat_color, h.notes, h.name, null, h.color_gene_overrides);
  return {
    colorCode: colorCodeOf(h),
    presentGenes: genes.map((g) => g.alleles).join(' '),
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : null,
    extAvg: averageScore(h.exterior_descriptive, scoreExteriorTerm),
    extPercent: h.exterior_genetics?.overall?.percent ?? null,
    intAvg: averageScore(h.temperament, scoreTemperamentTerm),
  };
}

// Ob ein Locus sein dominantes/sichtbares Allel trägt, nach der vom Nutzer
// bereitgestellten MDR-Farbvererbungs-Dokumentation. KIT gilt als "trägt
// das Merkmal", wenn der Wert nicht ausschließlich aus "0" besteht (laut
// Spiel: getestet, aber kein Tobiano/Sabino/Dominant White/Roan).
const LOCUS_DOMINANT_CHECK = {
  Extension: (v) => v.includes('E'),
  Dun: (v) => v.includes('D'),
  Champagne: (v) => v.includes('Ch'),
  Grey: (v) => v.includes('G'),
  Silver: (v) => v.includes('Z'),
  Overo: (v) => v.includes('O'),
  Splashed: (v) => v.includes('SPL'),
  Appaloosa: (v) => v.includes('Lp'),
  PATN1: (v) => v.includes('P1'),
  Agouti: (v) => /Ap|A1|At/.test(v),
  Cream: (v) => /Cr|pl/.test(v),
  KIT: (v) => !!v && !/^0+$/.test(v),
};

// Pearl liegt auf demselben Locus wie Cream (siehe parser.js) - ein
// getesteter Rohwert wie "Crpl" (Cream+Pearl-Trägerin) oder "plpl"
// (reinerbig Pearl) soll hier also schon bei einem bloßen "pl"-Vorkommen
// zählen, unabhängig von Groß-/Kleinschreibung und auch mischerbig -
// anders als LOCUS_DOMINANT_CHECK.Cream, das nur die sichtbare Ausprägung
// prüft. Ist Cream nicht getestet, zählt zusätzlich eine aus Fellfarbe/
// Notiz/Name abgeleitete Pearl-Vermutung (presentGenesSummary).
function hasPearlGene(row) {
  const entry = (row.colors || []).find((c) => c.label === 'Cream');
  if (entry && !isUntestedLocusValue(entry.value) && /pl/i.test(entry.value)) return true;
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Cream' && /pl/i.test(g.alleles));
}

// Flaxen wird vom Spiel nicht als eigener Locus getestet (siehe
// parser.js) - daher ausschließlich aus Fellfarbe/Notiz/Name ableitbar,
// sowohl als Träger (fl) als auch reinerbig (flfl).
function hasFlaxenGene(row) {
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Flaxen');
}

// KIT ist ein Sammel-Locus für mehrere unabhängige Merkmale (Tobiano/
// Sabino/Roan/Dominant White), die im Rohwert als aneinandergereihte
// Zwei-Buchstaben-Kürzel stehen (z.B. "RnTO" = Roan + Tobiano). Für die
// Filterung wird daher gezielt nach dem jeweiligen Kürzel gesucht statt
// nur (wie LOCUS_DOMINANT_CHECK.KIT) pauschal "irgendetwas vorhanden".
function hasKitTrait(row, code) {
  const entry = (row.colors || []).find((c) => c.label === 'KIT');
  if (!entry || isUntestedLocusValue(entry.value)) return false;
  return new RegExp(code, 'i').test(entry.value);
}

function matchesGenetikLocus(row, locusName) {
  if (locusName === '__pearl__') return hasPearlGene(row);
  if (locusName === '__flaxen__') return hasFlaxenGene(row);
  if (locusName === '__kit_sb__') return hasKitTrait(row, 'sb');
  if (locusName === '__kit_rn__') return hasKitTrait(row, 'rn');
  if (locusName === '__kit_to__') return hasKitTrait(row, 'to');
  const entry = (row.colors || []).find((c) => c.label === locusName);
  if (!entry || isUntestedLocusValue(entry.value)) return false;
  const check = LOCUS_DOMINANT_CHECK[locusName];
  return check ? check(entry.value) : false;
}

// Ein Erbkrankheiten-Locuswert gilt als unauffällig, wenn er (ohne die
// "/"-Trenner) ausschließlich aus großem "N" (normal) besteht - jede
// Abweichung bedeutet Träger/betroffen. Wichtig: das Risikoallel-Kürzel
// ist nicht immer klein geschrieben (z.B. "LF/NN" bei LFS, komplett groß)
// - ein reiner Kleinbuchstaben-Check (wie zuvor) übersieht solche Fälle.
function isDiseaseClear(value) {
  const cleaned = (value || '').replace(/\//g, '');
  return cleaned === '' || /^N+$/.test(cleaned);
}

// Zusätzlich zu tatsächlich getesteten (und auffälligen) Erbkrankheiten
// auch manuell als Träger/betroffen bestätigte, noch nicht getestete
// Krankheiten mit einbeziehen (siehe diseaseOverrideBadge in
// horseForm.js) - "frei"/unbekannt zählt dagegen nicht als betroffen.
function affectedDiseaseLabels(row) {
  // Manche Datensätze enthalten pro Krankheit auch dann eine Zeile, wenn
  // sie gar nicht getestet wurde (Rohwert wörtlich "Nicht getestet" statt
  // fehlender Zeile, siehe diseaseTableHtml in horseForm.js) - die zählen
  // hier weder als getestet noch als betroffen.
  const diseases = (row.genetic_diseases || []).filter((d) => !isUntestedLocusValue(d.value));
  const tested = diseases.filter((d) => !isDiseaseClear(d.value)).map((d) => d.label);
  const testedCodes = new Set(diseases.map((d) => d.label));
  const ov = row.disease_gene_overrides || {};
  const manual = Object.keys(ov).filter((code) => (ov[code] === 'het' || ov[code] === 'hom') && !testedCodes.has(code));
  return [...tested, ...manual];
}

function matchesEkh(row, selectedCodes) {
  return selectedCodes.some((code) => {
    if (code === '__none__') return row.disease_free === true;
    return affectedDiseaseLabels(row).includes(code);
  });
}

function compareValue(value, op, targetStr) {
  if (targetStr === '') return true;
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  const target = Number(targetStr);
  return op === 'lt' ? value < target : value > target;
}

function applyClientFilters(rows) {
  const genetikSelected = getCheckDropdownSelected('f-genetik-drop');
  const ekhSelected = getCheckDropdownSelected('f-ekh-drop');

  const gpOp = document.querySelector('#f-gp-op').value;
  const gpVal = document.querySelector('#f-gp-val').value;
  const extOp = document.querySelector('#f-ext-op').value;
  const extVal = document.querySelector('#f-ext-val').value;
  const extpctOp = document.querySelector('#f-extpct-op').value;
  const extpctVal = document.querySelector('#f-extpct-val').value;
  const intOp = document.querySelector('#f-int-op').value;
  const intVal = document.querySelector('#f-int-val').value;

  return rows.filter((row) => {
    const d = computeDerived(row);

    if (genetikSelected.length && !genetikSelected.every((locus) => matchesGenetikLocus(row, locus))) return false;
    if (ekhSelected.length && !matchesEkh(row, ekhSelected)) return false;
    if (!compareValue(d.gp, gpOp, gpVal)) return false;
    if (!compareValue(d.extAvg, extOp, extVal)) return false;
    if (!compareValue(d.extPercent, extpctOp, extpctVal)) return false;
    if (!compareValue(d.intAvg, intOp, intVal)) return false;

    return true;
  });
}

function sortValue(row, field) {
  switch (field) {
    case 'name': return (row.name || '').toLowerCase();
    case 'gender': return (row.gender || '').toLowerCase();
    case 'breed': return (row.breed || '').toLowerCase();
    case 'coat_color': return (row.coat_color || '').toLowerCase();
    case 'owner': return (row.owner || '').toLowerCase();
    case 'gp': return computeDerived(row).gp;
    case 'ext': return computeDerived(row).extAvg;
    case 'extpct': return computeDerived(row).extPercent;
    case 'int': return computeDerived(row).intAvg;
    case 'hlpslp': {
      const n = Number(hlpSlpDisplay(row.hlp_slp));
      return Number.isNaN(n) ? null : n;
    }
    case 'zzl': return row.breeding_allowed == null ? null : (row.breeding_allowed ? 1 : 0);
    default: return null;
  }
}

// Fehlende Werte (null) landen unabhängig von der Richtung immer am Ende,
// damit A-Z/Z-A bzw. 1-x/x-1 nicht durch Lücken durcheinandergeraten.
function applySort(rows) {
  const { field, dir } = currentSort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, field);
    const vb = sortValue(b, field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb, 'de') * mult;
    return (va - vb) * mult;
  });
}

async function loadHorses() {
  const tbody = document.querySelector('#horse-table tbody');
  const countEl = document.querySelector('#result-count');
  tbody.innerHTML = '<tr><td colspan="16">Lade…</td></tr>';
  selectedIds = new Set();
  updateBulkBar();

  const { data, error } = await buildQuery();

  if (error) {
    tbody.innerHTML = `<tr><td colspan="16" class="error">Fehler beim Laden: ${escapeHtml(error.message)}</td></tr>`;
    countEl.textContent = '';
    return;
  }

  const filtered = applySort(applyClientFilters(data));

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="16">Keine Pferde gefunden.</td></tr>';
    countEl.textContent = '0 Pferde';
    return;
  }

  countEl.textContent = `${filtered.length} Pferd${filtered.length === 1 ? '' : 'e'}`;
  lastRenderedRows = filtered;
  tbody.innerHTML = filtered.map(rowHtml).join('');
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.delete));
  });
  tbody.querySelectorAll('[data-select]').forEach((cb) => {
    cb.addEventListener('change', () => onRowSelect(cb.dataset.select, cb.checked));
  });
  document.querySelectorAll('#select-all, #select-all-mobile').forEach((box) => { box.checked = false; });
}

// "data-label" wird nur für die mobile Kartenansicht gebraucht (siehe
// style.css) - dort ersetzt CSS-generierter Inhalt (attr(data-label)) die
// sonst fehlenden Spaltenüberschriften, da <thead> dort ausgeblendet ist.
function rowHtml(h) {
  const d = computeDerived(h);
  const affected = affectedDiseaseLabels(h);
  const ekhText = affected.length ? affected.join(', ') : '-';

  // Name öffnet die reine Ansichtsseite (view.html) - Bearbeiten passiert
  // über den eigenen Stift-Button in der Aktionen-Spalte, der externe
  // Spiel-Link über den eigenen 🔗-Button (nur falls external_id gesetzt).
  const nameCell = `<a href="view.html?id=${h.id}">${escapeHtml(h.name || '(ohne Name)')}</a>`;
  const linkCell = h.external_id
    ? `<a class="btn secondary icon-btn" href="https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}" target="_blank" rel="noopener" title="Zum Pferd im Spiel">🔗</a>`
    : '';

  return `<tr>
    <td data-label="Auswählen"><input type="checkbox" data-select="${h.id}" /></td>
    <td data-label="Link">${linkCell}</td>
    <td data-label="Name" class="name-cell">${nameCell}</td>
    <td data-label="Geschlecht">${escapeHtml(h.gender || '')}</td>
    <td data-label="Rasse">${escapeHtml(normalizeBreed(h.breed) || 'Rasselos')}</td>
    <td data-label="Farbe">${escapeHtml(h.coat_color || '')}</td>
    <td data-label="Genetik" class="small" style="font-family: ui-monospace, monospace;">${escapeHtml(d.presentGenes)}</td>
    <td data-label="GP">${d.gp != null ? escapeHtml(String(d.gp)) : ''}</td>
    <td data-label="Ext">${d.extAvg != null ? d.extAvg.toFixed(2) : ''}</td>
    <td data-label="Ext%">${d.extPercent != null ? d.extPercent + '%' : ''}</td>
    <td data-label="Int">${d.intAvg != null ? d.intAvg.toFixed(2) : ''}</td>
    <td data-label="HLP/SLP">${escapeHtml(hlpSlpDisplay(h.hlp_slp))}</td>
    <td data-label="ZZL">${zzlDisplay(h.breeding_allowed)}</td>
    <td data-label="EKH">${escapeHtml(ekhText)}</td>
    <td data-label="Besitzer">${escapeHtml(h.owner || '')}</td>
    <td data-label="Aktionen" class="actions-cell">
      <a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a>
      <button class="danger icon-btn" data-delete="${h.id}" title="Löschen">✗</button>
    </td>
  </tr>`;
}

// Zeigt die HLP/SLP-Punktzahl, falls im Text eine Zahl steht (bestandene
// Prüfung), sonst "-" (z.B. bei "nicht bestanden"/"nicht absolviert").
function hlpSlpDisplay(text) {
  if (!text) return '-';
  const m = text.match(/\d+([.,]\d+)?/);
  return m ? m[0] : '-';
}

function zzlDisplay(breedingAllowed) {
  if (breedingAllowed === true) return 'Ja';
  if (breedingAllowed === false) return 'Nein';
  return '-';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function onDelete(id) {
  const row = lastRenderedRows.find((r) => r.id === id);
  openDeleteModal(row ? [row] : [{ id, name: '(unbekannt)', owner: '' }]);
}

// --- Lösch-Bestätigung (Popup statt native confirm()) ---

function wireDeleteModal() {
  document.querySelector('#delete-modal-cancel').addEventListener('click', closeDeleteModal);
  document.querySelector('#delete-modal-confirm').addEventListener('click', confirmDelete);
  document.querySelector('#delete-modal').addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
}

function openDeleteModal(rows) {
  pendingDeleteIds = rows.map((r) => r.id);
  const list = document.querySelector('#delete-modal-list');
  list.innerHTML = rows.map((r) => {
    const owner = r.owner ? ` — Besitzer: ${escapeHtml(r.owner)}` : '';
    return `<li>${escapeHtml(r.name || '(ohne Name)')}${owner}</li>`;
  }).join('');
  document.querySelector('#delete-modal-count').textContent =
    rows.length === 1 ? '1 Pferd wirklich unwiderruflich löschen?' : `${rows.length} Pferde wirklich unwiderruflich löschen?`;
  document.querySelector('#delete-modal').hidden = false;
}

function closeDeleteModal() {
  document.querySelector('#delete-modal').hidden = true;
  pendingDeleteIds = [];
}

async function confirmDelete() {
  const ids = pendingDeleteIds;
  closeDeleteModal();
  if (!ids.length) return;
  const { error } = ids.length === 1
    ? await supabaseClient.from('horses').delete().eq('id', ids[0])
    : await supabaseClient.from('horses').delete().in('id', ids);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadHorses();
}

function wireFilterForm() {
  document.querySelector('#filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadHorses();
  });
  document.querySelector('#reset-filters').addEventListener('click', () => {
    document.querySelector('#filter-form').reset();
    resetCheckDropdown('f-ekh-drop');
    resetCheckDropdown('f-genetik-drop');
    loadHorses();
  });
}

function wireSortableHeaders() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { field, dir: 'asc' };
      }
      syncMobileSortControls();
      loadHorses();
    });
  });

  // Mobile Alternative zum Klick auf die (dort ausgeblendete)
  // Tabellenkopfzeile - siehe .mobile-sort in style.css.
  const fieldSel = document.querySelector('#f-sort-field');
  const dirSel = document.querySelector('#f-sort-dir');
  [fieldSel, dirSel].forEach((sel) => {
    sel.addEventListener('change', () => {
      currentSort = { field: fieldSel.value, dir: dirSel.value };
      loadHorses();
    });
  });
  syncMobileSortControls();
}

function syncMobileSortControls() {
  const fieldSel = document.querySelector('#f-sort-field');
  const dirSel = document.querySelector('#f-sort-dir');
  fieldSel.value = currentSort.field;
  dirSel.value = currentSort.dir;
}

// --- Checkbox-Dropdowns (Genetik, EKH) ---

function wireCheckDropdowns() {
  document.querySelectorAll('.checkdrop').forEach((root) => {
    const toggle = root.querySelector('.checkdrop-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = root.querySelector('.checkdrop-panel');
      const wasOpen = !panel.hidden;
      closeAllCheckDropdowns();
      panel.hidden = wasOpen;
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.checkdrop')) closeAllCheckDropdowns();
  });
}

function closeAllCheckDropdowns() {
  document.querySelectorAll('.checkdrop-panel').forEach((p) => { p.hidden = true; });
}

function populateCheckDropdown(rootId, values, { noneOption, extra } = {}) {
  const panel = document.querySelector(`#${rootId} .checkdrop-panel`);
  panel.innerHTML = '';

  if (noneOption) panel.appendChild(checkDropdownItem('__none__', noneOption));
  for (const v of values) panel.appendChild(checkDropdownItem(v, v));
  for (const { value, label } of extra || []) panel.appendChild(checkDropdownItem(value, label));

  if (!noneOption && !values.length && !(extra || []).length) {
    const empty = document.createElement('div');
    empty.className = 'checkdrop-empty';
    empty.textContent = 'Keine Werte vorhanden';
    panel.appendChild(empty);
  }

  panel.addEventListener('change', () => updateCheckDropdownLabel(rootId));
}

function checkDropdownItem(value, label) {
  const wrap = document.createElement('label');
  wrap.className = 'checkdrop-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.value = value;
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(label));
  return wrap;
}

function updateCheckDropdownLabel(rootId) {
  const root = document.getElementById(rootId);
  const toggle = root.querySelector('.checkdrop-toggle');
  const checked = root.querySelectorAll('.checkdrop-panel input[type=checkbox]:checked');
  toggle.textContent = checked.length ? `${checked.length} ausgewählt` : 'Alle';
}

function getCheckDropdownSelected(rootId) {
  return [...document.querySelectorAll(`#${rootId} .checkdrop-panel input[type=checkbox]:checked`)].map((cb) => cb.value);
}

function resetCheckDropdown(rootId) {
  document.querySelectorAll(`#${rootId} .checkdrop-panel input[type=checkbox]`).forEach((cb) => { cb.checked = false; });
  updateCheckDropdownLabel(rootId);
}

// --- Mehrfachauswahl (Zeilen) ---

// "#select-all" (Tabellenkopf) und "#select-all-mobile" (Listenkopf, nur
// in der mobilen Kartenansicht sichtbar, da <thead> dort ausgeblendet
// ist) steuern dieselbe Auswahl und werden dabei synchron gehalten.
function wireSelection() {
  const selectAllBoxes = document.querySelectorAll('#select-all, #select-all-mobile');
  selectAllBoxes.forEach((box) => {
    box.addEventListener('change', (e) => {
      const checked = e.target.checked;
      selectAllBoxes.forEach((other) => { other.checked = checked; });
      document.querySelectorAll('#horse-table tbody [data-select]').forEach((cb) => {
        cb.checked = checked;
        onRowSelect(cb.dataset.select, checked, false);
      });
      updateBulkBar();
    });
  });
  document.querySelector('#bulk-delete-btn').addEventListener('click', onBulkDelete);
}

function onRowSelect(id, checked, refreshBar = true) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  if (refreshBar) updateBulkBar();
}

function updateBulkBar() {
  const bar = document.querySelector('#bulk-actions');
  const countEl = document.querySelector('#selected-count');
  if (selectedIds.size > 0) {
    bar.hidden = false;
    countEl.textContent = `${selectedIds.size} ausgewählt`;
  } else {
    bar.hidden = true;
  }
}

function onBulkDelete() {
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  if (!rows.length) return;
  openDeleteModal(rows);
}

// --- CSV-Export ---

const CSV_COLUMNS = ['Name', 'Geschlecht', 'Rasse - Rasseanteile', 'Farbe Genetik', 'GP', 'Ext', 'Ext%', 'Int', 'Besitzer', 'MDR-Link'];

// Semikolon statt Komma als Trennzeichen, da deutsches Excel Kommas als
// Dezimaltrennzeichen liest und eine mit Komma getrennte CSV-Datei sonst
// nicht automatisch in Spalten aufgeteilt würde.
function csvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

// Deutsches Dezimalkomma statt Punkt - mit Punkt liest Excel (deutsches
// Gebietsschema) Werte wie "2.10" sonst fälschlich als Datum (2. Oktober)
// statt als Zahl.
function deDecimal(value) {
  return String(value).replace('.', ',');
}

function csvRowOf(h) {
  const d = computeDerived(h);
  const breed = normalizeBreed(h.breed) || 'Rasselos';
  const breedCell = h.breed_composition ? `${breed} - ${h.breed_composition}` : breed;
  const colorGeneticsCell = [h.coat_color, d.presentGenes].filter(Boolean).join(' ');
  const mdrLink = h.external_id
    ? `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}`
    : '';
  return [
    h.name || '',
    h.gender || '',
    breedCell,
    colorGeneticsCell,
    d.gp ?? '',
    d.extAvg != null ? deDecimal(d.extAvg.toFixed(2)) : '',
    d.extPercent != null ? deDecimal(d.extPercent) + '%' : '',
    d.intAvg != null ? deDecimal(d.intAvg.toFixed(2)) : '',
    h.owner || '',
    mdrLink,
  ];
}

// Sind über die Kästchen einzelne Pferde ausgewählt, werden nur diese
// exportiert - ohne Auswahl exportiert der Button stattdessen alle
// aktuell gefilterten/sortierten Zeilen (lastRenderedRows, siehe
// loadHorses), berücksichtigt also automatisch alle aktiven Filter.
function exportCsv() {
  const rows = selectedIds.size > 0
    ? lastRenderedRows.filter((r) => selectedIds.has(r.id))
    : lastRenderedRows;

  if (!rows.length) {
    alert('Keine Pferde zum Exportieren (Filter ergibt keine Treffer).');
    return;
  }

  const lines = [CSV_COLUMNS, ...rows.map(csvRowOf)]
    .map((row) => row.map(csvEscape).join(';'));
  // BOM voranstellen, damit Excel die UTF-8-Kodierung (Umlaute) korrekt erkennt.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pferde_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireExportCsv() {
  document.querySelector('#export-csv-btn').addEventListener('click', exportCsv);
}
