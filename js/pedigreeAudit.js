// Read-only Audit (Verwaltung): findet Pferde, deren gespeicherter
// Stammbaum vermutlich von einem älteren, mittlerweile behobenen
// Parser-Bug betroffen ist (Bugreport "*Iced* Nimbus -)B(-": Name und
// Rasse eines Vorfahren waren um eine Zeile verschoben in der Datenbank
// gelandet). Die eigentliche Heuristik (und ihre Begründung) steht als
// findPedigreeSuspects in js/parser.js - dieselbe Funktion nutzt auch der
// Hinweis für Besitzer*innen in der Übersicht (js/list.js).
//
// Zeigt die betroffenen Pferde als sortierbare Tabelle (Name, Rasse,
// Besitzer, Link zum Spiel). Macht KEINE Änderungen an der Datenbank. Der
// einzige Fix ist ein erneutes Einfügen+Speichern des aktuellen
// Spieltextes für das jeweilige Pferd. Läuft nur auf Klick auf "Erneut
// prüfen", nicht automatisch beim Öffnen der Seite.

// Sortierzustand der Ergebnistabelle - bleibt über "Erneut prüfen" hinweg
// erhalten.
let pedigreeAuditSort = { field: 'name', dir: 'asc' };
let pedigreeAuditRows = [];

function pedigreeAuditSortValue(row, field) {
  switch (field) {
    case 'name': return (row.name || '').toLowerCase();
    case 'breed': return (row.breed || 'Rasselos').toLowerCase();
    case 'owner': return (row.owner || '').toLowerCase();
    case 'link': return row.external_id ? 0 : 1;
    default: return '';
  }
}

function renderPedigreeAuditTable() {
  const container = document.getElementById('pedigree-audit-result');
  if (!pedigreeAuditRows.length) {
    container.innerHTML = '';
    return;
  }
  const mult = pedigreeAuditSort.dir === 'asc' ? 1 : -1;
  const rows = [...pedigreeAuditRows].sort((a, b) => {
    const va = pedigreeAuditSortValue(a, pedigreeAuditSort.field);
    const vb = pedigreeAuditSortValue(b, pedigreeAuditSort.field);
    if (typeof va === 'string') return va.localeCompare(vb, 'de') * mult;
    return (va - vb) * mult;
  });
  const th = (field, label) => {
    const arrow = pedigreeAuditSort.field === field ? (pedigreeAuditSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th data-sort="${field}" style="cursor:pointer;">${label}${arrow}</th>`;
  };
  const body = rows.map((h) => `<tr>
      <td><a href="view.html?id=${encodeURIComponent(h.id)}">${escapeHtml(h.name || '(ohne Name)')}</a></td>
      <td>${escapeHtml(h.breed || 'Rasselos')}</td>
      <td>${h.owner ? escapeHtml(h.owner) : '–'}</td>
      <td>${h.external_id ? `<a href="https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}" target="_blank" rel="noopener" title="Zum Pferd im Spiel">🔗 Spiel</a>` : '–'}</td>
    </tr>`).join('');
  container.innerHTML = `<div style="max-height: 420px; overflow: auto;"><table class="small" id="pedigree-audit-table">
    <thead><tr>${th('name', 'Name')}${th('breed', 'Rasse')}${th('owner', 'Besitzer')}${th('link', 'Link')}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

async function runPedigreeAudit() {
  const statusEl = document.getElementById('pedigree-audit-status');
  const diagEl = document.getElementById('pedigree-audit-diagnostics');
  pedigreeAuditRows = [];
  renderPedigreeAuditTable();
  diagEl.innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, name, external_id, breed, owner, pedigree'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  const { suspects, triggerCounts, rareBreedValues, badBreedHorses } = findPedigreeSuspects(horses);
  pedigreeAuditRows = suspects.map((s) => s.horse);
  renderPedigreeAuditTable();

  statusEl.textContent = `Fertig: ${horses.length} Pferde geprüft, ${suspects.length} mit vermutlich vertauschtem Name/Rasse im Stammbaum.` +
    (suspects.length ? '' : ' Keine betroffenen Pferde gefunden.');

  // Diagnose (eingeklappt): welche Namen lösen die meisten Treffer aus? Taucht
  // dort ein normaler Pferdename mit sehr hoher Zahl auf, ist er vermutlich
  // als Rasse-Wert eines einzelnen Pferds in der Datenbank gelandet statt ein
  // echter Vertauschungsfall zu sein.
  const diagnostics = [];
  if (suspects.length) {
    const ownerCounts = new Map();
    for (const { horse } of suspects) {
      const o = horse.owner || '(ohne Besitzer)';
      ownerCounts.set(o, (ownerCounts.get(o) || 0) + 1);
    }
    const byOwner = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])
      .map(([o, n]) => `${escapeHtml(o)} (${n})`).join(', ');
    diagnostics.push(`Betroffene Pferde je Besitzer: ${byOwner}`);
  }
  if (badBreedHorses.length) {
    const list = badBreedHorses.slice(0, 30)
      .map((h) => `${escapeHtml(h.name || '(ohne Name)')} [${h.owner ? escapeHtml(h.owner) : '–'}] → Rasse-Feld „${escapeHtml(h.breed)}“`).join('; ');
    diagnostics.push(`Pferde, deren EIGENES Rasse-Feld wie ein Pferdename aussieht (${badBreedHorses.length}, vermutlich selbst vom Fehler betroffen und Auslöser für viele Treffer - bitte zuerst diese neu einlesen): ${list}${badBreedHorses.length > 30 ? ' …' : ''}`);
  }
  if (triggerCounts.size) {
    const top = [...triggerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, n]) => `${escapeHtml(name)} (${n})`).join(', ');
    diagnostics.push(`Häufigste auslösende Vorfahren-Namen (Anzahl betroffener Pferde): ${top}`);
  }
  if (rareBreedValues.length) {
    diagnostics.push(`Selten vorkommende Rasse-Werte (unter ${PEDIGREE_AUDIT_RARE_BREED_LIMIT} Pferden, zählen trotzdem als Rasse - ggf. selbst fehlerhaft): ${rareBreedValues.map(escapeHtml).join(', ')}`);
  }
  if (diagnostics.length) {
    diagEl.innerHTML = `<details><summary class="small muted">Diagnose</summary>${diagnostics.map((d) => `<p class="small muted">${d}</p>`).join('')}</details>`;
  }
}

document.addEventListener('click', (e) => {
  const th = e.target.closest('#pedigree-audit-table th[data-sort]');
  if (!th) return;
  const field = th.dataset.sort;
  pedigreeAuditSort = pedigreeAuditSort.field === field
    ? { field, dir: pedigreeAuditSort.dir === 'asc' ? 'desc' : 'asc' }
    : { field, dir: 'asc' };
  renderPedigreeAuditTable();
});

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session || !isAdminSession(session)) return;

  const startBtn = document.getElementById('pedigree-audit-start-btn');
  async function runAndToggle() {
    startBtn.disabled = true;
    try {
      await runPedigreeAudit();
    } finally {
      startBtn.disabled = false;
    }
  }
  startBtn.addEventListener('click', runAndToggle);
  // Nutzerwunsch: nicht automatisch beim Öffnen prüfen, nur per Klick.
  document.getElementById('pedigree-audit-status').textContent = 'Noch nicht geprüft - auf „Erneut prüfen“ klicken.';
});
