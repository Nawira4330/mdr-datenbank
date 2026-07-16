const TEXT_FIELDS = [
  'name', 'external_id', 'gender', 'breed', 'breed_composition', 'coat_color', 'owner', 'hlp_slp', 'notes', 'image_url',
];
const DATE_FIELDS = [];
const NUMBER_FIELDS = ['purebred_pct', 'ico'];
const BOOLEAN_FIELDS = ['disease_free', 'breeding_allowed'];
const JSONB_KEYS = [
  'genetic_diseases', 'colors', 'exterior_genetics', 'exterior_descriptive',
  'temperament', 'disciplines', 'traits', 'tournament_potential', 'pedigree',
  'color_gene_overrides', 'disease_gene_overrides',
];

let extraData = {};
let editingId = null;
// Benutzername (vor dem @) des eingeloggten Kontos - wird fuer die
// Pfeil-Navigation (findAdjacentHorseId) gebraucht, damit dort nur durch
// die eigenen Pferde geblaettert wird. Eigener Name (nicht "currentIdentity")
// noetig, weil horseForm.js und verpaarung.js beide als eigene <script>-Tags
// auf verpaarung.html geladen werden und sich denselben globalen Scope
// teilen - eine gleichnamige "let"-Variable in beiden Dateien wuerde einen
// SyntaxError ausloesen, der das komplette zweite Skript (verpaarung.js)
// stumm lahmlegt (siehe Commit-Historie).
let formIdentity = null;

document.addEventListener('DOMContentLoaded', init);

// Klick auf einen Gen-Bestätigungs-Button (siehe geneOverrideBadge/
// nextOverrideState in parser.js) - per Event-Delegation auf "document",
// damit es unabhaengig davon funktioniert, wie oft renderDetailTables die
// Detail-Tabellen neu aufbaut (dabei wird jedesmal neues HTML erzeugt,
// ein direkt angehefteter Listener wuerde also verloren gehen). Auf der
// reinen Ansichtsseite (view.html, erkennbar an ".view-mode") sind die
// Buttons nur Anzeige, kein Klick-Handling - siehe auch CSS
// (.view-mode .gene-override { pointer-events: none; }).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-override-locus]');
  if (!btn || document.querySelector('.view-mode')) return;
  // "key" ist entweder ein bloßer Locus-/Krankheits-Name ("Champagne",
  // "CA") oder bei Loci mit mehreren Allelen "Locus:Allel" ("KIT:To"),
  // siehe LOCUS_MULTI_ALLELES in parser.js. "data-override-group"
  // unterscheidet Farbgenetik (color_gene_overrides, Standard) von
  // Erbkrankheiten (disease_gene_overrides).
  const key = btn.dataset.overrideLocus;
  const field = btn.dataset.overrideGroup === 'disease' ? 'disease_gene_overrides' : 'color_gene_overrides';
  const overrides = { ...(extraData[field] || {}) };
  const next = nextOverrideState(key, overrides[key] || null);
  if (next) overrides[key] = next;
  else delete overrides[key];
  extraData[field] = overrides;
  renderDetailTables(extraData);
});

async function init() {
  // Wird dieses Skript auf einer anderen Seite geladen, um einzelne
  // Funktionen wiederzuverwenden (z.B. das Fohlen-Popup in
  // verpaarung.html, das dieselben Feld-IDs nutzt, aber sein eigenes
  // Speichern/Wiring hat), soll das eigene init() hier nicht laufen -
  // "page-title" gibt es nur auf horse.html selbst.
  if (!document.getElementById('page-title')) return;

  const session = await requireSession();
  if (!session) return;
  wireLogout();
  formIdentity = session.user.email.split('@')[0];

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  document.getElementById('parse-btn').addEventListener('click', onParse);
  document.getElementById('horse-form').addEventListener('submit', onSave);
  document.getElementById('delete-btn').addEventListener('click', onDelete);
  document.getElementById('purebred_pct').addEventListener('input', updateBreedCompositionVisibility);
  updateBreedCompositionVisibility();
  wireSaveWarningModal();
  wireTabs();

  if (editingId) {
    document.getElementById('page-title').textContent = '🐴 Pferd bearbeiten';
    document.getElementById('delete-btn').hidden = false;
    // Pfeile zum Speichern + direkt zum naechsten/vorherigen Pferd
    // (alphabetisch) springen - nur beim Bearbeiten eines bestehenden
    // Pferds sinnvoll, nicht bei der Neuanlage.
    document.getElementById('prev-horse-btn').hidden = false;
    document.getElementById('next-horse-btn').hidden = false;
    document.getElementById('prev-horse-btn').addEventListener('click', () => onSaveAndNavigate('prev'));
    document.getElementById('next-horse-btn').addEventListener('click', () => onSaveAndNavigate('next'));
    // Der Text-Einfuegen-Kasten ist beim Bearbeiten eines bereits
    // angelegten Pferds meist nicht mehr gebraucht - eingeklappt starten,
    // laesst sich bei Bedarf (z.B. erneutes Auslesen) einfach aufklappen.
    document.getElementById('paste-details').open = false;
    await loadHorse(editingId);
  }
}

