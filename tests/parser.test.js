// Unit-Tests für die reinen (DOM-unabhängigen) Funktionen aus js/parser.js
// - vor allem die Farbgenetik-Ableitung und die Altersberechnung, beide
// mit einigen Sonderfällen, die bisher nur durch manuelles Testen im
// Browser auffielen. Ausführen mit: node --test tests/
//
// Bewusst ohne zusätzliche Abhängigkeiten (node:test/node:assert sind
// in Node ab 18 eingebaut) - die App selbst bleibt eine reine statische
// Seite ohne Build-Schritt, das hier ist nur ein Entwicklungswerkzeug.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  gameAgeYears, gameAgeYearsMonths,
  normalizeBreed, inferGeneticHintsFromPhenotype,
  presentGenesSummary, parentColorHints,
  missingDataLabels,
  cycleTristateItem,
  RECESSIVE_CARRIER_TRAITS, isVisiblyHomozygousForTrait,
  findPedigreeSuspects, parseHorseText,
} = require('../js/parser.js');

// Tage-Offset statt fester Kalenderdaten, damit die Tests unabhängig vom
// tatsächlichen Ausführungsdatum immer dieselben Ergebnisse liefern.
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe('Altersberechnung (gameAgeYears/gameAgeYearsMonths) - 30 reale Tage = 1 Spieljahr', () => {
  test('0 Tage = 0 Jahre, 0 Monate', () => {
    assert.deepEqual(gameAgeYearsMonths(daysAgo(0)), { years: 0, months: 0 });
  });

  test('Grenze bei 6 Monaten (Fohlenstall-Hinweis): 15-17 Tage = 6 Monate, ab 18 Tage = 7 Monate', () => {
    assert.deepEqual(gameAgeYearsMonths(daysAgo(15)), { years: 0, months: 6 });
    assert.deepEqual(gameAgeYearsMonths(daysAgo(17)), { years: 0, months: 6 });
    assert.deepEqual(gameAgeYearsMonths(daysAgo(18)), { years: 0, months: 7 });
  });

  test('Grenze bei 3 Spieljahren (Bild-Hinweis): 89 Tage = 2 Jahre, 90 Tage = 3 Jahre', () => {
    assert.equal(gameAgeYears(daysAgo(89)), 2);
    assert.equal(gameAgeYears(daysAgo(90)), 3);
  });

  test('Grenze bei 25 Spieljahren (GBH-Automatik greift erst bei > 25): 749 Tage = 24, 750 Tage = 25', () => {
    assert.equal(gameAgeYears(daysAgo(749)), 24);
    assert.equal(gameAgeYears(daysAgo(750)), 25);
  });

  test('kein Geburtsdatum -> null', () => {
    assert.equal(gameAgeYears(null), null);
    assert.equal(gameAgeYearsMonths(null), null);
  });

  test('Geburtsdatum in der Zukunft -> null (kein negatives Alter)', () => {
    assert.equal(gameAgeYears(daysAgo(-1)), null);
  });
});

describe('normalizeBreed', () => {
  test('Kürzel wird ausgeschrieben', () => {
    assert.equal(normalizeBreed('APH'), 'American Paint Horse');
  });

  test('bereits ausgeschriebener Name bleibt unverändert', () => {
    assert.equal(normalizeBreed('American Paint Horse'), 'American Paint Horse');
  });
});

