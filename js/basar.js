// Basar-Verkaufsliste (siehe basar.html) - eigenständige Seite neben der
// Pferdedatenbank, nutzt aber dieselben Konten/denselben Login
// (requireSession/renderSharedNav aus js/auth.js bzw. js/nav.js). Bewusst
// KEINE Abhängigkeit von js/parser.js oder js/list.js (anderes Datenmodell,
// eigene Domäne) - eigenständige Hilfsfunktionen hier, analog zu
// js/stockCheck.js.
//
// Ablauf: Foto(s) einer Verkaufsliste hochladen -> Texterkennung im Browser
// (Tesseract.js) -> js/basarParser.js schlägt Artikelzeilen vor -> Nutzer
// prüft/korrigiert in einer editierbaren Tabelle -> erst dann werden die
// Artikel gespeichert. Jede Statusänderung/Bearbeitung landet zusätzlich als
// Eintrag in basar_verlauf (Zeitstempel automatisch, Benutzername aus der
// Session) - siehe logBasarAktion.

const basarState = {
  identity: '',
  userId: null,
  reviewRows: [],
  importFiles: [],
  allArtikel: [],
  editId: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  await renderSharedNav(session);
  basarState.identity = session.user.email.split('@')[0];
  basarState.userId = session.user.id;

  wireImportUi();
  wireReviewTableUi();
  wireFilterUi();
  wireRowActions();
  wireEditModal();
  wireHistoryModal();

  await loadKnownArtValues();
  await loadArtikelListe();
});

// --- Kleine, DOM-unabhängige Helfer ---------------------------------------

function basarEscapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatBasarTimestamp(iso) {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function flashBasar(message, type) {
  const box = document.getElementById('basar-flash');
  box.textContent = message;
  box.hidden = false;
  box.className = 'flash-banner' + (type === 'error' ? ' error' : '');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Supabase liefert je Abfrage höchstens 1000 Zeilen - für Basar-Listen mit
// mehr Artikeln (mehrere hundert Verkäufer*innen) blättert das hier durch.
async function fetchAllBasarRows(queryBuilder, pageSize = 1000) {
  let rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) return { data: rows.length ? rows : null, error };
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

async function logBasarAktion(artikelId, aktion) {
  await supabaseClient.from('basar_verlauf').insert({ artikel_id: artikelId, aktion, benutzer: basarState.identity });
}

const IMAGE_EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

async function uploadBasarFoto(file) {
  const ext = IMAGE_EXT_BY_MIME[file.type] || 'jpg';
  const path = `${basarState.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseClient.storage.from('basar-fotos').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  });
  if (error) return null;
  return supabaseClient.storage.from('basar-fotos').getPublicUrl(path).data.publicUrl;
}

// --- Ersatz für window.confirm()/window.prompt() --------------------------
// (identisches Muster wie showConfirmModal/showPromptModal in js/parser.js
// - native Dialoge werden in manchen Browsern/Kontexten stillschweigend
// unterdrückt. Hier eigenständig, da diese Seite js/parser.js nicht lädt.)

function showConfirmModal(title, message, okLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    okBtn.textContent = okLabel || 'OK';
    modal.hidden = false;
    okBtn.focus();

    const cleanup = () => {
      modal.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeydown);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onKeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeydown);
  });
}

function showPromptModal(title, label, defaultValue) {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
    document.getElementById('prompt-modal-title').textContent = title;
    document.getElementById('prompt-modal-label').textContent = label;
    const input = document.getElementById('prompt-modal-input');
    const okBtn = document.getElementById('prompt-modal-ok');
    const cancelBtn = document.getElementById('prompt-modal-cancel');
    input.value = defaultValue || '';
    modal.hidden = false;
    input.focus();
    input.select();

    const cleanup = () => {
      modal.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
    };
    const onOk = () => { const value = input.value; cleanup(); resolve(value); };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

// --- Foto/Text einlesen ----------------------------------------------------

function wireImportUi() {
  document.getElementById('run-ocr-btn').addEventListener('click', runImport);
  document.getElementById('review-cancel-btn').addEventListener('click', cancelReview);
  document.getElementById('review-commit-btn').addEventListener('click', commitReview);
  document.getElementById('review-add-row-btn').addEventListener('click', () => {
    basarState.reviewRows.push({
      artikelNr: '', name: '', beschreibung: '', art: '', preis: '',
      confidence: 'ok', rawLine: '', sourceFileIndex: null,
    });
    renderReviewTable();
    document.getElementById('review-section').hidden = false;
  });
}

async function runImport() {
  const fileInput = document.getElementById('basar-photo-input');
  const files = [...fileInput.files];
  const pastedText = document.getElementById('basar-paste-text').value.trim();

  if (!files.length && !pastedText) {
    flashBasar('Bitte mindestens ein Foto auswählen oder Text einfügen.', 'error');
    return;
  }

  const runBtn = document.getElementById('run-ocr-btn');
  const progress = document.getElementById('ocr-progress');
  runBtn.disabled = true;
  progress.hidden = false;
  // Anhängen statt ersetzen: werden vor dem Übernehmen weitere Fotos
  // ausgelesen (z.B. mehrseitige Liste), müssen die Dateiindizes der
  // bereits vorhandenen reviewRows (sourceFileIndex) weiter auf die
  // richtige Datei in importFiles zeigen.
  const startIndex = basarState.importFiles.length;
  basarState.importFiles = basarState.importFiles.concat(files);

  const newRows = [];
  let detectedVerkaeuferNr = '';

  try {
    for (let i = 0; i < files.length; i++) {
      progress.textContent = `Lese Foto ${i + 1} von ${files.length}…`;
      const { data } = await Tesseract.recognize(files[i], 'deu', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            progress.textContent = `Lese Foto ${i + 1} von ${files.length}… (${Math.round((m.progress || 0) * 100)}%)`;
          }
        },
      });
      const { verkaeuferNr, rows } = parseBasarListText(data.text);
      if (verkaeuferNr && !detectedVerkaeuferNr) detectedVerkaeuferNr = verkaeuferNr;
      rows.forEach((r) => newRows.push({ ...r, sourceFileIndex: startIndex + i }));
    }

    if (pastedText) {
      const { verkaeuferNr, rows } = parseBasarListText(pastedText);
      if (verkaeuferNr && !detectedVerkaeuferNr) detectedVerkaeuferNr = verkaeuferNr;
      rows.forEach((r) => newRows.push({ ...r, sourceFileIndex: null }));
    }
  } catch (err) {
    flashBasar('Texterkennung fehlgeschlagen: ' + err.message, 'error');
    runBtn.disabled = false;
    progress.hidden = true;
    return;
  }

  runBtn.disabled = false;
  progress.hidden = true;

  if (!newRows.length) {
    flashBasar('Es konnten keine Artikelzeilen erkannt werden - bitte über "+ Zeile hinzufügen" manuell ergänzen oder Foto/Text prüfen.', 'error');
  }

  const vkInput = document.getElementById('import-verkaeufer-nr');
  if (!vkInput.value.trim() && detectedVerkaeuferNr) vkInput.value = detectedVerkaeuferNr;

  // Eingabefeld leeren, damit ein erneutes Klicken auf "Auslesen" (z.B. für
  // ein weiteres Foto derselben Liste) dieselben Dateien nicht versehentlich
  // doppelt einliest - die schon eingelesenen Dateien bleiben über
  // basarState.importFiles/sourceFileIndex weiter mit ihren Zeilen verknüpft.
  fileInput.value = '';
  document.getElementById('basar-paste-text').value = '';

  basarState.reviewRows = basarState.reviewRows.concat(newRows);
  renderReviewTable();
  document.getElementById('review-section').hidden = false;
  document.getElementById('review-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireReviewTableUi() {
  const tbody = document.getElementById('review-tbody');
  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.reviewField;
    const idx = e.target.dataset.idx;
    if (field === undefined || idx === undefined) return;
    basarState.reviewRows[idx][field] = e.target.value;
  });
  tbody.addEventListener('click', (e) => {
    const idx = e.target.dataset.reviewRemove;
    if (idx === undefined) return;
    basarState.reviewRows.splice(Number(idx), 1);
    renderReviewTable();
  });
}

function renderReviewTable() {
  const tbody = document.getElementById('review-tbody');
  tbody.innerHTML = basarState.reviewRows.map((row, idx) => `
    <tr class="${row.confidence === 'unsicher' ? 'review-row-unsicher' : ''}">
      <td><input type="text" data-review-field="artikelNr" data-idx="${idx}" value="${basarEscapeHtml(row.artikelNr)}" /></td>
      <td><input type="text" data-review-field="name" data-idx="${idx}" value="${basarEscapeHtml(row.name)}" /></td>
      <td><input type="text" data-review-field="beschreibung" data-idx="${idx}" value="${basarEscapeHtml(row.beschreibung)}" /></td>
      <td><input type="text" data-review-field="art" data-idx="${idx}" value="${basarEscapeHtml(row.art || '')}" list="known-art-list" /></td>
      <td><input type="text" data-review-field="preis" data-idx="${idx}" value="${basarEscapeHtml(row.preis === '' || row.preis === null || row.preis === undefined ? '' : String(row.preis).replace('.', ','))}" /></td>
      <td><button type="button" class="secondary small" data-review-remove="${idx}" title="Zeile entfernen">🗑️</button></td>
    </tr>
  `).join('');
}

function cancelReview() {
  basarState.reviewRows = [];
  basarState.importFiles = [];
  document.getElementById('review-section').hidden = true;
  document.getElementById('review-error').textContent = '';
  document.getElementById('basar-photo-input').value = '';
  document.getElementById('basar-paste-text').value = '';
  document.getElementById('import-verkaeufer-nr').value = '';
}

async function commitReview() {
  const errorBox = document.getElementById('review-error');
  errorBox.textContent = '';

  const verkaeuferNr = document.getElementById('import-verkaeufer-nr').value.trim();
  if (!verkaeuferNr) {
    errorBox.textContent = 'Bitte eine Verkäufernummer für diesen Import angeben.';
    return;
  }
  if (!basarState.reviewRows.length) {
    errorBox.textContent = 'Keine Artikelzeilen zum Übernehmen vorhanden.';
    return;
  }
  if (basarState.reviewRows.some((r) => !r.artikelNr.trim() || !r.name.trim())) {
    errorBox.textContent = 'Bitte für jede Zeile mindestens Artikelnummer und Name ausfüllen.';
    return;
  }

  const commitBtn = document.getElementById('review-commit-btn');
  commitBtn.disabled = true;

  // Fotos, aus denen tatsächlich übernommene Zeilen stammen, je einmal
  // hochladen - schlägt der Upload fehl, werden die Artikel trotzdem
  // gespeichert (Foto ist nur Beleg/Referenz, kein Pflichtfeld).
  const fotoUrlByFileIndex = {};
  for (let i = 0; i < basarState.importFiles.length; i++) {
    if (!basarState.reviewRows.some((r) => r.sourceFileIndex === i)) continue;
    try {
      const url = await uploadBasarFoto(basarState.importFiles[i]);
      if (url) fotoUrlByFileIndex[i] = url;
    } catch { /* Foto optional - Speichern läuft trotzdem weiter */ }
  }

  const inserts = basarState.reviewRows.map((r) => ({
    user_id: basarState.userId,
    verkaeufer_nr: verkaeuferNr,
    artikel_nr: r.artikelNr.trim(),
    name: r.name.trim(),
    beschreibung: r.beschreibung.trim() || null,
    art: (r.art || '').trim() || null,
    preis: parsePreisInput(r.preis),
    raw_text: r.rawLine || null,
    foto_url: r.sourceFileIndex !== null ? (fotoUrlByFileIndex[r.sourceFileIndex] || null) : null,
  }));

  const { data, error } = await supabaseClient.from('basar_artikel').insert(inserts).select();
  commitBtn.disabled = false;

  if (error) {
    errorBox.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }

  await supabaseClient.from('basar_verlauf').insert(
    data.map((row) => ({ artikel_id: row.id, aktion: 'angelegt (Fotoerkennung/Import)', benutzer: basarState.identity }))
  );

  flashBasar(`${data.length} Artikel wurden übernommen.`, 'success');
  cancelReview();
  await loadKnownArtValues();
  await loadArtikelListe();
}

// --- Verkaufsliste laden/anzeigen/filtern ----------------------------------

async function loadKnownArtValues() {
  const { data } = await supabaseClient.from('basar_artikel').select('art');
  const values = [...new Set((data || []).map((d) => d.art).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));

  document.getElementById('known-art-list').innerHTML =
    values.map((v) => `<option value="${basarEscapeHtml(v)}"></option>`).join('');

  const select = document.getElementById('f-basar-art');
  const current = select.value;
  select.innerHTML = '<option value="">Alle</option>' +
    values.map((v) => `<option value="${basarEscapeHtml(v)}">${basarEscapeHtml(v)}</option>`).join('');
  select.value = current;
}

async function loadArtikelListe() {
  const tbody = document.getElementById('basar-tbody');
  tbody.innerHTML = '<tr><td colspan="8">Lade…</td></tr>';

  const { data, error } = await fetchAllBasarRows(
    supabaseClient.from('basar_artikel').select('*').order('verkaeufer_nr').order('artikel_nr')
  );
  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="error">Fehler beim Laden: ${basarEscapeHtml(error.message)}</td></tr>`;
    return;
  }

  basarState.allArtikel = data || [];
  renderArtikelTable();
}

function wireFilterUi() {
  document.getElementById('basar-filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    renderArtikelTable();
  });
  document.getElementById('basar-filter-reset').addEventListener('click', () => {
    document.getElementById('basar-filter-form').reset();
    renderArtikelTable();
  });
}