async function loadHorse(id) {
  const { data, error } = await supabaseClient.from('horses').select('*').eq('id', id).single();
  if (error) {
    document.getElementById('form-error').textContent = 'Konnte Pferd nicht laden: ' + error.message;
    return;
  }
  fillForm(data);
  extraData = data;
  document.getElementById('raw-text').value = data.raw_text || '';
  await renderDetailTables(data);
}

async function onParse() {
  const text = document.getElementById('raw-text').value;
  const statusEl = document.getElementById('parse-status');
  if (!text.trim()) {
    statusEl.textContent = 'Bitte zuerst Text einfügen.';
    return;
  }
  const parsed = parseHorseText(text);
  fillForm(parsed);
  extraData = { ...extraData, ...parsed };
  await renderDetailTables(parsed);
  statusEl.textContent = 'Erkannt: ' + (parsed.name || 'kein Name gefunden') + ' — bitte Felder unten prüfen, bevor du speicherst.';
}

function fillForm(data) {
  for (const id of TEXT_FIELDS.concat(DATE_FIELDS)) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
  }
  for (const id of NUMBER_FIELDS) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
  }
  for (const id of BOOLEAN_FIELDS) {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== null) el.value = String(data[id]);
  }
  // "Rasselos" ist im Spiel eine echte Ausprägung ("keine Rasse"), keine
  // fehlende Angabe - wird deshalb auch im Bearbeitungsformular als Wert
  // eingetragen statt leer gelassen, konsistent mit der Übersichtstabelle
  // und den Filtern (siehe list.js: normalizeBreed(h.breed) || 'Rasselos').
  const breedEl = document.getElementById('breed');
  if (breedEl && !breedEl.value.trim()) breedEl.value = 'Rasselos';
  updateBreedCompositionVisibility();
}

// Das Rasseanteile-Feld ist nur relevant, wenn das Pferd NICHT sicher zu
// 100% reinrassig ist - bei leerem/unbekanntem Reinrassigkeit-Wert bleibt
// es trotzdem sichtbar, damit es sich vorsorglich ausfüllen lässt (siehe
// missingDataLabels: nur bei bekanntem Wert < 100% wird es überhaupt
// verlangt). Wird sowohl bei jedem fillForm() (Laden/Auslesen) als auch
// live beim Tippen im Reinrassigkeit-Feld aufgerufen (siehe init()).
function updateBreedCompositionVisibility() {
  const field = document.getElementById('breed-composition-field');
  if (!field) return;
  const pct = document.getElementById('purebred_pct').value;
  const isKnownFullyPurebred = pct !== '' && Number(pct) === 100;
  field.hidden = isKnownFullyPurebred;
}

function collectForm() {
  const out = {};
  for (const id of TEXT_FIELDS.concat(DATE_FIELDS)) {
    const el = document.getElementById(id);
    const v = el.value.trim();
    out[id] = v === '' ? null : v;
  }
  // Rasse-Kürzel (z.B. "APH") auf den ausgeschriebenen Namen normalisieren,
  // falls direkt ins Formular eingetragen statt per Text-Auslesen (dort
  // übernimmt das bereits parser.js) - siehe normalizeBreed.
  if (out.breed) out.breed = normalizeBreed(out.breed);
  for (const id of NUMBER_FIELDS) {
    const el = document.getElementById(id);
    out[id] = el.value === '' ? null : Number(el.value);
  }
  for (const id of BOOLEAN_FIELDS) {
    const el = document.getElementById(id);
    out[id] = el.value === '' ? null : el.value === 'true';
  }
  return out;
}

// Ausführliche Hinweistexte zu missingDataLabels (siehe parser.js) - kein
// Pflichtfeld-Fehler, sondern nur ein Hinweis vor dem Speichern, siehe
// showSaveWarningModal.
const MISSING_DATA_SENTENCES = {
  'Ext%': 'Das Exterieur-Prozentwert (Ext%) konnte nicht berechnet werden.',
  'Stammbaum': 'Der Stammbaum konnte nicht vollständig erfasst werden.',
  'Turnierwerte': 'Die Turnierwerte (GP/Begabung) konnten nicht vollständig erfasst werden.',
  'Rasseanteile': 'Das Pferd ist nicht 100% reinrassig - bitte die Rasseanteile ergänzen.',
};
function missingDataWarnings(payload) {
  return missingDataLabels(payload).map((label) => MISSING_DATA_SENTENCES[label]);
}

let pendingSave = null;
// Wohin performSave nach erfolgreichem Speichern weiterleitet - normal
// zurueck zur Uebersicht, bei den Pfeil-Buttons (siehe onSaveAndNavigate)
// stattdessen direkt zum naechsten/vorherigen Pferd.
let saveRedirect = 'index.html';

async function onSave(e) {
  e.preventDefault();
  saveRedirect = 'index.html';
  await runSaveFlow();
}

