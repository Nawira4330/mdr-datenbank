// Kurzlebiger Zwischenspeicher fuer Mehrfachauswahl-Menues (siehe
// horseSelect.js): das Auswahlmenue selbst darf im customId nur wenig
// Text tragen (Discord-Limit 100 Zeichen), daher steckt hier nur eine
// kurze ID im customId, waehrend die eigentlichen Zusatzdaten (z.B. der
// Kaeufer-Name bei /mdrdb-verkaufen) rein im Bot-Prozess-Speicher bleiben.
// Bewusst nicht persistent (kein Neustart-ueberlebend noetig) - eine
// offene Auswahl verfaellt ohnehin nach kurzer Zeit von selbst.
const pending = new Map();
let counter = 0;

const TTL_MS = 10 * 60 * 1000;

function createPendingAction(data) {
  const id = String(++counter);
  pending.set(id, data);
  setTimeout(() => pending.delete(id), TTL_MS).unref();
  return id;
}

function takePendingAction(id) {
  const data = pending.get(id);
  pending.delete(id);
  return data;
}

module.exports = { createPendingAction, takePendingAction };
