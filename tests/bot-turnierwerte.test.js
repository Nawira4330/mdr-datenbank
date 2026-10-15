// Turnierwerte-Anzeige im Discord-Bot: Mindestwerte je Leistungsklasse
// (LK10 > 140, LK9 > 200, LK8 > 230, ab LK7 alles) - siehe horseStats.js.
// Ausführen mit: node --test tests/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { tournamentValuesForDisplay } = require('../discord-bot/src/horseStats.js');

const v = (name, wert, lk, extra = {}) => ({ category: 'X', name, wert, lk, interieur: 2, complete: true, ...extra });

describe('tournamentValuesForDisplay', () => {
  test('LK10 nur über 140, LK9 nur über 200, LK8 nur über 230 (genau der Schwellenwert zählt nicht)', () => {
    const shown = tournamentValuesForDisplay([
      v('a', 140, 10), v('b', 141, 10), v('c', 200, 9), v('d', 201, 9), v('e', 230, 8), v('f', 231, 8),
    ]).map((x) => x.name).sort();
    assert.deepEqual(shown, ['b', 'd', 'f']);
  });

  test('ab LK7 aufwärts wird alles gezeigt, auch niedrige Werte', () => {
    const shown = tournamentValuesForDisplay([v('a', 10, 7), v('b', 5, 1)]).map((x) => x.name).sort();
    assert.deepEqual(shown, ['a', 'b']);
  });

  test('unvollständige Einträge und fehlende Werte fallen raus, Sortierung nach Wert absteigend', () => {
    const shown = tournamentValuesForDisplay([
      v('klein', 300, 5), v('gross', 500, 3), v('unvollstaendig', 400, 4, { complete: false }), v('ohneWert', null, 4), null,
    ]).map((x) => x.name);
    assert.deepEqual(shown, ['gross', 'klein']);
  });

  test('keine/ungültige Eingabe -> leere Liste', () => {
    assert.deepEqual(tournamentValuesForDisplay(null), []);
    assert.deepEqual(tournamentValuesForDisplay(undefined), []);
  });
});
