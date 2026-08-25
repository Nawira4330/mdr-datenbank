document.addEventListener('DOMContentLoaded', init);

let currentUserId = null;
// Arbeitskopie der Dashboard-Kacheln-Auswahl (Reihenfolge + Sichtbarkeit,
// siehe mergeDashboardTiles/DASHBOARD_TILE_OPTIONS in parser.js) - wird
// per ▲/▼ und Häkchen in renderDashboardTileList direkt verändert und erst
// mit "Speichern" (onSave) übernommen.
let dashboardTiles = [];
// Arbeitskopie der selbst angelegten, angepinnten Kacheln (Definitionen:
// Kriterien + Metrik, siehe migration_033_custom_dashboard_tiles.sql) -
// wie dashboardTiles nur eine Kopie, erst mit "Speichern" übernommen.
let customDashboardTiles = [];

async function init() {
  const session = await requireSession();
  if (!session) return;
  await renderSharedNav(session);
  currentUserId = session.user.id;

  await populateBreedCheckboxes();
  populateCustomTileBreedSelect();
  await populateCustomTileOwnerSelect();
  // Muss vor loadCurrentSettings laufen, da diese Dropdown-Optionen dort
  // erst gesetzt (ausgewählt) werden.
  await loadFilterPresetsList();
  await loadSortPresetsList();
  dashboardTiles = mergeDashboardTiles(null, customDashboardTiles);
  renderDashboardTileList();
  wireDashboardTileList();
  wireCustomTileForm();
  await loadCurrentSettings();

  document.getElementById('save-settings-btn').addEventListener('click', onSave);
}

// Baut die Dashboard-Kacheln-Liste aus dashboardTiles (Reihenfolge +
// Sichtbarkeit) neu auf - bei jeder ▲/▼-Verschiebung sowie initial nach
// dem Laden der gespeicherten Auswahl. Eigene, angepinnte Kacheln (siehe
// customDashboardTiles) stehen gleichberechtigt in derselben Liste,
// bekommen aber zusätzlich einen Löschen-Button (🗑️) statt nur die feste
// Auswahl aus DASHBOARD_TILE_OPTIONS.
function renderDashboardTileList() {
  const container = document.getElementById('dashboard-tile-list');
  container.innerHTML = dashboardTiles.map((t, i) => {
    const opt = DASHBOARD_TILE_OPTIONS.find((o) => o.id === t.id);
    const custom = opt ? null : customDashboardTiles.find((c) => c.id === t.id);
    if (!opt && !custom) return '';
    const label = opt ? opt.label : custom.label;
    const deleteBtn = custom
      ? `<button type="button" class="icon-btn" data-tile-delete="${escapeHtml(t.id)}" title="Kachel löschen">🗑️</button>`
      : '';
    return `
      <div class="dashboard-tile-row">
        <div class="dashboard-tile-move">
          <button type="button" class="icon-btn" data-tile-up="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben">▲</button>
          <button type="button" class="icon-btn" data-tile-down="${i}" ${i === dashboardTiles.length - 1 ? 'disabled' : ''} title="Nach unten">▼</button>
        </div>
        <label>
          <input type="checkbox" data-tile-visible="${i}" style="width: auto;" ${t.visible ? 'checked' : ''} />
          ${escapeHtml(label)}
        </label>
        ${deleteBtn}
      </div>`;
  }).join('');
}

function wireDashboardTileList() {
  document.getElementById('dashboard-tile-list').addEventListener('click', async (e) => {
    const upBtn = e.target.closest('[data-tile-up]');
    const downBtn = e.target.closest('[data-tile-down]');
    const deleteBtn = e.target.closest('[data-tile-delete]');
    if (upBtn) {
      const i = Number(upBtn.dataset.tileUp);
      [dashboardTiles[i - 1], dashboardTiles[i]] = [dashboardTiles[i], dashboardTiles[i - 1]];
      renderDashboardTileList();
    } else if (downBtn) {
      const i = Number(downBtn.dataset.tileDown);
      [dashboardTiles[i], dashboardTiles[i + 1]] = [dashboardTiles[i + 1], dashboardTiles[i]];
      renderDashboardTileList();
    } else if (deleteBtn) {
      const id = deleteBtn.dataset.tileDelete;
      if (!(await showConfirmModal('Kachel löschen', 'Diese Kachel wirklich löschen?', 'Löschen'))) return;
      customDashboardTiles = customDashboardTiles.filter((c) => c.id !== id);
      dashboardTiles = dashboardTiles.filter((t) => t.id !== id);
      renderDashboardTileList();
    }
  });
  document.getElementById('dashboard-tile-list').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-tile-visible]');
    if (!cb) return;
    dashboardTiles[Number(cb.dataset.tileVisible)].visible = cb.checked;
  });
}

