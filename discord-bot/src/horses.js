const supabase = require('./supabaseClient');

async function fetchHorseByName(name) {
  const { data, error } = await supabase.from('horses').select('*').eq('name', name).maybeSingle();
  if (error) throw new Error(`Supabase-Fehler beim Laden von "${name}": ${error.message}`);
  return data;
}

async function fetchHorseById(id) {
  const { data, error } = await supabase.from('horses').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Supabase-Fehler beim Laden von Pferd ${id}: ${error.message}`);
  return data;
}

module.exports = { fetchHorseByName, fetchHorseById };
