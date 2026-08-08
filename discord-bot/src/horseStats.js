// Portiert aus ../../js/parser.js (EXTERIOR_TERM_SCORES, TEMPERAMENT_TERM_SCORES,
// scoreTerm/scoreExteriorTerm/scoreTemperamentTerm, averageScore) sowie aus
// ../../js/list.js (computeDerived) - berechnet GP/Ext/Ext%/Int/Farbgenetik
// exakt wie in der Weboberflaeche (siehe js/list.js:157 computeDerived).
const { presentGenesSummary } = require('./mdrGenetics');

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

function averageScore(rows, scoreFn) {
  if (!rows || !rows.length) return null;
  const scores = rows.map((r) => scoreFn(r.value)).filter((s) => s !== null && s !== undefined);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

const DASH = '–';

function fmtNumber(n) {
  return n === null || n === undefined ? DASH : n.toFixed(2);
}

function fmtText(v) {
  return v === null || v === undefined || v === '' ? DASH : String(v);
}

// Portiert aus js/list.js (zzlDisplay/hlpSlpDisplay), damit Bot und
// Weboberflaeche exakt dieselbe Darstellung zeigen.
function zzlDisplay(breedingAllowed) {
  if (breedingAllowed === true) return 'Ja';
  if (breedingAllowed === false) return 'Nein';
  return DASH;
}

function hlpSlpDisplay(text) {
  if (!text) return DASH;
  const m = text.match(/\d+([.,]\d+)?/);
  return m ? m[0] : DASH;
}

// Berechnet alle Anzeige-Felder fuer ein "horses"-Row (Supabase select('*')).
// GP bleibt bewusst der Rohstring aus tournament_potential (wie in
// horseForm.js tournamentSummaryHtml angezeigt), statt wie in list.js
// computeDerived per Number() konvertiert zu werden - der Rohwert kann ein
// "%"-Suffix enthalten, das Number() zu NaN machen wuerde.
// "Rasselos" ist im Spiel eine echte Ausprägung ("keine Rasse"), keine
// fehlende Angabe - wird deshalb wie in der Weboberflaeche (js/list.js:
// normalizeBreed(h.breed) || 'Rasselos', js/horseForm.js fillForm) auch
// hier als Wert angezeigt statt als "–".
function breedDisplay(horse) {
  return horse.breed || 'Rasselos';
}

// Rasseanteile sind relevant, sobald ein Pferd nachweislich nicht 100%
// reinrassig ist - unabhaengig davon, ob zusaetzlich eine Haupt-Rasse
// eingetragen ist (gleiche Bedingung wie missingDataLabels in
// js/parser.js). Ist weder das eine noch das andere der Fall, wird das
// Feld im Embed komplett weggelassen (siehe embeds.js), statt fuer jedes
// vollstaendig reinrassige Pferd eine leere Zeile anzuzeigen.
function breedCompositionDisplay(horse) {
  const notFullyPurebred = horse.purebred_pct != null && horse.purebred_pct < 100;
  if (!notFullyPurebred && !horse.breed_composition) return null;
  return horse.breed_composition || DASH;
}

function computeDisplayFields(horse) {
  const genes = presentGenesSummary(horse.colors, horse.coat_color, horse.notes, horse.name);
  const extPercent = horse.exterior_genetics?.overall?.percent;

  return {
    name: fmtText(horse.name),
    gender: fmtText(horse.gender),
    breed: breedDisplay(horse),
    breedComposition: breedCompositionDisplay(horse),
    coatColor: fmtText(horse.coat_color),
    colorGenetics: genes.length ? genes.map((g) => g.alleles).join(' ') : DASH,
    gp: fmtText(horse.tournament_potential?.Gesamtpotenzial),
    ext: fmtNumber(averageScore(horse.exterior_descriptive, scoreExteriorTerm)),
    extPercent: extPercent === null || extPercent === undefined ? DASH : `${extPercent}%`,
    int: fmtNumber(averageScore(horse.temperament, scoreTemperamentTerm)),
    owner: fmtText(horse.owner),
    zzl: zzlDisplay(horse.breeding_allowed),
    hlpSlp: hlpSlpDisplay(horse.hlp_slp),
  };
}

module.exports = {
  averageScore,
  scoreExteriorTerm,
  scoreTemperamentTerm,
  computeDisplayFields,
  DASH,
};
