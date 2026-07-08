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
  const fruchtbarkeit = findValueForLabel(nonEmpty, 'Fruchtbarkeit');
  if (fruchtbarkeit) result.fertility_pct = parseFloat(fruchtbarkeit.replace(',', '.').replace('%', '').trim());

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

// --- Farbgenetik-Ableitung (nach der offiziellen MDR-Dokumentation) ---
//
// Jeder Locus wird anhand fester Allel-Symbole in zwei Allele zerlegt
// (beide Allel-Tokens sind bei allen bekannten Loci gleich lang, daher
// reicht ein Split in der Mitte des Rohwerts). Für Extension/Agouti ist
// die Ableitung 1:1 gegen den Beispieltext geprüft (ergibt "Chestnut" +
// "Gold Dun Cream", was exakt zur im Spiel angezeigten Fellfarbe
// "Gold Dun Cream Pinto" passt). KIT (cKit: Tobiano/Sabino/Dominant
// White/Roan) lässt sich aus der Doku nicht eindeutig dekodieren, wird
// daher nur roh angezeigt.

const AGOUTI_RANK = { Ap: 4, A1: 3, At: 2, a0: 1 };

// Basisfarbe aus Extension + Agouti (siehe Farbvererbungs-Tabellen).
function deriveBaseColor(extensionRaw, agoutiRaw) {
  if (!extensionRaw || extensionRaw.length !== 2) return null;
  const hasE = extensionRaw.includes('E');
  if (!hasE) return 'Chestnut';

  if (!agoutiRaw || agoutiRaw.length !== 4) return null;
  const a1 = agoutiRaw.slice(0, 2);
  const a2 = agoutiRaw.slice(2, 4);
  const rank = (a) => AGOUTI_RANK[a] ?? 0;
  const top = rank(a1) >= rank(a2) ? a1 : a2;
  if (top === 'Ap') return 'Wildbay';
  if (top === 'A1') return 'Bay';
  if (top === 'At') return 'Sealbrown';
  return 'Black';
}

// Zerlegt einen Locus-Rohwert in zwei Allel-Tokens anhand eines bekannten
// Symbol-Sets. Case-insensitiver Fallback für Loci, bei denen die
// Groß-/Kleinschreibung im kopierten Text unzuverlässig sein kann
// (siehe "caseCaution").
function splitLocus(raw, tokens, caseCaution) {
  if (!raw) return null;
  const half = raw.length / 2;
  if (!Number.isInteger(half)) return null;
  const parts = [raw.slice(0, half), raw.slice(half)];
  const match = (s) => {
    if (tokens.includes(s)) return s;
    if (caseCaution) {
      const ci = tokens.find((t) => t.toLowerCase() === s.toLowerCase());
      if (ci) return ci;
    }
    return null;
  };
  const a1 = match(parts[0]);
  const a2 = match(parts[1]);
  if (!a1 || !a2) return null;
  return [a1, a2];
}

function zygosity(alleles, dominant) {
  const domCount = alleles.filter((a) => a === dominant).length;
  if (domCount === 2) return 'homozygot (reinerbig)';
  if (domCount === 1) return 'heterozygot (mischerbig)';
  return 'nicht vorhanden';
}

const SHADE_PRIORITY = ['Cr1', 'Cr2', 'Pearl', 'Dun', 'Ch'];

const SHADE_TABLES = {
  Chestnut: {
    single: { Cr1: 'Palomino', Cr2: 'Cremello', Dun: 'Red Dun', Ch: 'Gold Champagne', Pearl: 'Apricot' },
    combos: {
      'Cr1+Dun': 'Dunalino', 'Dun+Ch': 'Gold Dun', 'Cr1+Ch': 'Gold Cream',
      'Pearl+Dun': 'Apricot Dun', 'Pearl+Ch': 'Gold Pearl',
      'Cr2+Dun': 'Cremello Dun', 'Cr2+Ch': 'Cremello Champagne',
      'Cr1+Dun+Ch': 'Gold Dun Cream', 'Pearl+Dun+Ch': 'Gold Dun Pearl',
    },
  },
  Sealbrown: {
    single: { Cr1: 'Smoky Brown', Cr2: 'Sealbrown Cream', Dun: 'Brown Dun', Ch: 'Sable Champagne', Pearl: 'Pearl Brown' },
    combos: {
      'Cr1+Dun': 'Smoky Brown Dun', 'Dun+Ch': 'Sable Dun', 'Cr1+Ch': 'Sable Cream',
      'Pearl+Dun': 'Pearl Brown Dun', 'Pearl+Ch': 'Sable Pearl',
      'Cr2+Dun': 'Sealbrown Cream Dun', 'Cr2+Ch': 'Sealbrown Cream Champagne',
      'Cr1+Dun+Ch': 'Sable Dun Cream', 'Pearl+Dun+Ch': 'Sable Dun Pearl',
    },
  },
  Black: {
    single: { Cr1: 'Smoky Black', Cr2: 'Smoky Cream', Dun: 'Grulla', Ch: 'Classic Champagne', Pearl: 'Pearl Black' },
    combos: {
      'Cr1+Dun': 'Smoky Grulla', 'Dun+Ch': 'Classic Dun', 'Cr1+Ch': 'Classic Cream',
      'Pearl+Dun': 'Pearl Black Dun', 'Pearl+Ch': 'Classic Pearl',
      'Cr2+Dun': 'Smoky Cream Dun', 'Cr2+Ch': 'Smoky Cream Champagne',
      'Cr1+Dun+Ch': 'Classic Dun Cream', 'Pearl+Dun+Ch': 'Classic Dun Pearl',
    },
  },
};
// Bay und Wildbay verwenden laut Dokumentation dieselben Aufhellungs-Namen.
SHADE_TABLES.Bay = {
  single: { Cr1: 'Buckskin', Cr2: 'Perlino', Dun: 'Classic Dun', Ch: 'Amber Champagne', Pearl: 'Pearl Bay' },
  combos: {
    'Cr1+Dun': '(Wild) Dunskin', 'Dun+Ch': 'Amber Dun', 'Cr1+Ch': 'Amber Cream',
    'Pearl+Dun': 'Pearl Bay Dun', 'Pearl+Ch': 'Amber Pearl',
    'Cr2+Dun': 'Perlino Dun', 'Cr2+Ch': 'Perlino Champagne',
    'Cr1+Dun+Ch': 'Amber Dun Cream', 'Pearl+Dun+Ch': 'Amber Dun Pearl',
  },
};
SHADE_TABLES.Wildbay = SHADE_TABLES.Bay;

