// Persistente Bot-Einstellungen pro Discord-Server (Rassen-Einschraenkung)
// und pro Kanal (Zuchtzulassungs-Filter) - bewusst als lokale JSON-Datei
// statt in Supabase, da das reine Bot-Betriebs-Konfiguration ist (nicht
// Teil der eigentlichen Pferdedatenbank, die auch von der Weboberflaeche
// und dem separaten Zucht-/Turnierplaner genutzt wird).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'settings.json');

function loadRaw() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { guilds: {}, channels: {} };
  }
}

function saveRaw(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// allowedBreeds: leeres Array = keine Einschraenkung (alle Rassen
// durchsuchbar). Werte sind Anzeige-Rassenamen wie in horses.breed bzw.
// "Rasselos" fuer Pferde ohne eingetragene Rasse (siehe embeds.js
// breedDisplay).
function getGuildSettings(guildId) {
  const data = loadRaw();
  return { allowedBreeds: [], ...(data.guilds[guildId] || {}) };
}

function setAllowedBreeds(guildId, breeds) {
  const data = loadRaw();
  data.guilds[guildId] = { ...(data.guilds[guildId] || {}), allowedBreeds: breeds };
  saveRaw(data);
}

// zzlFilter: 'none' (kein Filter) | 'without' (nur ohne Zuchtzulassung) |
// 'with' (nur mit Zuchtzulassung). allowedGenders: leeres Array = keine
// Einschraenkung (alle Geschlechter), sonst nur die ausgewaehlten
// (Stute/Hengst/Wallach/Stutfohlen/Hengstfohlen, siehe channelFilterSelect.js).
// Beide Filter gelten unabhaengig voneinander (UND-verknuepft).
function getChannelSettings(channelId) {
  const data = loadRaw();
  return { zzlFilter: 'none', allowedGenders: [], ...(data.channels[channelId] || {}) };
}

function setChannelZzlFilter(channelId, value) {
  const data = loadRaw();
  data.channels[channelId] = { ...(data.channels[channelId] || {}), zzlFilter: value };
  saveRaw(data);
}

function setChannelAllowedGenders(channelId, genders) {
  const data = loadRaw();
  data.channels[channelId] = { ...(data.channels[channelId] || {}), allowedGenders: genders };
  saveRaw(data);
}

module.exports = {
  getGuildSettings,
  setAllowedBreeds,
  getChannelSettings,
  setChannelZzlFilter,
  setChannelAllowedGenders,
};
