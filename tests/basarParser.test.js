// Unit-Tests für js/basarParser.js - Ausführen mit: node --test tests/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseBasarListText, detectVerkaeuferNr, extractPrice, extractLeadingArtikelNr,
  splitNameBeschreibung, formatPreis, parsePreisInput,
} = require('../js/basarParser.js');

describe('detectVerkaeuferNr', () => {
  test('findet "Verkäufernummer: 12"', () => {
    assert.equal(detectVerkaeuferNr('Verkäufernummer: 12\n1. Puppe 3,50'), '12');
  });

  test('findet "Verkäufer-Nr 7"', () => {
    assert.equal(detectVerkaeuferNr('Verkäufer-Nr 7\nHallo'), '7');
  });

  test('kein Treffer -> leerer String', () => {
    assert.equal(detectVerkaeuferNr('1. Puppe 3,50'), '');
  });
});

describe('extractPrice', () => {
  test('erkennt Preis mit Komma und Euro-Zeichen', () => {
    assert.deepEqual(extractPrice('Puppe blau 3,50€'), { rest: 'Puppe blau', preis: 3.5 });
  });

  test('erkennt Preis mit Leerzeichen vor Euro', () => {
    assert.deepEqual(extractPrice('Jacke 12,00 €'), { rest: 'Jacke', preis: 12 });
  });

  test('erkennt Preis ohne Komma, aber mit Euro-Wort', () => {
    assert.deepEqual(extractPrice('Buch 5 Euro'), { rest: 'Buch', preis: 5 });
  });

  test('ignoriert reine Zahl ohne Komma/Währung (z.B. Größenangabe)', () => {
    assert.deepEqual(extractPrice('Jacke Gr 128'), { rest: 'Jacke Gr 128', preis: null });
  });
});

describe('extractLeadingArtikelNr', () => {
  test('erkennt "3. "', () => {
    assert.deepEqual(extractLeadingArtikelNr('3. Puppe'), { rest: 'Puppe', artikelNr: '3' });
  });

  test('erkennt "Art.-Nr. 12 "', () => {
    assert.deepEqual(extractLeadingArtikelNr('Art.-Nr. 12 Spielzeugauto'), { rest: 'Spielzeugauto', artikelNr: '12' });
  });

  test('erkennt "#4 "', () => {
    assert.deepEqual(extractLeadingArtikelNr('#4 Buch'), { rest: 'Buch', artikelNr: '4' });
  });

  test('kein Treffer ohne führende Nummer', () => {
    assert.deepEqual(extractLeadingArtikelNr('Puppe blau'), { rest: 'Puppe blau', artikelNr: null });
  });
});

describe('splitNameBeschreibung', () => {
  test('trennt an " - "', () => {
    assert.deepEqual(splitNameBeschreibung('Jacke - blau, Gr. 128'), { name: 'Jacke', beschreibung: 'blau, Gr. 128' });
  });

  test('trennt an ": "', () => {
    assert.deepEqual(splitNameBeschreibung('Buch: Gut erhalten'), { name: 'Buch', beschreibung: 'Gut erhalten' });
  });

  test('ohne Trenner bleibt alles im Namen', () => {
    assert.deepEqual(splitNameBeschreibung('Puppenwagen'), { name: 'Puppenwagen', beschreibung: '' });
  });
});

describe('parseBasarListText', () => {
  test('parst eine vollständige Beispielliste', () => {
    const text = [
      'Verkäufernummer: 12',
      '1. Jacke blau Gr. 128 - guter Zustand 8,00€',
      '2. Puppenwagen 12,50 €',
      '3. Buch: Gut erhalten 2,00€',
    ].join('\n');

    const result = parseBasarListText(text);
    assert.equal(result.verkaeuferNr, '12');
    assert.equal(result.rows.length, 3);

    assert.deepEqual(result.rows[0], {
      artikelNr: '1', name: 'Jacke blau Gr. 128', beschreibung: 'guter Zustand',
      preis: 8, confidence: 'ok', rawLine: '1. Jacke blau Gr. 128 - guter Zustand 8,00€',
    });
    assert.equal(result.rows[1].artikelNr, '2');
    assert.equal(result.rows[1].preis, 12.5);
    assert.equal(result.rows[2].beschreibung, 'Gut erhalten');
  });

  test('Zeile ohne Artikelnummer/Preis wird als "unsicher" markiert, aber nicht verworfen', () => {
    const result = parseBasarListText('Puppenwagen ohne Preis');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].confidence, 'unsicher');
    assert.equal(result.rows[0].preis, '');
  });

  test('leere Zeilen und die Verkäufernummer-Zeile selbst werden übersprungen', () => {
    const result = parseBasarListText('Verkäufernummer: 5\n\n1. Buch 2,00€\n');
    assert.equal(result.rows.length, 1);
  });
});

describe('formatPreis', () => {
  test('formatiert Zahl als deutsche Preisangabe', () => {
    assert.equal(formatPreis(3.5), '3,50 €');
    assert.equal(formatPreis(12), '12,00 €');
  });

  test('leerer/ungültiger Wert -> leerer String', () => {
    assert.equal(formatPreis(null), '');
    assert.equal(formatPreis(''), '');
    assert.equal(formatPreis('abc'), '');
  });
});

describe('parsePreisInput', () => {
  test('wandelt Komma-Eingabe in Zahl um', () => {
    assert.equal(parsePreisInput('12,50'), 12.5);
    assert.equal(parsePreisInput('12.50'), 12.5);
  });

  test('leere/ungültige Eingabe -> null', () => {
    assert.equal(parsePreisInput(''), null);
    assert.equal(parsePreisInput('  '), null);
    assert.equal(parsePreisInput('abc'), null);
  });
});
