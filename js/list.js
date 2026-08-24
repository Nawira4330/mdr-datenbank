let currentSort = { field: 'name', dir: 'asc' };
let selectedIds = new Set();
let lastRenderedRows = [];
let pendingDeleteIds = [];
// Id der in den Einstellungen gewählten Standard-Filtervorlage (siehe
// migration_028_default_filter_preset.sql) - null = keine, Übersicht
// startet wie bisher ungefiltert (dann greift höchstens noch
// LAST_SORT_STORAGE_KEY als Fallback für die Sortierung, siehe init()).
let defaultFilterPresetId = null;
// Id der in den Einstellungen gewählten Standard-Sortier-Vorlage (siehe
// migration_030_default_sort_preset.sql) - null = keine. Greift nur, wenn
// KEINE Standard-Filtervorlage gesetzt ist (die bringt ihre eigene
// Sortierung schon mit), siehe applyInitialFilterState().
let defaultSortPresetId = null;
// localStorage-Schlüssel für die zuletzt manuell gewählte Sortierung
// (Spaltenklick oder mobiles Sortier-Dropdown, siehe wireSortableHeaders) -
// rein geräte-lokal (kein Server-Roundtrip bei jedem Klick nötig), wird nur
// angewendet, wenn keine Standard-Filtervorlage gesetzt ist (die bringt
// ihre eigene, mit gespeicherte Sortierung schon mit, siehe applyFilterState).
const LAST_SORT_STORAGE_KEY = 'mdr_last_sort';
// Bevorzugte Rassen aus den persönlichen Einstellungen (siehe
// einstellungen.html) - null/leer = keine Einschränkung. Nur bei der
// Standardauswahl "Alle" im Rasse-Filter wirksam (siehe
// applyClientFilters), nicht bei "Alle (auch außerhalb meiner Auswahl)"
// oder einer konkret gewählten einzelnen Rasse.
let preferredBreeds = null;
// Ø-Vergleich (Checkbox "Ø-Vergleich anzeigen", siehe wireCompareAvg) -
// null = aus, sonst {gp, ext, extPercent, int} als Vergleichsbasis für
// die Grün/Rot-Markierung in rowHtml.
let compareBaseline = null;
// Persönliche Toleranzwerte für den Ø-Vergleich (Einstellungen, siehe
// migration_027_compare_tolerances.sql) - {gp, ext, extPercent, int},
// jeweils "wie viel schlechter als der Durchschnitt zählt noch als
// akzeptabel" (0/fehlend = keine Toleranz, wie bisher). Siehe cmpClass.
let compareTolerances = {};
// Häkchen "Toleranz berücksichtigen" (siehe wireCompareAvg) - bei false
// wirkt effectiveTolerance() überall wie 0, d.h. keine grüne Toleranzzone,
// nur noch strikt besser (grün) / schlechter (rot) wie vor diesem Feature.
let compareToleranceEnabled = true;
// Eingeloggtes Konto - wird u.a. von saveFilterPreset() gebraucht (siehe
// wireFilterPresets), sonst nur lokal in init() gebraucht.
let currentSession = null;
// Als Favorit markierte Pferde-IDs des eingeloggten Kontos (siehe
// migration_031_favorites_dashboard_tiles.sql) - rein persönlich, wirkt
// sich nur auf das ☆/★-Symbol in rowHtml und die "Favoriten"-Kachel aus.
let favoriteHorseIds = new Set();
// Sichtbarkeit/Reihenfolge der Kennzahlen-Kacheln (siehe
// migration_031_favorites_dashboard_tiles.sql, renderDashboardTiles) -
// leer = DEFAULT_DASHBOARD_TILES.
let dashboardTiles = [];
// Benutzername (vor dem @) des eingeloggten Kontos - fuer den
// "Nur meine"-Schnellfilter beim Besitzer (siehe onOnlyMyHorses).
let currentIdentity = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  currentSession = session;
  currentIdentity = session.user.email.split('@')[0];
  await renderSharedNav(session);
  if (!isAdminSession(session)) {
    // Löschen (einzeln wie mehrfach) bleibt in der Übersicht dem Admin
    // vorbehalten - versteckt per CSS (siehe style.css), damit rowHtml()
    // nicht zwei verschiedene Markup-Varianten pflegen muss.
    document.body.classList.add('hide-delete');
  }
  wireFilterForm();
  wireSortableHeaders();
  wireSelection();
  wireFavorites();
  wireCheckDropdowns();
  wireDeleteModal();
  wireExportCsv();
  wireCompareAvg();
  wireFilterPresets();
  wireSortPresets();
  wireScrollTop();
  showFlashBanner();
  await loadUserSettings(session);
  await showMissingDataNotice(session);
  await checkAgeNotices(session);
  await loadTagSuggestions();
  await populateFilterOptions();
  await loadFilterPresets();
  await loadSortPresets();
  await applyInitialFilterState();
}

// Entscheidet, mit welchem Zustand die Übersicht startet - in dieser
// Reihenfolge:
// 1. Standard-Filtervorlage aus den Einstellungen (siehe
//    defaultFilterPresetId/migration_028), falls gesetzt - bringt ihre
//    eigene, mit gespeicherte Sortierung gleich mit.
// 2. Sonst die Standard-Sortier-Vorlage aus den Einstellungen (siehe
//    defaultSortPresetId/migration_030), falls gesetzt - ohne Filter.
// 3. Sonst die zuletzt manuell gewählte Sortierung aus diesem Browser
//    (siehe LAST_SORT_STORAGE_KEY/saveLastSort), ohne Filter.
// 4. Sonst der Programmstandard (Name aufsteigend, keine Filter).
async function applyInitialFilterState() {
  if (defaultFilterPresetId) {
    const { data, error } = await supabaseClient
      .from('filter_presets')
      .select('filters')
      .eq('id', defaultFilterPresetId)
      .maybeSingle();
    if (!error && data?.filters) {
      await applyFilterState(data.filters);
      // Zeigt in "Vorlage laden…" an, welche Vorlage gerade aktiv ist -
      // nur kosmetisch, wirkt sich nicht auf die Filterung selbst aus.
      const presetSelect = document.querySelector('#filter-preset-select');
      if ([...presetSelect.options].some((o) => o.value === defaultFilterPresetId)) {
        presetSelect.value = defaultFilterPresetId;
      }
      return;
    }
  }

  if (defaultSortPresetId) {
    const { data, error } = await supabaseClient
      .from('sort_presets')
      .select('sort_field, sort_dir')
      .eq('id', defaultSortPresetId)
      .maybeSingle();
    if (!error && data?.sort_field) {
      currentSort = { field: data.sort_field, dir: data.sort_dir };
      syncMobileSortControls();
      // Zeigt in "Sortierung laden…" an, welche Vorlage gerade aktiv ist -
      // nur kosmetisch, wirkt sich nicht auf die Sortierung selbst aus.
      const sortPresetSelect = document.querySelector('#sort-preset-select');
      if ([...sortPresetSelect.options].some((o) => o.value === defaultSortPresetId)) {
        sortPresetSelect.value = defaultSortPresetId;
      }
      await loadHorses();
      return;
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(LAST_SORT_STORAGE_KEY));
    if (saved?.field) {
      currentSort = saved;
      syncMobileSortControls();
    }
  } catch {
    // Ungültiger/fehlender localStorage-Wert - beim Programmstandard bleiben.
  }
  await loadHorses();
}

// Lädt die in einstellungen.html gewählten persönlichen Einstellungen für
// das eingeloggte Konto (siehe migration_017/018) und wendet die
// bevorzugten Rassen an (preferredBreeds, siehe applyClientFilters). Das
// Aus-/Einblenden des "Verpaarungs-Log"-Menüpunkts übernimmt zentral
// renderSharedNav() (js/nav.js), da das jetzt auf jeder Seite gilt, nicht
// nur hier.
async function loadUserSettings(session) {
  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('preferred_breeds, compare_tolerances, default_filter_preset_id, default_sort_preset_id, favorite_horse_ids, dashboard_tiles')
    .eq('user_id', session.user.id)
    .maybeSingle();
  preferredBreeds = (!error && data?.preferred_breeds?.length) ? data.preferred_breeds : null;
  compareTolerances = (!error && data?.compare_tolerances) || {};
  defaultFilterPresetId = (!error && data?.default_filter_preset_id) || null;
  defaultSortPresetId = (!error && data?.default_sort_preset_id) || null;
  favoriteHorseIds = new Set((!error && data?.favorite_horse_ids) || []);
  dashboardTiles = mergeDashboardTiles(!error ? data?.dashboard_tiles : null);
}

// Zeigt einen Hinweis über den Filtern, wenn bei den EIGENEN Pferden
// (Besitzer-Feld entspricht dem eingeloggten Benutzernamen) noch Daten
// fehlen (siehe missingDataLabels in parser.js) - z.B. weil beim Kopieren
// aus dem Spiel nicht die ganze Seite markiert wurde. Andere Nutzer*innen
// sehen diesen Hinweis nur für ihre eigenen Pferde, nicht für die anderer.
async function showMissingDataNotice(session) {
  const identity = session.user.email.split('@')[0];
  const { data, error } = await supabaseClient
    .from('horses')
    .select('id, name, exterior_genetics, pedigree, tournament_potential, disciplines, breed, purebred_pct, breed_composition')
    .ilike('owner', identity);
  if (error || !data) return;

  const incomplete = data
    .map((h) => ({ id: h.id, name: h.name, missing: missingDataLabels(h) }))
    .filter((h) => h.missing.length);
  if (!incomplete.length) return;

  // Bearbeiten-Stift vor dem Namen (wie in der Uebersichtstabelle), damit
  // sich das betroffene Pferd direkt aus dem Hinweis heraus oeffnen laesst,
  // ohne erst in der Liste danach suchen zu muessen.
  const list = incomplete
    .map((h) => `<li><a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a> ${escapeHtml(h.name)} - ${escapeHtml(h.missing.join(', '))}</li>`)
    .join('');
  const notice = document.querySelector('#missing-data-notice');
  notice.innerHTML = `<summary><strong>Hinweis:</strong> Es fehlen noch Daten bei ${incomplete.length} Pferd${incomplete.length === 1 ? '' : 'en'}</summary><p>Es fehlen noch folgende Daten:</p><ul>${list}</ul>`;
  notice.hidden = false;
}

