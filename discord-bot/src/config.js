require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Fehlende Umgebungsvariable: ${name} (siehe .env.example)`);
  return value;
}

module.exports = {
  discordToken: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID || null,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  // Optional (nur fuer die Schreib-Befehle /mdrdb-verkaufen und
  // /mdrdb-besitzer noetig) - bewusst NICHT mit required(), damit der Bot
  // auch ohne diesen Key startet und nur beim tatsaechlichen Aufruf dieser
  // beiden Befehle eine klare Fehlermeldung zeigt (siehe index.js).
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
};
