let currentSort = { field: 'name', dir: 'asc' };
let selectedIds = new Set();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  wireFilterForm();
  wireSortableHeaders();
  wireSelection();
  await populateFilterOptions();
  await loadHorses();
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('owner, genetic_diseases');
  if (error || !data) return;

  fillSelect('#f-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());

  const diseaseLabels = new Set();
  for (const row of data) {
    for (const d of row.genetic_diseases || []) diseaseLabels.add(d.label);
  }
  fillSelect('#f-ekh', [...diseaseLabels].sort());
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
  const color = document.querySelector('#f-color').value.trim();

  if (name) q = q.ilike('name', `%${name}%`);
  if (owner) q = q.eq('owner', owner);
  if (color) q = q.ilike('coat_color', `%${color}%`);

  return q.order(currentSort.field, { ascending: currentSort.dir === 'asc', nullsFirst: false });
}

// Farbcode wird aus der "colors"-Tabelle jedes Pferds zusammengesetzt.
// Groß-/Kleinschreibung ist bewusst relevant (z.B. "Z" = Silver dominant
// vorhanden, "z" nur rezessiv), daher case-sensitiver Substring-Vergleich.
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

function inRange(value, minStr, maxStr) {
  if (minStr === '' && maxStr === '') return true;
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  if (minStr !== '' && value < Number(minStr)) return false;
  if (maxStr !== '' && value > Number(maxStr)) return false;
  return true;
}

// Ein Erbkrankheiten-Locuswert gilt als unauffällig, wenn er ausschließlich
// aus "N" (normal) besteht - jede Kleinbuchstaben-/Risikoallel-Angabe
// bedeutet Träger/betroffen.
function isDiseaseClear(value) {
  return !/[a-z]/.test(value || '');
}

function matchesEkh(row, selectedCodes) {
  return selectedCodes.some((code) => {
    if (code === '__none__') return row.disease_free === true;
    return (row.genetic_diseases || []).some((d) => d.label === code && !isDiseaseClear(d.value));
  });
}

function applyClientFilters(rows) {
  const genetikTerms = document.querySelector('#f-genetik').value
    .split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  const gpMin = document.querySelector('#f-gp-min').value;
  const gpMax = document.querySelector('#f-gp-max').value;
  const extMin = document.querySelector('#f-ext-min').value;
  const extMax = document.querySelector('#f-ext-max').value;
  const extpctMin = document.querySelector('#f-extpct-min').value;
  const extpctMax = document.querySelector('#f-extpct-max').value;
  const intMin = document.querySelector('#f-int-min').value;
  const intMax = document.querySelector('#f-int-max').value;
  const ekhSelected = [...document.querySelector('#f-ekh').selectedOptions].map((o) => o.value);

  return rows.filter((row) => {
    const d = computeDerived(row);

    if (genetikTerms.length && !genetikTerms.every((t) => d.colorCode.includes(t))) return false;
    if (!inRange(d.gp, gpMin, gpMax)) return false;
    if (!inRange(d.extAvg, extMin, extMax)) return false;
    if (!inRange(d.extPercent, extpctMin, extpctMax)) return false;
    if (!inRange(d.intAvg, intMin, intMax)) return false;
    if (ekhSelected.length && !matchesEkh(row, ekhSelected)) return false;

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
    <td>${diseaseFreePill(h.disease_free)}</td>
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

function diseaseFreePill(v) {
  if (v === true) return '<span class="pill yes">Frei</span>';
  if (v === false) return '<span class="pill no">Betroffen</span>';
  return '';
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

// --- Mehrfachauswahl ---

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