// Drei Alters-Hinweise (Geburtsdatum -> Spieljahre/-monate, siehe
// gameAgeYearsMonths in parser.js), wie showMissingDataNotice nur für
// die eigenen Pferde:
// - Fohlen, die genau 6 Spielmonate alt sind (noch im 1. Spieljahr) -
//   Erinnerung, dass sie einen Stall brauchen, verschwindet von selbst
//   wieder mit 7 Monaten.
// - Pferde, die genau 3 Spieljahre alt sind (ihr viertes Spieljahr läuft
//   gerade) - im Spiel ändert sich das Pferdebild meist mit 3 Jahren,
//   der Hinweis verschwindet von selbst wieder, sobald das Pferd 4 wird.
// - Pferde über 25 Spieljahre - bekommen automatisch das Schlagwort
//   "GBH" zugewiesen, falls noch nicht vorhanden, und werden hier als
//   Bestätigung aufgelistet.
async function checkAgeNotices(session) {
  const identity = session.user.email.split('@')[0];
  const { data, error } = await supabaseClient
    .from('horses')
    .select('id, name, birthdate, tags, created_at, updated_at, external_id')
    .ilike('owner', identity);
  if (error || !data) return;

  const withAge = data
    .map((h) => ({ ...h, age: gameAgeYearsMonths(h.birthdate) }))
    .filter((h) => h.age != null);

  const needsStall = withAge.filter((h) => h.age.years === 0 && h.age.months === 6);
  renderAgeNotice(
    '#foal-stall-notice',
    needsStall,
    `${needsStall.length} Fohlen ${needsStall.length === 1 ? 'ist' : 'sind'} 6 Monate alt`,
    '<p>Fohlen brauchen ab 6 Monaten einen eigenen Stall:</p>',
  );

  // "Ist 3 geworden" gilt technisch das ganze 4. Spieljahr (30 Tage) -
  // zwei Einschränkungen, damit der Hinweis nur bei tatsächlich neu
  // relevanten Fällen erscheint:
  // - das Formular erneut zu speichern (z.B. nach dem Bild-Update) gilt
  //   als "erledigt": bleibt das Pferd seitdem unangetastet (updated_at
  //   vor dem 3.-Geburtstag), wird der Hinweis gezeigt, sonst
  //   verschwindet er sofort statt erst nach Ablauf des ganzen
  //   Spieljahres.
  // - neu eingetragene Pferde, die schon bei der Ersteingabe älter als
  //   3 Jahre waren (created_at nach dem 3.-Geburtstag), bekommen den
  //   Hinweis gar nicht erst - die haben vermutlich schon ein aktuelles
  //   Bild, das "Bild ändert sich mit 3 Jahren" ist hier nicht relevant.
  const turningThree = withAge.filter((h) => {
    if (h.age.years !== 3) return false;
    const turnedThreeAt = new Date(h.birthdate).getTime() + 3 * REAL_DAYS_PER_GAME_YEAR * 86400000;
    const createdAt = h.created_at ? new Date(h.created_at).getTime() : 0;
    if (createdAt >= turnedThreeAt) return false;
    const savedAt = h.updated_at ? new Date(h.updated_at).getTime() : 0;
    return savedAt < turnedThreeAt;
  });
  renderAgeNotice(
    '#age3-notice',
    turningThree,
    `${turningThree.length} Pferd${turningThree.length === 1 ? '' : 'e'} ${turningThree.length === 1 ? 'ist' : 'sind'} 3 Jahre alt geworden`,
    '<p>Im Spiel ändert sich das Pferdebild meist mit 3 Jahren - bitte prüfen und ggf. aktualisieren:</p>',
  );

  const over25 = withAge.filter((h) => h.age.years > 25);
  for (const h of over25) {
    if (!(h.tags || []).some((t) => t.label === 'GBH')) {
      const merged = [...(h.tags || []), { label: 'GBH' }];
      const { error: updateError } = await supabaseClient.from('horses').update({ tags: merged }).eq('id', h.id);
      if (!updateError) h.tags = merged;
    }
  }
  renderAgeNotice(
    '#age25-notice',
    over25,
    `${over25.length} Pferd${over25.length === 1 ? '' : 'e'} über 25 Jahre - automatisch mit „GBH" markiert`,
    '<p>Pferde über 25 Jahren gelten als zu alt für Zucht/Turnier und wurden deshalb automatisch mit dem Schlagwort „GBH" (Gnadenbrot) markiert:</p>',
  );
}

function renderAgeNotice(selector, horses, summaryText, introHtml) {
  const notice = document.querySelector(selector);
  if (!horses.length) {
    notice.hidden = true;
    return;
  }
  const list = horses
    .map((h) => {
      const linkBtn = h.external_id
        ? `<a class="btn secondary icon-btn" href="https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}" target="_blank" rel="noopener" title="Zum Pferd im Spiel">🔗</a>`
        : '';
      return `<li><a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a> ${escapeHtml(h.name)} ${linkBtn}</li>`;
    })
    .join('');
  notice.innerHTML = `<summary><strong>Hinweis:</strong> ${summaryText}</summary>${introHtml}<ul>${list}</ul>`;
  notice.hidden = false;
}

// Vorgeschlagene Schlagwörter (Staging-Tabelle "tag_suggestions", siehe
// migration_023_tag_suggestions.sql) - z.B. vom MDR-Planer eingetragen.
// Wirken sich NICHT sofort auf horses.tags aus, sondern erscheinen hier
// zum manuellen Übernehmen oder Verwerfen. Nutzerwunsch: nur für das
// eigene Pferd sichtbar (horses.owner === currentIdentity, case-
// insensitiv wie bei onOnlyMyHorses), nicht für alle Konten - andere
// Vorschläge existieren zwar weiter in der Tabelle, werden hier aber
// ausgefiltert.
async function loadTagSuggestions() {
  const notice = document.querySelector('#tag-suggestions-notice');
  const { data, error } = await supabaseClient
    .from('tag_suggestions')
    .select('id, horse_id, label, note, source, horses(name, owner)')
    .order('created_at');
  const own = (data || []).filter((s) => (s.horses?.owner || '').toLowerCase() === currentIdentity.toLowerCase());
  if (error || !own.length) {
    notice.hidden = true;
    return;
  }

  const list = own.map((s) => {
    const horseName = s.horses?.name || '(unbekanntes Pferd)';
    const badgeText = s.note ? `${s.label}: ${s.note}` : s.label;
    const sourceText = s.source ? ` <span class="muted small">(aus ${escapeHtml(s.source)})</span>` : '';
    return `<li>
      <span class="horse-tag-badge" style="background:${tagColor(s.label)}">${escapeHtml(badgeText)}</span>
      für <a href="horse.html?id=${s.horse_id}">${escapeHtml(horseName)}</a>${sourceText}
      <button type="button" class="secondary icon-btn" data-accept-suggestion="${s.id}" title="Übernehmen">✓</button>
      <button type="button" class="secondary icon-btn" data-discard-suggestion="${s.id}" title="Verwerfen">✗</button>
    </li>`;
  }).join('');

  notice.innerHTML = `<summary><strong>Hinweis:</strong> ${own.length} vorgeschlagene${own.length === 1 ? 's' : ''} Schlagwort${own.length === 1 ? '' : 'e'} aus dem MDR-Planer</summary><ul>${list}</ul>`;
  notice.hidden = false;

  notice.querySelectorAll('[data-accept-suggestion]').forEach((btn) => {
    btn.addEventListener('click', () => onAcceptTagSuggestion(btn.dataset.acceptSuggestion));
  });
  notice.querySelectorAll('[data-discard-suggestion]').forEach((btn) => {
    btn.addEventListener('click', () => onDiscardTagSuggestion(btn.dataset.discardSuggestion));
  });
}

// Übernimmt einen Vorschlag ins eigentliche horses.tags (nach Label
// zusammengeführt - ein gleichlautendes bereits vorhandenes Schlagwort
// wird durch den Vorschlag samt seinem Zusatztext ersetzt, andere
// bleiben erhalten) und entfernt ihn danach aus der Staging-Tabelle.
async function onAcceptTagSuggestion(id) {
  const { data: suggestion, error: fetchError } = await supabaseClient
    .from('tag_suggestions')
    .select('horse_id, label, note')
    .eq('id', id)
    .single();
  if (fetchError || !suggestion) return;

  const { data: horse, error: horseError } = await supabaseClient
    .from('horses')
    .select('tags')
    .eq('id', suggestion.horse_id)
    .single();
  if (horseError || !horse) return;

  const newTag = suggestion.note ? { label: suggestion.label, note: suggestion.note } : { label: suggestion.label };
  const merged = new Map((horse.tags || []).map((t) => [t.label, t]));
  merged.set(newTag.label, newTag);

  const { error: updateError } = await supabaseClient
    .from('horses')
    .update({ tags: [...merged.values()] })
    .eq('id', suggestion.horse_id);
  if (updateError) {
    alert('Übernehmen fehlgeschlagen: ' + updateError.message);
    return;
  }
  await supabaseClient.from('tag_suggestions').delete().eq('id', id);
  await loadTagSuggestions();
  await loadHorses();
}

async function onDiscardTagSuggestion(id) {
  await supabaseClient.from('tag_suggestions').delete().eq('id', id);
  await loadTagSuggestions();
}

// Zeigt nach dem Anlegen/Aktualisieren eines Pferds (siehe horseForm.js)
// einmalig einen Banner mit dessen Namen. "Einmalig" heißt: sofort nach
// dem Anzeigen aus dem sessionStorage entfernt (ein erneutes Laden der
// Seite zeigt ihn also nicht nochmal), und zusätzlich bei der nächsten
// Interaktion (Filtern, Sortieren, Auswählen, Klick irgendwo) sofort
// ausgeblendet.
function showFlashBanner() {
  const raw = sessionStorage.getItem('mdr_flash');
  if (!raw) return;
  sessionStorage.removeItem('mdr_flash');

  let flash;
  try {
    flash = JSON.parse(raw);
  } catch {
    return;
  }
  const banner = document.querySelector('#flash-banner');
  const verb = flash.action === 'updated' ? 'aktualisiert' : 'neu angelegt';
  // Massenerfassung (siehe "Speichern & nächstes Pferd" in horseForm.js):
  // statt nur des zuletzt gespeicherten Pferds werden alle in dieser
  // Sitzung neu angelegten Pferde aufgelistet.
  let text = flash.bulkNames?.length
    ? `${flash.bulkNames.length} Pferde neu angelegt: ${flash.bulkNames.map((n) => `„${n}"`).join(', ')}.`
    : `„${flash.name}" wurde ${verb}.`;
  // Nur beim Aktualisieren sinnvoll (bei einer Neuanlage ist ohnehin
  // "alles neu") - zeigt, welche Felder sich durch diesen Speichervorgang
  // gegenüber dem vorherigen Stand tatsächlich geändert haben (siehe
  // computeChangedFields in horseForm.js).
  if (flash.action === 'updated' && flash.changedFields?.length) {
    text += ` Geändert: ${flash.changedFields.join(', ')}.`;
  }
  // Siehe autoUpdateParentFlaxenCarriers in horseForm.js: automatische
  // Flaxen-Trägerschaft bei den Eltern, wenn dieses Pferd sichtbar Flaxen
  // ist.
  if (flash.flaxenUpdated?.length) {
    text += ` Elternteil${flash.flaxenUpdated.length > 1 ? 'e' : ''} automatisch als Flaxen-Träger markiert: ${flash.flaxenUpdated.join(', ')}.`;
  }
  if (flash.flaxenWarnings?.length) {
    text += ` ⚠️ Widerspruch: ${flash.flaxenWarnings.join(', ')} ${flash.flaxenWarnings.length > 1 ? 'sind' : 'ist'} als "Flaxen nicht vorhanden" markiert, müsste laut diesem Fohlen aber Träger sein - bitte manuell prüfen.`;
  }
  // Siehe zzlJustApproved in horseForm.js: die Zuchtzulassung wurde bei
  // diesem Speichervorgang neu auf "Ja" gesetzt - im Spiel ändert sich
  // dadurch meist auch das Pferdebild.
  if (flash.zzlJustApproved) {
    text += ` 🖼️ Zuchtzulassung wurde auf „Ja" gesetzt – bitte das Bild aktualisieren.`;
  }
  banner.textContent = text;
  banner.hidden = false;

  const dismiss = () => { banner.hidden = true; };
  document.addEventListener('click', dismiss, { once: true });
  document.addEventListener('change', dismiss, { once: true });
  document.addEventListener('submit', dismiss, { once: true });
}

