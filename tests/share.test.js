// Teilen/Kopieren ausgewählter Pferde (js/shareHorses.js) - reine Funktionen.
// Ausführen mit: node --test tests/share.test.js

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { SHARE_DEFAULT_KEYS, shareCardModel, shareText, shareTsv, shareLinks, shareWrapText } = require('../js/shareHorses.js');

const view = (over = {}) => ({
  name: 'Fohlen_Aliada', imageUrl: '', breed: 'Rasselos', gender: 'Stute', age: '2 J, 3 M',
  color: 'Perlino Champagne', genes: 'E A1 CrCr Ch', gp: '331', ext: '2,50', extPct: '55,5%', int: '2,10',
  zzl: 'Ja', hlp: '-', ekh: 'HERDA', parents: 'Vater Sun | Mutter Aliada', owner: 'Ice', tags: 'Zucht, Training',
  link: 'https://www.morning-dust-ranch.de/index2.php?site=pferd&id=864841', ...over,
});

describe('shareText (Discord-Formatierung)', () => {
  test('Standardfelder: Titel, Farbe mit Code, Kennzahlen, Besitzer, Link', () => {
    const t = shareText([view()], SHARE_DEFAULT_KEYS);
    assert.equal(t, [
      '**Fohlen_Aliada** – Rasselos, Stute, 2 J, 3 M',
      'Farbe: Perlino Champagne `E A1 CrCr Ch`',
      'GP 331 | Ext 2,50 (55,5%) | Int 2,10 | ZZL Ja',
      'Besitzer: Ice',
      'https://www.morning-dust-ranch.de/index2.php?site=pferd&id=864841',
    ].join('\n'));
  });

  test('nur ausgewählte Felder erscheinen, ohne Links auf Wunsch', () => {
    const t = shareText([view()], ['gp', 'owner'], { withLinks: false });
    assert.equal(t, '**Fohlen_Aliada**\nGP 331\nBesitzer: Ice');
  });

  test('Ext% allein, optionale Felder (Eltern, Schlagwörter, EKH, HLP/SLP)', () => {
    const t = shareText([view()], ['extPct', 'hlp', 'ekh', 'parents', 'tags'], { withLinks: false });
    assert.equal(t, [
      '**Fohlen_Aliada**',
      'Ext% 55,5% | HLP/SLP - | EKH HERDA',
      'Eltern: Vater Sun | Mutter Aliada',
      'Schlagwörter: Zucht, Training',
    ].join('\n'));
  });

  test('mehrere Pferde durch Leerzeile getrennt; fehlende Werte werden weggelassen', () => {
    const t = shareText([view(), view({ name: 'B', gp: '', ext: '', extPct: '', int: '', link: '' })], ['gp', 'ext', 'int', 'zzl'], {});
    assert.equal(t, '**Fohlen_Aliada**\nGP 331 | Ext 2,50 | Int 2,10 | ZZL Ja\nhttps://www.morning-dust-ranch.de/index2.php?site=pferd&id=864841\n\n**B**\nZZL Ja');
  });

  test('Farbe ohne Genetik und umgekehrt', () => {
    assert.match(shareText([view()], ['color'], { withLinks: false }), /Farbe: Perlino Champagne$/);
    assert.match(shareText([view()], ['genes'], { withLinks: false }), /Farbe: `E A1 CrCr Ch`$/);
  });
});

describe('shareTsv / shareLinks / shareCardModel', () => {
  test('Tabelle: Kopfzeile + eine Zeile je Pferd, Tabs/Zeilenumbrüche entschärft, Bild-Spalte entfällt', () => {
    const tsv = shareTsv([view({ name: 'A\tB', owner: 'x\ny' })], ['image', 'gp', 'owner']);
    assert.equal(tsv, 'Name\tGP\tBesitzer\nA B\t331\tx y');
  });

  test('Links: nur Pferde mit Spiel-Link, "Name: Link" je Zeile', () => {
    assert.equal(shareLinks([view(), view({ name: 'B', link: '' })]),
      'Fohlen_Aliada: https://www.morning-dust-ranch.de/index2.php?site=pferd&id=864841');
    assert.equal(shareLinks([view({ link: '' })]), '');
  });

  test('Kartenmodell: Untertitel nur aus gewählten Feldern', () => {
    const m = shareCardModel(view(), ['breed', 'age']);
    assert.equal(m.sub, 'Rasselos, 2 J, 3 M');
    assert.deepEqual(m.rows, []);
    assert.deepEqual(m.stats, []);
  });
});

describe('shareWrapText', () => {
  const measure = (s) => s.length * 10;
  test('bricht an Wortgrenzen um', () => {
    assert.deepEqual(shareWrapText('aaa bbb ccc ddd', 70, measure), ['aaa bbb', 'ccc ddd']);
  });
  test('zu langes Einzelwort bleibt in einer Zeile, leerer Text -> keine Zeilen', () => {
    assert.deepEqual(shareWrapText('abcdefghijkl x', 50, measure), ['abcdefghijkl', 'x']);
    assert.deepEqual(shareWrapText('', 50, measure), []);
  });
});
