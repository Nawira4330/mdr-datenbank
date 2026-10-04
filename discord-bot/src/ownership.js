// Gemeinsame Logik zur Ermittlung, ob ein Pferd zu der aufrufenden Person
// gehoert - genutzt fuer die Berechtigungspruefung bei /mdrdb-verkaufen/
// -besitzer (requireHorseOwner in index.js), fuer die "nur eigene
// Pferde"-Eingrenzung der Namenssuchen nach /mdrdb-register (siehe
// interactions/autocomplete.js) und fuer die Bleibt-Sonderregel bei
// /mdrdb pferd.
const { getRegisteredOwner } = require('./registrations');

// Besitzer-Feld ist reiner Freitext (keine Verknuepfung zu Discord-
// Accounts), daher kein exakter Vergleich, sondern ein toleranter "kommt
// vor"-Abgleich in beide Richtungen (Gross-/Kleinschreibung egal) - deckt
// sowohl Spitznamen im Besitzer-Feld als auch abweichende
// Discord-Anzeigenamen ab.
function ownerNameMatches(ownerField, candidateNames) {
  if (!ownerField) return false;
  const owner = ownerField.trim().toLowerCase();
  if (!owner) return false;
  return candidateNames.some((n) => {
    if (!n) return false;
    const name = n.trim().toLowerCase();
    if (!name) return false;
    return owner.includes(name) || name.includes(owner);
  });
}

// Die per /mdrdb-register hinterlegte Kennung steht zuerst (bewusst
// gesetzt, daher zuverlaessigste Quelle), Discord-Anzeigename/
// Nutzername/Server-Spitzname folgen als Fallback fuer Personen, die sich
// (noch) nicht registriert haben.
function candidateOwnerNames(interaction) {
  const registered = getRegisteredOwner(interaction.user.id);
  return [registered, interaction.user.username, interaction.user.globalName, interaction.member?.nickname].filter(
    Boolean,
  );
}

function isOwnHorse(interaction, horse) {
  return ownerNameMatches(horse.owner, candidateOwnerNames(interaction));
}

module.exports = { ownerNameMatches, candidateOwnerNames, isOwnHorse };