async function populateFilterOptions() {
  const { data, error } = await supabaseClient.from('horses').select('owner, gender, breed, genetic_diseases, colors');
  if (error || !data) return;

  fillSelect('#f-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());
  // Für das Freitextfeld "Besitzer wechseln" (siehe wireBulkOwnerChange) -
  // schlägt bekannte Besitzernamen vor, erlaubt aber auch neue.
  const knownOwners = document.querySelector('#known-owners');
  if (knownOwners) {
    knownOwners.innerHTML = [...new Set(data.map((d) => d.owner).filter(Boolean))].sort()
      .map((o) => `<option value="${escapeHtml(o)}"></option>`).join('');
  }
  fillSelect('#f-gender', [...new Set(data.map((d) => d.gender).filter(Boolean))].sort());
  // Kürzel wie "APH" werden zusätzlich auf den vollen Namen normalisiert
  // (siehe normalizeBreed), falls noch nicht normalisierte Altdaten
  // vorkommen. "Rasselos" gehört fest dazu, auch wenn keine Zeile den
  // Wert wörtlich trägt (siehe buildQuery: deckt zusätzlich breed=null ab).
  const breeds = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
  breeds.add('American Paint Horse');
  breeds.add('Rasselos');
  // Ist in den persönlichen Einstellungen (einstellungen.html) eine
  // Rassen-Auswahl getroffen, zeigt der Filter selbst nur noch diese
  // Rassen als Option an (statt aller vorkommenden) - "Alle (auch
  // außerhalb meiner Auswahl)" bleibt als einzige Möglichkeit, Pferde
  // außerhalb der Auswahl zu sehen.
  const breedFilterOptions = preferredBreeds ? [...breeds].filter((b) => preferredBreeds.includes(b)) : [...breeds];
  fillSelect('#f-breed', breedFilterOptions.sort());

  // Vergleichsbasis-Auswahl für den Ø-Vergleich (siehe wireCompareAvg) -
  // eigene Selects, unabhängig von den obigen Übersichts-Filtern, da sie
  // festlegen, welche Pferde in die Durchschnittsberechnung einfließen,
  // nicht welche in der Tabelle angezeigt werden. Bewusst NICHT auf die
  // bevorzugten Rassen eingeschränkt, da sie hier eine bewusste
  // Vergleichsbasis festlegen, nicht die Standardanzeige.
  fillSelect('#cmp-breed', [...breeds].sort());
  fillSelect('#cmp-owner', [...new Set(data.map((d) => d.owner).filter(Boolean))].sort());
  fillSelect('#cmp-gender', [...new Set(data.map((d) => d.gender).filter(Boolean))].sort());

  const diseaseLabels = new Set();
  const locusLabels = new Set();
  for (const row of data) {
    for (const d of row.genetic_diseases || []) diseaseLabels.add(d.label);
    for (const c of row.colors || []) locusLabels.add(c.label);
  }
  populateCheckDropdown('f-ekh-drop', [...diseaseLabels].sort(), { noneOption: 'Keine', tristate: true });
  // "KIT" selbst wird nicht als Option angeboten, da es ein Sammel-Locus
  // für mehrere unabhängige Merkmale (Tobiano/Sabino/Roan/Dominant White)
  // ist - stattdessen einzeln als Sabino/Roan/Tobiano weiter unten.
  locusLabels.delete('KIT');
  // Pearl und Flaxen sind Sonderfälle: Pearl teilt sich den Cream-Locus
  // (ein "pl" im Rohwert zeigt es auch mischerbig/als Träger an, anders
  // als der scharfe Sichtbarkeits-Check in LOCUS_DOMINANT_CHECK), und
  // Flaxen wird vom Spiel gar nicht als eigener Locus getestet, sondern
  // nur aus Fellfarbe/Notiz/Name abgeleitet (siehe hasPearlGene/
  // hasFlaxenGene) - daher als feste Zusatzoptionen statt aus den
  // vorhandenen "colors"-Labels abgeleitet.
  populateCheckDropdown('f-genetik-drop', [...locusLabels].sort(), {
    extra: [
      { value: '__pearl__', label: 'pl – Pearl (mind. 1x)' },
      { value: '__pearl_doubled__', label: 'plpl – Pearl (reinerbig)' },
      { value: '__flaxen__', label: 'fl – Flaxen (mind. 1x)' },
      { value: '__flaxen_doubled__', label: 'flfl – Flaxen (reinerbig)' },
      { value: '__kit_sb__', label: 'Sabino' },
      { value: '__kit_rn__', label: 'Roan' },
      { value: '__kit_to__', label: 'Tobiano' },
    ],
    tristate: true,
  });

  // Feste Liste statt aus vorhandenen Daten abgeleitet (siehe
  // HORSE_TAG_OPTIONS in parser.js) - alle Schlagwörter sollen als
  // Filteroption wählbar sein, auch wenn sie aktuell bei keinem Pferd
  // vergeben sind.
  populateCheckDropdown('f-tag-drop', HORSE_TAG_OPTIONS.map((t) => t.label), { noneOption: 'Kein Schlagwort', tristate: true });
}

function fillSelect(selector, values) {
  const sel = document.querySelector(selector);
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
}

function buildQuery() {
  let q = supabaseClient.from('horses').select('*');

  const name = document.querySelector('#f-name').value.trim();
  const owner = document.querySelector('#f-owner').value;
  const gender = document.querySelector('#f-gender').value;
  const breed = document.querySelector('#f-breed').value;
  const zzl = document.querySelector('#f-zzl').value;

  if (name) q = q.ilike('name', `%${name}%`);
  if (owner) q = q.eq('owner', owner);
  if (gender) q = q.eq('gender', gender);
  // "Rasselos" deckt zusätzlich Pferde ohne jeglichen Rasse-Eintrag mit ab
  // (null) - beides bedeutet praktisch dasselbe ("keine Rasse bekannt").
  // "__unrestricted__" ("Alle (auch außerhalb meiner Auswahl)") und die
  // Standardauswahl "" (Alle) bekommen serverseitig bewusst KEINE
  // Rasse-Einschränkung - die bevorzugten Rassen aus den Einstellungen
  // werden stattdessen nur bei "" clientseitig angewendet (siehe
  // applyClientFilters), da sie keine eigene SQL-Bedingung sind.
  if (breed === 'Rasselos') q = q.or('breed.eq.Rasselos,breed.is.null');
  else if (breed && breed !== '__unrestricted__') q = q.eq('breed', breed);
  // "Nein" bedeutet hier "(noch) keine Zuchtzulassung" - das schließt
  // sowohl explizit "Nein" (false) als auch noch nicht gesetzt (null,
  // zeigt sich in der Tabelle als "-") mit ein, da beides in der Praxis
  // "noch keine ZZL" heißt. "Ja" bleibt dagegen strikt auf true begrenzt.
  if (zzl === 'true') q = q.eq('breeding_allowed', true);
  else if (zzl === 'false') q = q.or('breeding_allowed.eq.false,breeding_allowed.is.null');

  // Die eigentliche Sortierung passiert clientseitig in applySort(), da
  // GP/Ext/Ext%/Int/HLP-SLP berechnete Werte ohne eigene DB-Spalte sind
  // (siehe computeDerived) und ".order()" damit nicht arbeiten kann.
  return q.order('name', { ascending: true });
}

function colorCodeOf(row) {
  return (row.colors || []).map((c) => c.value).join(' ');
}

// GP/Ext/Ext%/Int existieren nicht als eigene Spalten in der Datenbank,
// sondern werden aus den bereits geladenen JSON-Feldern berechnet - hier
// zentral, damit Anzeige (rowHtml) und Filterung (applyClientFilters)
// exakt dieselben Werte verwenden.
function computeDerived(h) {
  const gpRaw = h.tournament_potential?.['Gesamtpotenzial'];
  const genes = presentGenesSummary(h.colors, h.coat_color, h.notes, h.name, null, h.color_gene_overrides);
  return {
    colorCode: colorCodeOf(h),
    presentGenes: genes.map((g) => g.alleles).join(' '),
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : null,
    extAvg: averageScore(h.exterior_descriptive, scoreExteriorTerm),
    extPercent: h.exterior_genetics?.overall?.percent ?? null,
    intAvg: averageScore(h.temperament, scoreTemperamentTerm),
  };
}

// --- Ø-Vergleich (Checkbox "Ø-Vergleich anzeigen") ---

function wireCompareAvg() {
  const toggle = document.querySelector('#compare-avg-toggle');
  const panel = document.querySelector('#compare-avg-panel');
  const toleranceToggle = document.querySelector('#compare-tolerance-toggle');
  const recompute = async () => {
    if (!toggle.checked) return;
    compareBaseline = await computeCompareBaseline();
    renderCompareAvgValues();
    await loadHorses();
  };
  toggle.addEventListener('change', async () => {
    panel.hidden = !toggle.checked;
    compareBaseline = toggle.checked ? await computeCompareBaseline() : null;
    renderCompareAvgValues();
    updateCompareHintBadge();
    await loadHorses();
  });
  ['#cmp-breed', '#cmp-zzl', '#cmp-owner', '#cmp-gender'].forEach((sel) => {
    document.querySelector(sel).addEventListener('change', async () => {
      updateCompareHintBadge();
      await recompute();
    });
  });
  updateCompareHintBadge();
  toleranceToggle.addEventListener('change', async () => {
    compareToleranceEnabled = toleranceToggle.checked;
    renderCompareAvgValues();
    await loadHorses();
  });
}

// Wie weit ein Wert schlechter als der Durchschnitt sein darf und trotzdem
// nicht als "richtig schlecht" (cmp-bad), sondern nur als "durch Toleranz
// akzeptabel" (cmp-tolerance) gilt - 0, wenn das Toleranz-Häkchen aus ist
// oder für den jeweiligen Wert keine Toleranz hinterlegt ist.
function effectiveTolerance(key) {
  return compareToleranceEnabled ? (compareTolerances[key] || 0) : 0;
}

// Zeigt die aus der aktuellen Vergleichsbasis berechneten Ø-Werte neben den
// Basis-Dropdowns an, inkl. der jeweils wirksamen Toleranz in Klammern
// (siehe effectiveTolerance) - nur informativ, ohne Einfluss auf die
// Berechnung selbst (die passiert weiterhin in cmpClass/overallCmpClass).
function renderCompareAvgValues() {
  const el = document.querySelector('#compare-avg-values');
  if (!compareBaseline) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const part = (label, value, decimals, suffix, tolerance) => {
    if (value == null) return `${label} <b>–</b>`;
    const val = value.toFixed(decimals) + (suffix || '');
    const tolText = tolerance ? ` (±${tolerance.toFixed ? tolerance.toFixed(decimals) : tolerance}${suffix || ''})` : '';
    return `${label} <b>${val}${tolText}</b>`;
  };
  el.innerHTML = [
    part('Ø GP', compareBaseline.gp, 0, '', effectiveTolerance('gp')),
    part('Ø Ext', compareBaseline.ext, 2, '', effectiveTolerance('ext')),
    part('Ø Ext%', compareBaseline.extPercent, 0, '%', effectiveTolerance('extPercent')),
    part('Ø Int', compareBaseline.int, 2, '', effectiveTolerance('int')),
  ].join(' · ');
  el.hidden = false;
}

// "Nach oben"-Pfeil (siehe .scroll-top-btn in style.css) - je nach
// Bildschirmbreite scrollt entweder nur die Tabelle selbst (Desktop, "nur
// die Tabelle scrollt"-Layout weiter unten) oder die ganze Seite
// (Tablet/Handy) - deshalb auf beide möglichen Scroll-Quellen hören und
// bei Klick beide zurücksetzen (das jeweils nicht betroffene scrollTo ist
// dann einfach wirkungslos).
function wireScrollTop() {
  const btn = document.querySelector('#scroll-top-btn');
  const tableWrap = document.querySelector('.table-wrap');
  const threshold = 400;
  const updateVisibility = () => {
    const scrolled = window.scrollY > threshold || tableWrap.scrollTop > threshold;
    btn.hidden = !scrolled;
  };
  window.addEventListener('scroll', updateVisibility);
  tableWrap.addEventListener('scroll', updateVisibility);
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    tableWrap.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Durchschnitt von GP/Ext/Ext%/Int über die per Rasse/ZZL/Besitzer/
// Geschlecht eingeschränkte Vergleichsbasis (eigene Auswahl, unabhängig
// von den Übersichts-Filtern) - wie durchschnitt.js, aber nur die vier
// hier gebrauchten Werte statt der vollen Ergebnis-Tabelle.
async function computeCompareBaseline() {
  let q = supabaseClient.from('horses').select('tournament_potential, exterior_descriptive, exterior_genetics, temperament');
  const breed = document.querySelector('#cmp-breed').value;
  const zzl = document.querySelector('#cmp-zzl').value;
  const owner = document.querySelector('#cmp-owner').value;
  const gender = document.querySelector('#cmp-gender').value;
  if (breed === 'Rasselos') q = q.or('breed.eq.Rasselos,breed.is.null');
  else if (breed) q = q.eq('breed', breed);
  if (zzl === 'true') q = q.eq('breeding_allowed', true);
  else if (zzl === 'false') q = q.or('breeding_allowed.eq.false,breeding_allowed.is.null');
  if (owner) q = q.eq('owner', owner);
  if (gender) q = q.eq('gender', gender);

  const { data, error } = await q;
  if (error || !data || !data.length) return null;

  const avg = (values) => {
    const nums = values.filter((v) => v != null && !Number.isNaN(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  return {
    gp: avg(data.map((h) => {
      const raw = h.tournament_potential?.['Gesamtpotenzial'];
      return raw != null && raw !== '' ? Number(raw) : null;
    })),
    ext: avg(data.map((h) => averageScore(h.exterior_descriptive, scoreExteriorTerm))),
    extPercent: avg(data.map((h) => h.exterior_genetics?.overall?.percent ?? null)),
    int: avg(data.map((h) => averageScore(h.temperament, scoreTemperamentTerm))),
  };
}

// Klasse für eine einzelne Werte-Zelle (GP/Ext/Ext%/Int) - grün, wenn der
// Wert im Vergleich zur Basis "besser" ist, rot wenn "schlechter". Bei GP
// und Ext% ist ein höherer Wert besser; bei Ext und Int ist es dagegen ein
// NIEDRIGERER Wert (Skala 1=exzellent...4/5=schlecht, siehe
// scoreExteriorTerm/scoreTemperamentTerm) - daher "lowerIsBetter" je
// Aufruf mitgeben. Nichts bei fehlendem Wert auf einer der beiden Seiten.
// "tolerance" (siehe compareTolerances/Einstellungen, effectiveTolerance)
// verschiebt nur die "schlechter"-Schwelle, nicht die "besser"-Schwelle:
// ein Wert, der bis zu "tolerance" schlechter als der Durchschnitt ist,
// gilt dann als "durch Toleranz akzeptabel" (eigener Grünton, cmp-tolerance)
// statt rot - für eine großzügigere Auswahl in der Übersicht, ohne die
// Definition von "besser" (cmp-good) zu verwässern. Ist der Wert weiter als
// "tolerance" schlechter, bleibt es bei rot (cmp-bad).
function cmpClass(value, baseline, lowerIsBetter, tolerance = 0) {
  if (!compareBaseline || value == null || baseline == null) return '';
  const better = lowerIsBetter ? value < baseline : value > baseline;
  if (better) return 'cmp-good';
  const worse = lowerIsBetter ? value > baseline : value < baseline;
  if (!worse) return '';
  const beyondTolerance = lowerIsBetter ? value > baseline + tolerance : value < baseline - tolerance;
  return beyondTolerance ? 'cmp-bad' : 'cmp-tolerance';
}

// Klasse für die Name-Zelle - Mehrheitsentscheid über die vier Werte
// (mehr "besser" als "schlechter/toleriert" -> grün, umgekehrt bei
// überwiegend "schlechter" rot bzw. bei überwiegend "toleriert" der
// Toleranz-Grünton, sonst nichts).
function overallCmpClass(d) {
  if (!compareBaseline) return '';
  const pairs = [
    [d.gp, compareBaseline.gp, false, effectiveTolerance('gp')],
    [d.extAvg, compareBaseline.ext, true, effectiveTolerance('ext')],
    [d.extPercent, compareBaseline.extPercent, false, effectiveTolerance('extPercent')],
    [d.intAvg, compareBaseline.int, true, effectiveTolerance('int')],
  ].filter(([v, b]) => v != null && b != null);
  if (!pairs.length) return '';
  const classes = pairs.map(([v, b, lowerIsBetter, tolerance]) => cmpClass(v, b, lowerIsBetter, tolerance));
  const good = classes.filter((c) => c === 'cmp-good').length;
  const bad = classes.filter((c) => c === 'cmp-bad').length;
  const tolerated = classes.filter((c) => c === 'cmp-tolerance').length;
  const notGood = bad + tolerated;
  if (good > notGood) return 'cmp-good';
  if (notGood > good) return bad >= tolerated ? 'cmp-bad' : 'cmp-tolerance';
  return '';
}

// Ob ein Locus sein dominantes/sichtbares Allel trägt, nach der vom Nutzer
// bereitgestellten MDR-Farbvererbungs-Dokumentation. KIT gilt als "trägt
// das Merkmal", wenn der Wert nicht ausschließlich aus "0" besteht (laut
// Spiel: getestet, aber kein Tobiano/Sabino/Dominant White/Roan).
const LOCUS_DOMINANT_CHECK = {
  Extension: (v) => v.includes('E'),
  Dun: (v) => v.includes('D'),
  Champagne: (v) => v.includes('Ch'),
  Grey: (v) => v.includes('G'),
  Silver: (v) => v.includes('Z'),
  Overo: (v) => v.includes('O'),
  Splashed: (v) => v.includes('SPL'),
  Appaloosa: (v) => v.includes('Lp'),
  PATN1: (v) => v.includes('P1'),
  Agouti: (v) => /Ap|A1|At/.test(v),
  Cream: (v) => /Cr|pl/.test(v),
  KIT: (v) => !!v && !/^0+$/.test(v),
};

// Pearl liegt auf demselben Locus wie Cream (siehe parser.js) - ein
// getesteter Rohwert wie "Crpl" (Cream+Pearl-Trägerin) oder "plpl"
// (reinerbig Pearl) soll hier also schon bei einem bloßen "pl"-Vorkommen
// zählen, unabhängig von Groß-/Kleinschreibung und auch mischerbig -
// anders als LOCUS_DOMINANT_CHECK.Cream, das nur die sichtbare Ausprägung
// prüft. Ist Cream nicht getestet, zählt zusätzlich eine aus Fellfarbe/
// Notiz/Name abgeleitete Pearl-Vermutung (presentGenesSummary).
function hasPearlGene(row) {
  const entry = (row.colors || []).find((c) => c.label === 'Cream');
  if (entry && !isUntestedLocusValue(entry.value) && /pl/i.test(entry.value)) return true;
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Cream' && /pl/i.test(g.alleles));
}

// Wie hasPearlGene, aber nur reinerbig ("plpl") statt schon bei einer
// einzelnen Kopie - für die separate "plpl"-Filteroption.
function hasPearlGeneDoubled(row) {
  const entry = (row.colors || []).find((c) => c.label === 'Cream');
  if (entry && !isUntestedLocusValue(entry.value) && /^plpl$/i.test(entry.value)) return true;
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Cream' && /^plpl$/i.test(g.alleles));
}

// Flaxen wird vom Spiel nicht als eigener Locus getestet (siehe
// parser.js) - daher ausschließlich aus Fellfarbe/Notiz/Name ableitbar,
// sowohl als Träger (fl) als auch reinerbig (flfl).
function hasFlaxenGene(row) {
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Flaxen');
}

// Wie hasFlaxenGene, aber nur reinerbig ("flfl") - für die separate
// "flfl"-Filteroption.
function hasFlaxenGeneDoubled(row) {
  const genes = presentGenesSummary(row.colors, row.coat_color, row.notes, row.name, null, row.color_gene_overrides);
  return genes.some((g) => g.locus === 'Flaxen' && /^flfl$/i.test(g.alleles));
}

// KIT ist ein Sammel-Locus für mehrere unabhängige Merkmale (Tobiano/
// Sabino/Roan/Dominant White), die im Rohwert als aneinandergereihte
// Zwei-Buchstaben-Kürzel stehen (z.B. "RnTO" = Roan + Tobiano). Für die
// Filterung wird daher gezielt nach dem jeweiligen Kürzel gesucht statt
// nur (wie LOCUS_DOMINANT_CHECK.KIT) pauschal "irgendetwas vorhanden".
function hasKitTrait(row, code) {
  const entry = (row.colors || []).find((c) => c.label === 'KIT');
  if (!entry || isUntestedLocusValue(entry.value)) return false;
  return new RegExp(code, 'i').test(entry.value);
}

function matchesGenetikLocus(row, locusName) {
  if (locusName === '__pearl__') return hasPearlGene(row);
  if (locusName === '__pearl_doubled__') return hasPearlGeneDoubled(row);
  if (locusName === '__flaxen__') return hasFlaxenGene(row);
  if (locusName === '__flaxen_doubled__') return hasFlaxenGeneDoubled(row);
  if (locusName === '__kit_sb__') return hasKitTrait(row, 'sb');
  if (locusName === '__kit_rn__') return hasKitTrait(row, 'rn');
  if (locusName === '__kit_to__') return hasKitTrait(row, 'to');
  const entry = (row.colors || []).find((c) => c.label === locusName);
  if (!entry || isUntestedLocusValue(entry.value)) return false;
  const check = LOCUS_DOMINANT_CHECK[locusName];
  return check ? check(entry.value) : false;
}

// Ein Erbkrankheiten-Locuswert gilt als unauffällig, wenn er (ohne die
// "/"-Trenner) ausschließlich aus großem "N" (normal) besteht - jede
// Abweichung bedeutet Träger/betroffen. Wichtig: das Risikoallel-Kürzel
// ist nicht immer klein geschrieben (z.B. "LF/NN" bei LFS, komplett groß)
// - ein reiner Kleinbuchstaben-Check (wie zuvor) übersieht solche Fälle.
function isDiseaseClear(value) {
  const cleaned = (value || '').replace(/\//g, '');
  return cleaned === '' || /^N+$/.test(cleaned);
}

// Zusätzlich zu tatsächlich getesteten (und auffälligen) Erbkrankheiten
// auch manuell als Träger/betroffen bestätigte, noch nicht getestete
// Krankheiten mit einbeziehen (siehe diseaseOverrideBadge in
// horseForm.js) - "frei"/unbekannt zählt dagegen nicht als betroffen.
function affectedDiseaseLabels(row) {
  // Manche Datensätze enthalten pro Krankheit auch dann eine Zeile, wenn
  // sie gar nicht getestet wurde (Rohwert wörtlich "Nicht getestet" statt
  // fehlender Zeile, siehe diseaseTableHtml in horseForm.js) - die zählen
  // hier weder als getestet noch als betroffen.
  const diseases = (row.genetic_diseases || []).filter((d) => !isUntestedLocusValue(d.value));
  const tested = diseases.filter((d) => !isDiseaseClear(d.value)).map((d) => d.label);
  const testedCodes = new Set(diseases.map((d) => d.label));
  const ov = row.disease_gene_overrides || {};
  const manual = Object.keys(ov).filter((code) => (ov[code] === 'het' || ov[code] === 'hom') && !testedCodes.has(code));
  return [...tested, ...manual];
}

function matchesEkh(row, codes) {
  return codes.some((code) => {
    if (code === '__none__') return row.disease_free === true;
    return affectedDiseaseLabels(row).includes(code);
  });
}

function compareValue(value, op, targetStr) {
  if (targetStr === '') return true;
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  const target = Number(targetStr);
  return op === 'lt' ? value < target : value > target;
}

function applyClientFilters(rows) {
  const breed = document.querySelector('#f-breed').value;
  const genetikState = getCheckDropdownTristate('f-genetik-drop');
  const ekhState = getCheckDropdownTristate('f-ekh-drop');
  const tagState = getCheckDropdownTristate('f-tag-drop');
  const tagNote = document.querySelector('#f-tag-note').value.trim().toLowerCase();

  const gpOp = document.querySelector('#f-gp-op').value;
  const gpVal = document.querySelector('#f-gp-val').value;
  const extOp = document.querySelector('#f-ext-op').value;
  const extVal = document.querySelector('#f-ext-val').value;
  const extpctOp = document.querySelector('#f-extpct-op').value;
  const extpctVal = document.querySelector('#f-extpct-val').value;
  const intOp = document.querySelector('#f-int-op').value;
  const intVal = document.querySelector('#f-int-val').value;
  const favoritesOnly = document.querySelector('#f-favorites').checked;

  return rows.filter((row) => {
    const d = computeDerived(row);

    if (favoritesOnly && !favoriteHorseIds.has(row.id)) return false;

    // Nur bei der Standardauswahl "Alle" (kein konkreter Rasse-Filter
    // gewählt) wirken die bevorzugten Rassen aus den Einstellungen -
    // "Alle (auch außerhalb meiner Auswahl)" (__unrestricted__) und eine
    // konkret gewählte Rasse überstimmen sie bewusst.
    if (breed === '' && preferredBreeds) {
      const rowBreed = normalizeBreed(row.breed) || 'Rasselos';
      if (!preferredBreeds.includes(rowBreed)) return false;
    }
    if (genetikState.include.length && !genetikState.include.every((locus) => matchesGenetikLocus(row, locus))) return false;
    if (genetikState.exclude.some((locus) => matchesGenetikLocus(row, locus))) return false;
    if (ekhState.include.length && !matchesEkh(row, ekhState.include)) return false;
    if (ekhState.exclude.some((code) => matchesEkh(row, [code]))) return false;
    // Wie beim EKH-Filter: "einer der angewählten Schlagwörter" (ODER),
    // nicht "alle gleichzeitig" (UND) - sonst ließe sich z.B. "Verkauf"
    // + "Reserviert" nicht kombiniert als "eins von beiden" filtern.
    // "Keine" (__none__) findet Pferde ganz ohne Schlagwort. Ausschlüsse
    // wirken dagegen einzeln (UND) - ein ausgeschlossenes Schlagwort darf
    // nie vorkommen, unabhängig von anderen Ausschlüssen.
    if (tagState.include.length && !matchesTags(row, tagState.include)) return false;
    if (tagState.exclude.some((label) => matchesTags(row, [label]))) return false;
    // Freitextsuche über die optionalen Zusatztexte der Schlagwörter (z.B.
    // "Reserviert: Bella_99" nach "Bella_99" durchsuchen) - unabhängig von
    // der An-/Ausschluss-Auswahl oben, findet ein Pferd sobald IRGENDEIN
    // Schlagwort eine passende Notiz trägt.
    if (tagNote && !(row.tags || []).some((t) => (t.note || '').toLowerCase().includes(tagNote))) return false;
    if (!compareValue(d.gp, gpOp, gpVal)) return false;
    if (!compareValue(d.extAvg, extOp, extVal)) return false;
    if (!compareValue(d.extPercent, extpctOp, extpctVal)) return false;
    if (!compareValue(d.intAvg, intOp, intVal)) return false;

    return true;
  });
}

function sortValue(row, field) {
  switch (field) {
    case 'name': return (row.name || '').toLowerCase();
    case 'gender': return (row.gender || '').toLowerCase();
    case 'breed': return (row.breed || '').toLowerCase();
    case 'coat_color': return (row.coat_color || '').toLowerCase();
    case 'owner': return (row.owner || '').toLowerCase();
    case 'gp': return computeDerived(row).gp;
    case 'ext': return computeDerived(row).extAvg;
    case 'extpct': return computeDerived(row).extPercent;
    case 'int': return computeDerived(row).intAvg;
    case 'hlpslp': {
      const n = Number(hlpSlpDisplay(row.hlp_slp));
      return Number.isNaN(n) ? null : n;
    }
    case 'zzl': return row.breeding_allowed == null ? null : (row.breeding_allowed ? 1 : 0);
    case 'birthdate': return row.birthdate || null;
    case 'updated_at': return row.updated_at || null;
    default: return null;
  }
}

// Fehlende Werte (null) landen unabhängig von der Richtung immer am Ende,
// damit A-Z/Z-A bzw. 1-x/x-1 nicht durch Lücken durcheinandergeraten.
function applySort(rows) {
  const { field, dir } = currentSort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, field);
    const vb = sortValue(b, field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb, 'de') * mult;
    return (va - vb) * mult;
  });
}

async function loadHorses() {
  const tbody = document.querySelector('#horse-table tbody');
  const countEl = document.querySelector('#result-count');
  tbody.innerHTML = '<tr><td colspan="20">Lade…</td></tr>';
  selectedIds = new Set();
  updateBulkBar();

  const { data, error } = await buildQuery();

  if (error) {
    tbody.innerHTML = `<tr><td colspan="20" class="error">Fehler beim Laden: ${escapeHtml(error.message)}</td></tr>`;
    countEl.textContent = '';
    return;
  }

  const filtered = applySort(applyClientFilters(data));
  renderDashboardTiles(filtered);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="20">Keine Pferde gefunden.</td></tr>';
    countEl.textContent = '0 Pferde';
    return;
  }

  countEl.textContent = `${filtered.length} Pferd${filtered.length === 1 ? '' : 'e'}`;
  lastRenderedRows = filtered;
  tbody.innerHTML = filtered.map(rowHtml).join('');
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.delete));
  });
  tbody.querySelectorAll('[data-select]').forEach((cb) => {
    cb.addEventListener('change', () => onRowSelect(cb.dataset.select, cb.checked));
  });
  document.querySelectorAll('#select-all, #select-all-mobile').forEach((box) => { box.checked = false; });
}