function currentBasarFilters() {
  return {
    verkaeufer: document.getElementById('f-basar-verkaeufer').value.trim().toLowerCase(),
    suche: document.getElementById('f-basar-suche').value.trim().toLowerCase(),
    art: document.getElementById('f-basar-art').value,
    status: document.getElementById('f-basar-status').value,
  };
}

function renderArtikelTable() {
  const filters = currentBasarFilters();
  const rows = basarState.allArtikel.filter((a) => {
    if (filters.verkaeufer && !String(a.verkaeufer_nr).toLowerCase().includes(filters.verkaeufer)) return false;
    if (filters.suche) {
      const hay = `${a.artikel_nr} ${a.name}`.toLowerCase();
      if (!hay.includes(filters.suche)) return false;
    }
    if (filters.art && a.art !== filters.art) return false;
    if (filters.status && a.status !== filters.status) return false;
    return true;
  });

  document.getElementById('basar-result-count').textContent =
    `${rows.length} von ${basarState.allArtikel.length} Artikeln`;

  const tbody = document.getElementById('basar-tbody');
  tbody.innerHTML = rows.length
    ? rows.map(renderArtikelRow).join('')
    : '<tr><td colspan="8" class="muted">Keine Artikel gefunden.</td></tr>';
}

function renderArtikelRow(a) {
  const statusInfo = BASAR_STATUS[a.status] || BASAR_STATUS.bestand;
  const priceHtml = a.status === 'preissenkung' && a.reduzierter_preis != null
    ? `<span style="text-decoration: line-through; color: var(--muted);">${formatPreis(a.preis)}</span> → <strong>${formatPreis(a.reduzierter_preis)}</strong>`
    : formatPreis(a.preis);

  const actions = [];
  if (a.status !== 'verkauft') actions.push(`<button type="button" class="secondary small" data-action="verkauft" data-id="${a.id}">✅ Verkauft</button>`);
  if (a.status !== 'preissenkung') actions.push(`<button type="button" class="secondary small" data-action="preissenkung" data-id="${a.id}">🔻 Preissenkung</button>`);
  if (a.status !== 'verloren') actions.push(`<button type="button" class="secondary small" data-action="verloren" data-id="${a.id}">❌ Verloren</button>`);
  if (a.status !== 'bestand') actions.push(`<button type="button" class="secondary small" data-action="reset" data-id="${a.id}">📦 Zurücksetzen</button>`);
  actions.push(`<button type="button" class="secondary small" data-action="edit" data-id="${a.id}" title="Bearbeiten">✏️</button>`);
  actions.push(`<button type="button" class="secondary small" data-action="history" data-id="${a.id}" title="Verlauf">🕘</button>`);
  actions.push(`<button type="button" class="danger small" data-action="delete" data-id="${a.id}" title="Löschen">🗑️</button>`);

  return `
    <tr>
      <td>${basarEscapeHtml(a.verkaeufer_nr)}</td>
      <td>${basarEscapeHtml(a.artikel_nr)}</td>
      <td>${basarEscapeHtml(a.name)}</td>
      <td>${basarEscapeHtml(a.beschreibung || '')}</td>
      <td>${basarEscapeHtml(a.art || '')}</td>
      <td>${priceHtml}</td>
      <td>${statusInfo.symbol} ${basarEscapeHtml(statusInfo.label)}</td>
      <td style="display: flex; flex-wrap: wrap; gap: 0.3rem;">${actions.join('')}</td>
    </tr>
  `;
}

