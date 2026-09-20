const TEXT_FIELDS = [
  'name', 'external_id', 'gender', 'breed', 'breed_composition', 'coat_color', 'owner', 'hlp_slp', 'notes', 'image_url',
];
const DATE_FIELDS = ['birthdate'];
const NUMBER_FIELDS = ['purebred_pct', 'ico'];
const BOOLEAN_FIELDS = ['disease_free', 'breeding_allowed'];
const JSONB_KEYS = [
  'genetic_diseases', 'colors', 'exterior_genetics', 'exterior_descriptive',
  'temperament', 'disciplines', 'traits', 'tournament_potential', 'pedigree',
  'color_gene_overrides', 'disease_gene_overrides', 'tags',
];

let extraData = {};
let editingId = null;
// Unveränderte Kopie des beim Laden vorgefundenen Datensatzes (siehe
// loadHorse) - anders als extraData (wird bei jedem erneuten "Automatisch
// auslesen" überschrieben) bleibt das der feste Vergleichspunkt für
// computeChangedFields beim Speichern (siehe performSave).
let originalRecord = null;
// Benutzername (vor dem @) des eingeloggten Kontos - wird fuer die
// Pfeil-Navigation (findAdjacentHorseId) gebraucht, damit dort nur durch
// die eigenen Pferde geblaettert wird. Eigener Name (nicht "currentIdentity")
// noetig, weil horseForm.js und verpaarung.js beide als eigene <script>-Tags
// auf verpaarung.html geladen werden und sich denselben globalen Scope
// teilen - eine gleichnamige "let"-Variable in beiden Dateien wuerde einen
// SyntaxError ausloesen, der das komplette zweite Skript (verpaarung.js)
// stumm lahmlegt (siehe Commit-Historie).
let formIdentity = null;
// Die in dieser Sitzung per "Speichern & nächstes Pferd" bereits
// erfassten Pferde (siehe onSaveAndNew/resetFormForNextEntry) - je
// {id, name, updated} ("updated" = Nachtrag zu einem bereits bestehenden
// Pferd statt echter Neuanlage, siehe targetId in performSave). Rein zur
// Anzeige (renderBulkSessionCard) und für den Übersicht-Banner beim
// Abschluss der Sitzung, nicht selbst gespeichert.
let bulkSessionEntries = [];

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

// Erlaubt, ein Bild direkt aus der Zwischenablage einzufügen (Screenshot
// oder per Rechtsklick "Bild kopieren" aus dem Browser) statt nur eine
// externe Bild-URL einzutippen - wird in den Supabase-Storage-Bucket
// "horse-images" hochgeladen (siehe migration_019_horse_images_storage.sql),
// die resultierende öffentliche URL landet im Feld. Eine echte http(s)-URL
// (statt z.B. einer data:-URL) wird u.a. für die Bild-Einbettung im
// Discord-Bot gebraucht (embed.setImage() kann keine data:-URLs laden).
// Enthält die Zwischenablage kein Bild (normaler Text/Link), passiert hier
// nichts, der normale Text-Paste läuft unverändert weiter.
// IMAGE_EXTENSION_BY_MIME_TYPE/compressImageFile() stehen jetzt in
// parser.js (dort auch von der nachtraeglichen Bestandsbild-Komprimierung
// in verwaltung.html genutzt).

document.getElementById('image_url')?.addEventListener('paste', async (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  const file = item.getAsFile();
  if (!file) return;

  const input = e.target;
  const previousValue = input.value;
  input.value = 'Bild wird hochgeladen…';
  input.disabled = true;

  const uploadFile = await compressImageFile(file);
  const ext = IMAGE_EXTENSION_BY_MIME_TYPE[uploadFile.type] || 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  // cacheControl auf 1 Jahr (Egress): der Dateiname enthält bereits einen
  // Zeitstempel + Zufallsanteil und wird nie wiederverwendet/überschrieben
  // - ein langes, unveränderliches Cache-Control ist hier also gefahrlos
  // möglich und verhindert, dass Browser/CDN dasselbe Bild nach Supabase'
  // sonst recht kurzem Standard (1 Stunde) immer wieder neu abrufen.
  const { error } = await supabaseClient.storage.from('horse-images').upload(path, uploadFile, {
    contentType: uploadFile.type,
    cacheControl: '31536000',
  });

  input.disabled = false;
  if (error) {
    input.value = previousValue;
    alert('Bild-Upload fehlgeschlagen: ' + error.message);
    return;
  }
  input.value = supabaseClient.storage.from('horse-images').getPublicUrl(path).data.publicUrl;
});

// Kopiert man die komplette Pferdeseite aus dem Spiel (z.B. per Ctrl+A,
// Ctrl+C auf der Seite selbst statt nur eines Textabschnitts), legt der
// Browser neben dem reinen Text auch eine HTML-Fassung der Auswahl in die
// Zwischenablage (clipboardData "text/html") - darin sind auch die Bilder
// enthalten, u.a. das eigentliche Pferdebild (im Spiel-HTML eindeutig als
// "id=pferdebild" markiert, nicht zu verwechseln mit Wetter-Icons, Logo
// oder der Mützen-Überlagerung "id=muetze"). Der normale Text-Paste in
// #raw-text läuft unverändert weiter (kein preventDefault) - hier wird nur
// zusätzlich die Bild-URL herausgelesen und automatisch in Bild-URL
// eingetragen, als Link (kein Hochladen/Zwischenspeichern der Bilddaten
// selbst - anders als beim direkten Bild-Paste in #image_url oben, wo nur
// die reinen Bilddaten ohne URL in der Zwischenablage liegen). Der
// Dateiname des Bilds beginnt dabei mit der Spiel-ID des Pferds (z.B.
// "864841_002.png") - wird deshalb hier gleich mit als ID übernommen,
// spart bei komplett kopierten Seiten das manuelle Eintippen der ID.
document.getElementById('raw-text')?.addEventListener('paste', (e) => {
  const html = e.clipboardData?.getData('text/html');
  if (!html) return;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const img = doc.getElementById('pferdebild');
  if (!img?.src) return;
  // img.src ist bereits vom DOMParser gegen die Basis-URL des Dokuments
  // aufgelöst - ohne <base>-Tag im Fragment bleibt ein rein relativer Pfad
  // aus dem Spiel-HTML aber unaufgelöst, deshalb hier zusätzlich explizit
  // gegen die Spiel-Domain auflösen (wie schon bei den Spiel-Links in
  // horseView.js/list.js).
  const rawSrc = img.getAttribute('src');
  const resolved = new URL(rawSrc, 'https://www.morning-dust-ranch.de/').href;
  document.getElementById('image_url').value = resolved;

  // Der Dateiname selbst (letzter Pfadabschnitt, z.B. "864841_002.png")
  // beginnt mit der Spiel-ID - alles danach (Bild-Variante, beim lokalen
  // Speichern vom Browser angehängtes Suffix, Dateiendung) ist dafür
  // unerheblich, es zählen nur die führenden Ziffern.
  const filename = rawSrc.split(/[/\\]/).pop() || '';
  const idMatch = filename.match(/^(\d+)/);
  if (idMatch) document.getElementById('external_id').value = idMatch[1];
});