// "data-label" wird nur für die mobile Kartenansicht gebraucht (siehe
// style.css) - dort ersetzt CSS-generierter Inhalt (attr(data-label)) die
// sonst fehlenden Spaltenüberschriften, da <thead> dort ausgeblendet ist.
function rowHtml(h) {
  const d = computeDerived(h);
  const affected = affectedDiseaseLabels(h);
  const ekhText = affected.length ? affected.join(', ') : '-';

  // Name öffnet die reine Ansichtsseite (view.html) - Bearbeiten passiert
  // über den eigenen Stift-Button in der Aktionen-Spalte, der externe
  // Spiel-Link über den eigenen 🔗-Button (nur falls external_id gesetzt).
  // .name-cell selbst bleibt ein normales table-cell-Element (display:flex
  // DIREKT auf einem <td> nimmt es aus dem Tabellen-Zeilenlayout heraus -
  // es wuerde dann nicht mehr automatisch auf die Zeilenhoehe der
  // Geschwister-Zellen gestreckt, wodurch seine eigene Trennlinie
  // "hoeher" als der Rest der Zeile sass, siehe Nutzer-Feedback). Die
  // Flex-Anordnung sitzt deshalb auf einem inneren Span statt auf dem
  // <td> selbst.
  const nameCell = `<span class="name-cell-inner"><a href="view.html?id=${h.id}">${escapeHtml(h.name || '(ohne Name)')}</a></span>`;
  const nameTitle = h.name || '(ohne Name)';
  // Schlagwort-Badges (siehe HORSE_TAG_OPTIONS in parser.js) in einer
  // eigenen Spalte statt direkt neben dem Namen (Design-Vorschlag, siehe
  // MixD.dc.html).
  const tagTitle = (h.tags || []).map((t) => t.note ? `${t.label}: ${t.note}` : t.label).join(' – ');
  const linkCell = h.external_id
    ? `<a class="btn secondary icon-btn" href="https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}" target="_blank" rel="noopener" title="Zum Pferd im Spiel">🔗</a>`
    : '';
  const imageCell = h.image_url
    ? `<a href="view.html?id=${h.id}"><img class="table-thumb" src="${escapeHtml(h.image_url)}" alt="" loading="lazy" /></a>`
    : '';
  const nameCls = ['name-cell', overallCmpClass(d)].filter(Boolean).join(' ');
  const isFavorite = favoriteHorseIds.has(h.id);

  return `<tr>
    <td data-label="Auswählen"><input type="checkbox" data-select="${h.id}" /></td>
    <td data-label="Favorit"><button type="button" class="icon-btn favorite-btn${isFavorite ? ' is-favorite' : ''}" data-favorite="${h.id}" title="${isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}">${isFavorite ? '♥' : '♡'}</button></td>
    <td data-label="Bild">${imageCell}</td>
    <td data-label="Link">${linkCell}</td>
    <td data-label="Name" class="${nameCls}" title="${escapeHtml(nameTitle)}">${nameCell}</td>
    <td data-label="Schlagwörter" title="${escapeHtml(tagTitle)}">${tagsBadgesHtml(h.tags)}</td>
    <td data-label="Geschlecht">${escapeHtml(h.gender || '')}</td>
    <td data-label="Rasse" title="${escapeHtml(normalizeBreed(h.breed) || 'Rasselos')}">${escapeHtml(normalizeBreed(h.breed) || 'Rasselos')}</td>
    <td data-label="Farbe" title="${escapeHtml(h.coat_color || '')}">${escapeHtml(h.coat_color || '')}</td>
    <td data-label="Genetik" class="small genetik-cell" style="font-family: ui-monospace, monospace;" title="${escapeHtml(d.presentGenes)}">${escapeHtml(d.presentGenes)}</td>
    <td data-label="GP" class="${cmpClass(d.gp, compareBaseline?.gp, false, effectiveTolerance('gp'))}">${d.gp != null ? escapeHtml(String(d.gp)) : ''}</td>
    <td data-label="Ext" class="${cmpClass(d.extAvg, compareBaseline?.ext, true, effectiveTolerance('ext'))}">${d.extAvg != null ? d.extAvg.toFixed(2) : ''}</td>
    <td data-label="Ext%" class="${cmpClass(d.extPercent, compareBaseline?.extPercent, false, effectiveTolerance('extPercent'))}">${d.extPercent != null ? d.extPercent + '%' : ''}</td>
    <td data-label="Int" class="${cmpClass(d.intAvg, compareBaseline?.int, true, effectiveTolerance('int'))}">${d.intAvg != null ? d.intAvg.toFixed(2) : ''}</td>
    <td data-label="HLP/SLP">${escapeHtml(hlpSlpDisplay(h.hlp_slp))}</td>
    <td data-label="ZZL">${zzlDisplay(h.breeding_allowed)}</td>
    <td data-label="EKH">${escapeHtml(ekhText)}</td>
    <td data-label="Alter">${h.birthdate ? escapeHtml(formatAge(h.birthdate)) : ''}</td>
    <td data-label="Zuletzt bearbeitet">${h.updated_at ? escapeHtml(formatTimestamp(h.updated_at)) : ''}</td>
    <td data-label="Besitzer" title="${escapeHtml(h.owner || '')}">${escapeHtml(h.owner || '')}</td>
    <td data-label="Aktionen" class="actions-cell">
      <a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a>
      <button class="danger icon-btn" data-delete="${h.id}" title="Löschen">✗</button>
    </td>
  </tr>`;
}

