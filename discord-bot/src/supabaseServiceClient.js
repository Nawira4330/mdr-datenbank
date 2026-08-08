const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// Einziger schreibender Client im Bot. Nutzt bewusst den geheimen
// service_role Key statt den anon Key mit einer neuen RLS-Schreibpolicy
// freizugeben: der anon Key steht bereits oeffentlich im Frontend-Code der
// Hauptseite (siehe supabase/migration_005_public_read_access.sql) - eine
// anon-Schreibpolicy waere daher fuer JEDEN mit diesem oeffentlichen Key
// nutzbar, nicht nur ueber den Bot. Der service_role Key bleibt dagegen
// ausschliesslich in der Server-.env und wird nur in den bereits im
// Bot-Code rechte-geprueften Befehlen (siehe requireHorseOwner in
// index.js) verwendet.
//
// "null" wenn SUPABASE_SERVICE_ROLE_KEY nicht gesetzt ist (siehe
// config.js) - die aufrufenden Befehle pruefen das selbst und zeigen dann
// eine klare Fehlermeldung, statt hier beim Start abzustuerzen.
const supabaseService = config.supabaseServiceRoleKey
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;

module.exports = supabaseService;