// Automatisches Auslesen direkt beim Einfügen (Strg+V) in #raw-text, statt
// erst nach Klick auf "Automatisch auslesen" - der Button bleibt trotzdem
// nutzbar (z.B. nach manuellen Korrekturen im Text oder erneutem Auslesen).
// setTimeout(0), weil der eingefügte Text im "paste"-Event selbst noch
// nicht im Feld steht (der Browser fügt ihn erst direkt danach ein) -
// onParse() liest also sonst noch den alten (leeren) Wert.
document.getElementById('raw-text')?.addEventListener('paste', () => {
  setTimeout(onParse, 0);
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
  await renderSharedNav(session);
  formIdentity = session.user.email.split('@')[0];

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  document.getElementById('parse-btn').addEventListener('click', onParse);
  document.getElementById('horse-form').addEventListener('submit', onSave);
  document.getElementById('delete-btn').addEventListener('click', onDelete);
  document.getElementById('purebred_pct').addEventListener('input', updateBreedCompositionVisibility);
  updateBreedCompositionVisibility();
  wireSaveWarningModal();
  wireDuplicateCheckModal();
  wireTabs();
  renderTagCheckboxes();

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
  } else {
    // "Massenerfassung": nur bei einer echten Neuanlage sinnvoll (beim
    // Bearbeiten eines bestehenden Pferds gibt es ja nur genau eines).
    document.getElementById('save-and-new-btn').hidden = false;
    document.getElementById('save-and-new-btn').addEventListener('click', onSaveAndNew);
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
  originalRecord = data;
  fillTagCheckboxes(data.tags);
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
  extraData = await mergeParsedIntoExisting(extraData, parsed);
  await renderDetailTables(extraData);
  statusEl.textContent = 'Erkannt: ' + (parsed.name || 'kein Name gefunden') + ' — bitte Felder unten prüfen, bevor du speicherst.';
}

// Wird beim Bearbeiten eines bereits gespeicherten Pferds erneut "Text
// von der Pferdeseite einfügen" benutzt (z.B. weil inzwischen ein
// Farbgen-Test durchgeführt wurde und jetzt ein sicheres Ergebnis
// vorliegt), soll das nur ERGÄNZEN: tatsächlich neu erkannte Werte
// überschreiben die alten, liefert der aktuelle Text für ein Feld aber
// nichts (z.B. weil diesmal eine kürzere Kopie eingefügt wurde), bleibt
// der bisherige Wert erhalten statt geleert zu werden - siehe
// isEmptyValue. Bei einem neuen Pferd (extraData vorher leer) hat das
// keine Wirkung.
async function mergeParsedIntoExisting(oldData, parsed) {
  const merged = { ...oldData, ...parsed };
  for (const key of JSONB_KEYS) {
    merged[key] = await mergeFieldValue(key, oldData[key], parsed[key]);
  }
  return merged;
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
  updateImagePreview();
}

// Zeigt das Pferdebild (Bild-URL-Feld) direkt an statt nur den reinen
// Link - sowohl bei horse.html (kleine Vorschau neben dem Feld) als auch
// bei view.html (grosse Anzeige, siehe .view-mode .image-preview in
// style.css). Wird bei jedem fillForm() (Laden/Auslesen) aufgerufen sowie
// live beim manuellen Tippen/Einfuegen der URL.
function updateImagePreview() {
  const img = document.getElementById('image-preview');
  if (!img) return;
  const url = document.getElementById('image_url')?.value.trim();
  if (url) {
    img.src = url;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
  }
}
document.getElementById('image_url')?.addEventListener('input', updateImagePreview);

// Baut die Checkbox-Liste der Schlagwörter einmalig aus HORSE_TAG_OPTIONS
// auf (siehe parser.js) - je Zeile Checkbox + Farbpunkt + optionales
// Zusatztext-Feld. Änderungen aktualisieren extraData.tags direkt (wie
// die Gen-Bestätigungs-Buttons weiter oben), da JSONB_KEYS-Werte beim
// Speichern aus extraData statt aus eigenen Formularfeldern gelesen
// werden (siehe runSaveFlow).
function renderTagCheckboxes() {
  const container = document.getElementById('tag-checkboxes');
  if (!container) return;
  container.innerHTML = HORSE_TAG_OPTIONS.map(({ label, color }) => `
    <label class="tag-checkbox-row">
      <input type="checkbox" data-tag-checkbox="${escapeHtml(label)}" />
      <span class="tag-dot" style="background:${color}"></span>
      <span class="tag-checkbox-label">${escapeHtml(label)}</span>
      <input type="text" class="tag-note-input" data-tag-note="${escapeHtml(label)}" placeholder="Zusatz (optional)" disabled />
    </label>
  `).join('');
  container.addEventListener('change', (e) => {
    if (e.target.matches('[data-tag-checkbox]')) {
      const noteInput = container.querySelector(`[data-tag-note="${CSS.escape(e.target.dataset.tagCheckbox)}"]`);
      noteInput.disabled = !e.target.checked;
      if (!e.target.checked) noteInput.value = '';
    }
    syncTagsFromCheckboxes();
  });
  container.addEventListener('input', (e) => {
    if (e.target.matches('[data-tag-note]')) syncTagsFromCheckboxes();
  });
}

function fillTagCheckboxes(tags) {
  const container = document.getElementById('tag-checkboxes');
  if (!container) return;
  const byLabel = new Map((tags || []).map((t) => [t.label, t.note || '']));
  container.querySelectorAll('[data-tag-checkbox]').forEach((cb) => {
    const has = byLabel.has(cb.dataset.tagCheckbox);
    cb.checked = has;
    const noteInput = container.querySelector(`[data-tag-note="${CSS.escape(cb.dataset.tagCheckbox)}"]`);
    noteInput.disabled = !has;
    noteInput.value = has ? byLabel.get(cb.dataset.tagCheckbox) : '';
  });
}

function syncTagsFromCheckboxes() {
  const container = document.getElementById('tag-checkboxes');
  if (!container) return;
  const tags = [...container.querySelectorAll('[data-tag-checkbox]:checked')].map((cb) => {
    const noteInput = container.querySelector(`[data-tag-note="${CSS.escape(cb.dataset.tagCheckbox)}"]`);
    const note = noteInput.value.trim();
    return note ? { label: cb.dataset.tagCheckbox, note } : { label: cb.dataset.tagCheckbox };
  });
  extraData.tags = tags;
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

// Extrahiert die reine numerische Spiel-ID aus einem kompletten Link wie
// "https://www.morning-dust-ranch.de/index2.php?site=pferd&id=622070" ->
// "622070". Enthält der Wert kein "id="-Muster (z.B. weil ohnehin schon
// nur die reine ID eingetragen wurde), bleibt er unverändert.
function normalizeExternalId(value) {
  const m = value.match(/[?&]id=(\d+)/);
  return m ? m[1] : value;
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
  // Erlaubt, statt der reinen Spiel-ID auch den kompletten Link zur
  // Pferdeseite einzufügen (z.B. aus der Browser-Adresszeile kopiert) -
  // wird auf die reine ID reduziert, da an anderer Stelle (list.js,
  // horseView.js, Discord-Bot) aus der gespeicherten ID der Link selbst
  // neu gebaut wird.
  if (out.external_id) out.external_id = normalizeExternalId(out.external_id);
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
  'Geburtsdatum': 'Das Geburtsdatum konnte nicht erkannt werden.',
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
// stattdessen direkt zum naechsten/vorherigen Pferd. null (siehe
// onSaveAndNew) heisst "gar nicht weiterleiten, Formular fuer die
// naechste Neuanlage zuruecksetzen" (Massenerfassung).
let saveRedirect = 'index.html';

async function onSave(e) {
  e.preventDefault();
  saveRedirect = 'index.html';
  await runSaveFlow();
}

// "Massenerfassung": speichert das aktuelle (neue) Pferd wie ein
// normaler Save, leitet danach aber nicht weiter, sondern setzt das
// Formular fuer die naechste Neuanlage zurueck (siehe
// resetFormForNextEntry in performSave) - so laesst sich eine ganze
// Reihe neuer Pferde ohne Umweg ueber die Uebersicht nacheinander
// eintragen.
async function onSaveAndNew(e) {
  e.preventDefault();
  saveRedirect = null;
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

  // Muss VOR der Vollständigkeits-Prüfung laufen (siehe unten): ist das
  // hier eigentlich nur ein Nachtrag zu einem bereits bestehenden Pferd
  // (Name-/ID-Treffer, siehe resolveSaveTarget), sollen bereits bekannte
  // Werte des bestehenden Datensatzes mitzählen - sonst würde z.B. „Die
  // Turnierwerte fehlen“ auch dann noch angezeigt, wenn sie im
  // bestehenden Datensatz längst erfasst sind und im diesmal
  // eingefügten (kürzeren) Text nur nicht nochmal enthalten waren.
  const resolved = await resolveSaveTarget(formData, payload);
  if (!resolved) return;
  const { targetId, payload: mergedPayload, beforeRecord } = resolved;

  // Turnierwerte + LP-Prognose (js/tournamentScoring.js) werden bewusst
  // HIER, einmalig beim Speichern, berechnet und mit abgelegt statt bei
  // jedem Ansehen des Profils neu (siehe computedTournamentValuesHtml/
  // lpResultHtml in renderDetailTables) - ändert sich nicht mehr, bis das
  // Pferd das nächste Mal gespeichert wird.
  mergedPayload.computed_tournament_values = computeTournamentValues(mergedPayload);
  mergedPayload.computed_lp_result = checkLP(mergedPayload);

  const warnings = missingDataWarnings(mergedPayload);
  if (warnings.length) {
    pendingSave = { formData, payload: mergedPayload, session, targetId, beforeRecord };
    const list = document.getElementById('save-warning-list');
    list.innerHTML = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
    document.getElementById('save-warning-modal').hidden = false;
    return;
  }

  await performSave(formData, mergedPayload, session, targetId, beforeRecord);
}

function wireSaveWarningModal() {
  document.getElementById('save-warning-cancel').addEventListener('click', () => {
    document.getElementById('save-warning-modal').hidden = true;
    pendingSave = null;
  });
  document.getElementById('save-warning-confirm').addEventListener('click', async () => {
    document.getElementById('save-warning-modal').hidden = true;
    if (!pendingSave) return;
    const { formData, payload, session, targetId, beforeRecord } = pendingSave;
    pendingSave = null;
    await performSave(formData, payload, session, targetId, beforeRecord);
  });
}

// Ob ein Feldwert als "nichts eingetragen" gilt - Arrays/Objekte, die
// parseHorseText auch bei fehlendem Abschnitt im Text immer zurückgibt
// (z.B. leeres colors-Array statt undefined), zählen hier genauso als
// leer wie null selbst (collectForm wandelt bereits '' in null um).
function isEmptyValue(key, value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (key === 'pedigree') return !hasPedigreeData(value);
  if (key === 'exterior_genetics') return !value.rows || value.rows.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// Führt einen einzelnen Feldwert beim Aktualisieren zusammen (siehe
// mergeParsedIntoExisting und performSave). "disciplines"/"traits" sind
// nach Kategorie gruppiert (z.B. "Barock", "Western") - zeigt das Spiel
// ohne aufgeklapptes "Alle Disziplinen anzeigen?" nur eine einzelne
// Kategorie, würden die übrigen sonst als "neuer, vollständiger Wert"
// gelten und verschwinden. "tournament_potential" hat dasselbe Problem
// mit seinen einzelnen benannten Werten (Gesamtpotenzial/Begabung/...):
// enthält ein erneut eingefügter Text z.B. nur Gesamtpotenzial, aber
// nicht Begabung, würde Begabung sonst durch das komplette Überschreiben
// verschwinden - obwohl es im Datensatz bereits bekannt war (siehe
// missingDataLabels/showSaveWarningModal, die genau das dann fälschlich
// wieder als "fehlt" anmahnen würden). Deshalb hier bei allen dreien
// feldweise zusammenführen statt alles-oder-nichts: neue Werte ergänzen/
// überschreiben, im neuen Text fehlende Werte bleiben aus dem alten Wert
// erhalten. Für alle anderen Felder gilt weiterhin: neuer Wert leer und
// alter nicht -> alten Wert behalten, sonst neuen Wert übernehmen.
async function mergeFieldValue(key, oldValue, newValue) {
  if (newValue === undefined) return oldValue;
  if (key === 'disciplines' || key === 'traits' || key === 'tournament_potential') {
    return { ...(oldValue || {}), ...(newValue || {}) };
  }
  // "tags": ähnliches Problem, nur als Array statt Objekt - wird das
  // Formular als vermeintlich neues Pferd ausgefüllt und dabei (ohne die
  // bereits vorhandenen Schlagwörter zu sehen, siehe fillTagCheckboxes/
  // loadHorse) z.B. nur "Verkauf" angehakt, würde ein alles-oder-nichts-
  // Ersetzen alle anderen, bereits vorhandenen Schlagwörter des
  // gefundenen Datensatzes stillschweigend löschen. Statt das automatisch
  // zu entscheiden, wird beim Speichern nachgefragt (siehe
  // decideTagsMerge) - aber nur, wenn es dabei wirklich etwas zu
  // entscheiden gibt.
  if (key === 'tags') return await decideTagsMerge(oldValue, newValue);
  // "pedigree": zeigt das Spiel den Stammbaum-Abschnitt nicht vollständig
  // aufgeklappt (z.B. nur Eltern statt aller 3 Generationen), liefert ein
  // erneut eingefügter Text zwar NICHT leer, aber weniger Vorfahren als
  // bereits gespeichert - ein reines "neu ist nicht leer -> übernehmen"
  // würde den bereits vollständigen Stammbaum dann durch einen
  // unvollständigeren ersetzen. Deshalb hier zusätzlich die Anzahl der
  // Vorfahren vergleichen statt nur auf leer/nicht-leer zu prüfen.
  if (key === 'pedigree' && pedigreeAncestorCount(newValue) < pedigreeAncestorCount(oldValue)) return oldValue;
  if (isEmptyValue(key, newValue) && !isEmptyValue(key, oldValue)) return oldValue;
  return newValue;
}

function mergeTagsUnion(oldTags, newTags) {
  const merged = new Map((oldTags || []).map((t) => [t.label, t]));
  for (const t of (newTags || [])) merged.set(t.label, t);
  return [...merged.values()];
}

// Wird nur in den beiden Dopplungs-Merge-Zweigen von performSave gebraucht
// (Namensgleichheit / Dopplungs-Check-Bestätigung) - dort wurde das
// Formular als vermeintlich neues Pferd ausgefüllt, checkt der Nutzer
// dabei ein Schlagwort an, weiß er nichts von eventuell bereits
// vorhandenen Schlagwörtern des gefundenen Datensatzes (die
// Checkbox-Liste wurde nie mit dessen Werten befüllt, siehe
// fillTagCheckboxes/loadHorse). Nur wenn der bestehende Datensatz
// Schlagwörter hat, die im neuen Formular NICHT angehakt sind, gibt es
// überhaupt etwas zu entscheiden - sonst einfach zusammenführen, ohne zu
// fragen.
async function decideTagsMerge(oldTags, newTags) {
  const old = oldTags || [];
  const fresh = newTags || [];
  const freshLabels = new Set(fresh.map((t) => t.label));
  const extraOld = old.filter((t) => !freshLabels.has(t.label));
  if (!extraOld.length) return mergeTagsUnion(old, fresh);
  const keepBoth = await showConfirmModal(
    'Schlagwörter zusammenführen',
    `Das gefundene Pferd hat bereits folgende Schlagwörter: ${extraOld.map((t) => t.label).join(', ')}.\n\n` +
    `OK = behalten und mit den neu angehakten zusammenführen.\n` +
    `Abbrechen = entfernen, nur die im Formular angehakten Schlagwörter übernehmen.`,
    'OK'
  );
  return keepBoth ? mergeTagsUnion(old, fresh) : fresh;
}

// Deutsche Kurz-Labels für den Änderungs-Hinweis im Flash-Banner (siehe
// computeChangedFields/performSave sowie showFlashBanner in list.js) -
// bewusst dieselben Bezeichnungen wie im Formular/der Übersicht (z.B.
// "ZZL" statt "breeding_allowed", passend zur Tabellenspalte in list.js).
const CHANGE_FIELD_LABELS = {
  name: 'Name',
  external_id: 'ID',
  gender: 'Geschlecht',
  breed: 'Rasse',
  breed_composition: 'Rasseanteile',
  coat_color: 'Fellfarbe',
  owner: 'Besitzer',
  hlp_slp: 'HLP/SLP',
  notes: 'Notizen',
  image_url: 'Bild',
  purebred_pct: 'Reinrassigkeit',
  ico: 'ICO',
  disease_free: 'Erbkrankheitsfrei',
  breeding_allowed: 'ZZL',
  genetic_diseases: 'Erbkrankheiten (Diagnosen)',
  colors: 'Farbgenetik',
  exterior_genetics: 'Exterieur-Genetik',
  exterior_descriptive: 'Körperbau',
  temperament: 'Interieur',
  disciplines: 'Disziplinen',
  traits: 'Eigenschaften',
  tournament_potential: 'Turnierwerte',
  pedigree: 'Stammbaum',
  tags: 'Schlagwörter',
};

// Strukturell-rekursiver Vergleich für JSONB-Werte: Objekt-Schlüssel
// werden UNABHÄNGIG von ihrer Reihenfolge verglichen (ein Objekt wie
// {Western: [...], Barock: [...]} bedeutet dasselbe, unabhängig davon, in
// welcher Reihenfolge die Kategorien eingetragen wurden - Postgres/JSONB
// garantiert diese Reihenfolge ohnehin nicht über mehrere Updates hinweg
// stabil), Array-Einträge dagegen IN Reihenfolge (dort ist die Position
// echte Information, z.B. beim Stammbaum: Position = welcher Vorfahre).
// Ersetzt einen früheren, reinen "JSON.stringify(a) !== JSON.stringify(b)"-
// Vergleich, der bei identischem Inhalt in anderer Schlüssel-Reihenfolge
// (z.B. weil ein erneut eingefügter Kopiertext dieselben Werte einfach in
// anderer Reihenfolge zusammenstellt) fälschlich "geändert" meldete, obwohl
// nur derselbe Stand erneut erfasst wurde.
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length
    && aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

// Ob sich ein einzelner Feldwert gegenüber dem vorherigen Datensatz
// tatsächlich geändert hat - bei JSONB-Feldern (Objekte/Arrays) über
// isEmptyValue normalisiert, damit z.B. "{}" und "null" nicht fälschlich
// als Änderung gelten, sonst über einen simplen Wertevergleich (leere
// Strings zählen wie null, siehe collectForm).
function isFieldChanged(key, beforeValue, afterValue) {
  const beforeIsObject = beforeValue !== null && typeof beforeValue === 'object';
  const afterIsObject = afterValue !== null && typeof afterValue === 'object';
  if (beforeIsObject || afterIsObject) {
    if (isEmptyValue(key, beforeValue) && isEmptyValue(key, afterValue)) return false;
    return !deepEqual(beforeValue, afterValue);
  }
  const before = beforeValue == null || beforeValue === '' ? null : beforeValue;
  const after = afterValue == null || afterValue === '' ? null : afterValue;
  return before !== after;
}

// Liefert die deutschen Labels aller Felder, die sich zwischen dem vorher
// geladenen Datensatz und dem zu speichernden Payload geändert haben -
// wird im Flash-Banner der Übersicht angezeigt (siehe performSave/
// showFlashBanner), damit beim Aktualisieren sofort ersichtlich ist, was
// sich geändert hat, ohne den alten Stand extra vergleichen zu müssen.
function computeChangedFields(before, after) {
  if (!before) return [];
  const changed = [];
  for (const [key, label] of Object.entries(CHANGE_FIELD_LABELS)) {
    if (isFieldChanged(key, before[key], after[key])) changed.push(label);
  }
  return changed;
}

// GP/Ext/Ext%/Int aus einem Pferde-Datensatz (Payload oder bestehender
// DB-Zeile) berechnen - wie list.js/computeDerived, hier nur die vier für
// den Dopplungs-Check gebrauchten Werte statt aller abgeleiteten Felder.
function quickStatsOf(data) {
  const gpRaw = data.tournament_potential?.['Gesamtpotenzial'];
  return {
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : null,
    ext: averageScore(data.exterior_descriptive, scoreExteriorTerm),
    extPercent: data.exterior_genetics?.overall?.percent ?? null,
    int: averageScore(data.temperament, scoreTemperamentTerm),
  };
}

// Gilt nur als Übereinstimmung, wenn alle vier Werte auf beiden Seiten
// tatsächlich vorhanden UND exakt gleich sind - sonst würden z.B. zwei
// verschiedene, noch komplett ungetestete Fohlen (überall null) fälschlich
// als Dopplung gelten.
function statsMatch(a, b) {
  return ['gp', 'ext', 'extPercent', 'int'].every((k) => a[k] != null && a[k] === b[k]);
}

let duplicateCheckResolve = null;
function wireDuplicateCheckModal() {
  document.getElementById('duplicate-check-cancel').addEventListener('click', () => {
    document.getElementById('duplicate-check-modal').hidden = true;
    duplicateCheckResolve?.(false);
  });
  document.getElementById('duplicate-check-confirm').addEventListener('click', () => {
    document.getElementById('duplicate-check-modal').hidden = true;
    duplicateCheckResolve?.(true);
  });
}

// Zeigt die Ja/Nein-Nachfrage samt Gegenüberstellung Name/Besitzer/ID/
// GP/Ext/Ext%/Int von neuem und bereits vorhandenem Datensatz - liefert
// true (dasselbe Pferd -> bestehenden Datensatz ergänzen) oder false
// (anderes Pferd -> normal neu anlegen).
function askIsDuplicateHorse(reasonParts, neu, alt) {
  document.getElementById('duplicate-check-reason').textContent =
    `Übereinstimmung: ${reasonParts.join(', ')}.`;
  const rows = [
    ['Name', neu.name, alt.name],
    ['Besitzer', neu.owner, alt.owner],
    ['ID', neu.external_id, alt.external_id],
    ['GP', neu.gp, alt.gp],
    ['Ext', neu.ext != null ? neu.ext.toFixed(2) : null, alt.ext != null ? alt.ext.toFixed(2) : null],
    ['Ext%', neu.extPercent != null ? neu.extPercent + '%' : null, alt.extPercent != null ? alt.extPercent + '%' : null],
    ['Int', neu.int != null ? neu.int.toFixed(2) : null, alt.int != null ? alt.int.toFixed(2) : null],
  ];
  document.getElementById('duplicate-check-body').innerHTML = rows.map(([label, a, b]) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(a ?? '-')}</td><td>${escapeHtml(b ?? '-')}</td></tr>`
  ).join('');
  document.getElementById('duplicate-check-modal').hidden = false;
  return new Promise((resolve) => { duplicateCheckResolve = resolve; });
}

// --- Automatische Flaxen-Trägerschaft bei den Eltern (Nutzerwunsch) ---
//
// Ist das gerade gespeicherte Pferd sichtbar Flaxen (reinerbig, "hom" -
// zeigt sich als "flfl"), MÜSSEN beide Eltern zwingend mindestens eine
// Kopie tragen (rezessives Merkmal) - wird hier automatisch als
// Trägerschaft ("het", zeigt sich als "fl") bei den Eltern-Datensätzen
// nachgetragen, falls dort noch nichts (Stärkeres) manuell eingetragen
// ist. Ausgelöst durch BEIDES: automatische Text-Erkennung ("Flaxen" in
// Fellfarbe/Notiz/Name) UND manuelle Bestätigung ("2x vorhanden") - beides
// läuft über dieselbe presentGenesSummary()-Ableitung, die für die
// Anzeige ohnehin schon passiert.
//
// Ein bereits vorhandenes "absent" (bewusst als "nicht vorhanden"
// bestätigt) wird NICHT automatisch überschrieben, da das ein echter
// Widerspruch wäre (kann eigentlich nicht vorkommen) - wird stattdessen
// als Warnung zurückgegeben, die Person muss das manuell auflösen.
async function autoUpdateParentFlaxenCarriers(payload) {
  const genes = presentGenesSummary(
    payload.colors, payload.coat_color, payload.notes, payload.name, null, payload.color_gene_overrides,
  );
  const isVisiblyFlaxen = genes.some((g) => g.locus === 'Flaxen' && g.alleles === 'flfl');
  if (!isVisiblyFlaxen) return { updated: [], warnings: [] };

  const ancestors = Array.isArray(payload.pedigree) ? payload.pedigree.slice(1) : (payload.pedigree?.ancestors || []);
  const parentNames = [ancestors[0]?.name, ancestors[1]?.name].filter(Boolean);
  if (!parentNames.length) return { updated: [], warnings: [] };

  const { data: parents, error } = await supabaseClient
    .from('horses')
    .select('id, name, color_gene_overrides')
    .in('name', parentNames);
  if (error || !parents?.length) return { updated: [], warnings: [] };

  const updated = [];
  const warnings = [];
  for (const parent of parents) {
    const overrides = parent.color_gene_overrides || {};
    const current = overrides.Flaxen;
    if (current === 'het' || current === 'hom') continue; // schon (mind.) Träger bestätigt
    if (current === 'absent') {
      warnings.push(parent.name);
      continue;
    }
    const { error: updateError } = await supabaseClient
      .from('horses')
      .update({ color_gene_overrides: { ...overrides, Flaxen: 'het' } })
      .eq('id', parent.id);
    if (!updateError) updated.push(parent.name);
  }
  return { updated, warnings };
}

// --- Automatische Flaxen-Trägerschaft beim Fohlen selbst (Nutzerwunsch) -
//
// Gegenstück zu autoUpdateParentFlaxenCarriers oben: ist mindestens ein
// Elternteil sichtbar Flaxen (reinerbig, "flfl"), MUSS dieses Pferd selbst
// zwingend mindestens eine Kopie tragen (rezessives Merkmal) - wird hier
// VOR dem eigentlichen Speichern direkt am payload dieses Pferds
// nachgetragen, falls dort noch nichts (Stärkeres) manuell eingetragen
// ist. Die Anzeige (Genetik-Tab, Übersicht) leitet das bereits live aus
// den Eltern-Daten ab (siehe fetchParentColorHints/parentColorHints) -
// hier wird es zusätzlich EXPLIZIT am Datensatz hinterlegt, analog zur
// umgekehrten Richtung bei den Eltern, damit es z.B. auch im CSV-Export
// oder bei zukünftigen Auswertungen ohne die Eltern-Herleitung sichtbar
// bleibt.
async function autoInheritFlaxenFromParents(payload) {
  const current = payload.color_gene_overrides?.Flaxen;
  if (current === 'het' || current === 'hom') return null; // schon (mind.) Träger bestätigt

  const ancestors = Array.isArray(payload.pedigree) ? payload.pedigree.slice(1) : (payload.pedigree?.ancestors || []);
  const parentNames = [ancestors[0]?.name, ancestors[1]?.name].filter(Boolean);
  if (!parentNames.length) return null;

  const { data: parents, error } = await supabaseClient
    .from('horses')
    .select('name, colors, coat_color, notes, color_gene_overrides')
    .in('name', parentNames);
  if (error || !parents?.length) return null;

  const flaxenParent = parents.find((p) => {
    const genes = presentGenesSummary(p.colors, p.coat_color, p.notes, p.name, null, p.color_gene_overrides);
    return genes.some((g) => g.locus === 'Flaxen' && g.alleles === 'flfl');
  });
  if (!flaxenParent) return null;

  if (current === 'absent') return { warning: flaxenParent.name };

  payload.color_gene_overrides = { ...(payload.color_gene_overrides || {}), Flaxen: 'het' };
  return { updated: flaxenParent.name };
}

// Führt "payload" (das frisch ausgefüllte/geparste Formular) mit einem
// gefundenen bestehenden Datensatz zusammen - für Felder, die in payload
// bereits stehen, per mergeFieldValue (leer im neuen Formular -> alten
// Wert behalten). Die strukturierten JSONB-Felder (Turnierwerte,
// Stammbaum, Farbgenetik, ...) stehen bei einer vermeintlichen Neuanlage
// OHNE eigenes "Automatisch auslesen" aber gar nicht erst in payload
// (siehe runSaveFlow: nur was in extraData steht, landet dort) - ohne
// dieses Nachtragen würden sie beim UPDATE schlicht nicht angefasst
// (bleiben also ohnehin unverändert bestehen), ABER missingDataWarnings
// direkt danach würde sie fälschlich als "fehlt" melden, weil es sie in
// payload gar nicht sieht. Deshalb hier zusätzlich aus dem bestehenden
// Datensatz nachtragen, wenn sie in payload fehlen.
async function mergePayloadFromExisting(payload, existing) {
  for (const key of Object.keys(payload)) {
    payload[key] = await mergeFieldValue(key, existing[key], payload[key]);
  }
  for (const key of JSONB_KEYS) {
    if (!(key in payload)) payload[key] = existing[key];
  }
}

// Ermittelt, ob dieser Speichervorgang ein neuer Datensatz wird oder
// (still oder nach Rückfrage) ein bestehender Datensatz ergänzt wird -
// inklusive dem eigentlichen Zusammenführen der Feldwerte (mergeFieldValue).
// Bewusst von der eigentlichen DB-Schreiboperation (performSave)
// getrennt: muss VOR der Vollständigkeits-Prüfung in runSaveFlow laufen,
// damit diese den bereits gemergten (statt nur den frisch eingefügten)
// Stand prüft - sonst würde ein bloßer Nachtrag zu einem bereits
// vollständigen Pferd fälschlich als "unvollständig" gemeldet, nur weil
// diesmal ein kürzerer Text eingefügt wurde. Gibt bei einem Lookup-Fehler
// null zurück (Fehlermeldung ist dann bereits in #form-error gesetzt).
async function resolveSaveTarget(formData, payload) {
  const errorEl = document.getElementById('form-error');

  // Vergleichsgrundlage für computeChangedFields (Flash-Banner nach dem
  // Speichern) - beim regulären Bearbeiten der beim Laden vorgefundene
  // Datensatz, in den beiden anderen Fällen (Namens- bzw.
  // Dopplungs-Treffer weiter unten) der dort jeweils geladene bestehende
  // Datensatz. Bleibt bei einer echten Neuanlage null.
  let beforeRecord = editingId ? originalRecord : null;

  // Wird ein neues Pferd mit einem Namen gespeichert, der bereits existiert
  // (Groß-/Kleinschreibung egal), wird statt einer neuen Dopplung einfach
  // der bestehende Datensatz aktualisiert. Beim Bearbeiten eines bereits
  // geladenen Pferds (editingId gesetzt) entfällt diese Prüfung, da es
  // sich sonst selbst als "Dopplung" erkennen würde.
  let targetId = editingId;
  if (!targetId) {
    const { data: existing, error: lookupError } = await supabaseClient
      .from('horses')
      .select('*')
      .ilike('name', formData.name)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      errorEl.textContent = 'Prüfung auf bestehenden Datensatz fehlgeschlagen: ' + lookupError.message;
      return null;
    }
    if (existing) {
      targetId = existing.id;
      beforeRecord = existing;
      // Das Formular wurde hier als vermeintlich NEUES Pferd ausgefüllt
      // (kein loadHorse() zuvor, siehe init) - Felder, die in diesem
      // Durchgang gar nicht ausgefüllt/erkannt wurden, sollen den bereits
      // vorhandenen Datensatz nur ERGÄNZEN statt ihn zu leeren. Beim
      // reguläten Bearbeiten (targetId = editingId, siehe unten) gilt das
      // bewusst NICHT: dort ist das Formular mit den alten Werten
      // vorbefüllt, ein leeres Feld dort also eine bewusste Änderung.
      await mergePayloadFromExisting(payload, existing);
    } else if (payload.external_id) {
      // Kein Namenstreffer, aber eine Spiel-ID eingetragen - die ID ist
      // eindeutig (kommt im Spiel nur einmal vor), deshalb genau wie beim
      // exakten Namenstreffer STILL aktualisieren statt erst nachzufragen
      // (z.B. wenn ein Fohlen zuerst automatisch als "Fohlen_Mutter X
      // Vater" angelegt wurde und jetzt unter seinem echten Namen erneut
      // eingetragen wird). Fehlende Felder im neuen Formular ERGÄNZEN den
      // bestehenden Datensatz dabei nur, statt ihn zu leeren.
      const { data: idMatch, error: idLookupError } = await supabaseClient
        .from('horses')
        .select('*')
        .eq('external_id', payload.external_id)
        .limit(1)
        .maybeSingle();
      if (idLookupError) {
        errorEl.textContent = 'Prüfung auf bestehenden Datensatz fehlgeschlagen: ' + idLookupError.message;
        return null;
      }
      if (idMatch) {
        targetId = idMatch.id;
        beforeRecord = idMatch;
        await mergePayloadFromExisting(payload, idMatch);
      }
    }

    if (!targetId) {
      // Weder Namens- noch ID-Treffer - trotzdem prüfen, ob es sich um
      // dasselbe Pferd unter anderem Namen UND ohne (oder mit
      // abweichender) ID handeln könnte: identische GP/Ext/Ext%/Int-Werte.
      // Anders als bei Name/ID (beides eindeutig) NICHT still
      // aktualisieren, sondern erst nachfragen (siehe askIsDuplicateHorse),
      // da rein zufällig gleiche Werte nicht ausgeschlossen sind.
      const newStats = quickStatsOf(payload);
      const { data: candidates, error: statsLookupError } = await supabaseClient
        .from('horses')
        .select('id, name, owner, external_id, tournament_potential, exterior_descriptive, exterior_genetics, temperament');
      if (statsLookupError) {
        errorEl.textContent = 'Prüfung auf bestehenden Datensatz fehlgeschlagen: ' + statsLookupError.message;
        return null;
      }
      const candidate = (candidates || []).find((h) => statsMatch(newStats, quickStatsOf(h))) || null;

      if (candidate) {
        const { data: fullCandidate } = await supabaseClient.from('horses').select('*').eq('id', candidate.id).maybeSingle();
        if (fullCandidate) {
          const isSame = await askIsDuplicateHorse(
            ['GP, Ext, Ext% und Int identisch'],
            { name: formData.name, owner: formData.owner, external_id: formData.external_id, ...newStats },
            { name: fullCandidate.name, owner: fullCandidate.owner, external_id: fullCandidate.external_id, ...quickStatsOf(fullCandidate) },
          );
          if (isSame) {
            targetId = fullCandidate.id;
            beforeRecord = fullCandidate;
            await mergePayloadFromExisting(payload, fullCandidate);
          }
        }
      }
    }
  }

  return { targetId, payload, beforeRecord };
}

async function performSave(formData, payload, session, targetId, beforeRecord) {
  const errorEl = document.getElementById('form-error');

  // Muss VOR dem eigentlichen Schreiben laufen (anders als
  // autoUpdateParentFlaxenCarriers weiter unten) - trägt eine ggf. von
  // einem Elternteil geerbte Flaxen-Trägerschaft direkt in DIESES
  // payload ein, damit sie mit demselben INSERT/UPDATE gespeichert wird.
  const ownFlaxenResult = await autoInheritFlaxenFromParents(payload);

  let error;
  let insertedId;
  if (targetId) {
    ({ error } = await supabaseClient.from('horses').update(payload).eq('id', targetId));
  } else {
    payload.user_id = session.user.id;
    // ".select('id').single()" wird nur für die Massenerfassung-Karte
    // gebraucht (siehe resetFormForNextEntry) - dort verlinkt jeder Eintrag
    // direkt auf das gerade angelegte Pferd, dafür muss dessen ID bekannt
    // sein (bei einem Update ist das ohnehin schon targetId).
    const insertResult = await supabaseClient.from('horses').insert(payload).select('id').single();
    error = insertResult.error;
    insertedId = insertResult.data?.id;
  }

  if (error) {
    // Der Name wurde (beim Bearbeiten eines bereits geladenen Pferds greift
    // die Dopplungs-Erkennung aus resolveSaveTarget bewusst nicht, siehe
    // dort) auf einen bereits von einem ANDEREN Pferd verwendeten Namen
    // geändert - statt der rohen Postgres-Fehlermeldung eine verständliche
    // Meldung anzeigen.
    if (error.code === '23505' && error.message.includes('horses_name_unique_idx')) {
      errorEl.textContent = 'Speichern fehlgeschlagen: Ein Pferd mit diesem Namen existiert bereits. Bitte einen anderen Namen wählen.';
    } else {
      errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    }
    return;
  }

  // Läuft nach dem eigentlichen Speichern, damit "payload" garantiert die
  // endgültigen (u.a. gemergten) Werte enthält - siehe
  // autoUpdateParentFlaxenCarriers weiter oben.
  const flaxenResult = await autoUpdateParentFlaxenCarriers(payload);

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
      // Wurden zuvor bereits Pferde per "Speichern & nächstes Pferd"
      // erfasst (siehe resetFormForNextEntry), zaehlt dieser letzte,
      // regulaer per "Speichern" abgeschlossene Speichervorgang als Ende
      // der Massenerfassung - der Banner in der Uebersicht listet dann
      // ALLE in dieser Sitzung neu angelegten Pferde statt nur dieses
      // eine, damit man den Ueberblick behaelt.
      bulkNames: bulkSessionEntries.length ? [...bulkSessionEntries.map((e) => e.name), formData.name] : null,
      changedFields: targetId ? computeChangedFields(beforeRecord, payload) : [],
      flaxenUpdated: flaxenResult.updated,
      flaxenWarnings: flaxenResult.warnings,
      ownFlaxenInheritedFrom: ownFlaxenResult?.updated || null,
      ownFlaxenWarningFrom: ownFlaxenResult?.warning || null,
    }));
  }
  if (saveRedirect === null) {
    resetFormForNextEntry(formData.name, targetId || insertedId, Boolean(targetId));
    return;
  }
  window.location.href = saveRedirect;
}

// Setzt das Formular nach "Speichern & nächstes Pferd" auf den Stand
// einer leeren Neuanlage zurück, ohne die Seite neu zu laden (spart bei
// vielen Pferden hintereinander den Umweg über die Übersicht). Native
// form.reset() deckt die meisten Formularfelder ab (Text/Zahl/Auswahl/
// Kästchen inkl. Schlagwörter) - Rohtext-Box und die aus dem Rohtext
// abgeleiteten Detail-Tabellen/Vorschau liegen außerhalb des <form> bzw.
// werden aus extraData gerendert und müssen deshalb manuell geleert
// werden.
async function resetFormForNextEntry(savedName, savedId, wasUpdate) {
  bulkSessionEntries.push({ id: savedId, name: savedName, updated: wasUpdate });
  document.getElementById('horse-form').reset();
  extraData = {};
  originalRecord = null;
  document.getElementById('raw-text').value = '';
  document.getElementById('paste-details').open = true;
  document.getElementById('parse-status').textContent = '';
  document.getElementById('form-error').textContent = '';
  fillTagCheckboxes([]);
  updateBreedCompositionVisibility();
  updateImagePreview();
  await renderDetailTables(extraData);
  activateTab('stammdaten');

  renderBulkSessionCard();

  document.getElementById('raw-text').focus();
}

// Baut die Massenerfassung-Karte auf (siehe .bulk-session-card in
// style.css) - Zähler, Liste der bereits erfassten Pferde (grüner Haken
// bei echter Neuanlage, blaues "aktualisiert"-Abzeichen bei einem
// Nachtrag zu einem bereits bestehenden Pferd, siehe bulkSessionEntries)
// sowie ein Button, um die Sitzung ohne eine weitere (leere) Neuanlage
// direkt zu beenden.
function renderBulkSessionCard() {
  const listEl = document.getElementById('bulk-session-list');
  listEl.hidden = false;
  const items = bulkSessionEntries.map((entry) => `
    <li class="bulk-session-item">
      <span class="bulk-session-badge ${entry.updated ? 'updated' : 'new'}">${entry.updated ? '↻ aktualisiert' : '✓ neu'}</span>
      <a href="horse.html?id=${encodeURIComponent(entry.id)}">${escapeHtml(entry.name)}</a>
    </li>
  `).join('');
  const pferdeWort = bulkSessionEntries.length === 1 ? 'Pferd' : 'Pferde';
  listEl.innerHTML = `
    <h3 class="bulk-session-title">🐎 Massenerfassung — ${bulkSessionEntries.length} ${pferdeWort} in dieser Sitzung</h3>
    <ul class="bulk-session-items">${items}</ul>
    <button type="button" id="bulk-session-finish-btn" class="secondary small">Fertig / Zur Übersicht</button>
  `;
  document.getElementById('bulk-session-finish-btn').addEventListener('click', onBulkSessionFinish);
}

// Beendet die Massenerfassung-Sitzung direkt von der Karte aus, ohne dass
// dafür noch ein (leeres) weiteres Pferd gespeichert werden muss - zeigt
// in der Übersicht denselben Sammel-Banner wie ein regulärer Abschluss
// per "Speichern" (siehe bulkNames in performSave).
function onBulkSessionFinish() {
  sessionStorage.setItem('mdr_flash', JSON.stringify({
    action: 'created',
    bulkNames: bulkSessionEntries.map((e) => e.name),
  }));
  window.location.href = 'index.html';
}

async function onDelete() {
  if (!editingId) return;
  if (!(await showConfirmModal('Pferd löschen', 'Dieses Pferd wirklich unwiderruflich löschen?', 'Löschen'))) return;
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
    const { hints: parentHints, parentMightHavePearl } = await fetchParentColorHints(data.pedigree, data.coat_color, notes, horseName);
    genetikParts.push(colorGeneticsHtml(data.colors, data.coat_color, notes, horseName, parentHints, data.color_gene_overrides, parentMightHavePearl));
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
  if (data.computed_lp_result) turnierParts.push(lpResultHtml(data.computed_lp_result));
  if (data.computed_tournament_values?.length) turnierParts.push(computedTournamentValuesHtml(data.computed_tournament_values));
  if (data.disciplines && Object.keys(data.disciplines).length) turnierParts.push(percentGroupsHtml('Disziplinen', data.disciplines, true));
  if (data.traits && Object.keys(data.traits).length) turnierParts.push(percentGroupsHtml('Eigenschaften', data.traits, true));

  if (hasPedigreeData(data.pedigree)) stammbaumParts.push(await pedigreeHtml(data.pedigree));

  fillDetailContainer('detail-genetik', genetikParts);
  fillDetailContainer('detail-turnier', turnierParts);
  fillDetailContainer('detail-stammbaum', stammbaumParts);

  const ownGpRaw = data.tournament_potential?.['Gesamtpotenzial'];
  currentProfileDerived = {
    gp: ownGpRaw != null && ownGpRaw !== '' ? Number(ownGpRaw) : null,
    ext: averageScore(data.exterior_descriptive, scoreExteriorTerm),
    extPct: data.exterior_genetics?.overall?.percent ?? null,
    int: averageScore(data.temperament, scoreTemperamentTerm),
  };
  currentRelatednessCache = data.relatedness_cache || [];
  currentRelatednessUpdatedAt = data.relatedness_updated_at || null;
  renderZuchtbuchTab();

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
  wireZuchtbuchFilter();
  wireZuchtbuchSort();
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
  const label = `${code} ${stateInfo.label}`;
  const title = `${code}: ${stateInfo.title} – zum Ändern klicken`;
  return `<button type="button" class="gene-override gene-override-${stateInfo.cls}" data-override-locus="${escapeHtml(code)}" data-override-group="disease" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

// Zeigt für jede bekannte Krankheit (KNOWN_DISEASE_CODES, siehe
// parser.js) entweder das tatsächliche Testergebnis (Rohwert wie
// "NN/NN", unverändert) oder - falls die Krankheit im Text komplett
// fehlte ODER dort explizit als "Nicht getestet" stand (beides kommt
// vor, je nach Spielversion/Kopierweg) - eine "Nicht getestet"-Zeile mit
// Klick-Button zur manuellen Träger/Betroffen/Frei-Bestätigung, z.B. für
// junge Fohlen, die noch nicht beim Tierarzt getestet wurden.
function diseaseTableHtml(diseases, overrides) {
  const rows = diseases || [];
  const ov = overrides || {};
  const valueByCode = {};
  for (const r of rows) valueByCode[r.label] = r.value;
  // Krankheiten aus dem Text, die nicht zu den bekannten Kürzeln gehören,
  // trotzdem mit anzeigen (unverändert, ohne Klick-Button) statt sie
  // stillschweigend zu verlieren.
  const extraCodes = rows.map((r) => r.label).filter((code) => !KNOWN_DISEASE_CODES.includes(code));

  const body = [...KNOWN_DISEASE_CODES, ...extraCodes].map((code) => {
    const rawValue = valueByCode[code];
    if (rawValue !== undefined && !isUntestedLocusValue(rawValue)) {
      return `<tr><th>${escapeHtml(code)}</th><td>${escapeHtml(rawValue)}</td></tr>`;
    }
    const state = ov[code] || null;
    let text = 'Nicht getestet';
    if (state === 'het') text += ' — Träger (manuell)';
    else if (state === 'hom') text += ' — betroffen, reinerbig (manuell)';
    else if (state === 'absent') text += ' — frei (manuell)';
    const badge = diseaseOverrideBadge(code, state);
    return `<tr><th>${escapeHtml(code)}</th><td class="gene-cell"><span class="gene-value-text">${text}</span><span class="gene-badges">${badge}</span></td></tr>`;
  }).join('');

  return `<div class="group-heading">Erbkrankheiten</div><table class="detail-table">${body}</table>`;
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
function colorGeneticsHtml(rows, coatColorName, notes, horseName, parentHints, overrides, parentMightHavePearl) {
  const ov = overrides || {};
  // Der Pferdename wird bewusst NICHT mehr nach Farbwörtern durchsucht
  // (siehe presentGenesSummary in parser.js) - nur Fellfarbe/Notiz gelten
  // als echte Farbangabe.
  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName, parentMightHavePearl),
    ...inferGeneticHintsFromPhenotype(notes, parentMightHavePearl),
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
      badges = geneOverrideBadge(r.label, overrideState, LOCUS_PRIMARY_ALLELE[r.label]);
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

  const summary = presentGenesSummary(rows, coatColorName, notes, horseName, parentHints, overrides, parentMightHavePearl);
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

// parentHomozygousLoci/parentColorHints/pintoParentHints/
// parentsMightHavePearl sind jetzt in parser.js (siehe dort) - werden
// dort UND hier gebraucht, list.js lädt aber kein horseForm.js.

async function fetchParentColorHints(pedigree, coatColorName, notes, horseName) {
  const parents = await fetchParentRecords(pedigree);
  return {
    hints: [
      ...parentColorHints(parents),
      ...pintoParentHints(parents, coatColorName, notes, horseName),
    ],
    parentMightHavePearl: parentsMightHavePearl(parents),
  };
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

// --- Turnierplaner-Integration im "Turnierwerte"-Reiter -----------------
//
// computed_tournament_values/computed_lp_result werden NICHT hier live
// berechnet, sondern einmalig beim Speichern in runSaveFlow() (siehe dort)
// mit js/tournamentScoring.js (1:1 aus MDR-Planer/js/tournamentScoring.js
// übernommen) und in der DB abgelegt - das Profil zeigt hier nur noch das
// gespeicherte Ergebnis an. Portiert aus MDR-Planer/js/turnierplaner.js
// (lpResultHtml/rowHtml).
function lpResultHtml(lp) {
  if (!lp) return '';
  let html = '<div style="margin-top:0.5rem;">';
  if (lp.possible === true) {
    html += '<div class="pill yes">Leistungsprüfung (LP): voraussichtlich bestanden</div>';
  } else if (lp.possible === false) {
    html += '<div class="pill no">Leistungsprüfung (LP): voraussichtlich NICHT bestanden</div>';
  } else {
    html += '<div class="pill">Leistungsprüfung (LP): nicht sicher prüfbar (zu wenig Daten)</div>';
  }
  if (lp.reasons?.length) {
    html += '<ul class="small">' + lp.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('') + '</ul>';
  }
  if (lp.warnings?.length) {
    html += '<p class="small muted">' + lp.warnings.map(escapeHtml).join('<br>') + '</p>';
  }
  html += '</div>';
  return html;
}

function computedTournamentValuesHtml(values) {
  if (!values?.length) return '';
  const rows = values.map((v) => `<tr>
    <td>${escapeHtml(v.category)}</td>
    <td>${escapeHtml(v.name)}</td>
    <td>${v.wert != null ? v.wert : '–'}</td>
    <td>${v.interieur != null ? v.interieur.toFixed(2) : '–'}</td>
    <td>${v.complete && v.lk != null ? 'LK' + v.lk : '–'}</td>
  </tr>`).join('');
  return `<div class="group-heading">Turnierwerte je Disziplin (Turnierplaner)</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Kategorie</th><th>Disziplin</th><th>Wert</th><th>Interieur</th><th>LK</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// --- Zuchtbuch-Reiter: Verwandtschaft -----------------------------------
//
// relatedness_cache wird NICHT hier live berechnet, sondern periodisch von
// der Edge Function supabase/functions/recompute-relatedness serverseitig
// neu aufgebaut (siehe dort, sowie mark_relatedness_stale-Trigger in
// supabase/migration_039_profile_relatedness_and_tournament_cache.sql) -
// hier nur Anzeige + Filter über das bereits geladene Ergebnis, kein
// zusätzlicher Abruf. Anders als im MDR-Planer-Zuchtbuch gibt es keine
// Pferdeauswahl - es werden immer nur die Verwandten DIESES Profils
// gezeigt. Filterlogik 1:1 aus MDR-Planer/js/zuchtbuch.js
// (filterRelatives) übernommen, nur als 5-Wege-Auswahl statt 4 Checkboxen
// + "Alle"-Kippschalter.
let currentRelatednessCache = [];
let currentRelatednessUpdatedAt = null;
// GP/Ext/Ext%/Int DIESES Profils - für die Farbcodierung der Verwandten-
// Werte "in Bezug auf das ausgewählte Pferd" (Nutzerwunsch 2026-09-07),
// dieselbe Konvention wie MDR-Planer/js/zuchtbuch.js (compareColor):
// grün = besser als dieses Pferd, rot = schlechter, keine Farbe = gleich.
let currentProfileDerived = { gp: null, ext: null, extPct: null, int: null };
// Auswahl fuer den CSV-Export der Verwandten-Tabelle (Nutzerwunsch) - als
// Namen statt IDs gefuehrt (bleibt so ueber Sortierung/Filterwechsel
// stabil, ohne bei jedem renderZuchtbuchTab neu gemappt werden zu
// muessen), da Pferdenamen in dieser Datenbank ohnehin eindeutig sind
// (siehe horses_name_unique_idx).
let zuchtbuchSelectedNames = new Set();

const ZUCHTBUCH_METRIC_HIGHER_IS_BETTER = { gp: true, ext: false, extPct: true, int: false };
function zuchtbuchCompareColor(value, reference, metric) {
  if (value == null || reference == null || value === reference) return '';
  const better = ZUCHTBUCH_METRIC_HIGHER_IS_BETTER[metric] ? value > reference : value < reference;
  return `color: ${better ? 'var(--success)' : 'var(--danger)'};`;
}

function filterRelativesCache(relatives, filter) {
  // "Alle Verwandtschaft" zeigt zusätzlich "Weitere Verwandtschaft" (siehe
  // findExtendedRelatives in der Edge Function - gemeinsamer Vorfahre
  // irgendwo im sichtbaren Stammbaum, ohne direkte Eltern-Kind-Beziehung,
  // Nutzerwunsch 2026-09-08) - bei den anderen, spezifischeren Filtern
  // bewusst NICHT mit dabei, wie im Original.
  if (filter === 'alle') return relatives;
  return relatives.filter((r) => {
    if (filter === 'vater') return r.beziehung === 'Vollgeschwister' || r.beziehung === 'Halbgeschwister (Vater)';
    if (filter === 'mutter') return r.beziehung === 'Vollgeschwister' || r.beziehung === 'Halbgeschwister (Mutter)';
    if (filter === 'kinder') return r.beziehung === 'Kind';
    // "Alle Nachkommen": alles außer den beiden Geschwister-Beziehungen
    // (Kind, Enkelkind, Urenkelkind, ... - siehe generationLabel) UND
    // außer "Weitere Verwandtschaft".
    return r.beziehung !== 'Vollgeschwister' && r.beziehung !== 'Halbgeschwister (Vater)'
      && r.beziehung !== 'Halbgeschwister (Mutter)' && r.beziehung !== 'Weitere Verwandtschaft';
  });
}

// Sortierung der Zuchtbuch-Verwandten-Tabelle (Nutzerwunsch 2026-09-09) -
// gleiches Klick-auf-Spaltenkopf-Muster wie MDR-Planer/js/zuchtbuch.js
// (relativesSortValue/nextSort/applySortGeneric/wireTableSort): Klick
// sortiert danach, erneuter Klick auf dieselbe Spalte kehrt die Richtung
// um. Default wie im Original: nach Beziehungs-Nähe (engste Verwandtschaft
// zuerst) - "Beziehung" hat dafür keinen eigenen Zahlenwert im Datensatz,
// deshalb hier dieselbe Rangfolge wie MDR-Planer's sortRank beim Aufbau
// von findRelatives/findExtendedRelatives (siehe dortige Edge Function).
let zuchtbuchSort = { field: 'beziehung', dir: 'asc' };

const ZUCHTBUCH_BEZIEHUNG_RANK = {
  'Vollgeschwister': 1,
  'Halbgeschwister (Vater)': 2,
  'Halbgeschwister (Mutter)': 3,
  'Kind': 4,
  'Enkelkind': 5,
  'Urenkelkind': 6,
  'Ururenkelkind': 7,
};
function zuchtbuchBeziehungRank(beziehung) {
  if (ZUCHTBUCH_BEZIEHUNG_RANK[beziehung] != null) return ZUCHTBUCH_BEZIEHUNG_RANK[beziehung];
  const m = /^Nachkomme \(Generation (\d+)\)$/.exec(beziehung || '');
  if (m) return 3 + Number(m[1]);
  if (beziehung === 'Weitere Verwandtschaft') return 50;
  return 99;
}

function zuchtbuchSortValue(r, field) {
  switch (field) {
    case 'name': return (r.name || '').toLowerCase();
    case 'gender': return (r.gender || '').toLowerCase();
    case 'beziehung': return zuchtbuchBeziehungRank(r.beziehung);
    case 'owner': return (r.owner || '').toLowerCase();
    case 'gp': return r.gp;
    case 'ext': return r.ext;
    case 'extpct': return r.extPct;
    case 'int': return r.int;
    case 'inbreeding': return r.inbreeding ? 1 : 0;
    case 'tag': return (r.tags && r.tags.length) ? r.tags.map((t) => t.label).join(', ').toLowerCase() : null;
    default: return null;
  }
}

// Fehlende Werte (null) landen unabhängig von der Richtung immer am Ende,
// wie beim gleichen Muster in js/list.js (applySort).
function applyZuchtbuchSort(rows) {
  const mult = zuchtbuchSort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = zuchtbuchSortValue(a, zuchtbuchSort.field);
    const vb = zuchtbuchSortValue(b, zuchtbuchSort.field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb, 'de') * mult;
    return (va - vb) * mult;
  });
}

function zuchtbuchSortArrow(field) {
  return zuchtbuchSort.field === field ? (zuchtbuchSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
}

function wireZuchtbuchSort() {
  document.addEventListener('click', (e) => {
    const th = e.target.closest('#zuchtbuch-relatives-table th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    zuchtbuchSort = zuchtbuchSort.field === field
      ? { field, dir: zuchtbuchSort.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' };
    renderZuchtbuchTab();
  });
}

function renderZuchtbuchTab() {
  const container = document.getElementById('detail-zuchtbuch');
  if (!container) return;
  const filterSel = document.getElementById('zuchtbuch-filter');
  const filter = filterSel ? filterSel.value : 'alle';
  const filtered = applyZuchtbuchSort(filterRelativesCache(currentRelatednessCache, filter));
  // "auf Inzuchtbasis" = wouldCauseInbreeding in der Edge Function - würde
  // eine Verpaarung mit DIESEM Pferd im gemeinsamen Fohlen tatsächlich
  // einen Namen doppeln (nicht nur "irgendwo verwandt", das deckt die
  // Beziehung/Filter oben bereits ab).
  const inbreedingCount = currentRelatednessCache.filter((r) => r.inbreeding).length;

  const updatedText = currentRelatednessUpdatedAt
    ? `Stand der Verwandtschaftsdaten: ${new Date(currentRelatednessUpdatedAt).toLocaleString('de-DE')}`
    : 'Verwandtschaftsdaten werden gerade zum ersten Mal berechnet - erscheinen automatisch innerhalb der nächsten Minuten, kein erneutes Laden nötig.';
  let html = `<p class="small">Verwandt mit <strong>${currentRelatednessCache.length}</strong> Pferden aus der Datenbank, davon <strong>${inbreedingCount}</strong> auf Inzuchtbasis (würde bei Verpaarung mit diesem Pferd Inzucht im gemeinsamen Fohlen verursachen).</p>`;
  html += `<p class="small muted">${filtered.length} von ${currentRelatednessCache.length} Verwandten angezeigt (aktueller Filter). ${escapeHtml(updatedText)}</p>`;

  if (!filtered.length) {
    html += '<p class="small muted">Keine passenden Verwandten gefunden.</p>';
    container.innerHTML = html;
    return;
  }

  // Nicht mehr angezeigte Auswahl (z.B. nach Filterwechsel) wird bewusst
  // NICHT geloescht - bleibt "im Hintergrund" ausgewaehlt, falls wieder
  // zurueckgefiltert wird (analog zur Pferde-Uebersicht, deren
  // selectedIds ebenfalls filterunabhaengig sind).
  const allSelected = filtered.length > 0 && filtered.every((r) => zuchtbuchSelectedNames.has(r.name));
  const someSelected = filtered.some((r) => zuchtbuchSelectedNames.has(r.name));

  const rows = filtered.map((r) => {
    const nameCell = r.id
      ? `<a href="view.html?id=${encodeURIComponent(r.id)}">${escapeHtml(r.name || '(ohne Name)')}</a>`
      : escapeHtml(r.name || '(ohne Name)');
    const pill = r.inbreeding
      ? '<span class="pill no">Inzucht-Gefahr</span>'
      : '<span class="pill yes">Unbedenklich</span>';
    return `<tr>
      <td data-label="Auswählen"><input type="checkbox" data-zb-select="${encodeURIComponent(r.name)}"${zuchtbuchSelectedNames.has(r.name) ? ' checked' : ''} /></td>
      <td>${nameCell}</td>
      <td>${tagsBadgesHtml(r.tags)}</td>
      <td>${r.gender ? escapeHtml(r.gender) : '–'}</td>
      <td${r.beziehungDetail ? ` title="${escapeHtml(r.beziehungDetail)}"` : ''}>${escapeHtml(r.beziehung)}${r.otherParent ? ` (${escapeHtml(r.otherParent.label)}: ${escapeHtml(r.otherParent.name)})` : ''}</td>
      <td>${r.owner ? escapeHtml(r.owner) : '–'}</td>
      <td style="${zuchtbuchCompareColor(r.gp, currentProfileDerived.gp, 'gp')}">${r.gp != null ? r.gp : '–'}</td>
      <td style="${zuchtbuchCompareColor(r.ext, currentProfileDerived.ext, 'ext')}">${r.ext != null ? r.ext.toFixed(2) : '–'}</td>
      <td style="${zuchtbuchCompareColor(r.extPct, currentProfileDerived.extPct, 'extPct')}">${r.extPct != null ? r.extPct + '%' : '–'}</td>
      <td style="${zuchtbuchCompareColor(r.int, currentProfileDerived.int, 'int')}">${r.int != null ? r.int.toFixed(2) : '–'}</td>
      <td>${pill}</td>
    </tr>`;
  }).join('');
  html += `<div class="form-actions">
    <button type="button" id="zuchtbuch-export-csv-btn" class="secondary small" title="Exportiert die ausgewählten Verwandten (Kästchen) - ohne Auswahl alle aktuell angezeigten">📄 CSV exportieren</button>
    ${someSelected ? `<span class="small muted">${filtered.filter((r) => zuchtbuchSelectedNames.has(r.name)).length} ausgewählt</span>` : ''}
  </div>`;
  html += `<div class="table-wrap"><table id="zuchtbuch-relatives-table">
    <thead><tr>
      <th><input type="checkbox" id="zuchtbuch-select-all"${allSelected ? ' checked' : ''} /></th>
      <th data-sort="name">Pferd${zuchtbuchSortArrow('name')}</th>
      <th data-sort="tag">Schlagwort${zuchtbuchSortArrow('tag')}</th>
      <th data-sort="gender">Geschlecht${zuchtbuchSortArrow('gender')}</th>
      <th data-sort="beziehung">Beziehung${zuchtbuchSortArrow('beziehung')}</th>
      <th data-sort="owner">Besitzer${zuchtbuchSortArrow('owner')}</th>
      <th data-sort="gp">GP${zuchtbuchSortArrow('gp')}</th>
      <th data-sort="ext">Ext${zuchtbuchSortArrow('ext')}</th>
      <th data-sort="extpct">Ext%${zuchtbuchSortArrow('extpct')}</th>
      <th data-sort="int">Int${zuchtbuchSortArrow('int')}</th>
      <th data-sort="inbreeding">Bei Verpaarung${zuchtbuchSortArrow('inbreeding')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
  container.innerHTML = html;
  wireZuchtbuchSelection(filtered);
}

// Checkboxen (einzeln + "alle") und CSV-Export-Button - muss nach jedem
// renderZuchtbuchTab() neu verdrahtet werden, da container.innerHTML das
// komplette Markup (inkl. Button) jedes Mal ersetzt.
function wireZuchtbuchSelection(filtered) {
  const container = document.getElementById('detail-zuchtbuch');
  container.querySelectorAll('[data-zb-select]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const name = decodeURIComponent(cb.dataset.zbSelect);
      if (cb.checked) zuchtbuchSelectedNames.add(name);
      else zuchtbuchSelectedNames.delete(name);
      renderZuchtbuchTab();
    });
  });
  const selectAllBox = document.getElementById('zuchtbuch-select-all');
  if (selectAllBox) {
    selectAllBox.addEventListener('change', () => {
      filtered.forEach((r) => {
        if (selectAllBox.checked) zuchtbuchSelectedNames.add(r.name);
        else zuchtbuchSelectedNames.delete(r.name);
      });
      renderZuchtbuchTab();
    });
  }
  const exportBtn = document.getElementById('zuchtbuch-export-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportZuchtbuchCsv(filtered));
}

const ZUCHTBUCH_CSV_COLUMNS = ['Pferd', 'Schlagwörter', 'Geschlecht', 'Beziehung', 'Besitzer', 'GP', 'Ext', 'Ext%', 'Int', 'Bei Verpaarung'];

// Semikolon statt Komma + deutsches Dezimalkomma - gleiche Begruendung wie
// beim CSV-Export der Pferdeliste (siehe csvEscape/deDecimal in js/list.js,
// hier dupliziert statt geteilt, da horse.html/view.html js/list.js nicht
// laden).
function zuchtbuchCsvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

function zuchtbuchDeDecimal(value) {
  return String(value).replace('.', ',');
}

function zuchtbuchCsvRowOf(r) {
  const tagsCell = (r.tags || []).map((t) => t.note ? `${t.label}: ${t.note}` : t.label).join(', ');
  const beziehungCell = (r.beziehung || '') + (r.otherParent ? ` (${r.otherParent.label}: ${r.otherParent.name})` : '');
  return [
    r.name || '',
    tagsCell,
    r.gender || '',
    beziehungCell,
    r.owner || '',
    r.gp ?? '',
    r.ext != null ? zuchtbuchDeDecimal(r.ext.toFixed(2)) : '',
    r.extPct != null ? zuchtbuchDeDecimal(r.extPct) + '%' : '',
    r.int != null ? zuchtbuchDeDecimal(r.int.toFixed(2)) : '',
    r.inbreeding ? 'Inzucht-Gefahr' : 'Unbedenklich',
  ];
}

// Sind über die Kästchen einzelne Verwandte ausgewählt, werden nur diese
// exportiert - ohne Auswahl exportiert der Button stattdessen alle aktuell
// angezeigten (gefilterten/sortierten) Zeilen, analog zum CSV-Export der
// Pferdeliste (js/list.js/exportCsv).
function exportZuchtbuchCsv(filtered) {
  const rows = zuchtbuchSelectedNames.size > 0
    ? filtered.filter((r) => zuchtbuchSelectedNames.has(r.name))
    : filtered;
  if (!rows.length) return;

  const lines = [ZUCHTBUCH_CSV_COLUMNS, ...rows.map(zuchtbuchCsvRowOf)]
    .map((row) => row.map(zuchtbuchCsvEscape).join(';'));
  // BOM voranstellen, damit Excel die UTF-8-Kodierung (Umlaute) korrekt erkennt.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const horseName = document.getElementById('name')?.value.trim() || 'pferd';
  a.download = `zuchtbuch_${horseName.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireZuchtbuchFilter() {
  const sel = document.getElementById('zuchtbuch-filter');
  if (sel) sel.addEventListener('change', renderZuchtbuchTab);
}

// hasPedigreeData siehe parser.js (dort geteilt mit list.js).

const PEDIGREE_SECTION_ORDER = [
  'Eltern',
  'Großeltern väterlicherseits', 'Großeltern mütterlicherseits',
  'Urgroßeltern (Großvater väterlicherseits)', 'Urgroßeltern (Großmutter väterlicherseits)',
  'Urgroßeltern (Großvater mütterlicherseits)', 'Urgroßeltern (Großmutter mütterlicherseits)',
];

// Sucht alle Vorfahren-Namen im Stammbaum als eigene (echte) Pferde in der
// Datenbank nach (Nutzerwunsch 2026-09-07: Namen sollen zum jeweiligen
// Profil verlinkt sein UND, wo vorhanden, dessen echte GP/Ext/Ext%/Int-
// Werte zeigen). EIN gebündelter Abruf für alle Namen zugleich (max. 14 -
// deutlich günstiger als eine Volltabellen-Abfrage). Die meisten Vorfahren
// sind selbst NICHT in der eigenen Datenbank erfasst - für die gilt weiter
// nur der beim Speichern mitkopierte "potential"-Wert (GP) aus dem
// Stammbaum-Text selbst, kein Ext/Ext%/Int (das kennt das Spiel dort
// nicht).
async function fetchAncestorLookup(names) {
  const uniqueNames = [...new Set(names.filter(Boolean))];
  if (!uniqueNames.length) return new Map();
  const { data, error } = await supabaseClient
    .from('horses')
    .select('id, name, gender, tournament_potential, exterior_descriptive, exterior_genetics, temperament')
    .in('name', uniqueNames);
  if (error || !data) return new Map();
  return new Map(data.map((h) => [h.name, h]));
}

// Eigene Werte, falls dieser Vorfahre selbst in der Datenbank steht -
// sonst nur der im Stammbaum mitkopierte GP-Schnappschuss (potentialFromPedigree).
function ancestorDerived(matchedHorse, potentialFromPedigree) {
  if (!matchedHorse) return { gp: potentialFromPedigree ?? null, ext: null, extPct: null, int: null };
  const gpRaw = matchedHorse.tournament_potential?.['Gesamtpotenzial'];
  return {
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : (potentialFromPedigree ?? null),
    ext: averageScore(matchedHorse.exterior_descriptive, scoreExteriorTerm),
    extPct: matchedHorse.exterior_genetics?.overall?.percent ?? null,
    int: averageScore(matchedHorse.temperament, scoreTemperamentTerm),
  };
}

function pedigreeGroupTableHtml(title, entries, ancestorLookup) {
  if (!entries?.length) return '';
  const body = entries.map((p) => {
    const matched = ancestorLookup.get(p.name);
    const d = ancestorDerived(matched, p.potential);
    const nameCell = matched
      ? `<a href="view.html?id=${encodeURIComponent(matched.id)}">${escapeHtml(p.name)}</a>`
      : escapeHtml(p.name);
    return `<tr>
      <th>${nameCell}</th>
      <td>${matched?.gender ? escapeHtml(matched.gender) : '–'}</td>
      <td>${escapeHtml(normalizeBreed(p.breed) || '')}</td>
      <td>${d.gp != null ? d.gp : '–'}</td>
      <td>${d.ext != null ? d.ext.toFixed(2) : '–'}</td>
      <td>${d.extPct != null ? d.extPct + '%' : '–'}</td>
      <td>${d.int != null ? d.int.toFixed(2) : '–'}</td>
    </tr>`;
  }).join('');
  return `<p class="small muted" style="margin-bottom:0.1rem;">${escapeHtml(title)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Geschlecht</th><th>Rasse</th><th>GP</th><th>Ext</th><th>Ext%</th><th>Int</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

// "pedigree" ist entweder das alte, flache Array (bereits gespeicherte
// Pferde vor dieser Änderung, Selbst-Eintrag an Position 0) oder das
// Format { ancestors, sections }. Der Parser liefert "sections" nicht mehr
// (Handy- und Desktop-Kopien werden identisch als reine Reihenfolge in
// "ancestors" gespeichert) - das Feld bleibt hier nur zur Anzeige bereits
// vor dieser Änderung gespeicherter Datensätze erhalten, bei denen es noch
// gefüllt ist.
async function pedigreeHtml(pedigree) {
  const isLegacyArray = Array.isArray(pedigree);
  const ancestors = isLegacyArray ? pedigree.slice(1) : (pedigree.ancestors || []);
  const sections = isLegacyArray ? null : pedigree.sections;

  const allNames = sections
    ? PEDIGREE_SECTION_ORDER.flatMap((label) => (sections[label] || []).map((p) => p.name))
    : ancestors.map((p) => p.name);
  const ancestorLookup = await fetchAncestorLookup(allNames);

  let body;
  let note;
  if (sections) {
    body = PEDIGREE_SECTION_ORDER.map((label) => pedigreeGroupTableHtml(label, sections[label], ancestorLookup)).join('');
    note = 'Einteilung anhand der im Text enthaltenen Abschnittsüberschriften (mobile Ansicht).';
  } else {
    const parents = ancestors.slice(0, 2);
    const grandparents = ancestors.slice(2, 6);
    const greatGrandparents = ancestors.slice(6, 14);
    const rest = ancestors.slice(14);
    body = pedigreeGroupTableHtml('Eltern', parents, ancestorLookup)
      + pedigreeGroupTableHtml('Großeltern', grandparents, ancestorLookup)
      + pedigreeGroupTableHtml('Urgroßeltern', greatGrandparents, ancestorLookup)
      + pedigreeGroupTableHtml('Weitere Vorfahren', rest, ancestorLookup);
    note = 'Einteilung anhand der Reihenfolge im kopierten Text – keine Garantie bei künftigen Layout-Änderungen im Spiel.';
  }

  return `<div class="group-heading">Stammbaum</div><p class="small muted">${escapeHtml(note)}</p>${body}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
