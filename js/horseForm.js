const TEXT_FIELDS = [
  'name', 'gender', 'breed', 'coat_color', 'owner', 'hlp_slp', 'notes', 'image_url',
];
const DATE_FIELDS = [];
const NUMBER_FIELDS = ['purebred_pct', 'ico', 'fertility_pct'];
const BOOLEAN_FIELDS = ['disease_free', 'breeding_allowed'];
const JSONB_KEYS = [
  'genetic_diseases', 'colors', 'exterior_genetics', 'exterior_descriptive',
  'temperament', 'disciplines', 'traits', 'tournament_potential', 'pedigree', 'raw_text',
];

let extraData = {};
let editingId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  document.getElementById('parse-btn').addEventListener('click', onParse);
  document.getElementById('horse-form').addEventListener('submit', onSave);
  document.getElementById('delete-btn').addEventListener('click', onDelete);

  if (editingId) {
    document.getElementById('page-title').textContent = '🐴 Pferd bearbeiten';
    document.getElementById('delete-btn').hidden = false;
    await loadHorse(editingId);
  }
}

async function loadHorse(id) {
  const { data, error } = await supabaseClient.from('horses').select('*').eq('id', id).single();
  if (error) {
    document.getElementById('form-error').textContent = 'Konnte Pferd nicht laden: ' + error.message;
    return;
  }
  fillForm(data);
  extraData = data;
  document.getElementById('raw-text').value = data.raw_text || '';
  renderDetailTables(data);
}

function onParse() {
  const text = document.getElementById('raw-text').value;
  const statusEl = document.getElementById('parse-status');
  if (!text.trim()) {
    statusEl.textContent = 'Bitte zuerst Text einfügen.';
    return;
  }
  const parsed = parseHorseText(text);
  fillForm(parsed);
  extraData = { ...extraData, ...parsed };
  renderDetailTables(parsed);
  statusEl.textContent = 'Erkannt: ' + (parsed.name || 'kein Name gefunden') + ' — bitte Felder unten prüfen, bevor du speicherst.';
}

function fillForm(data) {
  for (const id of TEXT_FIELDS.concat(DATE_FIELDS)) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
  }
  for (const id of NUMBER_FIELDS) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
  }
  for (const id of BOOLEAN_FIELDS) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = String(data[id]);
  }
}

function collectForm() {
  const out = {};
  for (const id of TEXT_FIELDS.concat(DATE_FIELDS)) {
    const el = document.getElementById(id);
    const v = el.value.trim();
    out[id] = v === '' ? null : v;
  }
  for (const id of NUMBER_FIELDS) {
    const el = document.getElementById(id);
    out[id] = el.value === '' ? null : Number(el.value);
  }
  for (const id of BOOLEAN_FIELDS) {
    const el = document.getElementById(id);
    out[id] = el.value === '' ? null : el.value === 'true';
  }
  return out;
}

async function onSave(e) {
  e.preventDefault();
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const formData = collectForm();
  if (!formData.name) {
    errorEl.textContent = 'Name ist ein Pflichtfeld.';
    return;
  }

  const payload = { ...formData };
  for (const k of JSONB_KEYS) {
    if (extraData[k] !== undefined) payload[k] = extraData[k];
  }

  let error;
  if (editingId) {
    ({ error } = await supabaseClient.from('horses').update(payload).eq('id', editingId));
  } else {
    payload.user_id = session.user.id;
    ({ error } = await supabaseClient.from('horses').insert(payload));
  }

  if (error) {
    errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }
  window.location.href = 'index.html';
}

async function onDelete() {
  if (!editingId) return;
  if (!confirm('Dieses Pferd wirklich unwiderruflich löschen?')) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', editingId);
  if (error) {
    document.getElementById('form-error').textContent = 'Löschen fehlgeschlagen: ' + error.message;
    return;
  }
  window.location.href = 'index.html';
}

// --- Detail-Tabellen (nur Anzeige) ---

