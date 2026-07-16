document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  wireForm();
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
    .select('tournament_potential, exterior_descriptive, exterior_genetics, temperament, owner, breed, gender, breeding_allowed');

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

function fmtStat(stat, suffix, total) {
  if (stat.avg == null) return '-';
  const note = stat.count === total
    ? ''
    : ` <span class="muted small">(aus ${stat.count} von ${total} Pferden mit Wert)</span>`;
  return `${stat.avg.toFixed(2)}${suffix}${note}`;
}

async function calculate() {
  const resultEl = document.querySelector('#avg-result');
  resultEl.innerHTML = '<p class="muted small">Lade…</p>';

  const { data, error } = await buildQuery();
  if (error) {
    resultEl.innerHTML = `<p class="error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    return;
  }

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

  resultEl.innerHTML = `
    <table class="detail-table">
      <tbody>
        <tr><th>Anzahl Pferde</th><td>${total}</td></tr>
        <tr><th>Ø GP</th><td>${fmtStat(gp, '', total)}</td></tr>
        <tr><th>Ø Ext</th><td>${fmtStat(ext, '', total)}</td></tr>
        <tr><th>Ø Ext%</th><td>${fmtStat(extpct, '%', total)}</td></tr>
        <tr><th>Ø Int</th><td>${fmtStat(intAvg, '', total)}</td></tr>
      </tbody>
    </table>
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
    calculate();
  });
}
