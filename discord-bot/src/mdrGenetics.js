// Nutzerwunsch: der Bot soll Farbe/Genetik nur aus der Datenbank übernehmen,
// nicht selbst neu berechnen/raten. Vorherige Fassungen dieser Datei
// portierten die Ableitungslogik aus ../../js/parser.js (Fellfarbe-Name ->
// vermutete Gene, plus Eltern-Cross-Referenz für mehrdeutige Cream-Fälle wie
// Cremello/Perlino) - das führte aber genau zu Fehlern wie beim Bugreport
// "4Leafs Celestial Benjiro" (Bot zeigte geratenes "CrCr", während das Spiel
// selbst tatsächlich "pl Cr" bestätigt). Diese Datei liest jetzt NUR NOCH,
// was in der Datenbank tatsächlich als bestätigt hinterlegt ist: getestete
// Loci (horses.colors) und manuell bestätigte Loci (horses.color_gene_overrides,
// über die Weboberfläche gepflegt) - keine Ableitung aus Fellfarbe/Notiz/
// Name mehr, keine Eltern-Cross-Referenz.

function isUntestedLocusValue(value) {
  return /nicht getestet/i.test(value || '');
}

function extractPresentAlleles(rawValue) {
  if (!rawValue || isUntestedLocusValue(rawValue)) return '';
  const half = rawValue.length / 2;
  const tokens = Number.isInteger(half) ? [rawValue.slice(0, half), rawValue.slice(half)] : [rawValue];
  return tokens.filter((t) => t === 'pl' || /[A-Z]/.test(t)).join('');
}

// Manuelle Gen-Bestaetigung je Locus (color_gene_overrides) - 1:1 aus
// ../../js/parser.js (LOCUS_PRIMARY_ALLELE/localeOfOverrideKey), siehe dort
// fuer Details zum Klick-Zyklus in der Weboberflaeche. Wird hier nur
// GELESEN (nie vom Bot gesetzt).
const LOCUS_PRIMARY_ALLELE = {
  Extension: 'E', Dun: 'D', Champagne: 'Ch', Grey: 'G', Silver: 'Z',
  Overo: 'O', Splashed: 'SPL', Appaloosa: 'Lp', PATN1: 'P1',
  Flaxen: 'fl',
};
function localeOfOverrideKey(key) {
  return key.split(':')[0];
}

// Anzeige-Reihenfolge (Grundfarbe/Aufhellungen/Sonderfarben/Scheckungen/
// Flaxen) - 1:1 aus ../../js/parser.js portiert, siehe dort für Details.
const GENE_DISPLAY_ORDER = [
  'Extension', 'Agouti',
  'Cream', 'Dun',
  'Champagne', 'Silver', 'Grey',
  'KIT', 'Overo', 'Splashed', 'Appaloosa', 'PATN1',
  'Flaxen',
];

function sortGenesForDisplay(genes) {
  return [...genes].sort((a, b) => {
    const ai = GENE_DISPLAY_ORDER.indexOf(a.locus);
    const bi = GENE_DISPLAY_ORDER.indexOf(b.locus);
    return (ai === -1 ? GENE_DISPLAY_ORDER.length : ai) - (bi === -1 ? GENE_DISPLAY_ORDER.length : bi);
  });
}

// Liefert {locus, alleles, source}[] - NUR "getestet" (aus colorRows) und
// "manuell" (aus color_gene_overrides), beides echte, in der Datenbank
// hinterlegte Bestätigungen. Bewusst KEINE Ableitung aus Fellfarbe/Notiz/
// Name und KEINE Eltern-Cross-Referenz (siehe Datei-Kommentar oben).
function presentGenesSummary(colorRows, overrides) {
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

  const manual = [];
  for (const key of Object.keys(ov)) {
    const state = ov[key];
    const locus = localeOfOverrideKey(key);
    if (!state || testedLoci.has(locus)) continue;
    const primary = key.includes(':') ? key.split(':')[1] : LOCUS_PRIMARY_ALLELE[key];
    if (!primary || state === 'absent') continue;
    const alleleCode = state === 'hom' ? primary + primary : primary;
    manual.push({ locus, alleles: alleleCode, source: 'manuell' });
  }

  return sortGenesForDisplay([...confirmed, ...manual]);
}

module.exports = { presentGenesSummary };