function renderDetailTables(data) {
  const container = document.getElementById('detail-tables');
  const fieldset = document.getElementById('detail-fieldset');
  const parts = [];

  if (data.genetic_diseases?.length) parts.push(simpleTableHtml('Erbkrankheiten', data.genetic_diseases));
  if (data.colors?.length) parts.push(simpleTableHtml('Farbgenetik', data.colors));
  if (data.exterior_genetics?.rows?.length) parts.push(exteriorGeneticsHtml(data.exterior_genetics));
  if (data.exterior_descriptive?.length) {
    parts.push(scoredTableHtml(
      'Exterieur (Körperbau)', data.exterior_descriptive, scoreExteriorTerm,
      'Skala 1 = exzellent … 3 = passabel … 5 = stark abweichend',
    ));
  }
  if (data.temperament?.length) {
    parts.push(scoredTableHtml(
      'Interieur (Mentalität)', data.temperament, scoreTemperamentTerm,
      'Skala 1 = exzellent … 4 = schlecht',
    ));
  }
  if (data.tournament_potential && Object.keys(data.tournament_potential).length) {
    parts.push(kvTableHtml('Turnierpotenzial', data.tournament_potential));
  }
  if (data.disciplines && Object.keys(data.disciplines).length) parts.push(percentGroupsHtml('Disziplinen', data.disciplines));
  if (data.traits && Object.keys(data.traits).length) parts.push(percentGroupsHtml('Eigenschaften', data.traits));
  if (data.pedigree?.length) parts.push(pedigreeHtml(data.pedigree));

  container.innerHTML = parts.join('');
  fieldset.hidden = parts.length === 0;
}

function simpleTableHtml(title, rows) {
  const body = rows.map((r) => `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`).join('');
  return `<div class="group-heading">${escapeHtml(title)}</div><table class="detail-table">${body}</table>`;
}

// Wie simpleTableHtml, aber zusätzlich mit berechnetem Durchschnitt anhand
// einer Bewertungsskala (siehe scoreExteriorTerm/scoreTemperamentTerm in
// parser.js).
function scoredTableHtml(title, rows, scoreFn, scaleHint) {
  const base = simpleTableHtml(title, rows);
  const avg = averageScore(rows, scoreFn);
  if (avg === null) return base;
  return `${base}<p class="small muted">Durchschnitt: <strong>${avg.toFixed(2)}</strong> (${escapeHtml(scaleHint)})</p>`;
}

function exteriorGeneticsHtml(ext) {
  const body = ext.rows.map((r) => {
    const pct = fractionToPercent(r.score);
    const pctText = pct !== null ? ` — ${pct.toFixed(1)}%` : '';
    return `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.genotype)} — ${escapeHtml(r.score)}${pctText}</td></tr>`;
  }).join('');
  const overall = ext.overall
    ? `<p class="small muted">Exterieur-Gesamtwert (genetisch): <strong>${ext.overall.percent}%</strong> (${escapeHtml(ext.overall.score)})</p>`
    : '';
  return `<div class="group-heading">Exterieur (Genetik)</div><table class="detail-table">${body}</table>${overall}`;
}

function kvTableHtml(title, obj) {
  const body = Object.entries(obj).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  return `<div class="group-heading">${escapeHtml(title)}</div><table class="detail-table">${body}</table>`;
}

function percentGroupsHtml(title, groups) {
  let html = `<div class="group-heading">${escapeHtml(title)}</div>`;
  for (const [group, entries] of Object.entries(groups)) {
    const body = entries.map((e) => `<tr><th>${escapeHtml(e.name)}</th><td>${e.current}% (Potenzial ${e.potential}%)</td></tr>`).join('');
    html += `<p class="small muted" style="margin-bottom:0.1rem;">${escapeHtml(group)}</p><table class="detail-table">${body}</table>`;
  }
  return html;
}

function pedigreeHtml(list) {
  const body = list.map((p) => `<tr><th>${escapeHtml(p.name)}</th><td>${escapeHtml(p.breed || '')}${p.potential ? ' — Potenzial ' + p.potential : ''}</td></tr>`).join('');
  return `<div class="group-heading">Stammbaum (unsortierte Liste)</div>
    <p class="small muted">Die genaue Abstammungs-Hierarchie lässt sich aus dem kopierten Text nicht zuverlässig rekonstruieren – hier alle im Text gefundenen Vorfahren als Liste, in Reihenfolge des Textes.</p>
    <table class="detail-table">${body}</table>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