// --- "+ Kachel hinzufügen": eigene, angepinnte Kachel anlegen ---

function populateCustomTileBreedSelect() {
  const select = document.getElementById('custom-tile-breed');
  // Rassen aus den bereits geladenen Rassen-Checkboxen übernehmen (siehe
  // populateBreedCheckboxes) statt eines eigenen Datenbankzugriffs.
  document.querySelectorAll('#breed-checkboxes input[type="checkbox"]').forEach((cb) => {
    const opt = document.createElement('option');
    opt.value = cb.value;
    opt.textContent = cb.value;
    select.appendChild(opt);
  });
}

// fetchAllRows statt eines einzelnen .select() - sonst könnten seltene
// Besitzer, die nur bei Pferden jenseits der ersten 1000 Zeilen vorkommen,
// in der Auswahl fehlen (siehe UPDATELOG.md, 1000-Zeilen-Bugfix).
async function populateCustomTileOwnerSelect() {
  const select = document.getElementById('custom-tile-owner');
  const { data, error } = await fetchAllRows(supabaseClient.from('horses').select('owner'));
  if (error || !data) return;
  const owners = [...new Set(data.map((d) => d.owner).filter(Boolean))].sort();
  for (const owner of owners) {
    const opt = document.createElement('option');
    opt.value = owner;
    opt.textContent = owner;
    select.appendChild(opt);
  }
}

function wireCustomTileForm() {
  const addBtn = document.getElementById('add-custom-tile-btn');
  const form = document.getElementById('custom-tile-form');
  const sourceSelect = document.getElementById('custom-tile-source');
  const presetFields = document.getElementById('custom-tile-preset-fields');
  const adhocFields = document.getElementById('custom-tile-adhoc-fields');

  addBtn.addEventListener('click', () => {
    form.hidden = !form.hidden;
  });
  sourceSelect.addEventListener('change', () => {
    presetFields.hidden = sourceSelect.value !== 'preset';
    adhocFields.hidden = sourceSelect.value !== 'custom';
  });
  document.getElementById('cancel-custom-tile-btn').addEventListener('click', () => {
    form.hidden = true;
  });
  document.getElementById('save-custom-tile-btn').addEventListener('click', onAddCustomTile);
}

function onAddCustomTile() {
  const labelInput = document.getElementById('custom-tile-label');
  const label = labelInput.value.trim();
  if (!label) {
    alert('Bitte einen Namen für die Kachel eingeben.');
    return;
  }
  const metric = document.getElementById('custom-tile-metric').value;
  const source = document.getElementById('custom-tile-source').value;

  const tile = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label, metric, source };
  if (source === 'preset') {
    const presetId = document.getElementById('custom-tile-preset-select').value;
    if (!presetId) {
      alert('Bitte eine Filtervorlage auswählen.');
      return;
    }
    tile.presetId = presetId;
  } else {
    const ageMinVal = document.getElementById('custom-tile-age-min').value;
    const ageMaxVal = document.getElementById('custom-tile-age-max').value;
    tile.filters = {
      breed: document.getElementById('custom-tile-breed').value || null,
      owner: document.getElementById('custom-tile-owner').value || null,
      gender: document.getElementById('custom-tile-gender').value || null,
      zzl: document.getElementById('custom-tile-zzl').value || null,
      ageMin: ageMinVal !== '' ? Number(ageMinVal) : null,
      ageMax: ageMaxVal !== '' ? Number(ageMaxVal) : null,
    };
  }

  customDashboardTiles.push(tile);
  dashboardTiles.push({ id: tile.id, visible: true });
  renderDashboardTileList();

  labelInput.value = '';
  document.getElementById('custom-tile-age-min').value = '';
  document.getElementById('custom-tile-age-max').value = '';
  document.getElementById('custom-tile-form').hidden = true;
}