// --- Zeilen-Aktionen (Status ändern/löschen) -------------------------------

function wireRowActions() {
  document.getElementById('basar-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const artikel = basarState.allArtikel.find((a) => a.id === btn.dataset.id);
    if (!artikel) return;

    switch (btn.dataset.action) {
      case 'verkauft': return handleStatusChange(artikel, 'verkauft');
      case 'verloren': return handleStatusChange(artikel, 'verloren');
      case 'reset': return handleStatusChange(artikel, 'bestand');
      case 'preissenkung': return handlePreissenkung(artikel);
      case 'edit': return openEditModal(artikel);
      case 'history': return openHistoryModal(artikel);
      case 'delete': return handleDelete(artikel);
      default: return undefined;
    }
  });
}

async function handleStatusChange(artikel, newStatus) {
  const label = BASAR_STATUS[newStatus].label;
  const ok = await showConfirmModal(
    'Status ändern',
    `"${artikel.name}" (Verkäufer ${artikel.verkaeufer_nr}, Artikel ${artikel.artikel_nr}) auf "${label}" setzen?`,
    'Ja, setzen'
  );
  if (!ok) return;

  const update = { status: newStatus };
  if (newStatus !== 'preissenkung') update.reduzierter_preis = null;

  const { error } = await supabaseClient.from('basar_artikel').update(update).eq('id', artikel.id);
  if (error) { flashBasar('Aktualisieren fehlgeschlagen: ' + error.message, 'error'); return; }

  await logBasarAktion(artikel.id, BASAR_STATUS[newStatus].aktion);
  await loadArtikelListe();
}