describe('Farbgenetik-Ableitung aus Fellfarbe/Notiz/Name (presentGenesSummary)', () => {
  test('Flaxen wird aus dem bloßen Wort "Flaxen" in der Fellfarbe als reinerbig (flfl) abgeleitet', () => {
    const genes = presentGenesSummary([], 'Flaxen Sorrel Chestnut', null, null, null, null);
    assert.deepEqual(genes, [{ locus: 'Flaxen', alleles: 'flfl', source: 'abgeleitet' }]);
  });

  test('manuell bestätigter Flaxen-Träger (het-Override) zeigt "fl", nicht "flfl"', () => {
    const genes = presentGenesSummary([], 'Blood Bay', null, null, null, { Flaxen: 'het' });
    const flaxen = genes.find((g) => g.locus === 'Flaxen');
    assert.deepEqual(flaxen, { locus: 'Flaxen', alleles: 'fl', source: 'manuell' });
  });

  test('Cremello ohne Pearl-Hinweis bei den Eltern gilt als reinerbig Cream (CrCr)', () => {
    const hints = inferGeneticHintsFromPhenotype('Cremello', false);
    assert.deepEqual(hints, [
      { locus: 'Cream', allele: 'CrCr', label: 'Cremello (Chestnut-doppel-Cream/Cream+Pearl)' },
    ]);
  });

  test('Cremello MIT Pearl-Hinweis bei einem Elternteil gilt nur als einfaches Cr (könnte Cream+Pearl statt CrCr sein)', () => {
    const hints = inferGeneticHintsFromPhenotype('Cremello', true);
    assert.equal(hints[0].allele, 'Cr');
  });

  // Regressionstest für den am 03.09.2026 behobenen Fall ("Cathys Anda-
  // Fohlen"): ein automatisch benanntes Fohlen "Fohlen_<Mutter> X <Vater>"
  // (siehe parseHorseText) hatte einen Vater namens "...Sir Classic..." -
  // "Classic" ist ein MDR-Farbwort (Black-Champagne) und wurde fälschlich
  // als Merkmal des FOHLENS selbst gedeutet, obwohl es nur zufällig im
  // Namen des Elternteils steckt (der komplette Fohlenname ist nur eine
  // Verkettung der Elternnamen, keine eigene Fellfarben-Beschreibung).
  test('Farbwörter im Namen eines Elternteils (auto-generierter Fohlenname) werden NICHT dem Fohlen selbst zugeschrieben', () => {
    const foalName = 'Fohlen_Cathy by Salino X *Iced* Sir Classic -)B(-';
    const genes = presentGenesSummary([], 'Sooty Sealbrown', null, foalName, null, null);
    assert.ok(!genes.some((g) => g.locus === 'Champagne'), 'Champagne sollte NICHT aus "Sir Classic" im Fohlennamen abgeleitet werden');
  });

  // Regressionstest für den am 20.09.2026 behobenen Fall ("Pearl Mirrow"):
  // der Pferdename wird NICHT MEHR nach Farbwörtern durchsucht (anders als
  // früher, siehe Test oben) - ein Pferd namens "Pearl Mirrow" oder
  // "Classic Beauty" wurde fälschlich als Pearl-Träger bzw. Champagne
  // gewertet, nur weil der Name zufällig wie ein Farbwort aussah, obwohl
  // "Pearl"/"Classic" hier eindeutig Teil des gewählten Namens war. Echte
  // Farbangaben stehen zuverlässig im Fellfarbe-Feld bzw. in der Notiz.
  test('Farbwörter im eigenen (frei gewählten) Namen werden NICHT mehr als Fellfarben-Hinweis gewertet', () => {
    const genes = presentGenesSummary([], null, null, 'Classic Beauty', null, null);
    assert.ok(!genes.some((g) => g.locus === 'Champagne'), 'ein frei gewählter Name darf NICHT als Fellfarben-Hinweis zählen (nur Fellfarbe-Feld/Notiz)');
  });

  test('echte Farbangabe im Fellfarbe-Feld wird weiterhin erkannt, unabhängig vom Namen', () => {
    const genes = presentGenesSummary([], 'Pearl', null, 'Pearl Mirrow', null, null);
    const cream = genes.find((g) => g.locus === 'Cream');
    assert.deepEqual(cream, { locus: 'Cream', alleles: 'plpl', source: 'abgeleitet' });
  });
});

