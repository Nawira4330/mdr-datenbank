// Read-only Audit (Verwaltung): findet Pferde, deren gespeicherter
// Stammbaum vermutlich von einem älteren, mittlerweile behobenen
// Parser-Bug betroffen ist (Bugreport "*Iced* Nimbus -)B(-": Name und
// Rasse eines Vorfahren waren um eine Zeile verschoben in der Datenbank
// gelandet - "Eltern" zeigte z.B. "RASSELOS" als Namen und den echten
// Namen im Rasse-Feld).
//
// Der ursprünglich eingefügte Rohtext wird nach dem Speichern NICHT
// dauerhaft gespeichert (siehe "payload.raw_text = null" in performSave,
// horseForm.js) - ein automatischer Rückwärts-Vergleich/Neu-Parse ist
// deshalb nicht möglich. Stattdessen eine Heuristik, die ohne Rohtext
// auskommt: eine echte Pferde-Vorfahrin heißt normalerweise nicht
// wortwörtlich genauso wie eine Rasse. Die Menge der "echten" Rassen wird
// dynamisch aus allen im Bestand tatsächlich vorkommenden Rasse-Werten
// gebildet (sowohl horses.breed als auch alle Vorfahren-Rasse-Felder) -
// kein hartcodierter Rasse-Katalog nötig. Taucht der NAME eines Vorfahren
// darin identisch wieder auf, ist das ein starkes Signal für genau diese
// Vertauschung.
//
// Macht KEINE Änderungen an der Datenbank - reine Liste zum manuellen
// Durchsehen. Der einzige Fix ist ein erneutes Einfügen+Speichern des
// aktuellen Spieltextes für das jeweilige Pferd (siehe ANLEITUNG). Läuft
// automatisch beim Öffnen dieser Seite.
function pedigreeAuditAncestorsOf(pedigree) {
  if (!pedigree) return [];
  return Array.isArray(pedigree) ? pedigree.slice(1) : (pedigree.ancestors || []);
}

async function runPedigreeAudit() {
  const statusEl = document.getElementById('pedigree-audit-status');
  const logList = document.getElementById('pedigree-audit-log');
  logList.innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, name, external_id, breed, pedigree'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  const byName = new Map();
  for (const h of horses) {
    const list = byName.get(h.name) || [];
    list.push(h);
    byName.set(h.name, list);
  }
  // Der verdächtige Vorfahren-Name steht nur als Text im Stammbaum, nicht
  // zwingend als eigener Datensatz - siehe linkedAncestorName weiter
  // unten, das ohne Treffer auf den reinen Namen zurückfällt.

  const knownBreeds = new Set();
  for (const h of horses) {
    if (h.breed) knownBreeds.add(h.breed.trim().toLowerCase());
    for (const a of pedigreeAuditAncestorsOf(h.pedigree)) {
      if (a?.breed) knownBreeds.add(a.breed.trim().toLowerCase());
    }
  }

  function logLine(html) {
    const li = document.createElement('li');
    li.innerHTML = html;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
  }

  // Bei einer vertauschten Zeile steht der ECHTE Name des Vorfahren meist
  // im "breed"-Feld (siehe oben) - für den Spiel-Link deshalb beide
  // Felder probieren, welches auch immer zu einem bekannten Pferd passt.
  // Der angezeigte Text bleibt trotzdem "a.name" (zeigt exakt, was aktuell
  // gespeichert ist).
  function linkedAncestorName(a) {
    const rec = (byName.get(a.name) || [])[0] || (byName.get(a.breed) || [])[0];
    const label = escapeHtml(a.name);
    return rec ? `${gameLinkPrefix(rec)}${label}` : label;
  }

  let flaggedCount = 0;
  for (const horse of horses) {
    const ancestors = pedigreeAuditAncestorsOf(horse.pedigree);
    const suspicious = ancestors.filter((a) => a?.name && knownBreeds.has(a.name.trim().toLowerCase()));
    if (!suspicious.length) continue;
    flaggedCount++;
    const details = suspicious
      .map((a) => `„${linkedAncestorName(a)}" (Rasse-Feld zeigt stattdessen: „${escapeHtml(a.breed || '–')}")`)
      .join(', ');
    logLine(`⚠️ ${linkedName(horse)}: ${suspicious.length} Vorfahre(n), deren Name einer Rasse entspricht - ${details}`);
  }

  statusEl.textContent = `Fertig: ${horses.length} Pferde geprüft, ${flaggedCount} mit vermutlich vertauschtem Name/Rasse im Stammbaum.`;
  if (!flaggedCount) {
    logLine('Keine betroffenen Pferde gefunden.');
  }
}

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
  runAndToggle();
});
