// Parser für den kopierten Text einer Morning-Dust-Ranch Pferdeseite.
//
// Das Spiel liefert keine offizielle API/Export-Funktion. Dieser Parser
// arbeitet daher rein textbasiert (Label-Zeilen, Tab-getrennte Tabellenzeilen,
// Prozent-Paare) und ist bewusst tolerant statt strikt. Er ist "best effort":
// jedes Ergebnis wird dem Nutzer vor dem Speichern zur Kontrolle angezeigt,
// und der komplette Rohtext wird immer mit gespeichert (raw_text), damit
// nichts verloren geht, falls sich das Seitenlayout im Spiel mal ändert.

// Rasse-Kürzel, wie sie im Spiel teils statt des vollen Namens auftauchen
// (z.B. im Stammbaum oder wenn manuell so eingetragen) - werden überall,
// wo eine Rasse gesetzt wird, auf den ausgeschriebenen Namen normalisiert
// (siehe normalizeBreed), damit Anzeige UND Filterung (exakter Abgleich
// auf den gespeicherten Spaltenwert) konsistent den vollen Namen nutzen.
const BREED_ABBREVIATIONS = {
  APH: 'American Paint Horse',
  Knab: 'Knabstupper',
  Anda: 'Andalusier',
  Lusi: 'Lusitano',
  QH: 'Quarter Horse',
  DRP: 'Deutsches Reitpony',
};

function normalizeBreed(value) {
  if (!value) return value;
  const trimmed = value.trim();
  const abbrKey = Object.keys(BREED_ABBREVIATIONS).find((abbr) => abbr.toLowerCase() === trimmed.toLowerCase());
  return abbrKey ? BREED_ABBREVIATIONS[abbrKey] : trimmed;
}

// Bei nicht 100% reinrassigen Pferden zeigt das Spiel hinter der
// "Reinrassigkeit:"-Zeile optional eine Rasseanteile-Aufschlüsselung -
// aber nur, wenn "Rasseanteile anzeigen?" vorher im Spiel aufgeklappt
// wurde, bevor die Seite kopiert wurde. Je Zeile ein Prozentwert gefolgt
// von der jeweiligen Rasse, z.B. "50.00 % Knabstrupper".
function parseBreedComposition(lines) {
  const reinIdx = lines.findIndex((l) => /^Reinrassigkeit\s*:/i.test(l));
  if (reinIdx === -1) return null;

  const parts = [];
  for (let i = reinIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(/^([\d.,]+)\s*%\s+(.+)$/);
    if (!m) break;
    const pct = m[1].replace(',', '.');
    parts.push(`${pct}% ${normalizeBreed(m[2].trim())}`);
  }
  return parts.length ? parts.join(', ') : null;
}

function parseHorseText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);

  const result = {
    raw_text: rawText,
  };

  Object.assign(result, extractHeaderBlock(lines));

  // --- Einfache "Label: Wert" Zeilen ---
  setIf(result, 'coat_color', findValueForLabel(nonEmpty, 'Fellfarbe'));
  setIf(result, 'owner', findValueForLabel(nonEmpty, 'Besitzer'));

  const erbkrankheitStatus =
    findValueForLabel(nonEmpty, 'Testergebnis') || findValueForLabel(nonEmpty, 'Erbkrankheit');
  if (erbkrankheitStatus) {
    result.disease_free = /frei/i.test(erbkrankheitStatus);
  }

  // --- Papiere ---
  const rasse = findValueForLabel(nonEmpty, 'Rasse');
  if (rasse) result.breed = normalizeBreed(rasse);
  const reinrassigkeit = findValueForLabel(nonEmpty, 'Reinrassigkeit');
  if (reinrassigkeit) {
    const m = reinrassigkeit.match(/([\d.,]+)\s*%/);
    if (m) result.purebred_pct = parseFloat(m[1].replace(',', '.'));
  }
  const breedComposition = parseBreedComposition(lines);
  if (breedComposition) result.breed_composition = breedComposition;
  const zuchtzulassungLine = nonEmpty.find((l) => /^Zuchtzulassung\b/i.test(l));
  if (zuchtzulassungLine) {
    result.breeding_allowed = /ja/i.test(zuchtzulassungLine.replace(/^Zuchtzulassung/i, ''));
  }
  setIf(result, 'hlp_slp', findValueForLabel(nonEmpty, 'HLP/SLP'));

  // --- Zucht ---
  const icoVal = findValueForLabel(nonEmpty, 'ICO');
  if (icoVal) result.ico = parseFloat(icoVal.replace(',', '.').replace('%', '').trim());

  // --- Tabellen ---
  result.genetic_diseases = extractSimpleTable(lines, 'Erbkrankheiten', ['Farben']);
  result.colors = extractSimpleTable(lines, 'Farben', ['Exterieur']).filter(
    (r) => r.label !== 'Fellfarbe'
  );

  const exteriorGenetic = parseExteriorGenetics(lines);
  result.exterior_genetics = exteriorGenetic;

  result.exterior_descriptive = extractSimpleTable(lines, 'Körperbau', ['Interieur', 'Mentalität']);
  result.temperament = extractSimpleTable(lines, 'Mentalität', ['Modbox', 'Zucht', 'Nachkommen']);

  // Bei "Begabung"-Disziplinen zeigt die Seite zunächst nur eine Kategorie
  // (z.B. "Western") offen an, gefolgt von Trainingszustand/Turnierpotenzial;
  // die übrigen Kategorien folgen erst danach hinter "Alle Disziplinen
  // anzeigen?". Diese Zwischenzeilen enthalten keine Prozent-Paare und
  // werden vom Gruppen-Erkenner automatisch übersprungen.
  result.disciplines = extractDisciplineGroups(lines);
  result.traits = extractPercentGroupsByLabel(lines, 'Eigenschaften', 'Papiere');

  result.tournament_potential = parseTournamentPotential(lines);
  result.pedigree = parsePedigree(lines, result.breed);

  // Noch unbenannte Fohlen heißen im Spiel schlicht "Unbekannt" - damit
  // nicht mehrere Fohlen mit demselben Namen angelegt werden (siehe
  // Dopplungs-Erkennung beim Speichern), wird stattdessen ein Name aus
  // Besitzer und Eltern gebildet. Die ersten beiden Stammbaum-Einträge
  // sind laut Spiel immer Vater und Mutter in dieser Reihenfolge (siehe
  // parsePedigree/PEDIGREE_SECTION_LABELS: "Eltern des Vaters" kommt vor
  // "Eltern der Mutter").
  if (result.name === 'Unbekannt') {
    const ancestors = result.pedigree.ancestors || [];
    const vater = ancestors[0]?.name || 'Unbekannt';
    const mutter = ancestors[1]?.name || 'Unbekannt';
    const besitzer = result.owner || 'Unbekannt';
    result.name = `Fohlen_${besitzer}_${mutter}x${vater}`;
  }

  return result;
}