// Zeigt die HLP/SLP-Punktzahl, falls im Text eine Zahl steht (bestandene
// Prüfung), sonst "-" (z.B. bei "nicht bestanden"/"nicht absolviert").
function hlpSlpDisplay(text) {
  if (!text) return '-';
  const m = text.match(/\d+([.,]\d+)?/);
  return m ? m[0] : '-';
}

function zzlDisplay(breedingAllowed) {
  if (breedingAllowed === true) return 'Ja';
  if (breedingAllowed === false) return 'Nein';
  return '-';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function onDelete(id) {
  const row = lastRenderedRows.find((r) => r.id === id);
  openDeleteModal(row ? [row] : [{ id, name: '(unbekannt)', owner: '' }]);
}

// --- Lösch-Bestätigung (Popup statt native confirm()) ---

function wireDeleteModal() {
  document.querySelector('#delete-modal-cancel').addEventListener('click', closeDeleteModal);
  document.querySelector('#delete-modal-confirm').addEventListener('click', confirmDelete);
  document.querySelector('#delete-modal').addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
}

function openDeleteModal(rows) {
  pendingDeleteIds = rows.map((r) => r.id);
  const list = document.querySelector('#delete-modal-list');
  list.innerHTML = rows.map((r) => {
    const owner = r.owner ? ` — Besitzer: ${escapeHtml(r.owner)}` : '';
    return `<li>${escapeHtml(r.name || '(ohne Name)')}${owner}</li>`;
  }).join('');
  document.querySelector('#delete-modal-count').textContent =
    rows.length === 1 ? '1 Pferd wirklich unwiderruflich löschen?' : `${rows.length} Pferde wirklich unwiderruflich löschen?`;
  document.querySelector('#delete-modal').hidden = false;
}

function closeDeleteModal() {
  document.querySelector('#delete-modal').hidden = true;
  pendingDeleteIds = [];
}

async function confirmDelete() {
  const ids = pendingDeleteIds;
  closeDeleteModal();
  if (!ids.length) return;
  const { error } = ids.length === 1
    ? await supabaseClient.from('horses').delete().eq('id', ids[0])
    : await supabaseClient.from('horses').delete().in('id', ids);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadHorses();
}

function wireFilterForm() {
  document.querySelector('#filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadHorses();
  });
  document.querySelector('#reset-filters').addEventListener('click', () => {
    document.querySelector('#filter-form').reset();
    resetCheckDropdown('f-ekh-drop');
    resetCheckDropdown('f-genetik-drop');
    resetCheckDropdown('f-tag-drop');
    updateFilterHintBadge();
    loadHorses();
  });
  document.querySelector('#only-my-horses-btn').addEventListener('click', onOnlyMyHorses);
  // "— N aktiv (Feld)"-Hinweis neben "🔍 Filter" (siehe MixD.dc.html) - auf
  // jede Eingabe/Auswahl im Formular reagieren, nicht erst beim Filtern
  // (Submit), damit der Hinweis den tatsächlichen Feldinhalt widerspiegelt.
  document.querySelector('#filter-form').addEventListener('input', updateFilterHintBadge);
  document.querySelector('#filter-form').addEventListener('change', updateFilterHintBadge);
  // Dreifach-Auswahl-Felder (Genetik/EKH/Schlagwörter, siehe
  // checkDropdownTristateItem in parser.js) ändern ihren Zustand per
  // Klick statt eines nativen input-/change-Events - ohne diesen
  // zusätzlichen Listener bliebe der Hinweis-Badge nach einem Klick
  // dort auf altem Stand.
  document.querySelector('#filter-form').addEventListener('click', (e) => {
    if (e.target.closest('.checkdrop-tristate')) updateFilterHintBadge();
  });
  updateFilterHintBadge();
}