// Regressionstest für den am 25.08.2026 behobenen Fall: ein Fohlen einer
// (aus der Fellfarbe abgeleitet) reinerbig flfl-Mutter zeigte in der
// Übersichtstabelle/beim Filtern/bei den Dashboard-Kacheln kein "fl",
// obwohl das genetisch zwingend vererbt wird - weil das Fohlen selbst
// (andere Grundfarbe, Flaxen zeigt sich nur bei Fuchs/Sorrel) keinen
// eigenen Text-Hinweis liefert. presentGenesSummary bekommt den
// Eltern-Hinweis nur über den separat übergebenen parentHints-Parameter
// (siehe parentColorHints/genesOfRow in list.js).
describe('Eltern-Vererbung (parentColorHints) - Regressionstest 25.08.2026', () => {
  test('Fohlen eines flfl-Elternteils gilt als (mindestens) Flaxen-Träger, auch ohne eigenen Text-Hinweis', () => {
    const mare = { name: 'Mare', coat_color: 'Flaxen Sorrel Chestnut Roan Pinto', notes: null, colors: [], color_gene_overrides: null };
    const stallion = { name: 'Stallion', coat_color: 'Blood Bay', notes: null, colors: [], color_gene_overrides: { Flaxen: 'het' } };
    const hints = parentColorHints([mare, stallion]);
    assert.deepEqual(hints, [{ locus: 'Flaxen', alleles: 'fl' }]);

    // Fohlen ist Bay-basiert (nicht Fuchs) - die Fellfarbe kann "Flaxen"
    // also gar nicht erwähnen, selbst wenn das Gen vorhanden ist.
    const foalGenes = presentGenesSummary([], 'Silver Blood Bay Roan Tobiano', null, null, hints, null);
    const flaxen = foalGenes.find((g) => g.locus === 'Flaxen');
    assert.deepEqual(flaxen, { locus: 'Flaxen', alleles: 'fl', source: 'elternteil' });
  });

  test('nur EIN Elternteil reinerbig -> Fohlen gilt nur als mischerbiger Träger (fl), nicht reinerbig', () => {
    const mare = { name: 'Mare', coat_color: 'Flaxen Sorrel Chestnut', notes: null, colors: [], color_gene_overrides: null };
    const stallion = { name: 'Stallion', coat_color: 'Blood Bay', notes: null, colors: [], color_gene_overrides: null };
    assert.deepEqual(parentColorHints([mare, stallion]), [{ locus: 'Flaxen', alleles: 'fl' }]);
  });

  test('BEIDE Elternteile reinerbig für dasselbe Merkmal -> Fohlen zwingend reinerbig (flfl)', () => {
    const mare = { name: 'Mare', coat_color: 'Flaxen Sorrel Chestnut', notes: null, colors: [], color_gene_overrides: null };
    const stallion = { name: 'Stallion', coat_color: 'Flaxen Sorrel', notes: null, colors: [], color_gene_overrides: null };
    assert.deepEqual(parentColorHints([mare, stallion]), [{ locus: 'Flaxen', alleles: 'flfl' }]);
  });

  test('kein Elternteil mit Flaxen -> keine Vererbungs-Hinweise', () => {
    const mare = { name: 'Mare', coat_color: 'Blood Bay', notes: null, colors: [], color_gene_overrides: null };
    const stallion = { name: 'Stallion', coat_color: 'Chestnut', notes: null, colors: [], color_gene_overrides: null };
    assert.deepEqual(parentColorHints([mare, stallion]), []);
  });
});

// Regressionstest für den am 25.08.2026 behobenen Fall: der Alter-Filter
// (Dashboard-Kacheln/Übersicht) schließt Pferde mit unbekanntem
// Geburtsdatum aus, ohne dass das bisher irgendwo als "fehlende Daten"
// auffiel.
describe('Fehlende Daten (missingDataLabels)', () => {
  test('leerer Datensatz meldet Geburtsdatum als fehlend', () => {
    assert.ok(missingDataLabels({}).includes('Geburtsdatum'));
  });

  test('vorhandenes Geburtsdatum wird nicht mehr gemeldet', () => {
    assert.ok(!missingDataLabels({ birthdate: '2026-01-01' }).includes('Geburtsdatum'));
  });
});

describe('Genetik-/EKH-/Schlagwörter-Filter: Dreifach-Zustand (Tristate)', () => {
  test('zyklt neutral -> anwählen -> ausschließen -> neutral', () => {
    const item = { dataset: { state: 'neutral' } };
    cycleTristateItem(item);
    assert.equal(item.dataset.state, 'include');
    cycleTristateItem(item);
    assert.equal(item.dataset.state, 'exclude');
    cycleTristateItem(item);
    assert.equal(item.dataset.state, 'neutral');
  });

  test('unbekannter/fehlender Zustand fällt auf neutral zurück', () => {
    const item = { dataset: {} };
    cycleTristateItem(item);
    assert.equal(item.dataset.state, 'neutral');
  });
});