function setIf(obj, key, value) {
  if (value !== null && value !== undefined && value !== '') obj[key] = value;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sucht eine Zeile im Format "Label: Wert" (auch wenn danach noch Text auf
// derselben Zeile folgt, z.B. "Reinrassigkeit: 100.00 % Rasseanteile anzeigen?").
function findValueForLabel(nonEmptyLines, label) {
  const re = new RegExp('^' + escapeRegex(label) + '\\s*:\\s*(.+)$', 'i');
  for (const line of nonEmptyLines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// Name/Alter/Geschlecht/Rasse/Reinrassigkeit stehen ohne Label direkt
// übereinander, kurz vor dem Link "Zum Pferd". Anker ist die Alterszeile
// ("19 Jahre, 10 Monate").
function extractHeaderBlock(lines) {
  const ageIdx = lines.findIndex((l) => /^\d+\s*Jahre?(,\s*\d+\s*Monate?)?$/i.test(l));
  if (ageIdx === -1) return {};

  let nameIdx = ageIdx - 1;
  while (nameIdx >= 0 && !lines[nameIdx]) nameIdx--;

  const out = {};
  // Bei eigenen Pferden hängt das Spiel direkt (ohne Leerzeichen) einen
  // "Ändern?"-Link an den Namen an, z.B. "4Leafs Prisma Secret
  // RoyaltyÄndern?" - wird beim Auslesen des Namens entfernt.
  if (nameIdx >= 0) out.name = lines[nameIdx].replace(/Ändern\?\s*$/, '').trim();

  const genderLine = lines[ageIdx + 1];
  if (genderLine && /^(Stute|Hengst|Wallach|Hengstfohlen|Stutfohlen|Fohlen)$/i.test(genderLine)) {
    out.gender = genderLine;
  }
  const breedLine = lines[ageIdx + 2];
  if (breedLine) out.breed = normalizeBreed(breedLine);

  const purebredLine = lines[ageIdx + 3] || '';
  const pm = purebredLine.match(/([\d.,]+)\s*%\s*Reinrassig/i);
  if (pm) out.purebred_pct = parseFloat(pm[1].replace(',', '.'));

  return out;
}

// Extrahiert Tab- (oder Mehrfach-Leerzeichen-) getrennte "Label / Wert"
// Zeilen zwischen einer Start-Überschrift und einer der End-Überschriften.
function extractSimpleTable(lines, startLabel, endLabels) {
  const startIdx = lines.indexOf(startLabel);
  if (startIdx === -1) return [];
  const rows = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (endLabels.includes(line)) break;
    if (!line) continue;
    const parts = line.split(/\t+| {2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      rows.push({ label: parts[0], value: parts[1] });
    } else if (parts.length === 1 && rows.length > 0) {
      // z.B. eine weitere Überschrift ohne Tabellenzeile -> Tabelle beenden
      break;
    }
  }
  return rows;
}

// Jedes Körperteil hat einen Genotyp aus 16 Zeichen (2 Gruppen zu je 4
// zweistelligen Allel-Kürzeln, insgesamt 8+8 Buchstaben, getrennt durch
// "|"). Im Optimalfall sind die ersten 8 Buchstaben groß (H) und die
// letzten 8 klein (h) - gezählt wird, wie viele davon tatsächlich passen.
// Das entspricht genau der Punktzahl, die das Spiel selbst als "X/16"
// anzeigt (gegen mehrere echte Beispiele geprüft) - wird hier aber immer
// selbst berechnet, weil die mobile Kopiervariante des Spiels weder die
// einzelnen "X/16"-Werte noch die Gesamtzeile ("141/224 62.95%") enthält.
function computeExteriorScore(genotype) {
  const parts = (genotype || '').split('|').map((s) => s.replace(/\s+/g, ''));
  if (parts.length !== 2 || parts[0].length !== 8 || parts[1].length !== 8) return null;
  const front = [...parts[0]].filter((c) => c === 'H').length;
  const back = [...parts[1]].filter((c) => c === 'h').length;
  return front + back;
}

// Die genetische Exterieur-Tabelle hat 2-3 Spalten (Körperteil / Genotyp /
// ggf. die vom Spiel mitgelieferte Punktzahl - wird ignoriert, siehe oben).
function parseExteriorGenetics(lines) {
  const startIdx = lines.indexOf('Exterieur');
  if (startIdx === -1) return { rows: [], overall: null };
  const rows = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line === 'Leistung' || line === 'Körperbau' || line === 'Disziplin') break;
    if (/^\d+\/\d+\s+[\d.,]+\s*%$/.test(line)) continue; // vom Spiel mitgelieferte Gesamtzeile, wird selbst berechnet
    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[1].includes('|')) {
      rows.push({ label: parts[0], genotype: parts[1] });
    }
  }

  let totalScore = 0;
  let totalMax = 0;
  for (const row of rows) {
    const score = computeExteriorScore(row.genotype);
    if (score === null) continue;
    row.score = `${score}/16`;
    totalScore += score;
    totalMax += 16;
  }
  const overall = totalMax > 0
    ? { score: `${totalScore}/${totalMax}`, percent: Math.round((totalScore / totalMax) * 10000) / 100 }
    : null;

  return { rows, overall };
}

// Sucht die erste Zeile mit exaktem Wert ab einem Startindex, oder -1.
function findLineIndex(lines, label, fromIdx = 0) {
  for (let i = fromIdx; i < lines.length; i++) {
    if (lines[i] === label) return i;
  }
  return -1;
}

// Disziplinen und Eigenschaften bestehen aus Gruppen (z.B. "Western",
// "Grundlagen"): eine Zeile ohne folgende Prozentwerte ist eine Gruppen-
// überschrift, eine Zeile gefolgt von zwei "NN %" Zeilen ist ein Eintrag
// mit aktuellem Wert und Potenzial. Manche Einträge (z.B. Gangarten, die
// das Pferd noch nicht "kann", oder die über "Alle Disziplinen anzeigen?"
// nachgeladenen Kategorien) zeigt das Spiel dagegen nur mit einem
// einzigen Prozentwert (Potenzial) an - auch das wird hier erkannt, statt
// diese Einträge komplett zu verlieren.
function extractPercentGroups(lines, startIdx, endIdx) {
  const percentRe = /^\d+(\.\d+)?\s*%$/;
  const result = {};
  let currentGroup = null;

  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];
    if (!line) continue;
    const p1 = lines[i + 1];
    const p2 = lines[i + 2];
    if (p1 && percentRe.test(p1) && p2 && percentRe.test(p2)) {
      if (!currentGroup) currentGroup = 'Allgemein';
      (result[currentGroup] ||= []).push({ name: line, current: parseFloat(p1), potential: parseFloat(p2) });
      i += 2;
    } else if (p1 && percentRe.test(p1)) {
      if (!currentGroup) currentGroup = 'Allgemein';
      (result[currentGroup] ||= []).push({ name: line, current: null, potential: parseFloat(p1) });
      i += 1;
    } else {
      currentGroup = line;
    }
  }
  return result;
}