// Menschlich lesbare Bezeichnungen der aktuell aktiven (vom Standard
// abweichenden) Filterfelder, für den Hinweis-Badge neben "🔍 Filter".
function activeFilterDescriptions() {
  const val = (sel) => document.querySelector(sel).value;
  const list = [];
  if (val('#f-name').trim()) list.push('Name');
  if (val('#f-owner')) list.push('Besitzer');
  if (val('#f-gender')) list.push('Geschlecht');
  if (val('#f-breed')) list.push('Rasse');
  if (val('#f-zzl')) list.push('ZZL');
  if (document.querySelector('#f-favorites').checked) list.push('Favoriten');
  const tagActive = getCheckDropdownTristate('f-tag-drop');
  if (tagActive.include.length || tagActive.exclude.length) list.push('Schlagwörter');
  if (val('#f-tag-note').trim()) list.push('Schlagwort-Notiz');
  const genetikActive = getCheckDropdownTristate('f-genetik-drop');
  if (genetikActive.include.length || genetikActive.exclude.length) list.push('Genetik');
  const ekhActive = getCheckDropdownTristate('f-ekh-drop');
  if (ekhActive.include.length || ekhActive.exclude.length) list.push('EKH');
  if (val('#f-gp-val') !== '') list.push('GP');
  if (val('#f-ext-val') !== '') list.push('Ext');
  if (val('#f-extpct-val') !== '') list.push('Ext%');
  if (val('#f-int-val') !== '') list.push('Int');
  return list;
}

function updateFilterHintBadge() {
  const badge = document.querySelector('#filter-hint-badge');
  const active = activeFilterDescriptions();
  if (!active.length) {
    badge.textContent = '';
  } else if (active.length === 1) {
    badge.textContent = `— 1 aktiv (${active[0]})`;
  } else {
    badge.textContent = `— ${active.length} aktiv`;
  }
}

// Hinweis-Badge neben "📊 Ø-Vergleich" (siehe MixD.dc.html): zeigt bei
// aktiviertem Vergleich die gewählte Vergleichsbasis an, sonst leer.
function updateCompareHintBadge() {
  const badge = document.querySelector('#compare-hint-badge');
  if (!document.querySelector('#compare-avg-toggle').checked) {
    badge.textContent = '';
    return;
  }
  const parts = [];
  ['#cmp-breed', '#cmp-zzl', '#cmp-owner', '#cmp-gender'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el.value) parts.push(el.selectedOptions[0].textContent);
  });
  badge.textContent = `— an, Basis: ${parts.length ? parts.join('/') : 'alle'}`;
}

// Setzt den Besitzer-Filter auf das eigene Konto - Groß-/Kleinschreibung
// im "Besitzer"-Feld ist nicht garantiert einheitlich mit dem
// Benutzernamen, deshalb hier case-insensitiv die passende Option in der
// bereits befüllten Auswahlliste suchen statt den Wert direkt zu setzen.
function onOnlyMyHorses() {
  const select = document.querySelector('#f-owner');
  const match = [...select.options].find((o) => o.value.toLowerCase() === currentIdentity.toLowerCase());
  if (match) select.value = match.value;
  loadHorses();
}

// Für die meisten Spalten ist beim ersten Klick aufsteigend (A-Z, 1-x) der
// sinnvollere Start - bei "Zuletzt bearbeitet" dagegen absteigend (neuste
// Änderung zuerst, Nutzerwunsch): sortValue liefert dafür ein Datum, "die
// neusten zuerst" ist praktisch immer das, was man nach einer Änderung
// sehen will, nicht "die am längsten unveränderten".
const SORT_FIELDS_DESC_FIRST = new Set(['updated_at']);

function wireSortableHeaders() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { field, dir: SORT_FIELDS_DESC_FIRST.has(field) ? 'desc' : 'asc' };
      }
      syncMobileSortControls();
      saveLastSort();
      loadHorses();
    });
  });

  // Mobile Alternative zum Klick auf die (dort ausgeblendete)
  // Tabellenkopfzeile - siehe .mobile-sort in style.css.
  const fieldSel = document.querySelector('#f-sort-field');
  const dirSel = document.querySelector('#f-sort-dir');
  [fieldSel, dirSel].forEach((sel) => {
    sel.addEventListener('change', () => {
      currentSort = { field: fieldSel.value, dir: dirSel.value };
      saveLastSort();
      loadHorses();
    });
  });
  syncMobileSortControls();
}

// Merkt sich die aktuelle Sortierung geräte-lokal (siehe
// LAST_SORT_STORAGE_KEY) - greift beim nächsten Öffnen der Übersicht nur,
// wenn keine Standard-Filtervorlage gesetzt ist (siehe init()).
function saveLastSort() {
  try {
    localStorage.setItem(LAST_SORT_STORAGE_KEY, JSON.stringify(currentSort));
  } catch {
    // localStorage kann z.B. im privaten Modus mancher Browser fehlschlagen -
    // dann bleibt die Sortierung einfach unsaved, kein harter Fehler.
  }
}

function syncMobileSortControls() {
  const fieldSel = document.querySelector('#f-sort-field');
  const dirSel = document.querySelector('#f-sort-dir');
  fieldSel.value = currentSort.field;
  dirSel.value = currentSort.dir;
}

// --- Filter-Vorlagen (gespeicherte Filter-/Sucheinstellungen je Konto,
// siehe migration_022_filter_presets.sql) ---

// Liest den kompletten Zustand aller Filter-/Suchfelder aus (nicht die
// Ø-Vergleich-Vergleichsbasis - eigenes, unabhängiges Feature).
function collectFilterState() {
  return {
    name: document.querySelector('#f-name').value,
    owner: document.querySelector('#f-owner').value,
    gender: document.querySelector('#f-gender').value,
    breed: document.querySelector('#f-breed').value,
    zzl: document.querySelector('#f-zzl').value,
    favorites: document.querySelector('#f-favorites').checked,
    tags: getCheckDropdownTristate('f-tag-drop'),
    tagNote: document.querySelector('#f-tag-note').value,
    genetik: getCheckDropdownTristate('f-genetik-drop'),
    ekh: getCheckDropdownTristate('f-ekh-drop'),
    gpOp: document.querySelector('#f-gp-op').value,
    gpVal: document.querySelector('#f-gp-val').value,
    extOp: document.querySelector('#f-ext-op').value,
    extVal: document.querySelector('#f-ext-val').value,
    extpctOp: document.querySelector('#f-extpct-op').value,
    extpctVal: document.querySelector('#f-extpct-val').value,
    intOp: document.querySelector('#f-int-op').value,
    intVal: document.querySelector('#f-int-val').value,
    sortField: currentSort.field,
    sortDir: currentSort.dir,
    compareAvgEnabled: document.querySelector('#compare-avg-toggle').checked,
    cmpBreed: document.querySelector('#cmp-breed').value,
    cmpZzl: document.querySelector('#cmp-zzl').value,
    cmpOwner: document.querySelector('#cmp-owner').value,
    cmpGender: document.querySelector('#cmp-gender').value,
  };
}