// Regressionstest für den am 22.09.2026 behobenen Fall ("Hollow Dusk"):
// isVisiblyHomozygousForTrait(record, trait, considerOverrides) ist die
// gemeinsame Grundlage für autoInheritFromParents/autoUpdateParentCarriers
// (horseForm.js) und den Bestands-Check in carrierBackfill.js - "false"
// muss dabei IMMER die reine Textableitung liefern (unabhängig von einem
// evtl. fälschlich gesetzten "het"-Override), sonst würde die
// Selbstkorrektur den Bugfall nicht mehr erkennen.
describe('isVisiblyHomozygousForTrait (Flaxen/Pearl, gemeinsame Grundlage für Träger-Nachpflege)', () => {
  const FLAXEN = RECESSIVE_CARRIER_TRAITS.find((t) => t.label === 'Flaxen');
  const PEARL = RECESSIVE_CARRIER_TRAITS.find((t) => t.label === 'Pearl');

  test('Flaxen: eigene Fellfarbe "Flaxen ..." gilt unabhängig von Overrides als reinerbig', () => {
    const horse = { name: 'Hollow Dusk', coat_color: 'Flaxen Sorrel Roan', notes: null, colors: [], color_gene_overrides: { Flaxen: 'het' } };
    assert.equal(isVisiblyHomozygousForTrait(horse, FLAXEN, false), true, 'ignoriert das (fälschliche) het-Override');
    assert.equal(isVisiblyHomozygousForTrait(horse, FLAXEN, true), false, 'MIT Override zählt das gesetzte "het" (zeigt den Bugfall)');
  });

  test('Pearl: eigene Fellfarbe "Pearl ..." gilt unabhängig von Overrides als reinerbig', () => {
    const horse = { name: 'Irgendein Name', coat_color: 'Pearl Bay Dun', notes: null, colors: [], color_gene_overrides: null };
    assert.equal(isVisiblyHomozygousForTrait(horse, PEARL, false), true);
    assert.equal(isVisiblyHomozygousForTrait(horse, PEARL, true), true);
  });

  test('kein Treffer bei unauffälliger Fellfarbe', () => {
    const horse = { name: 'Irgendein Name', coat_color: 'Bay', notes: null, colors: [], color_gene_overrides: null };
    assert.equal(isVisiblyHomozygousForTrait(horse, FLAXEN, false), false);
    assert.equal(isVisiblyHomozygousForTrait(horse, PEARL, false), false);
  });
});