// Gespeicherte Filter-Vorlagen aus der Übersicht (siehe
// migration_022_filter_presets.sql / js/list.js) - Löschen wirkt sofort,
// unabhängig vom "Speichern"-Button unten (der betrifft nur die anderen
// Einstellungen in dieser Datei). Befüllt zusätzlich das Dropdown
// "Standard-Vorlage beim Öffnen" (siehe migration_028) mit denselben
// Vorlagen - dessen ausgewählter Wert wird erst danach in
// loadCurrentSettings gesetzt, da hier nur die Optionsliste selbst
// aufgebaut wird.
async function loadFilterPresetsList() {
  const container = document.getElementById('filter-presets-list');
  const defaultSelect = document.getElementById('default-filter-preset-select');
  defaultSelect.innerHTML = '<option value="">Keine (Übersicht startet ungefiltert)</option>';
  const customTileSelect = document.getElementById('custom-tile-preset-select');
  customTileSelect.innerHTML = '<option value="">Bitte wählen…</option>';
  const { data, error } = await supabaseClient
    .from('filter_presets')
    .select('id, name')
    .eq('user_id', currentUserId)
    .order('name');
  if (error) {
    container.innerHTML = '<p class="error">Vorlagen konnten nicht geladen werden.</p>';
    return;
  }
  for (const p of data) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    defaultSelect.appendChild(opt);
    customTileSelect.appendChild(opt.cloneNode(true));
  }
  if (!data.length) {
    container.innerHTML = '<p class="muted small">Noch keine Filter-Vorlagen gespeichert.</p>';
    return;
  }
  container.innerHTML = data.map((p) =>
    `<div class="list-row">
      <span>${escapeHtml(p.name)}</span>
      <button type="button" class="danger small" data-delete-preset="${p.id}">Löschen</button>
    </div>`
  ).join('');
  container.querySelectorAll('[data-delete-preset]').forEach((btn) => {
    btn.addEventListener('click', () => onDeleteFilterPreset(btn.dataset.deletePreset));
  });
}

async function onDeleteFilterPreset(id) {
  if (!(await showConfirmModal('Vorlage löschen', 'Diese Filter-Vorlage wirklich löschen?', 'Löschen'))) return;
  const { error } = await supabaseClient.from('filter_presets').delete().eq('id', id);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadFilterPresetsList();
}

// Gespeicherte Sortier-Vorlagen aus der Übersicht (siehe
// migration_029_sort_presets.sql / js/list.js) - Löschen wirkt sofort,
// unabhängig vom "Speichern"-Button unten. Befüllt zusätzlich das Dropdown
// "Standard-Sortierung beim Öffnen" (siehe migration_030) mit denselben
// Vorlagen - dessen ausgewählter Wert wird erst danach in
// loadCurrentSettings gesetzt, da hier nur die Optionsliste selbst
// aufgebaut wird.
async function loadSortPresetsList() {
  const container = document.getElementById('sort-presets-list');
  const defaultSelect = document.getElementById('default-sort-preset-select');
  defaultSelect.innerHTML = '<option value="">Keine (letzte Sortierung auf diesem Gerät)</option>';
  const { data, error } = await supabaseClient
    .from('sort_presets')
    .select('id, name')
    .eq('user_id', currentUserId)
    .order('name');
  if (error) {
    container.innerHTML = '<p class="error">Sortierungen konnten nicht geladen werden.</p>';
    return;
  }
  for (const p of data) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    defaultSelect.appendChild(opt);
  }
  if (!data.length) {
    container.innerHTML = '<p class="muted small">Noch keine Sortierungen gespeichert.</p>';
    return;
  }
  container.innerHTML = data.map((p) =>
    `<div class="list-row">
      <span>${escapeHtml(p.name)}</span>
      <button type="button" class="danger small" data-delete-sort-preset="${p.id}">Löschen</button>
    </div>`
  ).join('');
  container.querySelectorAll('[data-delete-sort-preset]').forEach((btn) => {
    btn.addEventListener('click', () => onDeleteSortPreset(btn.dataset.deleteSortPreset));
  });
}