async function handlePreissenkung(artikel) {
  const defaultValue = artikel.reduzierter_preis != null ? String(artikel.reduzierter_preis).replace('.', ',') : '';
  const value = await showPromptModal(
    'Preissenkung',
    `Neuer Preis für "${artikel.name}" (bisher ${formatPreis(artikel.preis)}):`,
    defaultValue
  );
  if (value === null) return;

  const neuerPreis = parsePreisInput(value);
  if (neuerPreis === null) { flashBasar('Bitte einen gültigen Preis eingeben.', 'error'); return; }

  const { error } = await supabaseClient
    .from('basar_artikel')
    .update({ status: 'preissenkung', reduzierter_preis: neuerPreis })
    .eq('id', artikel.id);
  if (error) { flashBasar('Aktualisieren fehlgeschlagen: ' + error.message, 'error'); return; }

  await logBasarAktion(artikel.id, `Preis gesenkt von ${formatPreis(artikel.preis)} auf ${formatPreis(neuerPreis)}`);
  await loadArtikelListe();
}

async function handleDelete(artikel) {
  const ok = await showConfirmModal(
    'Löschen bestätigen',
    `"${artikel.name}" (Verkäufer ${artikel.verkaeufer_nr}, Artikel ${artikel.artikel_nr}) wirklich löschen? Der Verlauf geht dabei mit verloren.`,
    'Löschen'
  );
  if (!ok) return;

  const { error } = await supabaseClient.from('basar_artikel').delete().eq('id', artikel.id);
  if (error) { flashBasar('Löschen fehlgeschlagen: ' + error.message, 'error'); return; }
  await loadArtikelListe();
}

// --- Bearbeiten-Modal -------------------------------------------------------

const EDIT_FIELD_LABELS = {
  verkaeufer_nr: 'Verkäufernr.', artikel_nr: 'Artikelnr.', name: 'Name',
  beschreibung: 'Beschreibung', art: 'Art', preis: 'Preis',
};

