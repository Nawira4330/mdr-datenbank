let currentSort = { field: 'name', dir: 'asc' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  wireFilterForm();
  wireSortableHeaders();
  await populateFilterOptions();
  await loadHorses();
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('breed');
  if (error || !data) return;
  fillSelect('#f-breed', [...new Set(data.map((d) => d.breed).filter(Boolean))].sort());
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
  const breed = document.querySelector('#f-breed').value;
  const gender = document.querySelector('#f-gender').value;
  const owner = document.querySelector('#f-owner').value.trim();
  const color = document.querySelector('#f-color').value.trim();
  const breeding = document.querySelector('#f-breeding').value;

  if (name) q = q.ilike('name', `%${name}%`);
  if (breed) q = q.eq('breed', breed);
  if (gender) q = q.eq('gender', gender);
  if (owner) q = q.ilike('owner', `%${owner}%`);
  if (color) q = q.ilike('coat_color', `%${color}%`);
  if (breeding === 'yes') q = q.eq('breeding_allowed', true);
  if (breeding === 'no') q = q.eq('breeding_allowed', false);

  return q.order(currentSort.field, { ascending: currentSort.dir === 'asc', nullsFirst: false });
}

async function loadHorses() {
  const tbody = document.querySelector('#horse-table tbody');
  const countEl = document.querySelector('#result-count');
  tbody.innerHTML = '<tr><td colspan="7">Lade…</td></tr>';

  const { data, error } = await buildQuery();

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="error">Fehler beim Laden: ${escapeHtml(error.message)}</td></tr>`;
    countEl.textContent = '';
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7">Keine Pferde gefunden.</td></tr>';
    countEl.textContent = '0 Pferde';
    return;
  }

  countEl.textContent = `${data.length} Pferd${data.length === 1 ? '' : 'e'}`;
  tbody.innerHTML = data.map(rowHtml).join('');
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.delete, btn.dataset.name));
  });
}

function rowHtml(h) {
  return `<tr>
    <td><a href="horse.html?id=${h.id}">${escapeHtml(h.name || '(ohne Name)')}</a></td>
    <td>${escapeHtml(h.gender || '')}</td>
    <td>${escapeHtml(h.breed || '')}</td>
    <td>${escapeHtml(h.coat_color || '')}</td>
    <td>${breedingPill(h.breeding_allowed)}</td>
    <td>${escapeHtml(h.owner || '')}</td>
    <td class="actions-cell">
      <a class="btn secondary small" href="horse.html?id=${h.id}">Bearbeiten</a>
      <button class="danger small" data-delete="${h.id}" data-name="${escapeHtml(h.name || '')}">Löschen</button>
    </td>
  </tr>`;
}

function breedingPill(v) {
  if (v === true) return '<span class="pill yes">Ja</span>';
  if (v === false) return '<span class="pill no">Nein</span>';
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