async function onDeleteSortPreset(id) {
  if (!(await showConfirmModal('Sortierung löschen', 'Diese Sortierung wirklich löschen?', 'Löschen'))) return;
  const { error } = await supabaseClient.from('sort_presets').delete().eq('id', id);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadSortPresetsList();
}

// Rassen-Liste aus den tatsächlich vorkommenden Werten ableiten (wie
// list.js/populateFilterOptions), damit hier keine Rasse fehlt oder eine
// längst nicht mehr vorkommende angeboten wird.
async function populateBreedCheckboxes() {
  const container = document.getElementById('breed-checkboxes');
  // fetchAllRows statt eines einzelnen .select() - sonst könnten seltene
  // Rassen, die nur bei Pferden jenseits der ersten 1000 Zeilen vorkommen,
  // in der Auswahl fehlen.
  const { data, error } = await fetchAllRows(supabaseClient.from('horses').select('breed'));
  if (error || !data) {
    container.innerHTML = '<p class="error">Rassen konnten nicht geladen werden.</p>';
    return;
  }
  const breeds = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
  breeds.add('Rasselos');
  container.innerHTML = [...breeds].sort().map((b) =>
    `<label><input type="checkbox" value="${escapeHtml(b)}" /> ${escapeHtml(b)}</label>`
  ).join('');
}

async function loadCurrentSettings() {
  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('preferred_breeds, verpaarung_enabled, page_zoom, compare_tolerances, default_filter_preset_id, default_sort_preset_id, dashboard_tiles, profile_nav_sort, custom_dashboard_tiles, hidden_notices')
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (error || !data) return;
  // Nur setzen, wenn die Vorlage auch tatsächlich (noch) als Option
  // existiert (siehe loadFilterPresetsList) - z.B. falls die zuvor als
  // Standard gewählte Vorlage inzwischen gelöscht wurde, bleibt die
  // Auswahl dann bei "Keine" statt eine ungültige ID stumm zu übernehmen.
  const defaultSelect = document.getElementById('default-filter-preset-select');
  if (data.default_filter_preset_id && [...defaultSelect.options].some((o) => o.value === data.default_filter_preset_id)) {
    defaultSelect.value = data.default_filter_preset_id;
  }
  const defaultSortSelect = document.getElementById('default-sort-preset-select');
  if (data.default_sort_preset_id && [...defaultSortSelect.options].some((o) => o.value === data.default_sort_preset_id)) {
    defaultSortSelect.value = data.default_sort_preset_id;
  }
  if (data.preferred_breeds?.length) {
    const selected = new Set(data.preferred_breeds);
    document.querySelectorAll('#breed-checkboxes input[type="checkbox"]').forEach((cb) => {
      cb.checked = selected.has(cb.value);
    });
  }
  // "verpaarung_enabled" fehlt in der Zeile nur, wenn noch nie gespeichert
  // wurde (Spalte ist NOT NULL DEFAULT true) - dann bleibt die Checkbox
  // bei ihrem HTML-Standard (checked).
  if (data.verpaarung_enabled !== undefined && data.verpaarung_enabled !== null) {
    document.getElementById('verpaarung-enabled-checkbox').checked = data.verpaarung_enabled;
  }
  // "page_zoom" ist NULL, solange nie gespeichert wurde - dann bleibt die
  // Auswahl beim App-Standard (80%, siehe --zoom in style.css).
  document.getElementById('page-zoom-select').value = data.page_zoom || 80;

  const tolerances = data.compare_tolerances || {};
  document.getElementById('tolerance-gp').value = tolerances.gp || '';
  document.getElementById('tolerance-ext').value = tolerances.ext || '';
  document.getElementById('tolerance-extpct').value = tolerances.extPercent || '';
  document.getElementById('tolerance-int').value = tolerances.int || '';

  // "profile_nav_sort" ist NULL, solange nie gespeichert wurde - dann
  // bleibt die Auswahl beim HTML-Standard (erste Option, "alphabetisch").
  if (data.profile_nav_sort) document.getElementById('profile-nav-sort-select').value = data.profile_nav_sort;

  // "hidden_notices" enthält die Keys der AUSGEBLENDETEN Hinweise (siehe
  // js/list.js checkAgeNotices) - Checkbox-Standard ist "angezeigt"
  // (checked), deshalb hier nur bei tatsächlich ausgeblendeten Hinweisen
  // abhaken.
  const hidden = new Set(data.hidden_notices || []);
  document.getElementById('notice-foal-stall-checkbox').checked = !hidden.has('foalStall');
  document.getElementById('notice-age3-checkbox').checked = !hidden.has('age3');
  document.getElementById('notice-age25-checkbox').checked = !hidden.has('age25');

  // "dashboard_tiles" leer/fehlend = Standardauswahl (siehe
  // DASHBOARD_TILE_OPTIONS in parser.js) - mergeDashboardTiles ergänzt
  // dabei automatisch neu hinzugekommene Kacheln, die in einer älteren
  // gespeicherten Auswahl noch fehlen. customDashboardTiles muss VOR dem
  // Merge geladen sein, da deren Ids sonst als unbekannt aussortiert würden.
  customDashboardTiles = data.custom_dashboard_tiles || [];
  dashboardTiles = mergeDashboardTiles(data.dashboard_tiles, customDashboardTiles);
  renderDashboardTileList();
}