function buildShadeName(baseColor, flags) {
  const table = SHADE_TABLES[baseColor];
  if (!table) return null;
  const active = SHADE_PRIORITY.filter((k) => flags[k]);
  if (!active.length) return null;
  if (active.length === 1) return table.single[active[0]] || null;
  return table.combos[active.join('+')] || null;
}

// Liest alle relevanten Loci aus der geparsten "colors"-Tabelle (Array von
// {label, value}) und leitet Basisfarbe, Aufhellungs-/Verdünnungsname und
// Scheckungs-/Muster-Gene ab.
function deriveColorGenetics(colorRows) {
  if (!colorRows || !colorRows.length) return null;
  const byLabel = {};
  for (const r of colorRows) byLabel[r.label] = r.value;

  const baseColor = deriveBaseColor(byLabel['Extension'], byLabel['Agouti']);

  const dunAlleles = splitLocus(byLabel['Dun'], ['D', 'd']);
  const champagneAlleles = splitLocus(byLabel['Champagne'], ['Ch', 'ch']);
  const creamAlleles = splitLocus(byLabel['Cream'], ['Cr', 'cr', 'pl']);
  const greyAlleles = splitLocus(byLabel['Grey'], ['G', 'g']);
  const silverAlleles = splitLocus(byLabel['Silver'], ['Z', 'z']);
  const overoAlleles = splitLocus(byLabel['Overo'], ['O', 'o']);
  const splashedAlleles = splitLocus(byLabel['Splashed'], ['SPL', 'spl']);
  const leopardAlleles = splitLocus(byLabel['Appaloosa'], ['Lp', 'lp']);
  const patn1Alleles = splitLocus(byLabel['PATN1'], ['P1', 'p1']);

  const hasDun = !!dunAlleles && dunAlleles.includes('D');
  const hasChampagne = !!champagneAlleles && champagneAlleles.includes('Ch');
  let creamState = 'keine';
  if (creamAlleles) {
    const crCount = creamAlleles.filter((a) => a === 'Cr').length;
    const plCount = creamAlleles.filter((a) => a === 'pl').length;
    if (crCount === 2) creamState = 'Cr2';
    else if (crCount === 1 && plCount === 1) creamState = 'Cr2'; // Cream+Pearl = wie doppel Cream benannt
    else if (crCount === 1) creamState = 'Cr1';
    else if (plCount === 2) creamState = 'Pearl';
    else creamState = 'keine';
  }

  const shadeFlags = {
    Cr1: creamState === 'Cr1',
    Cr2: creamState === 'Cr2',
    Pearl: creamState === 'Pearl',
    Dun: hasDun,
    Ch: hasChampagne,
  };
  const shadeName = baseColor ? (buildShadeName(baseColor, shadeFlags) || baseColor) : null;

  const patterns = [];
  if (greyAlleles && greyAlleles.includes('G')) {
    patterns.push({ name: 'Grey (Schimmel)', zygosity: zygosity(greyAlleles, 'G') });
  }
  if (overoAlleles && overoAlleles.includes('O')) {
    patterns.push({ name: 'Overo', zygosity: zygosity(overoAlleles, 'O') });
  }
  if (splashedAlleles && splashedAlleles.includes('SPL')) {
    patterns.push({ name: 'Splashed White', zygosity: zygosity(splashedAlleles, 'SPL') });
  }
  if (leopardAlleles && leopardAlleles.includes('Lp')) {
    const patnNote = patn1Alleles && patn1Alleles.includes('P1') ? ', PATN1 vorhanden' : '';
    patterns.push({ name: 'Leopard/Appaloosa-Musterung', zygosity: zygosity(leopardAlleles, 'Lp') + patnNote });
  }

  // KIT (cKit: Tobiano/Sabino/Dominant White/Roan) ist getestet, "0000"
  // bedeutet bestätigt: keines der vier Gene vorhanden. Welches der vier
  // Gene bei einem positiven Befund wie kodiert wird, ist nicht bekannt,
  // daher wird ein von "0000" abweichender Wert nur als "enthält ein
  // KIT-Gen" gemeldet, ohne das konkrete Gen zu benennen.
  const kitRaw = byLabel['KIT'];
  let kit = null;
  if (kitRaw) {
    kit = /^0+$/.test(kitRaw)
      ? { present: false, label: 'getestet – kein Tobiano/Sabino/Dominant White/Roan vorhanden' }
      : { present: true, label: `enthält ein KIT-Gen (genaue Zuordnung nicht dokumentiert): ${kitRaw}` };
  }

  const warnings = [];
  if (kit?.present) {
    warnings.push('KIT enthält ein Gen ungleich "0" – welches der vier Gene (Tobiano/Sabino/Dominant White/Roan) das genau ist, lässt sich aus der verfügbaren Dokumentation nicht bestimmen.');
  }

  return { baseColor, shadeName, patterns, kit, warnings };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHorseText };
}
