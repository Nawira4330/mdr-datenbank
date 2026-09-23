// Read-only Audit (Verwaltung): listet für JEDES Pferd, das aktuell
// sichtbar reinerbig (Flaxen: "flfl" bzw. Pearl: "plpl") angezeigt wird,
// die genaue Quelle dieser Einstufung auf - Nutzerwunsch: "wir haben ganz
// viele Pferde mit flfl, die aber kein Flaxen im Namen haben - überprüfe,
// ob diese unter ihrer Farbe wirklich Flaxen sind oder nur Träger."
//
// Seit dem "Pearl Mirrow"-Fix (Name wird nicht mehr durchsucht, siehe
// presentGenesSummary in parser.js) kann "flfl"/"plpl" nur noch aus VIER
// Quellen kommen (siehe RECESSIVE_CARRIER_TRAITS/presentGenesSummary):
//  - getestet: ein echter Spiel-Testwert (zuverlässig)
//  - manuell: bewusst vom Nutzer per Klick-Button auf "2x vorhanden"
//    bestätigt (zuverlässig)
//  - abgeleitet AUS DER EIGENEN FELLFARBE: laut Spielregel zeigt das
//    Spiel "Flaxen"/"Pearl" im Farbnamen nur bei tatsächlich reinerbigen
//    Pferden (zuverlässig)
//  - abgeleitet AUS DER EIGENEN NOTIZ: Freitext - könnte theoretisch auch
//    von einem Elternteil/anderen Pferd handeln (z.B. "Vater war
//    Flaxenträger") und fälschlich als eigenes Merkmal gelesen werden
//    (RISIKO, wird hier markiert)
//  - elternteil: nur möglich, wenn BEIDE Eltern für denselben Locus
//    bereits bestätigt reinerbig sind (parentColorHints verdoppelt nur in
//    diesem Fall) - garantierte Vererbung, zuverlässig.
//
// Macht KEINE Änderungen an der Datenbank - reine Liste zum manuellen
// Durchsehen. Läuft automatisch beim Öffnen dieser Seite.
async function runCarrierAudit() {
  const statusEl = document.getElementById('carrier-audit-status');
  const logList = document.getElementById('carrier-audit-log');
  logList.innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, name, colors, coat_color, notes, color_gene_overrides'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  function logLine(text, warn) {
    const li = document.createElement('li');
    li.textContent = text;
    if (warn) li.style.color = '#b91c1c';
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
  }

  let checkedCount = 0;
  let flaggedCount = 0;

  for (let i = 0; i < horses.length; i++) {
    const horse = horses[i];
    statusEl.textContent = `${i + 1}/${horses.length} geprüft…`;

    for (const trait of RECESSIVE_CARRIER_TRAITS) {
      const finalGenes = presentGenesSummary(horse.colors, horse.coat_color, horse.notes, horse.name, null, horse.color_gene_overrides);
      const shown = finalGenes.find((g) => g.locus === trait.locus && g.alleles === trait.homAllele);
      if (!shown) continue;
      checkedCount++;

      if (shown.source === 'getestet') {
        logLine(`✅ ${horse.name} (${trait.label}): echter Spiel-Testwert.`);
        continue;
      }
      if (shown.source === 'manuell') {
        logLine(`✅ ${horse.name} (${trait.label}): manuell als reinerbig bestätigt (2x vorhanden).`);
        continue;
      }
      if (shown.source === 'elternteil') {
        logLine(`✅ ${horse.name} (${trait.label}): beide Eltern bestätigt reinerbig (garantierte Vererbung).`);
        continue;
      }

      // source === 'abgeleitet' - Fellfarbe und Notiz getrennt prüfen,
      // welche der beiden den Hinweis tatsächlich ausgelöst hat.
      const fromColor = inferGeneticHintsFromPhenotype(horse.coat_color).some((h) => h.locus === trait.locus && h.allele === trait.homAllele);
      const fromNotes = inferGeneticHintsFromPhenotype(horse.notes).some((h) => h.locus === trait.locus && h.allele === trait.homAllele);
      if (fromColor) {
        logLine(`✅ ${horse.name} (${trait.label}): eigene Fellfarbe „${horse.coat_color}" enthält „${trait.label}".`);
      } else if (fromNotes) {
        flaggedCount++;
        logLine(`⚠️ ${horse.name} (${trait.label}): NUR aus eigener Notiz abgeleitet („${horse.notes}") - bitte prüfen, ob die Notiz wirklich DIESES Pferd beschreibt.`, true);
      } else {
        flaggedCount++;
        logLine(`⚠️ ${horse.name} (${trait.label}): reinerbig angezeigt, Quelle unklar - bitte manuell prüfen.`, true);
      }
    }
  }

  statusEl.textContent = `Fertig: ${checkedCount} reinerbige Einträge (Flaxen/Pearl) geprüft, ${flaggedCount} davon mit unsicherer Quelle markiert (⚠️ in der Liste).`;
  if (!checkedCount) {
    logLine('Aktuell zeigt kein Pferd Flaxen oder Pearl reinerbig an.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session || !isAdminSession(session)) return;

  const startBtn = document.getElementById('carrier-audit-start-btn');
  async function runAndToggle() {
    startBtn.disabled = true;
    try {
      await runCarrierAudit();
    } finally {
      startBtn.disabled = false;
    }
  }
  startBtn.addEventListener('click', runAndToggle);
  runAndToggle();
});
