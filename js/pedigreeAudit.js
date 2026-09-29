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
// dynamisch aus dem Top-Level-Rasse-Feld ALLER Pferde gebildet (horses.breed,
// NICHT zusätzlich aus Vorfahren-Rasse-Feldern - siehe Begründung/Bugfix bei
// knownBreeds unten) - kein hartcodierter Rasse-Katalog nötig. Taucht der
// NAME eines Vorfahren darin identisch wieder auf, ist das ein starkes
// Signal für genau diese Vertauschung. Ausnahme: "Unbekannt" (regulärer
// Platzhalter für einen nicht erfassten Vorfahren) wird nie geflaggt.
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

  // NUR aus dem eigenen (Top-Level-)Rasse-Feld echter Pferde gebildet, NICHT
  // zusaetzlich aus Vorfahren-Rasse-Feldern (Bugfix): genau dieses Feld ist
  // bei Vorfahren das, was der gesuchte Bug verschieben wuerde - eine
  // bereits verschobene Vorfahren-Rasse (z.B. "Sir Davis by Salino" landet
  // im breed-Feld eines ANDEREN Vorfahren) wuerde sonst selbst in
  // knownBreeds aufgenommen und in der Folge JEDEN echten, korrekten
  // Vorfahren mit genau diesem Namen anderswo faelschlich mit-verdaechtigen
  // (Kaskade). "horses.breed" durchlaeuft dagegen nie die Vorfahren-
  // Parsing-Logik und ist deshalb als Referenz unverdaechtig.
  // Als Rasse zählt jeder Wert, der im Top-Level-Rasse-Feld irgendeines
  // Pferds steht (keine Mindestanzahl - Nutzerentscheidung, eine Schwelle
  // hätte seltene echte Rassen ausgeblendet). "Rasselos" (im Spiel eine
  // echte Ausprägung, in der Datenbank meist als leeres Feld gespeichert)
  // zählt immer. Nachteil: steht bei EINEM Pferd fälschlich ein Pferdename
  // im breed-Feld, verdächtigt das alle Pferde mit einem Vorfahren dieses
  // Namens - die Diagnose am Ende der Liste (häufigste Auslöser, seltene
  // Rasse-Werte) macht so einen Fall sichtbar.
  const RARE_BREED_DIAGNOSTIC_LIMIT = 3;
  const breedCounts = new Map();
  for (const h of horses) {
    if (!h.breed) continue;
    const key = h.breed.trim().toLowerCase();
    breedCounts.set(key, (breedCounts.get(key) || 0) + 1);
  }
  const knownBreeds = new Set(['rasselos', ...breedCounts.keys()]);
  const rareBreedValues = [];
  for (const [key, count] of breedCounts) {
    if (count < RARE_BREED_DIAGNOSTIC_LIMIT) rareBreedValues.push(`${key} (${count})`);
  }

  // "Unbekannt" ist im Spiel/Parser die reguläre Platzhalter-Bezeichnung für
  // einen nicht erfassten Vorfahren (siehe parser.js parseHorseText) - dabei
  // wird laut Kommentar dort teils sogar "breed: mainBreed || 'Unbekannt'"
  // gesetzt, wenn auch die Rasse des Pferdes selbst unbekannt war. Ein
  // Vorfahre namens "Unbekannt" ist also grundsätzlich normal und NIE ein
  // Hinweis auf den Name/Rasse-Vertauschungs-Bug, unabhängig davon, ob
  // "unbekannt" zufällig in knownBreeds landet.
  const ANCESTOR_PLACEHOLDER_NAMES = new Set(['unbekannt']);

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
  const triggerCounts = new Map();
  for (const horse of horses) {
    const ancestors = pedigreeAuditAncestorsOf(horse.pedigree);
    const suspicious = ancestors.filter((a) => {
      if (!a?.name) return false;
      const name = a.name.trim().toLowerCase();
      return !ANCESTOR_PLACEHOLDER_NAMES.has(name) && knownBreeds.has(name);
    });
    if (!suspicious.length) continue;
    flaggedCount++;
    for (const a of new Set(suspicious.map((x) => x.name.trim()))) triggerCounts.set(a, (triggerCounts.get(a) || 0) + 1);
    logLine(linkedName(horse));
  }

  statusEl.textContent = `Fertig: ${horses.length} Pferde geprüft, ${flaggedCount} mit vermutlich vertauschtem Name/Rasse im Stammbaum.`;
  if (!flaggedCount) {
    logLine('Keine betroffenen Pferde gefunden.');
  }
  // Diagnose: welche Namen lösen die meisten Treffer aus? Taucht dort ein
  // normaler Pferdename mit sehr hoher Zahl auf, ist er vermutlich als
  // Rasse-Wert eines einzelnen Pferds in der Datenbank gelandet (siehe
  // den Rasse-Werten oben) statt ein echter Vertauschungsfall zu sein.
  const diagnostics = [];
  if (triggerCounts.size) {
    const top = [...triggerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, n]) => `${escapeHtml(name)} (${n})`).join(', ');
    diagnostics.push(`Häufigste auslösende Vorfahren-Namen (Anzahl betroffener Pferde): ${top}`);
  }
  if (rareBreedValues.length) {
    diagnostics.push(`Selten vorkommende Rasse-Werte (unter ${RARE_BREED_DIAGNOSTIC_LIMIT} Pferden, zählen trotzdem als Rasse - ggf. selbst fehlerhaft): ${rareBreedValues.map(escapeHtml).join(', ')}`);
  }
  if (diagnostics.length) {
    logLine(`<details><summary class="small muted">Diagnose</summary>${diagnostics.map((d) => `<p class="small muted">${d}</p>`).join('')}</details>`);
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