// Speichert das aktuelle Pferd wie ein normaler Save, leitet danach aber
// nicht zur Uebersicht, sondern direkt zum alphabetisch naechsten/
// vorherigen Pferd weiter - damit laesst sich eine ganze Liste ohne
// Umweg ueber die Uebersicht durcharbeiten.
async function onSaveAndNavigate(direction) {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const adjacentId = await findAdjacentHorseId(direction);
  if (!adjacentId) {
    errorEl.textContent = direction === 'next'
      ? 'Kein weiteres Pferd (Ende der alphabetischen Liste).'
      : 'Kein vorheriges Pferd (Anfang der alphabetischen Liste).';
    return;
  }

  saveRedirect = `horse.html?id=${adjacentId}`;
  await runSaveFlow();
}

// Gleiche Sortierung wie in der Uebersicht (list.js sortValue "name"),
// damit "naechstes/vorheriges Pferd" hier zur selben Reihenfolge passt,
// die man auch in der Liste sieht. Auf die eigenen Pferde (Besitzer =
// eingeloggter Benutzername) eingeschraenkt, damit man beim Durchklicken
// nicht auch fremde Pferde anderer Nutzer*innen zu sehen bekommt.
async function findAdjacentHorseId(direction) {
  const { data, error } = await supabaseClient.from('horses').select('id, name').ilike('owner', formIdentity);
  if (error || !data) return null;
  data.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase(), 'de'));
  const idx = data.findIndex((h) => h.id === editingId);
  if (idx === -1) return null;
  const adjacentIdx = direction === 'next' ? idx + 1 : idx - 1;
  return data[adjacentIdx]?.id || null;
}

async function runSaveFlow() {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const formData = collectForm();
  if (!formData.name) {
    errorEl.textContent = 'Name ist ein Pflichtfeld.';
    return;
  }

  const payload = { ...formData };
  for (const k of JSONB_KEYS) {
    if (extraData[k] !== undefined) payload[k] = extraData[k];
  }
  // Der reinkopierte Rohtext wird nur zum Auslesen gebraucht - nach dem
  // Speichern soll ausschließlich das daraus extrahierte Ergebnis in der
  // Datenbank stehen, nicht der Rohtext selbst.
  payload.raw_text = null;

  const warnings = missingDataWarnings(payload);
  if (warnings.length) {
    pendingSave = { formData, payload, session };
    const list = document.getElementById('save-warning-list');
    list.innerHTML = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
    document.getElementById('save-warning-modal').hidden = false;
    return;
  }

  await performSave(formData, payload, session);
}

function wireSaveWarningModal() {
  document.getElementById('save-warning-cancel').addEventListener('click', () => {
    document.getElementById('save-warning-modal').hidden = true;
    pendingSave = null;
  });
  document.getElementById('save-warning-confirm').addEventListener('click', async () => {
    document.getElementById('save-warning-modal').hidden = true;
    if (!pendingSave) return;
    const { formData, payload, session } = pendingSave;
    pendingSave = null;
    await performSave(formData, payload, session);
  });
}

async function performSave(formData, payload, session) {
  const errorEl = document.getElementById('form-error');

  // Wird ein neues Pferd mit einem Namen gespeichert, der bereits existiert
  // (Groß-/Kleinschreibung egal), wird statt einer neuen Dopplung einfach
  // der bestehende Datensatz aktualisiert. Beim Bearbeiten eines bereits
  // geladenen Pferds (editingId gesetzt) entfällt diese Prüfung, da es
  // sich sonst selbst als "Dopplung" erkennen würde.
  let targetId = editingId;
  if (!targetId) {
    const { data: existing, error: lookupError } = await supabaseClient
      .from('horses')
      .select('id')
      .ilike('name', formData.name)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      errorEl.textContent = 'Prüfung auf bestehenden Datensatz fehlgeschlagen: ' + lookupError.message;
      return;
    }
    if (existing) targetId = existing.id;
  }

  let error;
  if (targetId) {
    ({ error } = await supabaseClient.from('horses').update(payload).eq('id', targetId));
  } else {
    payload.user_id = session.user.id;
    ({ error } = await supabaseClient.from('horses').insert(payload));
  }

  if (error) {
    errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }

  // Wird in der Übersicht nach der Weiterleitung als Banner angezeigt und
  // dort direkt wieder aus dem sessionStorage entfernt (siehe list.js) -
  // nur setzen, wenn es auch wirklich dorthin geht (bei den Pfeil-Buttons
  // geht es stattdessen zum naechsten/vorherigen Pferd, siehe
  // onSaveAndNavigate - sonst wuerde der Banner erst beim naechsten
  // zufaelligen Besuch der Uebersicht faelschlich fuer dieses Pferd
  // erscheinen).
  if (saveRedirect === 'index.html') {
    sessionStorage.setItem('mdr_flash', JSON.stringify({
      action: targetId ? 'updated' : 'created',
      name: formData.name,
    }));
  }
  window.location.href = saveRedirect;
}

async function onDelete() {
  if (!editingId) return;
  if (!confirm('Dieses Pferd wirklich unwiderruflich löschen?')) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', editingId);
  if (error) {
    document.getElementById('form-error').textContent = 'Löschen fehlgeschlagen: ' + error.message;
    return;
  }
  window.location.href = 'index.html';
}

