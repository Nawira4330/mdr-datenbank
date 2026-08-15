// Feste Schlagwort-Liste wie HORSE_TAG_OPTIONS in ../js/parser.js - hier
// nur die Labels, da der Bot keine CSS-Farben braucht (siehe embeds.js
// TAG_EMBED_COLORS fuer die Discord-Entsprechung).
const HORSE_TAG_LABELS = ['Verkauf', 'Reserviert', 'Bleibt', 'GBH', 'LastFoal', '???'];

// Setzt/ueberschreibt genau ein Tag anhand seines Labels, alle anderen
// Tags bleiben unveraendert - wie das Uebernehmen eines Vorschlags in
// js/list.js (Map ueber vorhandene Tags, dann ein Eintrag ersetzt).
function setTag(tags, label, note) {
  const merged = new Map((tags || []).map((t) => [t.label, t]));
  merged.set(label, note ? { label, note } : { label });
  return [...merged.values()];
}

function removeTag(tags, label) {
  return (tags || []).filter((t) => t.label !== label);
}

function hasTag(tags, label) {
  return (tags || []).some((t) => t.label === label);
}

module.exports = { HORSE_TAG_LABELS, setTag, removeTag, hasTag };