// Setzt alle Filter-/Suchfelder auf einen gespeicherten Zustand und
// wendet ihn direkt an. Werte, die in den Auswahllisten (Besitzer/Rasse/
// Geschlecht) inzwischen nicht mehr vorkommen (z.B. Pferd umbenannt/
// gelöscht), bleiben dabei einfach unwirksam - kein Fehler.
async function applyFilterState(state) {
  document.querySelector('#f-name').value = state.name || '';
  document.querySelector('#f-owner').value = state.owner || '';
  document.querySelector('#f-gender').value = state.gender || '';
  document.querySelector('#f-breed').value = state.breed || '';
  document.querySelector('#f-zzl').value = state.zzl || '';
  document.querySelector('#f-favorites').checked = !!state.favorites;
  document.querySelector('#f-tag-note').value = state.tagNote || '';
  // Ältere gespeicherte Vorlagen (vor der Dreifach-Auswahl bei Genetik/
  // EKH/Schlagwörtern) speichern hier noch ein flaches Array statt
  // {include, exclude} - als reine "anwählen"-Liste ohne Ausschlüsse
  // interpretieren, statt an einer alten Vorlage zu scheitern.
  const toTristate = (v) => (Array.isArray(v) ? { include: v, exclude: [] } : (v || { include: [], exclude: [] }));
  setCheckDropdownTristate('f-tag-drop', toTristate(state.tags));
  setCheckDropdownTristate('f-genetik-drop', toTristate(state.genetik));
  setCheckDropdownTristate('f-ekh-drop', toTristate(state.ekh));
  document.querySelector('#f-gp-op').value = state.gpOp || 'gt';
  document.querySelector('#f-gp-val').value = state.gpVal || '';
  document.querySelector('#f-ext-op').value = state.extOp || 'gt';
  document.querySelector('#f-ext-val').value = state.extVal || '';
  document.querySelector('#f-extpct-op').value = state.extpctOp || 'gt';
  document.querySelector('#f-extpct-val').value = state.extpctVal || '';
  document.querySelector('#f-int-op').value = state.intOp || 'gt';
  document.querySelector('#f-int-val').value = state.intVal || '';

  currentSort = { field: state.sortField || 'name', dir: state.sortDir || 'asc' };
  syncMobileSortControls();

  // Ø-Vergleich-Vergleichsbasis (eigenes Feature, siehe wireCompareAvg) -
  // mit in der Vorlage gespeichert, damit "Vorlage laden" wirklich den
  // kompletten zuletzt gesehenen Zustand wiederherstellt.
  const toggle = document.querySelector('#compare-avg-toggle');
  toggle.checked = Boolean(state.compareAvgEnabled);
  document.querySelector('#compare-avg-panel').hidden = !toggle.checked;
  document.querySelector('#cmp-breed').value = state.cmpBreed || '';
  document.querySelector('#cmp-zzl').value = state.cmpZzl || '';
  document.querySelector('#cmp-owner').value = state.cmpOwner || '';
  document.querySelector('#cmp-gender').value = state.cmpGender || '';
  compareBaseline = toggle.checked ? await computeCompareBaseline() : null;
  renderCompareAvgValues();
  updateFilterHintBadge();
  updateCompareHintBadge();

  loadHorses();
}

async function loadFilterPresets() {
  const select = document.querySelector('#filter-preset-select');
  select.innerHTML = '<option value="">Vorlage laden…</option>';
  if (!currentSession) return;
  const { data, error } = await supabaseClient
    .from('filter_presets')
    .select('id, name, filters')
    .eq('user_id', currentSession.user.id)
    .order('name');
  if (error || !data) return;
  for (const preset of data) {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name;
    opt.dataset.filters = JSON.stringify(preset.filters);
    select.appendChild(opt);
  }
}

function wireFilterPresets() {
  document.querySelector('#filter-preset-select').addEventListener('change', async (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt.value) return;
    await applyFilterState(JSON.parse(opt.dataset.filters));
  });
  document.querySelector('#save-filter-preset-btn').addEventListener('click', saveFilterPreset);
}

async function saveFilterPreset() {
  const name = prompt('Name für diese Filter-Vorlage:');
  if (!name || !name.trim()) return;
  const { error } = await supabaseClient
    .from('filter_presets')
    .upsert({ user_id: currentSession.user.id, name: name.trim(), filters: collectFilterState() }, { onConflict: 'user_id,name' });
  if (error) {
    alert('Vorlage konnte nicht gespeichert werden: ' + error.message);
    return;
  }
  await loadFilterPresets();
}

// --- Sortier-Vorlagen (gespeicherte, benannte Sortierungen je Konto,
// siehe migration_029_sort_presets.sql) - unabhängig von den kompletten
// Filter-Vorlagen oben: nur Feld + Richtung, keine Filter-/Suchfelder.
// Nutzerwunsch: mehrere Sortierungen benennen und per Dropdown schnell
// wechseln können, ohne dafür jedes Mal eine ganze Filter-Vorlage
// anzulegen.
async function loadSortPresets() {
  const select = document.querySelector('#sort-preset-select');
  select.innerHTML = '<option value="">Sortierung laden…</option>';
  if (!currentSession) return;
  const { data, error } = await supabaseClient
    .from('sort_presets')
    .select('id, name, sort_field, sort_dir')
    .eq('user_id', currentSession.user.id)
    .order('name');
  if (error || !data) return;
  for (const preset of data) {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name;
    opt.dataset.sortField = preset.sort_field;
    opt.dataset.sortDir = preset.sort_dir;
    select.appendChild(opt);
  }
}

function wireSortPresets() {
  document.querySelector('#sort-preset-select').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt.value) return;
    currentSort = { field: opt.dataset.sortField, dir: opt.dataset.sortDir };
    syncMobileSortControls();
    // Gilt wie ein manueller Sortier-Klick (siehe wireSortableHeaders) -
    // bleibt so auch als geräte-lokaler Fallback erhalten, falls später
    // keine Standard-Filtervorlage/Sortier-Vorlage mehr aktiv gewählt ist.
    saveLastSort();
    loadHorses();
  });
  document.querySelector('#save-sort-preset-btn').addEventListener('click', saveSortPreset);
}

async function saveSortPreset() {
  const name = prompt('Name für diese Sortierung:');
  if (!name || !name.trim()) return;
  const { error } = await supabaseClient
    .from('sort_presets')
    .upsert(
      { user_id: currentSession.user.id, name: name.trim(), sort_field: currentSort.field, sort_dir: currentSort.dir },
      { onConflict: 'user_id,name' },
    );
  if (error) {
    alert('Sortierung konnte nicht gespeichert werden: ' + error.message);
    return;
  }
  await loadSortPresets();
}

// --- Mehrfachauswahl (Zeilen) ---

// "#select-all" (Tabellenkopf) und "#select-all-mobile" (Listenkopf, nur
// in der mobilen Kartenansicht sichtbar, da <thead> dort ausgeblendet
// ist) steuern dieselbe Auswahl und werden dabei synchron gehalten.
function wireSelection() {
  const selectAllBoxes = document.querySelectorAll('#select-all, #select-all-mobile');
  selectAllBoxes.forEach((box) => {
    box.addEventListener('change', (e) => {
      const checked = e.target.checked;
      selectAllBoxes.forEach((other) => { other.checked = checked; });
      document.querySelectorAll('#horse-table tbody [data-select]').forEach((cb) => {
        cb.checked = checked;
        onRowSelect(cb.dataset.select, checked, false);
      });
      updateBulkBar();
    });
  });
  document.querySelector('#bulk-delete-btn').addEventListener('click', onBulkDelete);
  document.querySelector('#bulk-tag-btn').addEventListener('click', () => onBulkTag('add'));
  document.querySelector('#bulk-tag-remove-btn').addEventListener('click', () => onBulkTag('remove'));
  wireBulkTagModal();
  wireBulkOwnerChange();
}

// --- Besitzer wechseln (mehrere ausgewählte Pferde auf einmal) ---

function wireBulkOwnerChange() {
  document.querySelector('#bulk-owner-btn').addEventListener('click', onBulkOwnerChange);
  document.querySelector('#bulk-owner-cancel').addEventListener('click', () => {
    document.querySelector('#bulk-owner-modal').hidden = true;
  });
  document.querySelector('#bulk-owner-confirm').addEventListener('click', confirmBulkOwnerChange);
}

function onBulkOwnerChange() {
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  if (!rows.length) return;
  document.querySelector('#bulk-owner-count').textContent = `${rows.length} Pferd${rows.length === 1 ? '' : 'e'} ausgewählt`;
  document.querySelector('#bulk-owner-name').value = '';
  document.querySelector('#bulk-owner-modal').hidden = false;
}

async function confirmBulkOwnerChange() {
  const newOwner = document.querySelector('#bulk-owner-name').value.trim();
  document.querySelector('#bulk-owner-modal').hidden = true;
  if (!newOwner) return;

  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  const results = await Promise.all(
    rows.map((row) => supabaseClient.from('horses').update({ owner: newOwner }).eq('id', row.id)),
  );
  const failed = results.filter((r) => r.error);
  if (failed.length) alert(`${failed.length} von ${rows.length} Pferden konnten nicht aktualisiert werden: ${failed[0].error.message}`);
  await loadHorses();
}

// --- Favoriten (♥/♡-Spalte, siehe migration_031_favorites_dashboard_tiles.sql) ---

// Delegiert auf die Tabelle statt je Zeile einzeln, da loadHorses() das
// tbody-Innere bei jedem Neuladen komplett neu aufbaut (analog zu
// wireBulkTagModal).
function wireFavorites() {
  document.querySelector('#horse-table tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-favorite]');
    if (btn) onToggleFavorite(btn.dataset.favorite);
  });
}

async function onToggleFavorite(id) {
  if (favoriteHorseIds.has(id)) favoriteHorseIds.delete(id);
  else favoriteHorseIds.add(id);
  // Optimistisch: Symbol + Kachel sofort aktualisieren, DB-Fehler zeigt
  // sich nur per alert() statt die UI wieder zurückzudrehen (bleibt so
  // einfach wie die übrigen Bulk-Aktionen dieser Seite).
  const btn = document.querySelector(`[data-favorite="${CSS.escape(id)}"]`);
  if (btn) {
    const isFavorite = favoriteHorseIds.has(id);
    btn.classList.toggle('is-favorite', isFavorite);
    btn.textContent = isFavorite ? '♥' : '♡';
    btn.title = isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren';
  }
  renderDashboardTiles(lastRenderedRows);
  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({ user_id: currentSession.user.id, favorite_horse_ids: [...favoriteHorseIds] });
  if (error) alert('Favorit konnte nicht gespeichert werden: ' + error.message);
}

// --- Dashboard-Kacheln (Kennzahlen über den Filtern, siehe
// migration_031_favorites_dashboard_tiles.sql und einstellungen.html) ---

// Durchschnitt einer Kennzahl über computeDerived(h)[key], ignoriert
// Pferde ohne Wert (analog zu avgGp) - gemeinsame Hilfsfunktion für
// avgExt/avgExtPercent/avgInt unten.
function avgDerived(rows, key, decimals) {
  const values = rows.map((h) => computeDerived(h)[key]).filter((v) => v != null);
  if (!values.length) return '–';
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return decimals != null ? avg.toFixed(decimals) : String(Math.round(avg));
}