// --- Detail-Tabellen (nur Anzeige) ---

// Verteilt die erkannten Detaildaten auf die 4 Reiter (Stammdaten/
// Genetik/Turnierwerte/Stammbaum, siehe horse.html/view.html + wireTabs)
// statt sie wie zuvor in einem einzigen Block anzuzeigen. Das
// Fohlen-Popup in verpaarung.html nutzt dieselben Funktionen aber noch
// ein einzelnes "detail-tables" (keine Reiter, dafür kompakter) -
// fillDetailContainer() ist daher pro Container ein No-Op, falls das
// jeweilige Ziel-Element auf der aktuellen Seite gar nicht existiert, und
// am Ende wird zusätzlich - nur falls vorhanden - alles gesammelt in
// "detail-tables" geschrieben.
async function renderDetailTables(data) {
  const genetikParts = [];
  const turnierParts = [];
  const stammbaumParts = [];

  if (data.genetic_diseases?.length || data.colors?.length) {
    genetikParts.push(diseaseTableHtml(data.genetic_diseases, data.disease_gene_overrides));
  }
  if (data.colors?.length) {
    const notes = document.getElementById('notes').value;
    const horseName = document.getElementById('name').value;
    const parentHints = await fetchParentColorHints(data.pedigree, data.coat_color, notes, horseName);
    genetikParts.push(colorGeneticsHtml(data.colors, data.coat_color, notes, horseName, parentHints, data.color_gene_overrides));
  }
  if (data.exterior_genetics?.rows?.length) genetikParts.push(exteriorGeneticsHtml(data.exterior_genetics));
  if (data.exterior_descriptive?.length) {
    genetikParts.push(scoredTableHtml(
      'Exterieur (Körperbau)', data.exterior_descriptive, scoreExteriorTerm,
      'Skala 1 = exzellent … 3 = passabel … 5 = stark abweichend',
    ));
  }
  if (data.temperament?.length) {
    genetikParts.push(scoredTableHtml(
      'Interieur (Mentalität)', data.temperament, scoreTemperamentTerm,
      'Skala 1 = exzellent … 4 = schlecht',
    ));
  }

  if (data.tournament_potential && Object.keys(data.tournament_potential).length) {
    turnierParts.push(tournamentSummaryHtml(data.tournament_potential, data.disciplines));
  }
  if (data.disciplines && Object.keys(data.disciplines).length) turnierParts.push(percentGroupsHtml('Disziplinen', data.disciplines, true));
  if (data.traits && Object.keys(data.traits).length) turnierParts.push(percentGroupsHtml('Eigenschaften', data.traits, true));

  if (hasPedigreeData(data.pedigree)) stammbaumParts.push(pedigreeHtml(data.pedigree));

  fillDetailContainer('detail-genetik', genetikParts);
  fillDetailContainer('detail-turnier', turnierParts);
  fillDetailContainer('detail-stammbaum', stammbaumParts);

  const legacyContainer = document.getElementById('detail-tables');
  if (legacyContainer) {
    const allParts = [...genetikParts, ...turnierParts, ...stammbaumParts];
    legacyContainer.innerHTML = allParts.join('');
    const legacyFieldset = document.getElementById('detail-fieldset');
    if (legacyFieldset) legacyFieldset.hidden = allParts.length === 0;
  }
}

function fillDetailContainer(id, parts) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = parts.join('');
}

// --- Reiter (Stammdaten/Genetik/Turnierwerte/Stammbaum) ---
// Auf horse.html UND view.html verwendet (siehe wireTabs()-Aufruf in
// init() bzw. horseView.js/initView()) - auf verpaarung.html's
// Fohlen-Popup gibt es keine ".tab-btn"-Elemente, wireTabs() findet dort
// also einfach nichts und tut nichts.
function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
}

function simpleTableHtml(title, rows) {
  const body = rows.map((r) => `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`).join('');
  return `<div class="group-heading">${escapeHtml(title)}</div><table class="detail-table">${body}</table>`;
}

// Wie geneOverrideBadge, aber mit auf Erbkrankheiten zugeschnittenem
// Wortlaut ("Träger"/"Betroffen"/"Frei" statt "1x/2x vorhanden"/"nicht
// vorhanden") - optisch identisch (dieselben CSS-Klassen und
// Zustandssymbole), nur andere Tooltip-Bedeutung. data-override-group
// unterscheidet im Klick-Handler zwischen Farbgenetik und Erbkrankheiten
// (siehe document.addEventListener('click', ...) oben).
function diseaseOverrideBadge(code, state) {
  const stateInfo = {
    het: { label: '1×', cls: 'het', title: 'Träger (mischerbig)' },
    hom: { label: '2×', cls: 'hom', title: 'Betroffen (reinerbig)' },
    absent: { label: '✗', cls: 'absent', title: 'Frei (kein Risikoallel bekannt)' },
  }[state] || { label: '?', cls: 'unknown', title: 'Unbekannt, ob Träger/betroffen' };
  const title = `${stateInfo.title} – zum Ändern klicken`;
  return `<button type="button" class="gene-override gene-override-${stateInfo.cls}" data-override-locus="${escapeHtml(code)}" data-override-group="disease" title="${escapeHtml(title)}">${stateInfo.label}</button>`;
}

