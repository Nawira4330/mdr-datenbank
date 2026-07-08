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
  setIf(result, 'birth_date', parseGermanDate(findValueForLabel(nonEmpty, 'Geburtstag')));
  setIf(result, 'coat_color', findValueForLabel(nonEmpty, 'Fellfarbe'));
  setIf(result, 'height_cm', parseIntSafe(findValueForLabel(nonEmpty, 'Stockmaß')));
  setIf(result, 'owner', findValueForLabel(nonEmpty, 'Besitzer'));
  setIf(result, 'rider_partner', findValueForLabel(nonEmpty, 'Reitbeteiligung'));
  setIf(result, 'value_dd', parseIntSafe(findValueForLabel(nonEmpty, 'Wert')));
  setIf(result, 'folder', findValueForLabel(nonEmpty, 'Ordner'));
  setIf(result, 'subfolder', findValueForLabel(nonEmpty, 'Unterordner'));

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
  setIf(result, 'breeder', findValueForLabel(nonEmpty, 'Züchter'));
  const zuchtzulassungLine = nonEmpty.find((l) => /^Zuchtzulassung\b/i.test(l));
  if (zuchtzulassungLine) {
    result.breeding_allowed = /ja/i.test(zuchtzulassungLine.replace(/^Zuchtzulassung/i, ''));
  }
  setIf(result, 'hlp_slp', findValueForLabel(nonEmpty, 'HLP/SLP'));
  setIf(result, 'offspring_count', parseIntSafe(findValueForLabel(nonEmpty, 'Nachkommen insgesamt')));

  // --- Zucht ---
  const icoVal = findValueForLabel(nonEmpty, 'ICO');
  if (icoVal) result.ico = parseFloat(icoVal.replace(',', '.').replace('%', '').trim());
  const fruchtbarkeit = findValueForLabel(nonEmpty, 'Fruchtbarkeit');
  if (fruchtbarkeit) result.fertility_pct = parseFloat(fruchtbarkeit.replace(',', '.').replace('%', '').trim());
  const tragend = findValueForLabel(nonEmpty, 'Tragend?');
  if (tragend) {
    result.pregnant = /^ja/i.test(tragend.trim());
    const vonMatch = tragend.match(/von\s+(.+)$/i);
    if (vonMatch) result.covering_sire = vonMatch[1].trim();
  }
  setIf(result, 'foaling_date', parseGermanDate(findValueForLabel(nonEmpty, 'Abfohltermin')));

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
  result.pedigree = parsePedigree(lines);

  return result;
}

function setIf(obj, key, value) {
  if (value !== null && value !== undefined && value !== '') obj[key] = value;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseIntSafe(str) {
  if (!str) return null;
  const m = str.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseGermanDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
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
  out.age_text = lines[ageIdx];

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

// Die genetische Exterieur-Tabelle hat 3 Spalten (Körperteil / Genotyp /
// Punktzahl) und endet mit einer Gesamtzeile wie "141/224 62.95%".
function parseExteriorGenetics(lines) {
  const startIdx = lines.indexOf('Exterieur');
  if (startIdx === -1) return { rows: [], overall: null };
  const rows = [];
  let overall = null;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const totalMatch = line.match(/^(\d+)\/(\d+)\s+([\d.,]+)\s*%$/);
    if (totalMatch) {
      overall = { score: `${totalMatch[1]}/${totalMatch[2]}`, percent: parseFloat(totalMatch[3].replace(',', '.')) };
      break;
    }
    if (line === 'Leistung' || line === 'Körperbau') break;
    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 3) {
      rows.push({ label: parts[0], genotype: parts[1], score: parts[2] });
    }
  }
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

// Der Stammbaum wird im Kopiertext ohne Einrückung/Struktur dargestellt,
// daher lässt sich die genaue Abstammungs-Hierarchie (wer ist Vater/Mutter
// von wem) nicht zuverlässig rekonstruieren. Es wird stattdessen eine
// unsortierte Liste aller im Text vorkommenden Vorfahren gespeichert
// (Name, Rasse, ggf. Potenzial) - in der Reihenfolge, in der sie im Text
// auftauchen.
function parsePedigree(lines) {
  const startIdx = lines.indexOf('Stammbaum');
  if (startIdx === -1) return [];
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i] === 'Exterieur') {
      endIdx = i;
      break;
    }
  }
  const segment = lines.slice(startIdx + 1, endIdx).filter(Boolean);

  const entries = [];
  let current = null;
  for (const line of segment) {
    const potMatch = line.match(/^Potential:\s*(\d+)$/);
    const diffMatch = line.match(/^Diff\.-GP Eltern:/);
    if (potMatch) {
      // "Potential: N" folgt erst NACH Name+Rasse, current wurde also
      // bereits gepusht und zurückgesetzt - daher an den zuletzt
      // hinzugefügten Eintrag hängen, nicht an "current".
      const target = current || entries[entries.length - 1];
      if (target) target.potential = parseInt(potMatch[1], 10);
      continue;
    }
    if (diffMatch) continue;
    if (!current) {
      current = { name: line };
    } else if (!current.breed) {
      current.breed = line;
      entries.push(current);
      current = null;
    }
  }
  return entries;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHorseText };
}
