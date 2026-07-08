let currentSort = { field: 'name', dir: 'asc' };
let selectedIds = new Set();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  if (isAdminSession(session)) {
    document.querySelector('#verwaltung-link').hidden = false;
  }
  wireFilterForm();
  wireSortableHeaders();
  wireSelection();
  wireCheckDropdowns();
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

  return q.order(currentSort.field, { ascending: currentSort.dir === 'asc', nullsFirst: false });
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
  return {
    colorCode: colorCodeOf(h),
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
  if (!entry) return false;
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

  const filtered = applyClientFilters(data);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="13">Keine Pferde gefunden.</td></tr>';
    countEl.textContent = '0 Pferde';
    return;
  }

  countEl.textContent = `${filtered.length} Pferd${filtered.length === 1 ? '' : 'e'}`;
  tbody.innerHTML = filtered.map(rowHtml).join('');
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.delete, btn.dataset.name));
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
    <td class="small" style="font-family: ui-monospace, monospace;">${escapeHtml(d.colorCode)}</td>
    <td>${d.gp != null ? escapeHtml(String(d.gp)) : ''}</td>
    <td>${d.extAvg != null ? d.extAvg.toFixed(2) : ''}</td>
    <td>${d.extPercent != null ? d.extPercent + '%' : ''}</td>
    <td>${d.intAvg != null ? d.intAvg.toFixed(2) : ''}</td>
    <td>${escapeHtml(hlpSlpDisplay(h.hlp_slp))}</td>
    <td>${escapeHtml(ekhText)}</td>
    <td>${escapeHtml(h.owner || '')}</td>
    <td class="actions-cell">
      <a class="btn secondary small" href="horse.html?id=${h.id}">Bearbeiten</a>
      <button class="danger small" data-delete="${h.id}" data-name="${escapeHtml(h.name || '')}">Löschen</button>
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

async function onDelete(id, name) {
  if (!confirm(`Pferd "${name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', id);
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

async function onBulkDelete() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  if (!confirm(`${ids.length} Pferd(e) wirklich unwiderruflich löschen?`)) return;
  const { error } = await supabaseClient.from('horses').delete().in('id', ids);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadHorses();
}