// Zeigt zunächst alle tatsächlich getesteten Erbkrankheiten (Rohwerte wie
// "NN/NN", unverändert), danach je fehlender Krankheit aus
// KNOWN_DISEASE_CODES (siehe parser.js) eine "Nicht getestet"-Zeile mit
// Klick-Button zur manuellen Träger/Betroffen/Frei-Bestätigung - z.B. für
// junge Fohlen, die noch nicht beim Tierarzt getestet wurden.
function diseaseTableHtml(diseases, overrides) {
  const rows = diseases || [];
  const ov = overrides || {};
  const testedCodes = new Set(rows.map((d) => d.label));

  const testedBody = rows.map((r) => `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`).join('');

  const untestedBody = KNOWN_DISEASE_CODES.filter((code) => !testedCodes.has(code)).map((code) => {
    const state = ov[code] || null;
    let text = 'Nicht getestet';
    if (state === 'het') text += ' — Träger (manuell)';
    else if (state === 'hom') text += ' — betroffen, reinerbig (manuell)';
    else if (state === 'absent') text += ' — frei (manuell)';
    const badge = diseaseOverrideBadge(code, state);
    return `<tr><th>${escapeHtml(code)}</th><td class="gene-cell"><span class="gene-value-text">${text}</span><span class="gene-badges">${badge}</span></td></tr>`;
  }).join('');

  return `<div class="group-heading">Erbkrankheiten</div><table class="detail-table">${testedBody}${untestedBody}</table>`;
}

// Wie simpleTableHtml, aber zusätzlich mit berechnetem Durchschnitt anhand
// einer Bewertungsskala (siehe scoreExteriorTerm/scoreTemperamentTerm in
// parser.js).
function scoredTableHtml(title, rows, scoreFn, scaleHint) {
  const base = simpleTableHtml(title, rows);
  const avg = averageScore(rows, scoreFn);
  if (avg === null) return base;
  return `${base}<p class="small muted">Durchschnitt: <strong>${avg.toFixed(2)}</strong> (${escapeHtml(scaleHint)})</p>`;
}

function exteriorGeneticsHtml(ext) {
  const body = ext.rows.map((r) => {
    const pct = fractionToPercent(r.score);
    const pctText = pct !== null ? ` — ${pct.toFixed(1)}%` : '';
    return `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.genotype)} — ${escapeHtml(r.score)}${pctText}</td></tr>`;
  }).join('');
  const overall = ext.overall
    ? `<p class="small muted">Exterieur-Gesamtwert (genetisch): <strong>${ext.overall.percent}%</strong> (${escapeHtml(ext.overall.score)})</p>`
    : '';
  return `<div class="group-heading">Exterieur (Genetik)</div><table class="detail-table">${body}</table>${overall}`;
}

