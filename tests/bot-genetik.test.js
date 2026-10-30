// Discord-Bot-Port der Farbgenetik (discord-bot/src/mdrGenetics.js):
// - Grundfarben, die Extension/Agouti bedingen, zeigen "E" und ein allgemeines "A"
//   (Nutzerwunsch 2026-10-27; das genaue Allel A1/At/Ap bleibt offen),
// - reinerbige und einfache Angabe desselben Allels erscheinen nicht gleichzeitig.
// Ausführen mit: node --test tests/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { presentGenesSummary } = require('../discord-bot/src/mdrGenetics.js');

const untested = ['Extension', 'Agouti', 'Dun', 'Cream', 'Champagne', 'Grey', 'KIT', 'Silver', 'Overo', 'Splashed', 'Appaloosa', 'PATN1']
  .map((label) => ({ label, value: 'Nicht getestet' }));
const codes = (coat, parentHints = []) =>
  presentGenesSummary(untested, coat, null, 'Testpferd', parentHints, null, false).map((g) => g.alleles).join(' ');

describe('Bot-Farbgenetik: E und A bei bedingender Grundfarbe', () => {
  test('Bay/Sealbrown/Wildbay/Buckskin: E und allgemeines A', () => {
    assert.equal(codes('Bay'), 'E A');
    assert.equal(codes('Sealbrown'), 'E A');
    assert.equal(codes('Wildbay'), 'E A');
    assert.equal(codes('Buckskin'), 'E A Cr');
  });

  test('Farben ohne Agouti-Bedingung bekommen kein A', () => {
    assert.equal(codes('Chestnut'), '');
    assert.equal(codes('Palomino'), 'Cr');
  });

  test('Perlino Champagne Splashed White mit Cr vom Elternteil: nur CrCr, kein zusätzliches Cr', () => {
    const parents = [{ locus: 'Champagne', alleles: 'Ch' }, { locus: 'Splashed', alleles: 'SPL' }, { locus: 'Cream', alleles: 'Cr' }];
    assert.equal(codes('Perlino Champagne Splashed White', parents), 'E A CrCr Ch SPL');
  });
});
