const supabase = require('./supabaseClient');

// Bewusst KEIN select(BOT_HORSE_COLUMNS): horses.raw_text (der komplette eingefügte
// Spieltext, wird seit Kurzem wieder mitgespeichert) ist groß und wird vom Bot
// nie angezeigt - bei /mdrdb pferd würde er sonst für das Pferd UND beide
// Eltern jedes Mal mitübertragen (Egress). Die Liste enthält genau die
// Spalten, die der Bot tatsächlich liest.
const BOT_HORSE_COLUMNS = [
  'id', 'name', 'external_id', 'gender', 'breed', 'breed_composition', 'purebred_pct',
  'coat_color', 'colors', 'color_gene_overrides', 'notes', 'owner',
  'exterior_genetics', 'exterior_descriptive', 'temperament', 'tournament_potential',
  'pedigree', 'breeding_allowed', 'hlp_slp', 'tags', 'birthdate', 'image_url',
].join(', ');

async function fetchHorseByName(name) {
  const { data, error } = await supabase.from('horses').select(BOT_HORSE_COLUMNS).eq('name', name).maybeSingle();
  if (error) throw new Error(`Supabase-Fehler beim Laden von "${name}": ${error.message}`);
  return data;
}

async function fetchHorseById(id) {
  const { data, error } = await supabase.from('horses').select(BOT_HORSE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Supabase-Fehler beim Laden von Pferd ${id}: ${error.message}`);
  return data;
}

module.exports = { fetchHorseByName, fetchHorseById };
