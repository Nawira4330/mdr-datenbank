// Hilfsskript zum manuellen Abgleich: laedt ein echtes Pferd aus Supabase
// und gibt die berechneten Anzeige-Werte (GP/Ext/Ext%/Int/Farbgenetik) auf
// der Konsole aus - zum Vergleich mit der Detailansicht auf horse.html
// fuer dasselbe Pferd. Rein lesend, kein Discord-Token noetig.
//
// Aufruf: node scripts/check-horse.js "Pferdename"
const supabase = require('../src/supabaseClient');
const { computeDisplayFields } = require('../src/horseStats');
const { getParentNames } = require('../src/pedigree');

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Bitte einen Pferdenamen als Argument angeben: node scripts/check-horse.js "Name"');
    process.exit(1);
  }

  const { data: horse, error } = await supabase.from('horses').select('*').eq('name', name).maybeSingle();
  if (error) throw error;
  if (!horse) {
    console.error(`Kein Pferd mit dem Namen "${name}" gefunden.`);
    process.exit(1);
  }

  console.log(computeDisplayFields(horse));
  console.log('Eltern (aus Stammbaum):', getParentNames(horse));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
