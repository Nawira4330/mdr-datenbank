document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  await renderSharedNav(session);
  wireForm();
  wireCheckDropdowns();
  populateCheckDropdown('d-tag-drop', HORSE_TAG_OPTIONS.map((t) => t.label), { noneOption: 'Kein Schlagwort' });
  await populateFilterOptions();
  await calculate();
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('owner, gender, breed');
  if (error || !data) return;

  fillSelect('#d-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());
  fillSelect('#d-gender', [...new Set(data.map((d) => d.gender).filter(Boolean))].sort());
  const breeds = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
  breeds.add('Rasselos');
  fillSelect('#d-breed', [...breeds].sort());
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
  let q = supabaseClient
    .from('horses')
    .select('tournament_potential, exterior_descriptive, exterior_genetics, temperament, owner, breed, gender, breeding_allowed, tags');

  const owner = document.querySelector('#d-owner').value;
  const gender = document.querySelector('#d-gender').value;
  const breed = document.querySelector('#d-breed').value;
  const zzl = document.querySelector('#d-zzl').value;

  if (owner) q = q.eq('owner', owner);
  if (gender) q = q.eq('gender', gender);
  // "Rasselos" deckt zusätzlich Pferde ohne jeglichen Rasse-Eintrag mit ab
  // (null), siehe dieselbe Logik in list.js/buildQuery.
  if (breed === 'Rasselos') q = q.or('breed.eq.Rasselos,breed.is.null');
  else if (breed) q = q.eq('breed', breed);
  if (zzl === 'true') q = q.eq('breeding_allowed', true);
  else if (zzl === 'false') q = q.or('breeding_allowed.eq.false,breeding_allowed.is.null');

  return q;
}

// Dieselbe Berechnung wie computeDerived in list.js (GP/Ext/Ext%/Int sind
// abgeleitete Werte ohne eigene DB-Spalte) - hier eigenständig gehalten,
// statt list.js einzubinden, da dessen DOMContentLoaded-Handler von
// Tabellen-/Filterelementen ausgeht, die auf dieser Seite nicht existieren.
function computeDerived(h) {
  const gpRaw = h.tournament_potential?.['Gesamtpotenzial'];
  return {
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : null,
    extAvg: averageScore(h.exterior_descriptive, scoreExteriorTerm),
    extPercent: h.exterior_genetics?.overall?.percent ?? null,
    intAvg: averageScore(h.temperament, scoreTemperamentTerm),
  };
}

// Durchschnitt über eine Liste von Werten, wobei fehlende Werte (Pferde
// ohne diesen Wert) weder mitgezählt noch die Anzahl verfälschen.
function average(values) {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!nums.length) return { avg: null, count: 0 };
  return { avg: nums.reduce((a, b) => a + b, 0) / nums.length, count: nums.length };
}

function statCardHtml(label, stat, suffix, total) {
  const value = stat.avg == null ? '–' : `${stat.avg.toFixed(2)}${suffix}`;
  const sub = stat.avg != null && stat.count !== total
    ? `<div class="avg-stat-sub">aus ${stat.count} von ${total} Pferden mit Wert</div>`
    : '';
  return `<div class="avg-stat"><div class="avg-stat-label">${label}</div><div class="avg-stat-value">${escapeHtml(value)}</div>${sub}</div>`;
}

// Menschlich lesbare Beschreibung der aktuell gewählten Filter für den
// Ergebnis-Hinweis ("N Pferde entsprechen ... (Rasse: X)") - analog zum
// Filter-Hinweis-Badge in der Übersicht (siehe activeFilterDescriptions
// in list.js), hier aber mit dem tatsächlich gewählten Wert statt nur
// dem Feldnamen, da hier nur eine Handvoll Filterfelder existiert.
function activeFilterSummary() {
  const parts = [];
  const addSelect = (sel, label) => {
    const el = document.querySelector(sel);
    if (el.value) parts.push(`${label}: ${el.selectedOptions[0].textContent}`);
  };
  addSelect('#d-owner', 'Besitzer');
  addSelect('#d-breed', 'Rasse');
  addSelect('#d-gender', 'Geschlecht');
  const zzl = document.querySelector('#d-zzl');
  if (zzl.value) parts.push(`ZZL: ${zzl.selectedOptions[0].textContent}`);
  const tags = getCheckDropdownSelected('d-tag-drop');
  if (tags.length) parts.push(`Schlagwörter: ${tags.join(', ')}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

async function calculate() {
  const resultEl = document.querySelector('#avg-result');
  resultEl.innerHTML = '<p class="muted small">Lade…</p>';

  const { data: allData, error } = await buildQuery();
  if (error) {
    resultEl.innerHTML = `<p class="error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    return;
  }

  // Schlagwörter lassen sich nicht direkt in der Supabase-Abfrage
  // filtern (jsonb-Array) - deshalb erst clientseitig eingrenzen, wie
  // beim Schlagwort-Filter in der Übersicht (siehe matchesTags/list.js).
  const tagSelected = getCheckDropdownSelected('d-tag-drop');
  const data = tagSelected.length ? allData.filter((h) => matchesTags(h, tagSelected)) : allData;

  if (!data.length) {
    resultEl.innerHTML = '<p>Keine Pferde gefunden.</p>';
    return;
  }

  const derived = data.map(computeDerived);
  const total = data.length;
  const gp = average(derived.map((d) => d.gp));
  const ext = average(derived.map((d) => d.extAvg));
  const extpct = average(derived.map((d) => d.extPercent));
  const intAvg = average(derived.map((d) => d.intAvg));

  const pferdeWort = total === 1 ? 'Pferd entspricht' : 'Pferde entsprechen';
  resultEl.innerHTML = `
    <p class="result-note">${total} ${pferdeWort} den gewählten Filtern${activeFilterSummary()}.</p>
    <div class="avg-stats">
      ${statCardHtml('Ø GP', gp, '', total)}
      ${statCardHtml('Ø Ext', ext, '', total)}
      ${statCardHtml('Ø Ext%', extpct, '%', total)}
      ${statCardHtml('Ø Int', intAvg, '', total)}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function wireForm() {
  document.querySelector('#avg-filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    calculate();
  });
  document.querySelector('#avg-reset').addEventListener('click', () => {
    document.querySelector('#avg-filter-form').reset();
    resetCheckDropdown('d-tag-drop');
    calculate();
  });
}