function openEditModal(artikel) {
  basarState.editId = artikel.id;
  document.getElementById('edit-verkaeufer-nr').value = artikel.verkaeufer_nr;
  document.getElementById('edit-artikel-nr').value = artikel.artikel_nr;
  document.getElementById('edit-name').value = artikel.name;
  document.getElementById('edit-beschreibung').value = artikel.beschreibung || '';
  document.getElementById('edit-art').value = artikel.art || '';
  document.getElementById('edit-preis').value = artikel.preis != null ? String(artikel.preis).replace('.', ',') : '';
  document.getElementById('basar-edit-error').textContent = '';
  document.getElementById('basar-edit-modal').hidden = false;
}

function wireEditModal() {
  document.getElementById('basar-edit-cancel').addEventListener('click', () => {
    document.getElementById('basar-edit-modal').hidden = true;
  });

  document.getElementById('basar-edit-save').addEventListener('click', async () => {
    const artikel = basarState.allArtikel.find((a) => a.id === basarState.editId);
    if (!artikel) return;
    const errorBox = document.getElementById('basar-edit-error');

    const neu = {
      verkaeufer_nr: document.getElementById('edit-verkaeufer-nr').value.trim(),
      artikel_nr: document.getElementById('edit-artikel-nr').value.trim(),
      name: document.getElementById('edit-name').value.trim(),
      beschreibung: document.getElementById('edit-beschreibung').value.trim() || null,
      art: document.getElementById('edit-art').value.trim() || null,
      preis: parsePreisInput(document.getElementById('edit-preis').value),
    };
    if (!neu.verkaeufer_nr || !neu.artikel_nr || !neu.name) {
      errorBox.textContent = 'Verkäufernr., Artikelnr. und Name dürfen nicht leer sein.';
      return;
    }

    const changes = [];
    for (const key of Object.keys(neu)) {
      const alt = artikel[key] ?? null;
      const wert = neu[key] ?? null;
      if (String(alt) === String(wert)) continue;
      const format = key === 'preis' ? formatPreis : (v) => (v === null ? '(leer)' : v);
      changes.push(`${EDIT_FIELD_LABELS[key]}: "${format(alt)}" → "${format(wert)}"`);
    }

    if (!changes.length) {
      document.getElementById('basar-edit-modal').hidden = true;
      return;
    }

    const { error } = await supabaseClient.from('basar_artikel').update(neu).eq('id', artikel.id);
    if (error) {
      errorBox.textContent = 'Speichern fehlgeschlagen: ' + error.message;
      return;
    }

    await logBasarAktion(artikel.id, 'bearbeitet: ' + changes.join('; '));
    document.getElementById('basar-edit-modal').hidden = true;
    await loadKnownArtValues();
    await loadArtikelListe();
  });
}

// --- Verlaufs-Modal ----------------------------------------------------------

function wireHistoryModal() {
  document.getElementById('basar-history-close').addEventListener('click', () => {
    document.getElementById('basar-history-modal').hidden = true;
  });
}

async function openHistoryModal(artikel) {
  document.getElementById('basar-history-subtitle').textContent =
    `${artikel.name} (Verkäufer ${artikel.verkaeufer_nr}, Artikel ${artikel.artikel_nr})`;
  const list = document.getElementById('basar-history-list');
  list.innerHTML = '<li class="muted small">Lade…</li>';
  document.getElementById('basar-history-modal').hidden = false;

  const { data, error } = await supabaseClient
    .from('basar_verlauf')
    .select('*')
    .eq('artikel_id', artikel.id)
    .order('erstellt_at', { ascending: false });

  if (error) {
    list.innerHTML = `<li class="error">Fehler beim Laden: ${basarEscapeHtml(error.message)}</li>`;
    return;
  }
  if (!data.length) {
    list.innerHTML = '<li class="muted small">Noch kein Verlauf.</li>';
    return;
  }

  list.innerHTML = data.map((entry) => `
    <li style="padding: 0.4rem 0; border-bottom: 1px solid var(--border);">
      <strong>${basarEscapeHtml(formatBasarTimestamp(entry.erstellt_at))}</strong> – ${basarEscapeHtml(entry.benutzer)}<br />
      <span class="small">${basarEscapeHtml(entry.aktion)}</span>
    </li>
  `).join('');
}
