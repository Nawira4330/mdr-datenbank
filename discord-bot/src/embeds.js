const { EmbedBuilder } = require('discord.js');
const { computeDisplayFields, DASH } = require('./horseStats');
const { getParentNames } = require('./pedigree');

const COLOR = 0x8b5e3c;

// Feste Farbpalette, damit alle Nachrichten zu EINEM Pferd (Hauptkarte,
// Eltern, Geschwister, Nachkommen) dieselbe Farbe haben und optisch als
// zusammengehoerig erkennbar sind - die Farbe wird deterministisch aus der
// Pferde-ID abgeleitet (kein gemeinsamer Zustand zwischen den Interaktionen
// noetig), sodass das naechste nachgeschlagene Pferd ueblicherweise eine
// andere Farbe bekommt.
const HORSE_COLOR_PALETTE = [
  0x8b5e3c, 0x4c6ef5, 0x2f9e44, 0xe8590c, 0xae3ec9,
  0x1098ad, 0xf08c00, 0xe64980, 0x37b24d, 0x5c7cfa,
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorForHorse(horse) {
  const key = horse.id ?? horse.name ?? '';
  return HORSE_COLOR_PALETTE[hashString(String(key)) % HORSE_COLOR_PALETTE.length];
}

// Wie js/horseView.js (mdr-link-btn) - der Link zur Pferdeseite im Spiel
// selbst wird aus der frei gepflegten "external_id" gebaut (siehe
// supabase/migration_012_horses_external_id.sql), nicht aus der internen
// Supabase-UUID.
function mdrGameLink(externalId) {
  if (!externalId) return null;
  return `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(externalId)}`;
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Rasse/Geschlecht/Farbe zusammen in einem Feld statt drei einzelnen
// Boxen - jede Zeile trotzdem einzeln beschriftet, damit trotz der
// kompakteren Darstellung klar bleibt, was was ist. Rasseanteile (falls
// vorhanden) als kursive Zusatzzeile direkt unter der Rasse.
function steckbriefValue(d) {
  const lines = [`Rasse: ${d.breed}`];
  if (d.breedComposition != null) lines.push(`*${d.breedComposition}*`);
  lines.push(`Geschlecht: ${d.gender}`);
  lines.push(`Farbe: ${d.coatColor}`);
  lines.push(`Zuchtzulassung: ${d.zzl}`);
  return lines.join('\n');
}

// Namen der Eltern stehen bereits im pedigree-Feld des Pferdes selbst -
// keine zusaetzliche Datenbankabfrage noetig, um sie immer direkt unter
// der Hauptkarte mit anzuzeigen (statt nur ueber das Menue abrufbar).
function elternValue(horse) {
  const { father, mother } = getParentNames(horse);
  return `Vater: ${father || DASH}\nMutter: ${mother || DASH}`;
}

function buildHorseEmbed(horse) {
  const d = computeDisplayFields(horse);
  const link = mdrGameLink(horse.external_id);

  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(d.name)
    .addFields(
      { name: 'Steckbrief', value: steckbriefValue(d) },
      { name: 'Eltern', value: elternValue(horse) },
      { name: 'Farbgenetik', value: `\`${d.colorGenetics}\`` },
      { name: 'Leistungswerte', value: `GP ${d.gp}\nExt ${d.ext} (${d.extPercent})\nInt ${d.int}\nHLP/SLP ${d.hlpSlp}` },
      { name: 'Besitzer', value: d.owner },
    );

  // Der Link zur Pferdeseite im Spiel steckt schon im klickbaren Titel
  // (setURL) - kein zusaetzliches "Link"-Feld mehr, um die Karte nicht
  // unnoetig zu verlaengern.
  if (link) embed.setURL(link);
  if (isHttpUrl(horse.image_url)) embed.setImage(horse.image_url);

  return embed;
}

function genderIcon(gender) {
  if (gender === 'Stute' || gender === 'Stutfohlen') return '♀';
  if (gender === 'Hengst' || gender === 'Wallach' || gender === 'Hengstfohlen') return '♂';
  return '•';
}

function formatRelativeLine(horse, extraLabel) {
  const d = computeDisplayFields(horse);
  const suffix = extraLabel ? ` _(${extraLabel})_` : '';
  return (
    `${genderIcon(horse.gender)} **${d.name}**${suffix}\n` +
    `Farbe: ${d.coatColor} | ZZL: ${d.zzl} | Besitzer: ${d.owner}\n` +
    `GP: ${d.gp} | Ext: ${d.ext} | Ext%: ${d.extPercent} | Int: ${d.int} | HLP/SLP: ${d.hlpSlp}`
  );
}

// Discord erlaubt max. 1024 Zeichen je Feld-Wert - statt ueberzaehlige
// Eintraege mit "... und X weitere" abzuschneiden, werden sie auf mehrere
// Felder verteilt, damit wirklich JEDER Treffer angezeigt wird. Das erste
// Feld traegt die Gesamtanzahl im Namen, weitere Felder (falls noetig)
// heissen "(Fortsetzung)".
function linesToFields(baseLabel, lines) {
  if (!lines.length) return [{ name: `${baseLabel} (0)`, value: 'Keine gefunden.' }];

  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n\n${line}` : line;
    if (next.length > 1024) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((value, i) => ({
    name: i === 0 ? `${baseLabel} (${lines.length})` : `${baseLabel} (Fortsetzung)`,
    value,
  }));
}

function buildParentsEmbed(horse, father, mother) {
  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(`Eltern von ${horse.name}`);

  embed.addFields({
    name: 'Vater',
    value: father ? formatRelativeLine(father) : DASH,
  });
  embed.addFields({
    name: 'Mutter',
    value: mother ? formatRelativeLine(mother) : DASH,
  });

  return embed;
}

// "label" ist "Geschwister/Halbgeschwister (Vater)" bzw. "... (Mutter)" -
// beide Ansichten sind unabhaengige Menuepunkte (siehe submenu.js/index.js),
// ein Vollgeschwister (teilt beide Eltern) taucht daher in beiden Ansichten
// auf, wenn man sie nacheinander aufruft.
function buildSiblingsEmbed(horse, label, siblings) {
  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(`Geschwister von ${horse.name} – ${label}`);

  embed.addFields(...linesToFields(label, siblings.map((h) => formatRelativeLine(h))));

  return embed;
}

function buildOffspringEmbed(horse, offspring) {
  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(`Nachkommen von ${horse.name}`);

  embed.addFields(...linesToFields('Nachkommen', offspring.map((h) => formatRelativeLine(h))));

  return embed;
}

// Farben angelehnt an HORSE_TAG_OPTIONS in js/parser.js (--danger/--warning/
// --success/--tag-blue/--tag-purple), damit die Einfaerbung auch hier
// intuitiv nach Ampel-/Kategorie-Logik funktioniert statt zufaellig zu sein
// wie bei colorForHorse.
const TAG_EMBED_COLORS = {
  Verkauf: 0xe03131,
  Reserviert: 0xf08c00,
  Bleibt: 0x2f9e44,
  Zuchttier: 0x1c7ed6,
  GBH: 0x9c36b5,
};

function buildTagSearchEmbed(tagLabel, horses) {
  const embed = new EmbedBuilder()
    .setColor(TAG_EMBED_COLORS[tagLabel] || COLOR)
    .setTitle(`Pferde mit Schlagwort „${tagLabel}"`);

  const lines = horses.map((h) => {
    const note = (h.tags || []).find((t) => t.label === tagLabel)?.note;
    return formatRelativeLine(h, note);
  });

  embed.addFields(...linesToFields(tagLabel, lines));

  return embed;
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('MDR Pferdedatenbank – Befehle')
    .addFields(
      {
        name: '/mdrdb pferd',
        value:
          'Pferd per Namenssuche (Dropdown) anzeigen: Rasse, Geschlecht, Farbe, Farbgenetik, ' +
          'Leistungswerte (GP/Ext/Ext%/Int), Besitzer. Danach oeffnet sich ein privates Menue, ' +
          'um zusaetzlich Eltern, Geschwister/Halbgeschwister oder Nachkommen oeffentlich zu posten.',
      },
      {
        name: '/mdrdb-rassen  _(nur Admin, für andere unsichtbar)_',
        value:
          'Legt fest, welche Rassen auf diesem Server ueberhaupt durchsuchbar sind ' +
          '(Mehrfachauswahl, keine Auswahl = alle Rassen).',
      },
      {
        name: '/mdrdb-kanal  _(nur Admin, für andere unsichtbar)_',
        value:
          'Legt fuer den aktuellen Kanal zwei unabhaengige Filter fest: Zuchtzulassung ' +
          '(alle / nur ohne / nur mit) und Geschlecht (Stute/Hengst/Wallach, ' +
          '"Stute"/"Hengst" schliessen die jeweiligen Fohlen mit ein; keine Auswahl = alle).',
      },
      {
        name: '/mdrdb-tag',
        value:
          'Listet alle Pferde mit einem bestimmten Schlagwort auf (Verkauf/Reserviert/Bleibt/' +
          'Zuchttier/GBH), optional per Namensausschnitt eingegrenzt.',
      },
      {
        name: '/mdrdb-verkaufen  _(nur der/die aktuelle Besitzer*in)_',
        value:
          'Markiert ein Pferd mit dem Schlagwort "Verkauf" inkl. Kaeufer-Notiz. Aendert NICHT ' +
          'das Besitzer-Feld - das passiert erst mit /mdrdb-besitzer, sobald der Verkauf ' +
          'abgeschlossen ist.',
      },
      {
        name: '/mdrdb-besitzer  _(nur der/die aktuelle Besitzer*in)_',
        value:
          'Aendert das Besitzer-Feld eines Pferdes und entfernt dabei automatisch ein ' +
          'vorhandenes "Verkauf"-Schlagwort (der Verkauf ist dann abgeschlossen).',
      },
      {
        name: '/mdrdb hilfe',
        value: 'Zeigt diese Uebersicht.',
      },
    );
}

module.exports = {
  buildHorseEmbed,
  buildParentsEmbed,
  buildSiblingsEmbed,
  buildOffspringEmbed,
  buildTagSearchEmbed,
  buildHelpEmbed,
};