describe('Stammbaum-Prüfung vertauschter Name/Rasse (findPedigreeSuspects)', () => {
  const aph = [1, 2, 3].map((i) => ({ name: `APH ${i}`, breed: 'American Paint Horse', pedigree: null }));

  test('echter Vertauschungsfall (Vorfahren-Name = Rasse) wird erkannt, inkl. "RASSELOS" ohne Pferd mit diesem Rasse-Feld', () => {
    const broken = { name: 'Kaputt', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'RASSELOS', breed: 'Irgendein Name' }, { name: 'American Paint Horse', breed: 'X' }] } };
    const { suspects } = findPedigreeSuspects([broken, ...aph]);
    assert.equal(suspects.length, 1);
    assert.deepEqual(suspects[0].names, ['RASSELOS', 'American Paint Horse']);
  });

  test('"Unbekannt" und normale Vorfahren-Namen werden nie geflaggt, auch wenn "unbekannt" als breed vorkommt', () => {
    const withUnknownBreed = { name: 'Ohne Rasse', breed: 'Unbekannt', pedigree: null };
    const ok = { name: 'Gut', breed: 'American Paint Horse', pedigree: { ancestors: [{ name: 'Unbekannt', breed: 'American Paint Horse' }, { name: 'SPZ* Ikarus', breed: 'American Paint Horse' }] } };
    assert.equal(findPedigreeSuspects([withUnknownBreed, ok, ...aph]).suspects.length, 0);
  });

  test('Vorfahren-Rasse-Felder speisen die Rassenliste NICHT (keine Selbst-Vergiftung)', () => {
    const poisoner = { name: 'Poison', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Sir Davis by Salino', breed: 'Sir Davis by Salino' }] } };
    const innocent = { name: 'Unschuldig', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Sir Davis by Salino', breed: 'Andalusier' }] } };
    assert.equal(findPedigreeSuspects([poisoner, innocent, ...aph]).suspects.length, 0);
  });

  test('Pferd mit Pferdenamen im breed-Feld löst bei INTAKTEN Stammbäumen keinen Fehlalarm mehr aus (Sun-Eclipse-Fall), Diagnose nennt es trotzdem', () => {
    const poison = { name: 'Vergiftet', breed: 'Isa', pedigree: null };
    const intact = [1, 2].map((i) => ({ name: `Intakt ${i}`, breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Isa', breed: 'Andalusier' }] } }));
    const { suspects, badBreedHorses, rareBreedValues } = findPedigreeSuspects([poison, ...intact, ...aph]);
    assert.equal(suspects.length, 0);
    assert.deepEqual(badBreedHorses.map((h) => h.name), ['Vergiftet']);
    assert.ok(rareBreedValues.includes('isa (1)'));
  });

  test('Vertauschter Eintrag (Name = Rasse, Rasse-Feld = verrutschter Name) wird erkannt, details nennen beides', () => {
    const swapped = { name: 'Kaputt', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Rasselos', breed: '~PRE~ Gana' }, { name: 'Andalusier', breed: '~PRE~ Rhamos' }, { name: 'Normal', breed: 'Andalusier' }] } };
    const { suspects } = findPedigreeSuspects([swapped, ...aph]);
    assert.equal(suspects.length, 1);
    assert.deepEqual(suspects[0].details, [{ name: 'Rasselos', breed: '~PRE~ Gana' }, { name: 'Andalusier', breed: '~PRE~ Rhamos' }]);
  });

  test('Eintrag mit Rasse-Namen UND fehlendem Rasse-Feld zählt als Treffer (bei mindestens 2 im Stammbaum)', () => {
    const noBreed = { name: 'X', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Andalusier' }, { name: 'Rasselos' }] } };
    assert.equal(findPedigreeSuspects([noBreed, ...aph]).suspects.length, 1);
  });

  test('Ein EINZELNER auffälliger Vorfahre (z.B. ein Pferd, das wie eine Rasse heißt) reicht nicht - echtes Verrutschen betrifft mehrere Einträge', () => {
    const single = { name: 'Sun Eclipse', breed: 'Andalusier', pedigree: { ancestors: [{ name: 'Rasselos', breed: 'Sonstwas' }, { name: 'Normal', breed: 'Andalusier' }] } };
    assert.equal(findPedigreeSuspects([single, ...aph]).suspects.length, 0);
  });

  test('badBreedHorses: Pferd, dessen eigenes Rasse-Feld wie ein Pferdename aussieht, wird als Auslöser gemeldet', () => {
    const poison = { name: 'Vergiftet', owner: 'Ice', breed: '*Iced* Diljá -)B(-', pedigree: null };
    const parent = { name: '*Iced* Diljá -)B(-', owner: 'Ice', breed: 'Rasselos', pedigree: null };
    const { badBreedHorses } = findPedigreeSuspects([poison, parent, ...aph]);
    assert.deepEqual(badBreedHorses.map((h) => h.name), ['Vergiftet']);
  });

  test('badBreedHorses: echte Rassen ("Rasselos", APH) werden nie gemeldet', () => {
    assert.equal(findPedigreeSuspects([{ name: 'X', breed: 'Rasselos', pedigree: { ancestors: [{ name: 'Rasselos', breed: 'y' }] } }, ...aph]).badBreedHorses.length, 0);
  });
});

describe('Echter kopierter Spieltext (Ice: "*Iced* Ramiro -)B(-", Desktop-Kopie mit Stammbaum)', () => {
  const RAMIRO_TEXT = `*Iced* Ramiro -)B(-
6 Jahre, 9 Monate
 Hengst
 Rasselos
 87.50% Reinrassig
Zum Pferd
Geburtstag: 10.03.2026
Fellfarbe: Sooty Pearl Bay Tobiano
Stockmaß: 160 cm
Erbkrankheit: Frei von Erbkrankheiten

Besitzer: Ice
Reitbeteiligung: Ice
Wert: 7945 DD

Turnierpotenzial
Begabung: Klassische Dressur	Disziplinen: 98
Gesamtpotenzial: 341	Grundlagen: 243
Erfahrung
86 %
Alle Disziplinen anzeigen?
Zucht
Nachkommen
Turniere
Erfolge
Papiere
Rasse: Rasselos
Reinrassigkeit: 87.50 % Rasseanteile anzeigen?
Züchter: Ice

Zuchtzulassung Ja
HLP/SLP: Nein

Nachkommen insgesamt: 0
Gedeckte Stuten: 0
Zucht
ICO: 0.000 %
Fruchtbarkeit: 83 %
Deckhengst
In Zuchtstation?: Nein
Decktaxe: -
Heute gedeckte Stuten: 0
Besitzhistorie
Stammbaum
 
*Iced* Ramiro -)B(-
Rasselos

Potential: 341
 
~PRE~ Rayo Pl ~ ZF ~
Andalusier

Potential: 361
 
*Iced* Urania -)B(-
Rasselos

Potential: 340
~PRE~ Rhamos Pl ~ ZF ~
Andalusier

Potential: 340
~PRE~ Gana Pl ~ ZF ~
Andalusier

Potential: 358
*Iced* Arctic Diamond -B-
Rasselos

Potential: 309
Jama´s Uth Duna
Andalusier

Potential: 355
~PRE~ Remolino Pl ~ ZF ~
Andalusier
~PRE~ Bailadora ~ ZF ~
Andalusier
~PRE~ Otario Pl ~ ZF ~
Andalusier
~PRE~ Gallega ~ ZF ~
Andalusier
Welten's Arctic Night pl 'ph
American Paint Horse
Diamante Brillante - 319 ~Sun~
Andalusier
Castigo de Loens
Andalusier
Jama´s Flora
Andalusier
Exterieur
Körperbau
Kopf	Zu großer Kopf
`;

  test('Stammbaum: alle 14 Vorfahren mit korrekt gepaartem Namen/Rasse, kein Versatz', () => {
    const r = parseHorseText(RAMIRO_TEXT);
    assert.equal(r.name, '*Iced* Ramiro -)B(-');
    assert.equal(r.breed, 'Rasselos');
    const anc = r.pedigree.ancestors;
    assert.equal(anc.length, 14);
    assert.deepEqual(anc.slice(0, 6).map((a) => [a.name, a.breed, a.potential]), [
      ['~PRE~ Rayo Pl ~ ZF ~', 'Andalusier', 361],
      ['*Iced* Urania -)B(-', 'Rasselos', 340],
      ['~PRE~ Rhamos Pl ~ ZF ~', 'Andalusier', 340],
      ['~PRE~ Gana Pl ~ ZF ~', 'Andalusier', 358],
      ['*Iced* Arctic Diamond -B-', 'Rasselos', 309],
      ['Jama´s Uth Duna', 'Andalusier', 355],
    ]);
    assert.deepEqual(anc.slice(10).map((a) => [a.name, a.breed]), [
      ["Welten's Arctic Night pl 'ph", 'American Paint Horse'],
      ['Diamante Brillante - 319 ~Sun~', 'Andalusier'],
      ['Castigo de Loens', 'Andalusier'],
      ['Jama´s Flora', 'Andalusier'],
    ]);
  });

  test('Stammbaum-Prüfung flaggt dieses korrekt eingelesene Pferd nicht', () => {
    const r = parseHorseText(RAMIRO_TEXT);
    const horse = { name: r.name, breed: r.breed, pedigree: r.pedigree };
    const others = [1, 2, 3].map((i) => ({ name: `Bestand ${i}`, breed: 'Andalusier', pedigree: null }));
    assert.equal(findPedigreeSuspects([horse, ...others]).suspects.length, 0);
  });
});

