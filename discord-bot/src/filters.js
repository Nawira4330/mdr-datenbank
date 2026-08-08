// Prueft, ob ein Pferd zu den auf diesem Server/in diesem Kanal
// konfigurierten Einschraenkungen passt (siehe settings.js) - wird sowohl
// in der Autocomplete-Namenssuche als auch beim finalen Nachschlagen des
// exakten Namens angewendet, damit sich der Kanal-/Rassenfilter nicht
// durch Eintippen eines nicht vorgeschlagenen Namens umgehen laesst.
function breedLabel(horse) {
  return horse.breed || 'Rasselos';
}

// Fohlen fallen unter die jeweilige erwachsene Kategorie - ein
// Stutfohlen wird spaeter eine Stute, ein Hengstfohlen ein Hengst (oder
// Wallach, aber das laesst sich vorher nicht wissen). Wer im Kanal-Filter
// "Stute" auswaehlt, soll also automatisch auch Stutfohlen sehen, ohne
// das extra ankreuzen zu muessen. Wallach hat keine Fohlen-Entsprechung.
const GENDER_GROUPS = {
  Stute: ['Stute', 'Stutfohlen'],
  Hengst: ['Hengst', 'Hengstfohlen'],
  Wallach: ['Wallach'],
};

function genderMatchesAllowed(gender, allowedGenders) {
  if (!allowedGenders?.length) return true;
  return allowedGenders.some((g) => (GENDER_GROUPS[g] || [g]).includes(gender));
}

function horseMatchesFilters(horse, guildSettings, channelSettings) {
  if (guildSettings?.allowedBreeds?.length && !guildSettings.allowedBreeds.includes(breedLabel(horse))) {
    return false;
  }
  if (channelSettings?.zzlFilter === 'without' && horse.breeding_allowed === true) return false;
  if (channelSettings?.zzlFilter === 'with' && horse.breeding_allowed !== true) return false;
  if (!genderMatchesAllowed(horse.gender, channelSettings?.allowedGenders)) return false;
  return true;
}

module.exports = { horseMatchesFilters, breedLabel, GENDER_GROUPS };