// Klick-Button je nicht getestetem Locus/Allel (siehe nextOverrideState in
// parser.js) - Klick-Zyklus: unbekannt -> 1x vorhanden -> 2x vorhanden
// (reinerbig, außer bei Overo) -> nicht vorhanden -> zurück zu unbekannt.
// "key" ist entweder der bloße Locus-Name ("Champagne") oder bei Loci mit
// mehreren Allelen (siehe LOCUS_MULTI_ALLELES) "Locus:Allel" ("KIT:To") -
// "allelePrefix" zeigt dann zusätzlich, welches Allel gemeint ist. Auf der
// reinen Ansichtsseite (view.html, .view-mode) nur Anzeige, siehe CSS und
// den Klick-Handler weiter unten.
function geneOverrideBadge(key, state, allelePrefix) {
  const stateInfo = {
    het: { label: '1×', cls: 'het', title: '1x vorhanden (mischerbig)' },
    hom: { label: '2×', cls: 'hom', title: '2x vorhanden (reinerbig)' },
    absent: { label: '✗', cls: 'absent', title: 'nicht vorhanden' },
  }[state] || { label: '?', cls: 'unknown', title: 'Unbekannt, ob vorhanden' };
  const prefix = allelePrefix ? `${allelePrefix}: ` : '';
  const label = allelePrefix ? `${allelePrefix} ${stateInfo.label}` : stateInfo.label;
  const title = `${prefix}${stateInfo.title} – zum Ändern klicken`;
  return `<button type="button" class="gene-override gene-override-${stateInfo.cls}" data-override-locus="${escapeHtml(key)}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

// Name (Fellfarbe) + Rohwerte je Locus + Zusammenfassung der tatsächlich
// vorhandenen Gene (großgeschrieben = vorhanden, Ausnahme "pl"). Bei nicht
// getesteten Loci werden zusätzlich Hinweise aus Fellfarbe-Namen, Notiz
// UND (falls Vater/Mutter in der Datenbank stehen und dort reinerbig
// getestet sind) den Eltern einbezogen (siehe fetchParentColorHints) -
// eine manuelle Bestätigung/Ausschluss (overrides, per Klick-Button,
// siehe geneOverrideBadge) hat dabei Vorrang vor diesen automatischen
// Hinweisen.
function colorGeneticsHtml(rows, coatColorName, notes, horseName, parentHints, overrides) {
  const ov = overrides || {};
  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName),
    ...inferGeneticHintsFromPhenotype(notes),
    ...inferGeneticHintsFromPhenotype(horseName),
    ...(parentHints || []).map((h) => ({ locus: h.locus, allele: h.alleles, fromParent: true })),
  ];
  const hintsByLocus = {};
  for (const h of hints) {
    const list = (hintsByLocus[h.locus] ||= []);
    if (!list.some((x) => x.allele === h.allele)) list.push(h);
  }

  // Flaxen wird vom Spiel nie als eigener Locus getestet (siehe
  // presentGenesSummary in parser.js) und taucht deshalb nie in "rows"
  // auf - trotzdem braucht es eine eigene Zeile mit Klick-Button, damit
  // sich z.B. eine Vererbung vom Elternteil (siehe parentHomozygousLoci)
  // dort auch anzeigen und manuell bestätigen lässt. Nur für die Anzeige
  // ergänzt, presentGenesSummary weiter unten bekommt weiterhin die
  // ungeänderten "rows" (dort wird Flaxen unabhängig davon schon aus
  // Fellfarbe/Notiz/Name/Elternteil abgeleitet).
  const displayRows = [...rows, { label: 'Flaxen', value: 'Nicht getestet' }];

  const body = displayRows.map((r) => {
    let value = escapeHtml(r.value);
    const untested = isUntestedLocusValue(r.value);
    const multiAlleles = LOCUS_MULTI_ALLELES[r.label];
    let badges = '';

    if (untested && multiAlleles) {
      // Loci mit mehreren unabhängigen Allelen (KIT/Agouti) - je Allel
      // eigener Zustand/Text/Klick-Button statt nur einem für den ganzen
      // Locus (siehe LOCUS_MULTI_ALLELES).
      const parts = [];
      for (const allele of multiAlleles) {
        const key = `${r.label}:${allele}`;
        const state = ov[key] || null;
        if (state === 'absent') {
          parts.push(`${allele}: nicht vorhanden (manuell)`);
        } else if (state) {
          parts.push(`${allele}: ${state === 'hom' ? 'reinerbig' : 'mindestens 1x'} vorhanden (manuell)`);
        } else {
          // Manche abgeleiteten Hinweise sind schon verdoppelt (z.B. "pl"
          // bei Pearl, das nur reinerbig sichtbar ist, siehe
          // PHENOTYPE_GENE_HINTS) - dann nicht nur auf exakte Gleichheit
          // mit dem einfachen Allel-Kürzel prüfen, sondern auch auf die
          // doppelte Form, und den Text entsprechend anpassen.
          const hint = hintsByLocus[r.label]?.find((h) => h.allele === allele || h.allele === allele + allele);
          if (hint) {
            const isDoubled = hint.allele === allele + allele;
            parts.push(`${allele}: ${isDoubled ? 'reinerbig' : 'mindestens 1x'} vorhanden (${hint.fromParent ? 'laut Elternteil' : 'laut Fellfarbe/Notiz'})`);
          }
        }
        badges += geneOverrideBadge(key, state, allele);
      }
      if (parts.length) value += ' — ' + parts.join(', ');
    } else if (untested) {
      const overrideState = ov[r.label] || null;
      if (overrideState) {
        const primary = LOCUS_PRIMARY_ALLELE[r.label];
        if (overrideState === 'absent') {
          value += ' — manuell als nicht vorhanden markiert';
        } else if (primary) {
          const code = overrideState === 'hom' ? primary + primary : primary;
          value += ` — ${overrideState === 'hom' ? 'reinerbig' : 'mindestens'} ${escapeHtml(code)} vorhanden (manuell)`;
        } else {
          value += ` — manuell als ${overrideState === 'hom' ? '2x' : '1x'} vorhanden markiert`;
        }
      } else if (hintsByLocus[r.label]) {
        const fromPhenotype = hintsByLocus[r.label].filter((h) => !h.fromParent).map((h) => h.allele);
        const fromParent = hintsByLocus[r.label].filter((h) => h.fromParent).map((h) => h.allele);
        const parts = [];
        if (fromPhenotype.length) parts.push(`mindestens ${escapeHtml(fromPhenotype.join(', '))} (laut Fellfarbe/Notiz)`);
        if (fromParent.length) parts.push(`mindestens ${escapeHtml(fromParent.join(', '))} (laut Elternteil)`);
        value += ' — ' + parts.join(', ');
      }
      badges = geneOverrideBadge(r.label, overrideState);
    }
    // Text und Klick-Button(s) in getrennten Spans innerhalb einer
    // Flex-Zelle, damit die Buttons unabhängig von der (je Zeile
    // unterschiedlich langen) Hinweis-Textlänge immer an derselben
    // Position stehen und so über alle Zeilen hinweg miteinander
    // ausgerichtet sind (siehe CSS .detail-table td.gene-cell).
    const cellClass = badges ? ' class="gene-cell"' : '';
    const cellContent = badges
      ? `<span class="gene-value-text">${value}</span><span class="gene-badges">${badges}</span>`
      : value;
    return `<tr><th>${escapeHtml(r.label)}</th><td${cellClass}>${cellContent}</td></tr>`;
  }).join('');

  const nameLine = coatColorName ? `<p class="small muted">Name: <strong>${escapeHtml(coatColorName)}</strong></p>` : '';

  const summary = presentGenesSummary(rows, coatColorName, notes, horseName, parentHints, overrides);
  let summaryHtml = '';
  if (summary.length) {
    const text = summary.map((s) => {
      if (s.source === 'abgeleitet') return `${s.alleles} (abgeleitet)`;
      if (s.source === 'elternteil') return `${s.alleles} (von Elternteil)`;
      if (s.source === 'manuell') return `${s.alleles} (manuell)`;
      return s.alleles;
    }).join(', ');
    summaryHtml = `<p class="small muted">Vorhandene Gene: <strong>${escapeHtml(text)}</strong></p>`;
  } else {
    summaryHtml = '<p class="small muted">Keine vorhandenen Gene erkannt.</p>';
  }

  return `<div class="group-heading">Farbgenetik</div>${nameLine}<table class="detail-table">${body}</table>${summaryHtml}`;
}

// Liest Vater/Mutter aus dem Stammbaum (erste zwei Einträge, siehe
// parser.js/parsePedigree - "Eltern des Vaters" kommt im Text immer vor
// "Eltern der Mutter", die direkten Eltern folgen derselben Reihenfolge)
// und lädt ihre Daten, falls sie unter diesem Namen bereits in der
// Datenbank stehen.
async function fetchParentRecords(pedigree) {
  const ancestors = Array.isArray(pedigree) ? pedigree.slice(1) : (pedigree?.ancestors || []);
  const parentNames = [ancestors[0]?.name, ancestors[1]?.name].filter(Boolean);
  if (!parentNames.length) return [];

  const { data, error } = await supabaseClient
    .from('horses')
    .select('name, coat_color, notes, colors, color_gene_overrides')
    .in('name', parentNames);
  if (error || !data) return [];
  return data;
}

// Reinerbig vorhandene Loci eines Elternteils - sowohl bestätigt
// (getestet) als auch abgeleitet (z.B. aus dem Namen "Cremello" oder
// einem doppelten Kürzel "SPLSPL" in der Notiz), siehe
// presentGenesSummary/isDoubledAllele in parser.js. Ein reinerbiger
// Elternteil vererbt sein Allel garantiert (100%) - beim Fohlen selbst
// bedeutet das aber erstmal nur EINE garantierte Kopie (mischerbig),
// nicht zwangsläufig reinerbig (siehe parentColorHints).
function parentHomozygousLoci(parent) {
  const genes = presentGenesSummary(parent.colors, parent.coat_color, parent.notes, parent.name, null, parent.color_gene_overrides);
  const map = {};
  for (const g of genes) {
    if (isDoubledAllele(g.alleles)) map[g.locus] = halveDoubledAllele(g.alleles);
  }
  return map;
}

// Ist ein Locus bei GENAU EINEM Elternteil reinerbig vorhanden, weiß man
// beim Fohlen (falls dort selbst nicht vollständig getestet) nur, dass
// mindestens eine Kopie davon vorhanden ist (mischerbig) - welches Allel
// der zweite Elternteil weitergibt, ist Zufall. Sind dagegen BEIDE
// Elternteile für denselben Locus reinerbig mit demselben Allel, ist auch
// das Fohlen zwingend reinerbig dafür.
function parentColorHints(parents) {
  const perParent = parents.map(parentHomozygousLoci);
  const loci = new Set();
  perParent.forEach((m) => Object.keys(m).forEach((l) => loci.add(l)));

  const hints = [];
  for (const locus of loci) {
    const values = perParent.map((m) => m[locus]).filter(Boolean);
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 1 && values.length >= 2) {
      hints.push({ locus, alleles: uniqueValues[0] + uniqueValues[0] });
    } else {
      for (const v of uniqueValues) hints.push({ locus, alleles: v });
    }
  }
  return hints;
}

// Sonderfall "Pinto" (siehe pintoPatternsFromColors in parser.js): allein
// aus dem Namen lässt sich nicht sagen, welche 2 der 4 Scheckungs-Muster
// gemeint sind - stehen bei den Eltern zusammen aber genau 2 dieser 4
// Muster getestet vorhanden, muss ein sichtbar "Pinto" bezeichnetes Fohlen
// genau diese geerbt haben.
function pintoParentHints(parents, coatColorName, notes, horseName) {
  const isPinto = /\bpinto\b/i.test(`${coatColorName || ''} ${notes || ''} ${horseName || ''}`);
  if (!isPinto) return [];

  const combined = new Set();
  for (const parent of parents) {
    for (const p of pintoPatternsFromColors(parent.colors)) combined.add(p);
  }
  if (combined.size !== 2) return [];

  return [...combined].map((allele) => ({ locus: PINTO_ALLELE_LOCUS[allele], alleles: allele }));
}

async function fetchParentColorHints(pedigree, coatColorName, notes, horseName) {
  const parents = await fetchParentRecords(pedigree);
  return [
    ...parentColorHints(parents),
    ...pintoParentHints(parents, coatColorName, notes, horseName),
  ];
}

// GP (Gesamtpotenzial) und Begabung stehen im Text schon zusammen; die
// Hauptdisziplin (übergeordnete Kategorie der Begabung, z.B. "Western" für
// "Trail") wird hier aus den bereits geparsten Disziplin-Gruppen abgeleitet.
function findDisciplineCategory(disciplines, name) {
  if (!disciplines || !name) return null;
  for (const [category, entries] of Object.entries(disciplines)) {
    if (entries.some((e) => e.name === name)) return category;
  }
  return null;
}

function tournamentSummaryHtml(tp, disciplines) {
  const gp = tp['Gesamtpotenzial'];
  const begabung = tp['Begabung'];
  const hauptdisziplin = findDisciplineCategory(disciplines, begabung);

  const rows = [];
  if (gp) rows.push(['GP (Gesamtpotenzial)', gp]);
  if (begabung) rows.push(['Begabung', begabung]);
  if (hauptdisziplin) rows.push(['Hauptdisziplin', hauptdisziplin]);

  const body = rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  return `<div class="group-heading">Turnierpotenzial</div><table class="detail-table">${body}</table>`;
}

function percentGroupsHtml(title, groups, potentialOnly) {
  let html = `<div class="group-heading">${escapeHtml(title)}</div>`;
  for (const [group, entries] of Object.entries(groups)) {
    const body = entries.map((e) => {
      const value = potentialOnly ? `${e.potential}%` : `${e.current}% (Potenzial ${e.potential}%)`;
      return `<tr><th>${escapeHtml(e.name)}</th><td>${value}</td></tr>`;
    }).join('');
    html += `<p class="small muted" style="margin-bottom:0.1rem;">${escapeHtml(group)}</p><table class="detail-table">${body}</table>`;
  }
  return html;
}

// hasPedigreeData siehe parser.js (dort geteilt mit list.js).

const PEDIGREE_SECTION_ORDER = [
  'Eltern',
  'Großeltern väterlicherseits', 'Großeltern mütterlicherseits',
  'Urgroßeltern (Großvater väterlicherseits)', 'Urgroßeltern (Großmutter väterlicherseits)',
  'Urgroßeltern (Großvater mütterlicherseits)', 'Urgroßeltern (Großmutter mütterlicherseits)',
];

function pedigreeGroupTableHtml(title, entries) {
  if (!entries?.length) return '';
  const body = entries.map((p) => `<tr><th>${escapeHtml(p.name)}</th><td>${escapeHtml(normalizeBreed(p.breed) || '')}</td></tr>`).join('');
  return `<p class="small muted" style="margin-bottom:0.1rem;">${escapeHtml(title)}</p><table class="detail-table">${body}</table>`;
}

// "pedigree" ist entweder das alte, flache Array (bereits gespeicherte
// Pferde vor dieser Änderung, Selbst-Eintrag an Position 0) oder das
// Format { ancestors, sections }. Der Parser liefert "sections" nicht mehr
// (Handy- und Desktop-Kopien werden identisch als reine Reihenfolge in
// "ancestors" gespeichert) - das Feld bleibt hier nur zur Anzeige bereits
// vor dieser Änderung gespeicherter Datensätze erhalten, bei denen es noch
// gefüllt ist.
function pedigreeHtml(pedigree) {
  const isLegacyArray = Array.isArray(pedigree);
  const ancestors = isLegacyArray ? pedigree.slice(1) : (pedigree.ancestors || []);
  const sections = isLegacyArray ? null : pedigree.sections;

  let body;
  let note;
  if (sections) {
    body = PEDIGREE_SECTION_ORDER.map((label) => pedigreeGroupTableHtml(label, sections[label])).join('');
    note = 'Einteilung anhand der im Text enthaltenen Abschnittsüberschriften (mobile Ansicht).';
  } else {
    const parents = ancestors.slice(0, 2);
    const grandparents = ancestors.slice(2, 6);
    const greatGrandparents = ancestors.slice(6, 14);
    const rest = ancestors.slice(14);
    body = pedigreeGroupTableHtml('Eltern', parents)
      + pedigreeGroupTableHtml('Großeltern', grandparents)
      + pedigreeGroupTableHtml('Urgroßeltern', greatGrandparents)
      + pedigreeGroupTableHtml('Weitere Vorfahren', rest);
    note = 'Einteilung anhand der Reihenfolge im kopierten Text – keine Garantie bei künftigen Layout-Änderungen im Spiel.';
  }

  return `<div class="group-heading">Stammbaum</div><p class="small muted">${escapeHtml(note)}</p>${body}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
