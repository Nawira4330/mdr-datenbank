document.addEventListener('DOMContentLoaded', init);

let currentUserId = null;
// Arbeitskopie der Dashboard-Kacheln-Auswahl (Reihenfolge + Sichtbarkeit,
// siehe mergeDashboardTiles/DASHBOARD_TILE_OPTIONS in parser.js) - wird
// per ▲/▼ und Häkchen in renderDashboardTileList direkt verändert und erst
// mit "Speichern" (onSave) übernommen.
let dashboardTiles = [];

async function init() {
  const session = await requireSession();
  if (!session) return;
  await renderSharedNav(session);
  currentUserId = session.user.id;

  await populateBreedCheckboxes();
  // Muss vor loadCurrentSettings laufen, da diese Dropdown-Optionen dort
  // erst gesetzt (ausgewählt) werden.
  await loadFilterPresetsList();
  await loadSortPresetsList();
  dashboardTiles = mergeDashboardTiles(null);
  renderDashboardTileList();
  wireDashboardTileList();
  await loadCurrentSettings();

  document.getElementById('save-settings-btn').addEventListener('click', onSave);
}

// Baut die Dashboard-Kacheln-Liste aus dashboardTiles (Reihenfolge +
// Sichtbarkeit) neu auf - bei jeder ▲/▼-Verschiebung sowie initial nach
// dem Laden der gespeicherten Auswahl.
function renderDashboardTileList() {
  const container = document.getElementById('dashboard-tile-list');
  container.innerHTML = dashboardTiles.map((t, i) => {
    const opt = DASHBOARD_TILE_OPTIONS.find((o) => o.id === t.id);
    if (!opt) return '';
    return `
      <div class="dashboard-tile-row">
        <div class="dashboard-tile-move">
          <button type="button" class="icon-btn" data-tile-up="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben">▲</button>
          <button type="button" class="icon-btn" data-tile-down="${i}" ${i === dashboardTiles.length - 1 ? 'disabled' : ''} title="Nach unten">▼</button>
        </div>
        <label>
          <input type="checkbox" data-tile-visible="${i}" style="width: auto;" ${t.visible ? 'checked' : ''} />
          ${escapeHtml(opt.label)}
        </label>
      </div>`;
  }).join('');
}

function wireDashboardTileList() {
  document.getElementById('dashboard-tile-list').addEventListener('click', (e) => {
    const upBtn = e.target.closest('[data-tile-up]');
    const downBtn = e.target.closest('[data-tile-down]');
    if (upBtn) {
      const i = Number(upBtn.dataset.tileUp);
      [dashboardTiles[i - 1], dashboardTiles[i]] = [dashboardTiles[i], dashboardTiles[i - 1]];
      renderDashboardTileList();
    } else if (downBtn) {
      const i = Number(downBtn.dataset.tileDown);
      [dashboardTiles[i], dashboardTiles[i + 1]] = [dashboardTiles[i + 1], dashboardTiles[i]];
      renderDashboardTileList();
    }
  });
  document.getElementById('dashboard-tile-list').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-tile-visible]');
    if (!cb) return;
    dashboardTiles[Number(cb.dataset.tileVisible)].visible = cb.checked;
  });
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
  if (!confirm('Diese Filter-Vorlage wirklich löschen?')) return;
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
  if (!confirm('Diese Sortierung wirklich löschen?')) return;
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
  const { data, error } = await supabaseClient.from('horses').select('breed');
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
    .select('preferred_breeds, verpaarung_enabled, page_zoom, compare_tolerances, default_filter_preset_id, default_sort_preset_id, dashboard_tiles')
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

  // "dashboard_tiles" leer/fehlend = Standardauswahl (siehe
  // DASHBOARD_TILE_OPTIONS in parser.js) - mergeDashboardTiles ergänzt
  // dabei automatisch neu hinzugekommene Kacheln, die in einer älteren
  // gespeicherten Auswahl noch fehlen.
  dashboardTiles = mergeDashboardTiles(data.dashboard_tiles);
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