// Einfacher Fall (Eigenschaften): ein zusammenhängender Bereich zwischen
// zwei Überschriften, ohne Lücken dazwischen.
function extractPercentGroupsByLabel(lines, startLabel, endLabel) {
  const startIdx = lines.indexOf(startLabel);
  if (startIdx === -1) return {};
  const endIdxFound = findLineIndex(lines, endLabel, startIdx + 1);
  const endIdx = endIdxFound === -1 ? lines.length : endIdxFound;
  return extractPercentGroups(lines, startIdx + 1, endIdx);
}

// Disziplinen sind ein Sonderfall: das Spiel zeigt zunächst nur eine
// Kategorie (z.B. "Western") offen an, gefolgt von "Trainingszustand" und
// "Turnierpotenzial" (die einen eigenen Parser haben, s.u.
// parseTournamentPotential); die übrigen Kategorien folgen danach hinter
// "Alle Disziplinen anzeigen?". Der Trainingszustand/Turnierpotenzial-
// Block dazwischen wird hier bewusst übersprungen statt am Stück
// durchgescannt, da er selbst einzelne Prozentwerte enthält (z.B.
// "Fitness: 99 %"), die sonst fälschlich als Disziplinen-Einträge
// landen würden.
function extractDisciplineGroups(lines) {
  const startIdx = lines.indexOf('Disziplin');
  if (startIdx === -1) return {};
  const eigenschaftenIdx = findLineIndex(lines, 'Eigenschaften', startIdx + 1);
  const finalEndIdx = eigenschaftenIdx === -1 ? lines.length : eigenschaftenIdx;

  const trainingszustandIdx = findLineIndex(lines, 'Trainingszustand', startIdx + 1);
  const turnierpotenzialIdx = findLineIndex(lines, 'Turnierpotenzial', startIdx + 1);
  const junkCandidates = [trainingszustandIdx, turnierpotenzialIdx].filter((i) => i !== -1 && i < finalEndIdx);
  const junkStart = junkCandidates.length ? Math.min(...junkCandidates) : finalEndIdx;

  const showAllIdx = findLineIndex(lines, 'Alle Disziplinen anzeigen?', junkStart);
  const resumeIdx = showAllIdx !== -1 && showAllIdx < finalEndIdx ? showAllIdx + 1 : null;

  const result = extractPercentGroups(lines, startIdx + 1, junkStart);
  if (resumeIdx !== null) {
    const rest = extractPercentGroups(lines, resumeIdx, finalEndIdx);
    for (const [group, entries] of Object.entries(rest)) {
      result[group] = result[group] ? [...result[group], ...entries] : entries;
    }
  }
  return result;
}

function parseTournamentPotential(lines) {
  const startIdx = lines.indexOf('Turnierpotenzial');
  if (startIdx === -1) return {};
  const result = {};
  const knownLabels = ['Begabung', 'Disziplinen', 'Gesamtpotenzial', 'Grundlagen'];
  for (let i = startIdx + 1; i < Math.min(startIdx + 6, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split('\t');
    for (const part of parts) {
      const m = part.match(/^([^:]+):\s*(.+)$/);
      if (m && knownLabels.includes(m[1].trim())) {
        result[m[1].trim()] = m[2].trim();
      }
    }
    if (line === 'Erfahrung' && lines[i + 1] && /%$/.test(lines[i + 1])) {
      result['Erfahrung'] = lines[i + 1];
      break;
    }
  }
  return result;
}

// Beim Kopieren von der mobilen Ansicht liefert das Spiel (anders als am
// Desktop) benannte Abschnittsüberschriften für die Vorfahren, die erst
// nach Klick auf "Großeltern/Urgroßeltern anzeigen?" überhaupt im Text
// auftauchen. Diese Überschriften werden beim Einlesen übersprungen (siehe
// unten), damit sie nicht fälschlich als Pferdename interpretiert werden -
// die Vorfahren selbst werden aber unabhängig von der Kopierquelle
// (Handy/Desktop) einheitlich als einfache Reihenfolge in "ancestors"
// gespeichert, damit beide Varianten identisch abgelegt und dargestellt
// werden.
const PEDIGREE_SECTION_LABELS = new Set([
  'Eltern des Vaters',
  'Eltern der Mutter',
  'Eltern des Großvaters väterlicherseits',
  'Eltern der Großmutter väterlicherseits',
  'Eltern des Großvaters mütterlicherseits',
  'Eltern der Großmutter mütterlicherseits',
]);

function parsePedigree(lines, mainBreed) {
  // Anker ist "Besitzhistorie", nicht "Stammbaum": beim Kopieren von der
  // mobilen Ansicht fehlt die Überschrift "Stammbaum" komplett, während
  // "Besitzhistorie" in beiden Varianten unmittelbar davor steht. Steht
  // "Stammbaum" (Desktop-Navigationspunkt) kurz danach noch im Text, wird
  // es zusätzlich übersprungen, damit es nicht fälschlich als Pferdename
  // interpretiert wird.
  let startIdx = lines.indexOf('Besitzhistorie');
  if (startIdx === -1) {
    startIdx = lines.indexOf('Stammbaum');
    if (startIdx === -1) return { ancestors: [], sections: null };
  } else {
    for (let i = startIdx + 1; i < Math.min(startIdx + 4, lines.length); i++) {
      if (lines[i] === 'Stammbaum') { startIdx = i; break; }
    }
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i] === 'Exterieur' || lines[i] === 'Körperbau') {
      endIdx = i;
      break;
    }
  }
  const segment = lines.slice(startIdx + 1, endIdx).filter(Boolean);

  const ancestors = [];
  let current = null;
  let sawSelf = false;
  let lastEntry = null;

  for (const line of segment) {
    if (PEDIGREE_SECTION_LABELS.has(line)) {
      current = null;
      continue;
    }
    if (/anzeigen\?$/.test(line)) continue;

    const potMatch = line.match(/^Potential:\s*(\d+)$/);
    if (potMatch) {
      // "Potential: N" folgt erst NACH Name+Rasse, current wurde also
      // bereits übernommen - daher an den zuletzt hinzugefügten Eintrag
      // hängen, nicht an "current".
      if (lastEntry) lastEntry.potential = parseInt(potMatch[1], 10);
      continue;
    }
    if (/^Diff\.-GP Eltern:/.test(line)) continue;

    // "Unbekannt" steht für sich allein für EIN unbekanntes Pferd mit
    // derselben Rasse wie das Pferd selbst (ohne eigene Rasse-Zeile im
    // Text, anders als benannte Vorfahren). Taucht "Unbekannt" mehrfach
    // hintereinander auf, sind das ebenso viele eigenständige unbekannte
    // Vorfahren (z.B. beide Eltern eines Großelternteils unbekannt).
    //
    // Ausnahme: ist das Pferd SELBST noch unbenannt (ein Fohlen ohne
    // eigenen Namen, "sawSelf" also noch false), steht "Unbekannt" NICHT
    // für sich allein, sondern hat - anders als ein unbekannter Vorfahre -
    // trotzdem eine eigene Rasse-Zeile danach (z.B. "Unbekannt" gefolgt
    // von "American Paint Horse"). Würde man diese Zeile hier wie einen
    // unbekannten Vorfahren einfach überspringen, würde die nachfolgende
    // Rasse-Zeile fälschlich als NAME des ersten echten Vorfahren gelesen
    // und dadurch die Name/Rasse-Zuordnung alle nachfolgenden Vorfahren um
    // eine Zeile verschieben (Name und Rasse erscheinen dann vertauscht).
    if (line === 'Unbekannt' && !current) {
      if (!sawSelf) {
        current = { name: line };
        continue;
      }
      const entry = { name: 'Unbekannt', breed: mainBreed || 'Unbekannt' };
      ancestors.push(entry);
      lastEntry = entry;
      continue;
    }

    if (!current) {
      current = { name: line };
    } else if (!current.breed) {
      current.breed = normalizeBreed(line);
      if (!sawSelf) {
        // Der allererste vollständige Name+Rasse-Eintrag ist das Pferd
        // selbst, nicht sein Vorfahre.
        sawSelf = true;
      } else {
        ancestors.push(current);
      }
      lastEntry = current;
      current = null;
    }
  }

  return { ancestors, sections: null };
}