async function onSave() {
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Speichere…';
  const selected = [...document.querySelectorAll('#breed-checkboxes input[type="checkbox"]:checked')].map((cb) => cb.value);
  const verpaarungEnabled = document.getElementById('verpaarung-enabled-checkbox').checked;
  const pageZoom = Number(document.getElementById('page-zoom-select').value);
  const compareTolerances = {
    gp: Number(document.getElementById('tolerance-gp').value) || 0,
    ext: Number(document.getElementById('tolerance-ext').value) || 0,
    extPercent: Number(document.getElementById('tolerance-extpct').value) || 0,
    int: Number(document.getElementById('tolerance-int').value) || 0,
  };
  const defaultFilterPresetId = document.getElementById('default-filter-preset-select').value || null;
  const defaultSortPresetId = document.getElementById('default-sort-preset-select').value || null;
  const profileNavSort = document.getElementById('profile-nav-sort-select').value || null;
  const hiddenNotices = [
    !document.getElementById('notice-foal-stall-checkbox').checked ? 'foalStall' : null,
    !document.getElementById('notice-age3-checkbox').checked ? 'age3' : null,
    !document.getElementById('notice-age25-checkbox').checked ? 'age25' : null,
  ].filter(Boolean);
  // dashboardTiles (Reihenfolge + Sichtbarkeit) ist bereits aktuell -
  // renderDashboardTileList/wireDashboardTileList halten die Arbeitskopie
  // bei jeder ▲/▼-Verschiebung bzw. jedem Häkchen synchron.
  // Leere Rassen-Auswahl als NULL statt leerem Array speichern - beides
  // bedeutet "keine Einschränkung", NULL ist aber eindeutiger als Zustand
  // "bewusst nichts ausgewählt" vs. "Feld nie gesetzt".
  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({
      user_id: currentUserId,
      preferred_breeds: selected.length ? selected : null,
      verpaarung_enabled: verpaarungEnabled,
      page_zoom: pageZoom,
      compare_tolerances: compareTolerances,
      default_filter_preset_id: defaultFilterPresetId,
      default_sort_preset_id: defaultSortPresetId,
      dashboard_tiles: dashboardTiles,
      profile_nav_sort: profileNavSort,
      custom_dashboard_tiles: customDashboardTiles,
      hidden_notices: hiddenNotices,
    });
  statusEl.textContent = error ? 'Speichern fehlgeschlagen: ' + error.message : 'Gespeichert.';
  // Sofort anwenden, ohne dass die Seite neu geladen werden muss (siehe
  // applyPageZoom in auth.js - dieselbe Logik, die jede geschützte Seite
  // nach requireSession() ausführt).
  if (!error) {
    document.documentElement.style.setProperty('--zoom', pageZoom / 100);
    // Verpaarungs-Log-Menüpunkt im MDR-DB-Dropdown (siehe renderSharedNav
    // in js/nav.js) direkt aktualisieren, ohne die Seite neu laden zu
    // müssen.
    const verpaarungLink = document.getElementById('verpaarung-link');
    if (verpaarungLink) verpaarungLink.hidden = !verpaarungEnabled;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