// Berechnungen je Kachel-Id aus DASHBOARD_TILE_OPTIONS (parser.js) - hier
// statt dort, da sie Zugriff auf die geladenen Pferde-Zeilen sowie
// computeDerived/favoriteHorseIds brauchen, die nur in list.js existieren.
const DASHBOARD_TILE_DEFS = {
  total: {
    label: 'Pferde gesamt',
    compute: (rows) => String(rows.length),
  },
  avgGp: {
    label: 'Ø Gesamtpotential',
    compute: (rows) => avgDerived(rows, 'gp'),
  },
  avgExt: {
    label: 'Ø Ext',
    compute: (rows) => avgDerived(rows, 'extAvg', 2),
  },
  avgExtPercent: {
    label: 'Ø Ext%',
    compute: (rows) => {
      const result = avgDerived(rows, 'extPercent', 1);
      return result === '–' ? result : result + '%';
    },
  },
  avgInt: {
    label: 'Ø Int',
    compute: (rows) => avgDerived(rows, 'intAvg', 2),
  },
  zzl: {
    label: 'ZZL-Pferde',
    compute: (rows) => String(rows.filter((h) => h.breeding_allowed).length),
  },
  favorites: {
    label: 'Favoriten',
    compute: (rows) => String(rows.filter((h) => favoriteHorseIds.has(h.id)).length),
  },
  mares: {
    label: 'Stuten',
    compute: (rows) => String(rows.filter((h) => h.gender === 'Stute').length),
  },
  stallions: {
    label: 'Hengste',
    compute: (rows) => String(rows.filter((h) => h.gender === 'Hengst').length),
  },
  foals: {
    label: 'Fohlen',
    compute: (rows) => String(rows.filter((h) => h.gender === 'Hengstfohlen' || h.gender === 'Stutfohlen').length),
  },
  diseaseFree: {
    label: 'Erbkrankheitsfrei',
    compute: (rows) => String(rows.filter((h) => h.disease_free === true).length),
  },
};

// Zeigt Kennzahlen zur aktuell gefilterten/sortierten Tabelle (rows =
// lastRenderedRows) - passt sich also mit der Tabelle mit, statt fest den
// Gesamtbestand zu zeigen. dashboardTiles kommt bereits vollständig
// (alle bekannten Ids, siehe mergeDashboardTiles in parser.js) und in der
// vom Konto gewählten Reihenfolge aus loadUserSettings.
function renderDashboardTiles(rows) {
  const container = document.querySelector('#dashboard-tiles');
  if (!container) return;
  const tilesHtml = dashboardTiles
    .filter((t) => t.visible && DASHBOARD_TILE_DEFS[t.id])
    .map((t) => {
      const def = DASHBOARD_TILE_DEFS[t.id];
      return `<div class="dashboard-tile"><span class="dashboard-tile-value">${def.compute(rows)}</span><span class="dashboard-tile-label">${escapeHtml(def.label)}</span></div>`;
    })
    .join('');
  container.innerHTML = tilesHtml;
}

function onRowSelect(id, checked, refreshBar = true) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  if (refreshBar) updateBulkBar();
}

function updateBulkBar() {
  const bar = document.querySelector('#bulk-actions');
  const countEl = document.querySelector('#selected-count');
  if (selectedIds.size > 0) {
    bar.hidden = false;
    countEl.textContent = `${selectedIds.size} ausgewählt`;
  } else {
    bar.hidden = true;
  }
}

function onBulkDelete() {
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  if (!rows.length) return;
  openDeleteModal(rows);
}

// --- Schlagwörter für mehrere ausgewählte Pferde auf einmal (siehe
// HORSE_TAG_OPTIONS in parser.js) - je nach Modus entweder Hinzufügen
// (ergänzt nur, lässt bestehende Schlagwörter und deren Zusatztexte
// unangetastet) oder Entfernen (löscht die angehakten, falls vorhanden).
// Zusatztext einzeln setzen bleibt dem Formular in horse.html vorbehalten.
let bulkTagMode = 'add';

// Zusatztext-Feld je Schlagwort nur im "add"-Modus sinnvoll (beim
// Entfernen spielt ein Zusatztext keine Rolle) - deshalb wird die Liste
// bei jedem Öffnen (siehe onBulkTag) neu aufgebaut statt nur einmalig,
// damit sie je nach Modus mit/ohne Zusatzfeld erscheint. Der einzelne
// Zusatztext gilt dann für ALLE ausgewählten Pferde gleichermaßen (anders
// als im Bearbeiten-Formular, wo jedes Pferd sein eigenes Zusatztext-Feld
// je Schlagwort hat).
function renderBulkTagCheckboxes() {
  const container = document.querySelector('#bulk-tag-checkboxes');
  const showNotes = bulkTagMode === 'add';
  container.innerHTML = HORSE_TAG_OPTIONS.map(({ label, color }) => `
    <label class="tag-checkbox-row">
      <input type="checkbox" data-bulk-tag-checkbox="${escapeHtml(label)}" />
      <span class="tag-dot" style="background:${color}"></span>
      ${escapeHtml(label)}
      ${showNotes ? `<input type="text" class="tag-note-input" data-bulk-tag-note="${escapeHtml(label)}" placeholder="Zusatz (optional)" disabled />` : ''}
    </label>
  `).join('');
}

function wireBulkTagModal() {
  renderBulkTagCheckboxes();
  // Delegiert auf den Container (statt je Checkbox einzeln), da
  // renderBulkTagCheckboxes das Innere bei jedem Öffnen (onBulkTag) neu
  // aufbaut - ein Listener direkt auf dem Container bleibt davon
  // unberührt, muss also nur einmalig hier verdrahtet werden.
  document.querySelector('#bulk-tag-checkboxes').addEventListener('change', (e) => {
    if (!e.target.matches('[data-bulk-tag-checkbox]')) return;
    const noteInput = document.querySelector(`[data-bulk-tag-note="${CSS.escape(e.target.dataset.bulkTagCheckbox)}"]`);
    if (!noteInput) return;
    noteInput.disabled = !e.target.checked;
    if (!e.target.checked) noteInput.value = '';
  });
  document.querySelector('#bulk-tag-cancel').addEventListener('click', () => {
    document.querySelector('#bulk-tag-modal').hidden = true;
  });
  document.querySelector('#bulk-tag-confirm').addEventListener('click', confirmBulkTag);
}

function onBulkTag(mode) {
  bulkTagMode = mode;
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  if (!rows.length) return;
  renderBulkTagCheckboxes();
  document.querySelector('#bulk-tag-count').textContent = `${rows.length} Pferd${rows.length === 1 ? '' : 'e'} ausgewählt`;
  document.querySelector('#bulk-tag-modal-title').textContent = mode === 'add' ? 'Schlagwort zuweisen' : 'Schlagwort entfernen';
  document.querySelector('#bulk-tag-hint').textContent = mode === 'add'
    ? 'Ausgewählte Schlagwörter werden ergänzt, bestehende bleiben erhalten. Ein eingetragener Zusatztext gilt für alle ausgewählten Pferde gleichermaßen.'
    : 'Ausgewählte Schlagwörter werden bei allen ausgewählten Pferden entfernt, falls vorhanden - andere Schlagwörter bleiben erhalten.';
  document.querySelector('#bulk-tag-confirm').textContent = mode === 'add' ? 'Zuweisen' : 'Entfernen';
  document.querySelector('#bulk-tag-modal').hidden = false;
}

async function confirmBulkTag() {
  const chosen = [...document.querySelectorAll('#bulk-tag-checkboxes [data-bulk-tag-checkbox]:checked')].map((cb) => {
    const label = cb.dataset.bulkTagCheckbox;
    const noteInput = document.querySelector(`[data-bulk-tag-note="${CSS.escape(label)}"]`);
    const note = noteInput?.value.trim();
    return note ? { label, note } : { label };
  });
  document.querySelector('#bulk-tag-modal').hidden = true;
  if (!chosen.length) return;

  const chosenLabels = chosen.map((c) => c.label);
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  const results = await Promise.all(rows.map((row) => {
    let newTags;
    if (bulkTagMode === 'remove') {
      newTags = (row.tags || []).filter((t) => !chosenLabels.includes(t.label));
    } else {
      const existingLabels = new Set((row.tags || []).map((t) => t.label));
      newTags = [...(row.tags || []), ...chosen.filter((c) => !existingLabels.has(c.label))];
    }
    return supabaseClient.from('horses').update({ tags: newTags }).eq('id', row.id);
  }));
  const failed = results.filter((r) => r.error);
  if (failed.length) alert(`${failed.length} von ${rows.length} Pferden konnten nicht aktualisiert werden: ${failed[0].error.message}`);
  await loadHorses();
}

// --- CSV-Export ---

const CSV_COLUMNS = ['Name', 'Geschlecht', 'Rasse - Rasseanteile', 'Farbe Genetik', 'GP', 'Ext', 'Ext%', 'Int', 'Besitzer', 'Schlagwörter', 'MDR-Link'];

// Semikolon statt Komma als Trennzeichen, da deutsches Excel Kommas als
// Dezimaltrennzeichen liest und eine mit Komma getrennte CSV-Datei sonst
// nicht automatisch in Spalten aufgeteilt würde.
function csvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

// Deutsches Dezimalkomma statt Punkt - mit Punkt liest Excel (deutsches
// Gebietsschema) Werte wie "2.10" sonst fälschlich als Datum (2. Oktober)
// statt als Zahl.
function deDecimal(value) {
  return String(value).replace('.', ',');
}

function csvRowOf(h) {
  const d = computeDerived(h);
  const breed = normalizeBreed(h.breed) || 'Rasselos';
  const breedCell = h.breed_composition ? `${breed} - ${h.breed_composition}` : breed;
  const colorGeneticsCell = [h.coat_color, d.presentGenes].filter(Boolean).join(' ');
  const mdrLink = h.external_id
    ? `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}`
    : '';
  const tagsCell = (h.tags || []).map((t) => t.note ? `${t.label}: ${t.note}` : t.label).join(', ');
  return [
    h.name || '',
    h.gender || '',
    breedCell,
    colorGeneticsCell,
    d.gp ?? '',
    d.extAvg != null ? deDecimal(d.extAvg.toFixed(2)) : '',
    d.extPercent != null ? deDecimal(d.extPercent) + '%' : '',
    d.intAvg != null ? deDecimal(d.intAvg.toFixed(2)) : '',
    h.owner || '',
    tagsCell,
    mdrLink,
  ];
}

// Sind über die Kästchen einzelne Pferde ausgewählt, werden nur diese
// exportiert - ohne Auswahl exportiert der Button stattdessen alle
// aktuell gefilterten/sortierten Zeilen (lastRenderedRows, siehe
// loadHorses), berücksichtigt also automatisch alle aktiven Filter.
function exportCsv() {
  const rows = selectedIds.size > 0
    ? lastRenderedRows.filter((r) => selectedIds.has(r.id))
    : lastRenderedRows;

  if (!rows.length) {
    alert('Keine Pferde zum Exportieren (Filter ergibt keine Treffer).');
    return;
  }

  const lines = [CSV_COLUMNS, ...rows.map(csvRowOf)]
    .map((row) => row.map(csvEscape).join(';'));
  // BOM voranstellen, damit Excel die UTF-8-Kodierung (Umlaute) korrekt erkennt.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pferde_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireExportCsv() {
  document.querySelector('#export-csv-btn').addEventListener('click', exportCsv);
}