// --- Bewertungsskalen für Exterieur (Körperbau) und Interieur (Mentalität) ---
//
// Exterieur folgt einer symmetrischen 9-stufigen Skala um "exzellent" (Mitte)
// herum: exzellent=1, gut=2, passabel=3, "zu X"=4, "viel zu X"=5 (bzw.
// eigene Begriffe wie Speckhals/Hirschhals). Reihenfolge der Prüfung ist
// wichtig: spezifischere/extremere Begriffe zuerst, sonst würde z.B.
// "viel zu klein" schon bei der Prüfung auf "zu klein" (4) hängen bleiben.
const EXTERIOR_TERM_SCORES = [
  [/viel zu (klein|groß|tief|hoch|flach|steil|schmal|breit|kurz|lang|weich|hart)/i, 5],
  [/starker (unterbiss|überbiss|senkrücken|karpfenrücken)/i, 5],
  [/speckhals|hirschhals|zeheneng|zehenweit/i, 5],
  [/zu (klein|groß|tief|hoch|flach|steil|schmal|breit|kurz|lang|weich|hart)/i, 4],
  [/unterbiss|überbiss|senkrücken|karpfenrücken|schwanenhals|dicker hals|bodeneng|bodenweit/i, 4],
  [/passab/i, 3],
  [/exzellent/i, 1],
  [/\bgut/i, 2],
];

// Interieur: Exzellent=1, Gut=2, In Ordnung=3, Schlecht=4 (vom Nutzer vorgegeben).
const TEMPERAMENT_TERM_SCORES = [
  [/exzellent/i, 1],
  [/ordnung/i, 3],
  [/schlecht/i, 4],
  [/\bgut/i, 2],
];

function scoreTerm(text, table) {
  if (!text) return null;
  for (const [re, score] of table) {
    if (re.test(text)) return score;
  }
  return null;
}

function scoreExteriorTerm(text) {
  return scoreTerm(text, EXTERIOR_TERM_SCORES);
}

function scoreTemperamentTerm(text) {
  return scoreTerm(text, TEMPERAMENT_TERM_SCORES);
}

// Durchschnitt über eine Liste von {label, value}-Zeilen, anhand einer
// Bewertungsfunktion, die den Textwert in eine Zahl übersetzt. Zeilen, die
// sich keinem bekannten Begriff zuordnen lassen, werden ignoriert.
function averageScore(rows, scoreFn) {
  if (!rows || !rows.length) return null;
  const scores = rows.map((r) => scoreFn(r.value)).filter((s) => s !== null && s !== undefined);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Wandelt einen Bruch-Score wie "10/16" in einen Prozentwert um.
function fractionToPercent(scoreStr) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(scoreStr || '');
  if (!m) return null;
  return (parseInt(m[1], 10) / parseInt(m[2], 10)) * 100;
}

