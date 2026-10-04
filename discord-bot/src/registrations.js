// Persistente Zuordnung Discord-Nutzer-ID -> Besitzername (per
// /mdrdb-register gesetzt), damit Namenssuchen im Bot auf die eigenen
// Pferde eingegrenzt werden koennen (siehe ownership.js). Gleiches
// Speicher-Muster wie settings.js (lokale JSON-Datei statt Supabase, da
// reine Bot-Konfiguration, kein Teil der eigentlichen Pferdedatenbank).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'registrations.json');

function loadRaw() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveRaw(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getRegisteredOwner(userId) {
  return loadRaw()[userId] || null;
}

function setRegisteredOwner(userId, ownerName) {
  const data = loadRaw();
  data[userId] = ownerName;
  saveRaw(data);
}

module.exports = { getRegisteredOwner, setRegisteredOwner };
