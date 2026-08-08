const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// Nur lesender Zugriff (anon key + public-read Policy, siehe
// supabase/migration_005_public_read_access.sql im Hauptrepo) - der Bot
// schreibt/aendert nie Pferdedaten.
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false },
});

module.exports = supabase;