// Wenn ein Locus nicht getestet ist, lässt sich daraus trotzdem manchmal ein
// Mindestbestand ableiten - aus der sichtbaren Fellfarbe, aus der Notiz
// oder (nur bei Sooty) aus dem Namen. Nur eindeutige Begriffe werden
// ausgewertet - "Pinto" z.B. bleibt bewusst unberücksichtigt, da es für
// Overo, Splashed, Tobiano oder Sabino stehen kann und sich nicht sicher
// einem einzelnen Gen zuordnen lässt.
//
// Reihenfolge ist wichtig: spezifischere Begriffe zuerst, damit z.B.
// "Schwarzbraun"/"Wildbraun" nicht fälschlich die generische "Braun"-Regel
// auslösen, und "Varnish Roan" nicht als das separate cKit-Gen "Roan"
// erkannt wird. Jeder Treffer entfernt seinen Text aus der Arbeitskopie.
const PHENOTYPE_GENE_HINTS = [
  // Mehrwort-Kombinationsnamen IMMER zuerst prüfen, vor allen Basisfarben-/
  // Verdünnungs-Einzelmustern weiter unten - und innerhalb dieser Gruppe
  // immer die längeren/spezifischeren Namen vor den kürzeren, in denen sie
  // enthalten sind (z.B. "Sealbrown Cream Dun" vor "Sealbrown Cream" vor
  // "Sealbrown"). Sonst würde das kürzere Muster schon einen Teil des
  // Textes konsumieren, bevor die spezifischere Kombination geprüft wird,
  // und diese würde nie mehr (oder nur unvollständig) zutreffen.
  //
  // "Classic Dun" ist im Spiel doppeldeutig: in der einfachen
  // Aufhellungs-Tabelle steht es für Bay+Dun, in der Tabelle der
  // doppelten Aufhellungen dagegen für Black+Dun+Champagne. Da sich das
  // allein am Namen nicht unterscheiden lässt, wird hier bewusst nur Dun
  // abgeleitet (auf Nummer sicher) - Extension/Agouti/Champagne bleiben
  // offen und sollen stattdessen aus getesteten Loci bzw. der Notiz
  // kommen. Die eindeutigen 3-Wort-Varianten "Classic Dun Cream"/"Classic
  // Dun Pearl" (nur bei Basis Black dokumentiert) sind davon nicht
  // betroffen und werden vollständig aufgelöst.
  // "Gold" ist doppeldeutig: allein bzw. als "Gold Champagne" bedeutet es
  // Chestnut+Champagne (siehe unten), als "Gold Chestnut"/"Gold Bay" ist
  // es dagegen nur eine Schattierung (Helligkeitsstufe) OHNE Champagne -
  // diese beiden Faelle muessen daher zuerst abgefangen werden, sonst
  // wuerde faelschlich Champagne abgeleitet.
  { pattern: /\bgold chestnut\b/i, label: 'Gold Chestnut (Schattierung, keine Champagne)', hints: [] },
  { pattern: /\bgold bay\b/i, label: 'Gold Bay (Schattierung, keine Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },
  { pattern: /\bgold dun cream\b/i, label: 'Gold Dun Cream (Chestnut-Dun-Champagne-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun pearl\b/i, label: 'Gold Dun Pearl (Chestnut-Dun-Champagne-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bamber dun cream\b/i, label: 'Amber Dun Cream (Bay-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun pearl\b/i, label: 'Amber Dun Pearl (Bay-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsable dun cream\b/i, label: 'Sable Dun Cream (Sealbrown-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable dun pearl\b/i, label: 'Sable Dun Pearl (Sealbrown-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsealbrown cream dun\b/i, label: 'Sealbrown Cream Dun (Sealbrown-Dun-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bsealbrown cream champagne\b/i, label: 'Sealbrown Cream Champagne (Sealbrown-Champagne-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bclassic dun cream\b/i, label: 'Classic Dun Cream (Black-Dun-Champagne-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bclassic dun pearl\b/i, label: 'Classic Dun Pearl (Black-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsmoky brown dun\b/i, label: 'Smoky Brown Dun (Sealbrown-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream dun\b/i, label: 'Smoky Cream Dun (Black-Dun-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bpearl bay dun\b/i, label: 'Pearl Bay Dun (Bay-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl brown dun\b/i, label: 'Pearl Brown Dun (Sealbrown-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl black dun\b/i, label: 'Pearl Black Dun (Black-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bwild dunskin\b/i, label: 'Wild Dunskin (Wildbay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'Ap' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bsealbrown cream\b/i, label: 'Sealbrown Cream (Sealbrown-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bsmoky brown\b/i, label: 'Smoky Brown (Sealbrown-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky black\b/i, label: 'Smoky Black (Black-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream\b/i, label: 'Smoky Cream (Black-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bclassic dun\b/i, label: 'Classic Dun (Bay-Dun, mehrdeutig - siehe getestete Loci/Notiz)', hints: [{ locus: 'Dun', allele: 'D' }] },
  { pattern: /\bsmoky grulla\b/i, label: 'Smoky Grulla (Black-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bdunalino\b/i, label: 'Dunalino (Chestnut-Dun-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun\b/i, label: 'Gold Dun (Chestnut-Dun-Champagne)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold cream\b/i, label: 'Gold Cream (Chestnut-Champagne-Cream)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bapricot dun\b/i, label: 'Apricot Dun (Chestnut-Dun-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bgold pearl\b/i, label: 'Gold Pearl (Chestnut-Champagne-Pearl)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bcremello dun\b/i, label: 'Cremello Dun (Chestnut-Dun-doppel-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bcremello champagne\b/i, label: 'Cremello Champagne (Chestnut-Champagne-doppel-Cream)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bdunskin\b/i, label: 'Dunskin (Bay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun\b/i, label: 'Amber Dun (Bay-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber cream\b/i, label: 'Amber Cream (Bay-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  // Laut MDR-Doku wird derselbe Name ("Perlino Champagne") sowohl für die
  // Kombination mit doppeltem Cream als auch für Champagne+Pearl benutzt
  // (visuell kaum zu unterscheiden) - hier anhand der Beispielformel in
  // der Doku als Champagne+Pearl abgelegt.
  { pattern: /\bperlino champagne\b/i, label: 'Perlino Champagne (Bay-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsable dun\b/i, label: 'Sable Dun (Sealbrown-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bsable cream\b/i, label: 'Sable Cream (Sealbrown-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable pearl\b/i, label: 'Sable Pearl (Sealbrown-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bclassic cream\b/i, label: 'Classic Cream (Black-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bclassic pearl\b/i, label: 'Classic Pearl (Black-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },

  // Basisfarbe + Verdünnung: diese Namen setzen laut MDR-Farbvererbung
  // zwingend bestimmte Allele voraus.
  { pattern: /grulla/i, label: 'Grulla', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }] },
  { pattern: /wildbay|wildbraun/i, label: 'Wildbay', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'Ap' }] },
  { pattern: /sealbrown|schwarzbraun|\bbrown\b/i, label: 'Sealbrown/Brown', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }] },
  { pattern: /\b(bay|braun)\b/i, label: 'Bay', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },

  // Cream-Kombinationsnamen: einfache (Crcr) und doppelte (CrCr) Aufhellung
  // sind unterschiedliche Namen, daher je Basisfarbe eigene Einträge statt
  // sich auf das allgemeine "Cream"-Muster zu verlassen (das nur die
  // einfache Aufhellung abbildet).
  { pattern: /\bpalomino\b/i, label: 'Palomino (Chestnut-Cream)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bcremello\b/i, label: 'Cremello (Chestnut-doppel-Cream)', hints: [{ locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bbuckskin\b/i, label: 'Buckskin (Bay-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bperlino\b/i, label: 'Perlino (Bay-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /smoky/i, label: 'Smoky', hints: [{ locus: 'Cream', allele: 'Cr' }] },

  // Champagne-Kombinationsnamen: der Name kombiniert Basisfarbe +
  // Champagne, daher immer beide Loci mit ableiten. "Classic Dun" wird
  // oben bereits vorher abgefangen, sonst würde es hier fälschlich als
  // Champagne statt als Dun erkannt.
  { pattern: /\bsable\b/i, label: 'Sable (Sealbrown-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold\b/i, label: 'Gold (Chestnut-Champagne)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber\b/i, label: 'Amber (Bay-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bclassic\b/i, label: 'Classic (Black-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }] },

  // Muster, Scheckungen und sonstige Merkmale (volle Begriffe).
  { pattern: /varnish roan/i, label: 'Varnish Roan', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bchampagne\b/i, label: 'Champagne', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\broan\b/i, label: 'Roan', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\btobiano\b/i, label: 'Tobiano', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bsabino\b/i, label: 'Sabino', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bovero\b/i, label: 'Overo', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bsplashed\b/i, label: 'Splashed White', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bsilver\b/i, label: 'Silver', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Silver', allele: 'Z' }] },
  { pattern: /\bpangare\b/i, label: 'Pangare', hints: [{ locus: 'Pangare', allele: 'Pa' }] },
  { pattern: /\bdun\b/i, label: 'Dun', hints: [{ locus: 'Dun', allele: 'D' }] },
  { pattern: /\bcream\b/i, label: 'Cream', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  // Pearl zeigt sich sichtbar nur reinerbig (plpl) - wenn der Name also
  // "Pearl"/"Apricot" lautet, ist das Gen doppelt vorhanden, nicht nur
  // einfach getragen.
  { pattern: /\b(pearl|apricot)\b/i, label: 'Pearl', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /flaxentr[äa]ger/i, label: 'Flaxenträger', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bflaxen\b/i, label: 'Flaxen', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bsooty\b/i, label: 'Sooty', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brabicano\b/i, label: 'Rabicano', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
  { pattern: /\bgrey\b/i, label: 'Grey', hints: [{ locus: 'Grey', allele: 'G' }] },
  { pattern: /\b(leopard|fewspot|blanket|snowcap)\b/i, label: 'Leopard-Musterung', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },

  // Kurzkürzel, wie sie z.B. direkt in einer Notiz stehen könnten (z.B.
  // "SPL" oder "SB" statt der vollen Wörter). Groß-/Kleinschreibung wird
  // ignoriert (Notizen werden oft locker/klein getippt) - nur als
  // eigenständiges Wort (\b), um Zufallstreffer in normalem Fließtext zu
  // vermeiden. Die Kürzel selbst sind keine echten deutschen Wörter, daher
  // ist das Risiko von Fehltreffern auch ohne Groß-/Kleinschreibung gering.
  // Doppelt geschriebene Kürzel (z.B. "SPLSPL" statt "SPL") bedeuten
  // reinerbig/homozygot - werden vor dem jeweiligen Einzel-Kürzel geprüft
  // und mit dem doppelten Wert selbst als Allel-Anzeige abgelegt (analog
  // zum bereits bestehenden "plpl"/"flfl").
  { pattern: /\bSPLSPL\b/i, label: 'Splashed White homozygot (Kürzel)', hints: [{ locus: 'Splashed', allele: 'SPLSPL' }] },
  { pattern: /\bSBSB\b/i, label: 'Sabino homozygot (Kürzel)', hints: [{ locus: 'KIT', allele: 'SbSb' }] },
  { pattern: /\bTOTO\b/i, label: 'Tobiano homozygot (Kürzel)', hints: [{ locus: 'KIT', allele: 'ToTo' }] },
  { pattern: /\bRNRN\b/i, label: 'Roan homozygot (Kürzel)', hints: [{ locus: 'KIT', allele: 'RnRn' }] },
  { pattern: /\bCHCH\b/i, label: 'Champagne homozygot (Kürzel)', hints: [{ locus: 'Champagne', allele: 'ChCh' }] },
  { pattern: /\bCRCR\b/i, label: 'Cream homozygot (Kürzel)', hints: [{ locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bLPLP\b/i, label: 'Appaloosa homozygot (Kürzel)', hints: [{ locus: 'Appaloosa', allele: 'LpLp' }] },
  { pattern: /\bSTYSTY\b/i, label: 'Sooty homozygot (Kürzel)', hints: [{ locus: 'Sooty', allele: 'stysty' }] },
  { pattern: /\bRCRC\b/i, label: 'Rabicano homozygot (Kürzel)', hints: [{ locus: 'Rabicano', allele: 'rcrc' }] },

  { pattern: /\bSPL\b/i, label: 'Splashed White (Kürzel)', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bSB\b/i, label: 'Sabino (Kürzel)', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bTo\b/i, label: 'Tobiano (Kürzel)', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bRn\b/i, label: 'Roan (Kürzel)', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\bCh\b/i, label: 'Champagne (Kürzel)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bCr\b/i, label: 'Cream (Kürzel)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bLp\b/i, label: 'Appaloosa (Kürzel)', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  // Kein doppeltes "OO"-Kürzel: Overo ist reinerbig dominant letal (siehe
  // MDR-Doku), ein lebendes Pferd kann also nie OO sein.
  { pattern: /\bO\b/i, label: 'Overo (Kürzel)', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bplpl\b/i, label: 'Pearl (Kürzel)', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpl\b/i, label: 'Pearl (Kürzel)', hints: [{ locus: 'Cream', allele: 'pl' }] },
  { pattern: /\bflfl\b/i, label: 'Flaxen (Kürzel)', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bfl\b/i, label: 'Flaxen (Kürzel)', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bsty\b/i, label: 'Sooty (Kürzel)', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brc\b/i, label: 'Rabicano (Kürzel)', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
];

// Verneinungen wie "Kein Ch", "keine Overo", "nicht Champagne" sollen NICHT
// als vorhandenes Gen gewertet werden - das direkt folgende Wort wird
// deshalb vorab aus dem Arbeitstext entfernt, bevor die eigentlichen
// Muster unten geprüft werden (sonst würde z.B. "Kein Ch" trotzdem das
// Champagne-Kürzel "Ch" auslösen, da \bCh\b auch innerhalb der Notiz
// zuschlägt).
function stripNegatedPhrases(text) {
  return text.replace(/\b(kein|keine|keinen|nicht|ohne)\b\s+[\wäöüßÄÖÜ-]+/gi, ' ');
}

// Gibt eine Liste { locus, allele, label } aller aus dem Text eindeutig
// ableitbaren Merkmale zurück. Bereits erkannte Textstellen werden aus der
// Arbeitskopie entfernt, damit z.B. "Schwarzbraun" nicht zusätzlich das
// separate "Braun"-Muster auslöst.
function inferGeneticHintsFromPhenotype(text) {
  if (!text) return [];
  let working = stripNegatedPhrases(text);
  const hints = [];
  for (const { pattern, hints: entryHints, label } of PHENOTYPE_GENE_HINTS) {
    if (pattern.test(working)) {
      for (const h of entryHints) hints.push({ locus: h.locus, allele: h.allele, label });
      working = working.replace(pattern, ' ');
    }
  }
  return hints;
}

function isUntestedLocusValue(value) {
  return /nicht getestet/i.test(value || '');
}

// Zerlegt einen Locus-Rohwert (zwei gleich lange Allel-Tokens) und behält
// nur die "vorhandenen" Allele: großgeschrieben = vorhanden, klein = nicht
// vorhanden. Ausnahme: "pl" (Pearl) gilt immer als vorhanden, obwohl es
// klein geschrieben ist - es ist kein rezessives Gegenstück zu einem
// Großbuchstaben, sondern das eigentliche Allel-Kürzel selbst. Nicht zu
// verwechseln mit "lp" (Appaloosa/Leopard), das weiterhin als "nicht
// vorhanden" gilt, wenn es klein geschrieben ist.
function extractPresentAlleles(rawValue) {
  if (!rawValue || isUntestedLocusValue(rawValue)) return '';
  const half = rawValue.length / 2;
  const tokens = Number.isInteger(half) ? [rawValue.slice(0, half), rawValue.slice(half)] : [rawValue];
  return tokens.filter((t) => t === 'pl' || /[A-Z]/.test(t)).join('');
}

// Ein getesteter Locus ist reinerbig für das vorhandene Allel, wenn BEIDE
// Hälften "vorhanden" sind (z.B. "EE", "ChCh", "SPLSPL") - so ein Locus
// wird garantiert an jedes Nachkommen weitervererbt (mind. eine Kopie),
// unabhängig vom zweiten Elternteil. Wird genutzt, um vom Elternteil auf
// ein noch nicht vollständig getestetes Fohlen zu schließen (siehe
// homozygousPresentHints/presentGenesSummary).
function isHomozygousPresent(rawValue) {
  if (!rawValue || isUntestedLocusValue(rawValue)) return false;
  const half = rawValue.length / 2;
  if (!Number.isInteger(half)) return false;
  const tokens = [rawValue.slice(0, half), rawValue.slice(half)];
  return tokens.every((t) => t === 'pl' || /[A-Z]/.test(t));
}

// Liefert für jeden getesteten, reinerbig-vorhandenen Locus eines Pferdes
// {locus, alleles} - z.B. für ein Elternteil mit getesteter Farbgenetik,
// um daraus auf ein Fohlen zu schließen.
function homozygousPresentHints(colorRows) {
  return (colorRows || [])
    .filter((r) => isHomozygousPresent(r.value))
    .map((r) => ({ locus: r.label, alleles: extractPresentAlleles(r.value) }));
}

// Erkennt, ob ein Allel-Anzeigewert (egal ob getestet oder abgeleitet,
// z.B. "DD", "plpl", "SPLSPL") reinerbig/doppelt ist, also aus zwei
// identischen Hälften besteht. Wird genutzt, um aus presentGenesSummary
// eines Elternteils (bestätigte UND abgeleitete Gene) die Loci
// herauszufiltern, die garantiert an ein Fohlen weitervererbt werden.
function isDoubledAllele(alleleStr) {
  if (!alleleStr) return false;
  const half = alleleStr.length / 2;
  if (!Number.isInteger(half) || half < 1) return false;
  return alleleStr.slice(0, half) === alleleStr.slice(half);
}

// Halbiert ein reinerbiges Allel (z.B. "DD" -> "D", "plpl" -> "pl") - ein
// einzelnes Allel eines reinerbigen Elternteils, das garantiert (zu 100%)
// weitervererbt wird, aber beim Fohlen für sich allein nur eine einzelne
// Kopie (mischerbig) bedeutet, solange nicht auch der zweite Elternteil
// dasselbe Allel reinerbig trägt (siehe parentColorHints in horseForm.js).
function halveDoubledAllele(alleleStr) {
  return alleleStr.slice(0, alleleStr.length / 2);
}

// Der erste Eintrag im Stammbaum ist immer das Pferd selbst. Die restlichen
// Vorfahren stehen in der Reihenfolge des kopierten Texts; bei einem
// vollständigen 3-Generationen-Stammbaum sind das 2 Eltern, 4 Großeltern
// und 8 Urgroßeltern (2+4+8=14) - diese Reihenfolge (statt z.B. Sire-Linie
// zuerst komplett durch) passt auch zu den im Text mitgelieferten
// Potenzial-Werten, die nur für die ersten 6 Vorfahren (Eltern+Großeltern)
// angegeben werden. Eine Baumstruktur (wer ist Vater/Mutter von wem) lässt
// sich aus dem Text ohne Einrückung trotzdem nicht ableiten.
function hasPedigreeData(pedigree) {
  if (!pedigree) return false;
  if (Array.isArray(pedigree)) return pedigree.length > 0;
  return (pedigree.ancestors?.length > 0) || (pedigree.sections && Object.keys(pedigree.sections).length > 0);
}

// Ein vollständig ausgelesenes Pferd hat 7 Disziplin-Kategorien mit je 4
// Einzeldisziplinen (Western wird zuerst offen angezeigt, die übrigen 6
// erst hinter "Alle Disziplinen anzeigen?" - siehe extractDisciplineGroups).
// Fehlt eine Kategorie ganz oder hat sie weniger als 4 Einträge, war das
// Auslesen unvollständig (z.B. weil "Alle Disziplinen anzeigen?" im Spiel
// nicht angeklickt und der zusätzliche Text daher nicht mitkopiert wurde).
const EXPECTED_DISCIPLINE_COUNTS = {
  Western: 4, Englisch: 4, Rennen: 4, Rodeo: 4, Fahren: 4, Barock: 4, Mehrgang: 4,
};

function hasAllDisciplines(disciplines) {
  if (!disciplines) return false;
  return Object.entries(EXPECTED_DISCIPLINE_COUNTS)
    .every(([category, count]) => (disciplines[category]?.length || 0) >= count);
}

// Kurz-Labels für Daten, die typischerweise fehlen, wenn beim Kopieren aus
// dem Spiel etwas nicht mit erfasst wurde (z.B. weil nicht die ganze Seite
// markiert wurde) - wird sowohl beim Speichern (horseForm.js, ausführliche
// Hinweistexte) als auch in der Übersicht (list.js, Hinweis-Banner über
// den Filtern) genutzt.
function missingDataLabels(horse) {
  const missing = [];
  if (horse.exterior_genetics?.overall?.percent == null) missing.push('Ext%');
  if (!hasPedigreeData(horse.pedigree)) missing.push('Stammbaum');
  if (
    !horse.tournament_potential?.Gesamtpotenzial
    || !horse.tournament_potential?.Begabung
    || !hasAllDisciplines(horse.disciplines)
  ) {
    missing.push('Turnierwerte');
  }
  // Ist ein Pferd laut Reinrassigkeit-Wert nicht zu 100% reinrassig,
  // hätte das Spiel eigentlich eine Rasseanteile-Aufschlüsselung
  // anzubieten gehabt ("Rasseanteile anzeigen?", siehe parser.js
  // extractHeaderBlock) - die aber beim Kopieren nur mitkommt, wenn sie
  // vorher im Spiel aufgeklappt wurde. Das gilt unabhängig davon, ob
  // (zusätzlich zu den Anteilen) eine Haupt-Rasse eingetragen ist.
  if (horse.purebred_pct != null && horse.purebred_pct < 100 && !horse.breed_composition) {
    missing.push('Rasseanteile');
  }
  return missing;
}

// "Pinto" heißt laut MDR-Farbvererbung, dass mindestens 2 der 4
// Scheckungs-Muster (SB/Sabino, SPL/Splashed, O/Overo, To/Tobiano)
// gleichzeitig vorhanden sind - welche genau, lässt sich aus dem Namen
// allein nicht sicher sagen. Sind aber bei den Eltern (zusammen) genau 2
// dieser 4 Muster getestet vorhanden, muss ein als "Pinto" bezeichnetes
// Fohlen (das die Scheckung ja sichtbar zeigt) genau diese 2 geerbt
// haben, da im Genpool der Eltern keine anderen zur Auswahl stehen.
function pintoPatternsFromColors(colorRows) {
  const found = new Set();
  for (const r of colorRows || []) {
    if (isUntestedLocusValue(r.value)) continue;
    const present = extractPresentAlleles(r.value);
    if (!present) continue;
    if (r.label === 'Splashed') found.add('SPL');
    else if (r.label === 'Overo') found.add('O');
    else if (r.label === 'KIT') {
      // Anders als bei den übrigen Loci steht Tobiano/Sabino im
      // Rohwert tatsächlich in Großbuchstaben ("TO"/"SB"), nicht in der
      // gemischt geschriebenen Kürzel-Konvention ("To"/"Sb"), die nur für
      // die abgeleiteten Namens-Hinweise verwendet wird.
      if (present.includes('TO')) found.add('TO');
      if (present.includes('SB')) found.add('SB');
    }
  }
  return found;
}

const PINTO_ALLELE_LOCUS = { SPL: 'Splashed', O: 'Overo', TO: 'KIT', SB: 'KIT' };

// Manuelle Gen-Bestätigung je Locus (siehe colorGeneticsHtml/
// geneOverrideBadge und den Klick-Handler in horseForm.js) - Klick-Zyklus:
// unbekannt (kein Eintrag) -> 1x vorhanden -> 2x vorhanden (reinerbig) ->
// nicht vorhanden -> zurück zu unbekannt.
const LOCUS_PRIMARY_ALLELE = {
  Extension: 'E', Dun: 'D', Champagne: 'Ch', Grey: 'G', Silver: 'Z',
  Overo: 'O', Splashed: 'SPL', Appaloosa: 'Lp', PATN1: 'P1',
  Flaxen: 'fl',
};

// Loci mit mehreren unabhängigen Allelen/Merkmalen statt einem einzigen
// eindeutigen Code (Gegenstück zu LOCUS_PRIMARY_ALLELE) - hier gibt es
// pro Allel einen eigenen Klick-Button. Der Override-Schlüssel ist dann
// nicht der bloße Locus-Name, sondern "Locus:Allel" (z.B. "KIT:To"),
// siehe geneOverrideBadge/colorGeneticsHtml. Cream traegt sowohl Cr
// (Cream-Aufhellung) als auch pl (Pearl, geteilter Locus, siehe
// PHENOTYPE_GENE_HINTS) - beide unabhaengig voneinander bestaetigbar.
const LOCUS_MULTI_ALLELES = {
  KIT: ['To', 'Sb', 'Rn'],
  Agouti: ['A1', 'At', 'Ap'],
  Cream: ['Cr', 'pl'],
};

// Overo ist laut MDR-Doku reinerbig dominant letal (siehe
// PHENOTYPE_GENE_HINTS oben) - "2x vorhanden" wird für diesen Locus daher
// aus dem Klick-Zyklus ausgelassen (nur 1x <-> nicht vorhanden möglich).
const OVERRIDE_STATE_ORDER_DEFAULT = ['het', 'hom', 'absent'];
const OVERRIDE_STATE_ORDER_NO_HOM = ['het', 'absent'];

// Override-Schlüssel sind entweder ein bloßer Locus-Name ("Champagne")
// oder "Locus:Allel" ("KIT:To", siehe LOCUS_MULTI_ALLELES) - dieser Helfer
// liefert in beiden Fällen den reinen Locus-Namen davor.
function localeOfOverrideKey(key) {
  return key.split(':')[0];
}

function overrideStateOrder(key) {
  return localeOfOverrideKey(key) === 'Overo' ? OVERRIDE_STATE_ORDER_NO_HOM : OVERRIDE_STATE_ORDER_DEFAULT;
}

// Naechster Zustand im Klick-Zyklus (siehe overrideStateOrder) - "null"
// steht dabei für "unbekannt" (kein manueller Eintrag), sowohl als
// Start- als auch als Endpunkt des Zyklus.
function nextOverrideState(key, current) {
  const order = overrideStateOrder(key);
  const idx = order.indexOf(current);
  const nextIdx = idx + 1;
  return nextIdx >= order.length ? null : order[nextIdx];
}

// Die 10 im Spiel testbaren Erbkrankheiten (siehe extractSimpleTable
// 'Erbkrankheiten') - anders als bei der Farbgenetik sind hier
// normalerweise ALLE Krankheiten getestet (Rohwerte wie "NN/NN"); fehlt
// eine davon trotzdem im Array (z.B. bei einem noch nicht beim Tierarzt
// getesteten Fohlen), zeigt horseForm.js/diseaseTableHtml dafür eine
// eigene "Nicht getestet"-Zeile mit Klick-Button (gleicher Mechanismus
// wie bei den Farbgenetik-Loci: unbekannt -> Träger -> betroffen -> frei
// -> zurück zu unbekannt, siehe nextOverrideState).
const KNOWN_DISEASE_CODES = ['CA', 'HERDA', 'PSSM', 'EMH', 'ASD', 'HYPP', 'LFS', 'SCID', 'GBED', 'JEB'];

// Fasst alle tatsächlich vorhandenen Gene eines Pferdes zusammen: zuerst
// aus getesteten Loci (siehe extractPresentAlleles), dann - nur für Loci,
// die nicht getestet wurden (bzw. die es als Locus gar nicht gibt, wie
// Sooty/Flaxen) - manuelle Bestätigungen (overrides, siehe
// LOCUS_PRIMARY_ALLELE) mit Vorrang, sonst Hinweise im Fellfarbe-Namen, in
// der Notiz, im Pferdenamen (siehe inferGeneticHintsFromPhenotype) und
// optional aus reinerbig-vorhandenen Loci der Eltern (parentHints, siehe
// homozygousPresentHints - wird von horseForm.js anhand des Stammbaums
// befüllt, falls Vater/Mutter in der Datenbank stehen).
function presentGenesSummary(colorRows, coatColorName, notes, horseName, parentHints, overrides) {
  const rows = colorRows || [];
  const confirmed = [];
  const testedLoci = new Set();
  const ov = overrides || {};

  for (const r of rows) {
    if (isUntestedLocusValue(r.value)) continue;
    testedLoci.add(r.label);
    const alleles = extractPresentAlleles(r.value);
    if (alleles) confirmed.push({ locus: r.label, alleles, source: 'getestet' });
  }

  // Manuell bestätigte (oder als "nicht vorhanden" markierte) Loci/Allele
  // überstimmen die automatisch abgeleiteten Hinweise unten - bei
  // getesteten Loci wird ein Override ignoriert (der Rohwert bleibt
  // maßgeblich). Bei Loci mit mehreren Allelen (LOCUS_MULTI_ALLELES)
  // betrifft das nur das jeweils überschriebene Allel, nicht den ganzen
  // Locus - andere Allele desselben Locus bleiben von der automatischen
  // Ableitung unberührt.
  const overriddenKeys = new Set(Object.keys(ov).filter((k) => ov[k] && !testedLoci.has(localeOfOverrideKey(k))));
  const manual = [];
  for (const key of overriddenKeys) {
    const state = ov[key];
    const locus = localeOfOverrideKey(key);
    const primary = key.includes(':') ? key.split(':')[1] : LOCUS_PRIMARY_ALLELE[key];
    if (!primary || state === 'absent') continue;
    const alleleCode = state === 'hom' ? primary + primary : primary;
    manual.push({ locus, alleles: alleleCode, source: 'manuell' });
  }

  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...inferGeneticHintsFromPhenotype(notes).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...inferGeneticHintsFromPhenotype(horseName).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...(parentHints || []).map((h) => ({ locus: h.locus, allele: h.alleles, source: 'elternteil' })),
  ];
  const seen = new Set();
  const inferred = [];
  for (const h of hints) {
    if (testedLoci.has(h.locus)) continue;
    const hKey = LOCUS_MULTI_ALLELES[h.locus] ? `${h.locus}:${h.allele}` : h.locus;
    if (overriddenKeys.has(hKey)) continue;
    const key = h.locus + h.allele;
    if (seen.has(key)) continue;
    seen.add(key);
    inferred.push({ locus: h.locus, alleles: h.allele, source: h.source });
  }

  return [...confirmed, ...manual, ...inferred];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHorseText };
}
