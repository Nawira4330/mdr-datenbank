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
