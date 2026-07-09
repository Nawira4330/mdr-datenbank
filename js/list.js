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
  }
  wireFilterForm();
  wireSortableHeaders();
  wireSelection();
  wireCheckDropdowns();
  wireDeleteModal();
  await populateFilterOptions();
  await loadHorses();
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('owner, genetic_diseases, colors');
  if (error || !data) return;

  fillSelect('#f-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());

  const diseaseLabels = new Set();
  const locusLabels = new Set();
  for (const row of data) {
    for (const d of row.genetic_diseases || []) diseaseLabels.add(d.label);
    for (const c of row.colors || []) locusLabels.add(c.label);
  }
  populateCheckDropdown('f-ekh-drop', [...diseaseLabels].sort(), { noneOption: 'Keine' });
  populateCheckDropdown('f-genetik-drop', [...locusLabels].sort());
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

  if (name) q = q.ilike('name', `%${name}%`);
  if (owner) q = q.eq('owner', owner);

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
  const genes = presentGenesSummary(h.colors, h.coat_color, h.notes);
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

function matchesGenetikLocus(row, locusName) {
  const entry = (row.colors || []).find((c) => c.label === locusName);
  if (!entry || isUntestedLocusValue(entry.value)) return false;
  const check = LOCUS_DOMINANT_CHECK[locusName];
  return check ? check(entry.value) : false;
}

// Ein Erbkrankheiten-Locuswert gilt als unauffällig, wenn er ausschließlich
// aus "N" (normal) besteht - jede Kleinbuchstaben-/Risikoallel-Angabe
// bedeutet Träger/betroffen.
function isDiseaseClear(value) {
  return !/[a-z]/.test(value || '');
}

function affectedDiseaseLabels(row) {
  return (row.genetic_diseases || []).filter((d) => !isDiseaseClear(d.value)).map((d) => d.label);
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
  tbody.innerHTML = '<tr><td colspan="13">Lade…</td></tr>';
  selectedIds = new Set();
  updateBulkBar();

  const { data, error } = await buildQuery();

  if (error) {
    tbody.innerHTML = `<tr><td colspan="13" class="error">Fehler beim Laden: ${escapeHtml(error.message)}</td></tr>`;
    countEl.textContent = '';
    return;
  }

  const filtered = applySort(applyClientFilters(data));

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="13">Keine Pferde gefunden.</td></tr>';
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
  document.querySelector('#select-all').checked = false;
}

function rowHtml(h) {
  const d = computeDerived(h);
  const affected = affectedDiseaseLabels(h);
  const ekhText = affected.length ? affected.join(', ') : '-';

  return `<tr>
    <td><input type="checkbox" data-select="${h.id}" /></td>
    <td><a href="horse.html?id=${h.id}">${escapeHtml(h.name || '(ohne Name)')}</a></td>
    <td>${escapeHtml(h.gender || '')}</td>
    <td>${escapeHtml(h.coat_color || '')}</td>
    <td class="small" style="font-family: ui-monospace, monospace;">${escapeHtml(d.presentGenes)}</td>
    <td>${d.gp != null ? escapeHtml(String(d.gp)) : ''}</td>
    <td>${d.extAvg != null ? d.extAvg.toFixed(2) : ''}</td>
    <td>${d.extPercent != null ? d.extPercent + '%' : ''}</td>
    <td>${d.intAvg != null ? d.intAvg.toFixed(2) : ''}</td>
    <td>${escapeHtml(hlpSlpDisplay(h.hlp_slp))}</td>
    <td>${escapeHtml(ekhText)}</td>
    <td>${escapeHtml(h.owner || '')}</td>
    <td class="actions-cell">
      <button class="danger small" data-delete="${h.id}">Löschen</button>
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
      loadHorses();
    });
  });
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

function populateCheckDropdown(rootId, values, { noneOption } = {}) {
  const panel = document.querySelector(`#${rootId} .checkdrop-panel`);
  panel.innerHTML = '';

  if (noneOption) panel.appendChild(checkDropdownItem('__none__', noneOption));
  for (const v of values) panel.appendChild(checkDropdownItem(v, v));

  if (!noneOption && !values.length) {
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

function wireSelection() {
  document.querySelector('#select-all').addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('#horse-table tbody [data-select]').forEach((cb) => {
      cb.checked = checked;
      onRowSelect(cb.dataset.select, checked, false);
    });
    updateBulkBar();
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
