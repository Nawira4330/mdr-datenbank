// Parser für den kopierten Text einer Morning-Dust-Ranch Pferdeseite.
//
// Das Spiel liefert keine offizielle API/Export-Funktion. Dieser Parser
// arbeitet daher rein textbasiert (Label-Zeilen, Tab-getrennte Tabellenzeilen,
// Prozent-Paare) und ist bewusst tolerant statt strikt. Er ist "best effort":
// jedes Ergebnis wird dem Nutzer vor dem Speichern zur Kontrolle angezeigt,
// und der komplette Rohtext wird immer mit gespeichert (raw_text), damit
// nichts verloren geht, falls sich das Seitenlayout im Spiel mal ändert.

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
  if (rasse) result.breed = rasse;
  const reinrassigkeit = findValueForLabel(nonEmpty, 'Reinrassigkeit');
  if (reinrassigkeit) {
    const m = reinrassigkeit.match(/([\d.,]+)\s*%/);
    if (m) result.purebred_pct = parseFloat(m[1].replace(',', '.'));
  }
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
  result.disciplines = extractPercentGroups(lines, 'Disziplin', 'Eigenschaften');
  result.traits = extractPercentGroups(lines, 'Eigenschaften', 'Papiere');

  result.tournament_potential = parseTournamentPotential(lines);
  result.pedigree = parsePedigree(lines, result.breed);

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
  if (nameIdx >= 0) out.name = lines[nameIdx];

  const genderLine = lines[ageIdx + 1];
  if (genderLine && /^(Stute|Hengst|Wallach|Hengstfohlen|Stutfohlen|Fohlen)$/i.test(genderLine)) {
    out.gender = genderLine;
  }
  const breedLine = lines[ageIdx + 2];
  if (breedLine) out.breed = breedLine;

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

// Disziplinen und Eigenschaften bestehen aus Gruppen (z.B. "Western",
// "Grundlagen"): eine Zeile ohne folgende Prozentwerte ist eine Gruppen-
// überschrift, eine Zeile gefolgt von zwei "NN %" Zeilen ist ein Eintrag
// (aktueller Wert / Potenzial).
function extractPercentGroups(lines, startLabel, endLabel) {
  const startIdx = lines.indexOf(startLabel);
  if (startIdx === -1) return {};
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i] === endLabel) {
      endIdx = i;
      break;
    }
  }

  const percentRe = /^\d+(\.\d+)?\s*%$/;
  const result = {};
  let currentGroup = null;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line) continue;
    const p1 = lines[i + 1];
    const p2 = lines[i + 2];
    if (p1 && p2 && percentRe.test(p1) && percentRe.test(p2)) {
      if (!currentGroup) currentGroup = 'Allgemein';
      if (!result[currentGroup]) result[currentGroup] = [];
      result[currentGroup].push({
        name: line,
        current: parseFloat(p1),
        potential: parseFloat(p2),
      });
      i += 2;
    } else {
      currentGroup = line;
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
    if (line === 'Unbekannt' && !current) {
      if (sawSelf) {
        const entry = { name: 'Unbekannt', breed: mainBreed || 'Unbekannt' };
        ancestors.push(entry);
        lastEntry = entry;
      }
      continue;
    }

    if (!current) {
      current = { name: line };
    } else if (!current.breed) {
      current.breed = line;
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
  // Basisfarbe + Verdünnung: diese Namen setzen laut MDR-Farbvererbung
  // zwingend bestimmte Allele voraus.
  { pattern: /grulla/i, label: 'Grulla', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }] },
  { pattern: /wildbay|wildbraun/i, label: 'Wildbay', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'Ap' }] },
  { pattern: /sealbrown|schwarzbraun/i, label: 'Sealbrown', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }] },
  { pattern: /\b(bay|braun|brown)\b/i, label: 'Bay/Brown', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },
  { pattern: /\b(perlino|buckskin)\b/i, label: 'Perlino/Buckskin', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },
  { pattern: /smoky/i, label: 'Smoky', hints: [{ locus: 'Cream', allele: 'Cr' }] },

  // Muster, Scheckungen und sonstige Merkmale (volle Begriffe).
  { pattern: /varnish roan/i, label: 'Varnish Roan', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bchampagne\b/i, label: 'Champagne', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\broan\b/i, label: 'Roan', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\btobiano\b/i, label: 'Tobiano', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bsabino\b/i, label: 'Sabino', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bovero\b/i, label: 'Overo', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bsplashed\b/i, label: 'Splashed White', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
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
  // "SPL" oder "SB" statt der vollen Wörter). Bewusst GROSS-/Kleinschreibung-
  // sensitiv und nur als eigenständiges Wort, um Zufallstreffer in normalem
  // Fließtext zu vermeiden.
  { pattern: /\bSPL\b/, label: 'Splashed White (Kürzel)', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bSB\b/, label: 'Sabino (Kürzel)', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bTo\b/, label: 'Tobiano (Kürzel)', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bRn\b/, label: 'Roan (Kürzel)', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\bCh\b/, label: 'Champagne (Kürzel)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bCr\b/, label: 'Cream (Kürzel)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bLp\b/, label: 'Appaloosa (Kürzel)', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bplpl\b/, label: 'Pearl (Kürzel)', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpl\b/, label: 'Pearl (Kürzel)', hints: [{ locus: 'Cream', allele: 'pl' }] },
  { pattern: /\bflfl\b/, label: 'Flaxen (Kürzel)', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bfl\b/, label: 'Flaxen (Kürzel)', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bsty\b/, label: 'Sooty (Kürzel)', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brc\b/, label: 'Rabicano (Kürzel)', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
];

// Gibt eine Liste { locus, allele, label } aller aus dem Text eindeutig
// ableitbaren Merkmale zurück. Bereits erkannte Textstellen werden aus der
// Arbeitskopie entfernt, damit z.B. "Schwarzbraun" nicht zusätzlich das
// separate "Braun"-Muster auslöst.
function inferGeneticHintsFromPhenotype(text) {
  if (!text) return [];
  let working = text;
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

// Fasst alle tatsächlich vorhandenen Gene eines Pferdes zusammen: zuerst
// aus getesteten Loci (siehe extractPresentAlleles), dann - nur für Loci,
// die nicht getestet wurden (bzw. die es als Locus gar nicht gibt, wie
// Sooty/Flaxen) - aus Hinweisen im Fellfarbe-Namen, in der Notiz und im
// Pferdenamen (siehe inferGeneticHintsFromPhenotype).
function presentGenesSummary(colorRows, coatColorName, notes, horseName) {
  const rows = colorRows || [];
  const confirmed = [];
  const testedLoci = new Set();

  for (const r of rows) {
    if (isUntestedLocusValue(r.value)) continue;
    testedLoci.add(r.label);
    const alleles = extractPresentAlleles(r.value);
    if (alleles) confirmed.push({ locus: r.label, alleles, source: 'getestet' });
  }

  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName),
    ...inferGeneticHintsFromPhenotype(notes),
    ...inferGeneticHintsFromPhenotype(horseName),
  ];
  const seen = new Set();
  const inferred = [];
  for (const h of hints) {
    if (testedLoci.has(h.locus)) continue;
    const key = h.locus + h.allele;
    if (seen.has(key)) continue;
    seen.add(key);
    inferred.push({ locus: h.locus, alleles: h.allele, source: 'abgeleitet' });
  }

  return [...confirmed, ...inferred];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHorseText };
}
