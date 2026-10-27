// Ausgewählte Pferde teilen/kopieren (Übersicht, Mehrfachauswahl -> "Teilen / Kopieren").
// Nutzerwunsch 2026-10-27: Pferde als Kacheln (wie die Karten des Discord-Bots)
// weitergeben und nur die relevanten Daten gesammelt kopieren können.
//
// - Text (Discord-Formatierung) und Tabelle (Excel, Tab-getrennt) mit frei
//   wählbaren Feldern, die Auswahl wird im Browser gemerkt.
// - Kacheln als Bild (Canvas, ein Bild für alle Pferde): kopieren, speichern,
//   per Teilen-Dialog (Bild + Text mit Spiel-Links in einem Zug, wo der Browser
//   das kann, z.B. Handy -> WhatsApp) oder als Bildlink (Bild wird kurz im
//   Bucket "horse-images" unter shares/ abgelegt, Link in Discord/WhatsApp ->
//   Bild erscheint; Links zu den Pferden stehen als Text darunter). In ein Bild
//   lässt sich kein klickbarer Link einbetten - deshalb gehört der Text mit den
//   Spiel-Links immer dazu.
// Eine echte Link-Vorschau-Kachel (Titel/Beschreibung) bräuchte einen Server, der
// HTML mit Open-Graph-Tags liefert; GitHub Pages ist statisch und Supabase Edge
// Functions liefern kein HTML aus (GET wird auf text/plain umgestellt).
//
// Die reinen Funktionen (shareText/shareTsv/shareLinks/shareCardModel) sind
// DOM-unabhängig und in tests/share.test.js getestet.

const SHARE_FIELDS = [
  { key: 'image', label: 'Bild' },
  { key: 'breed', label: 'Rasse' },
  { key: 'gender', label: 'Geschlecht' },
  { key: 'age', label: 'Alter' },
  { key: 'color', label: 'Farbe' },
  { key: 'genes', label: 'Farbgenetik' },
  { key: 'gp', label: 'GP' },
  { key: 'ext', label: 'Ext' },
  { key: 'extPct', label: 'Ext%' },
  { key: 'int', label: 'Int' },
  { key: 'zzl', label: 'ZZL' },
  { key: 'hlp', label: 'HLP/SLP' },
  { key: 'ekh', label: 'EKH' },
  { key: 'parents', label: 'Eltern' },
  { key: 'owner', label: 'Besitzer' },
  { key: 'tags', label: 'Schlagwörter' },
  { key: 'link', label: 'Spiel-Link' },
];
const SHARE_DEFAULT_KEYS = ['image', 'breed', 'gender', 'age', 'color', 'genes', 'gp', 'ext', 'extPct', 'int', 'zzl', 'owner', 'link'];
// v2: "Spiel-Link" ist jetzt eine eigene Angabe (Standard an)
const SHARE_PREF_KEY = 'mdr_share_fields_v2';
const SHARE_DISCORD_LIMIT = 2000;
const SHARE_LINK_MAX_AGE_DAYS = 14;

// --- Reine Funktionen -------------------------------------------------------

function shareHas(keys, key) {
  return keys.includes(key);
}

// Gemeinsames Modell für Text und Kachel: Titel, Untertitel (Rasse, Geschlecht,
// Alter), Zeilen (Farbe/Eltern/Besitzer/...), Kennzahlen-Zeile (GP | Ext | ...).
function shareCardModel(view, keys) {
  const sub = ['breed', 'gender', 'age'].filter((k) => shareHas(keys, k)).map((k) => view[k]).filter(Boolean).join(', ');

  const rows = [];
  if ((shareHas(keys, 'color') && view.color) || (shareHas(keys, 'genes') && view.genes)) {
    rows.push({
      label: 'Farbe',
      value: shareHas(keys, 'color') ? view.color || '' : '',
      code: shareHas(keys, 'genes') ? view.genes || '' : '',
    });
  }

  const stats = [];
  if (shareHas(keys, 'gp') && view.gp) stats.push(`GP ${view.gp}`);
  if (shareHas(keys, 'ext') && view.ext) {
    stats.push(`Ext ${view.ext}${shareHas(keys, 'extPct') && view.extPct ? ` (${view.extPct})` : ''}`);
  } else if (shareHas(keys, 'extPct') && view.extPct) {
    stats.push(`Ext% ${view.extPct}`);
  }
  if (shareHas(keys, 'int') && view.int) stats.push(`Int ${view.int}`);
  if (shareHas(keys, 'zzl') && view.zzl) stats.push(`ZZL ${view.zzl}`);
  if (shareHas(keys, 'hlp') && view.hlp) stats.push(`HLP/SLP ${view.hlp}`);
  if (shareHas(keys, 'ekh') && view.ekh) stats.push(`EKH ${view.ekh}`);

  if (shareHas(keys, 'parents') && view.parents) rows.push({ label: 'Eltern', value: view.parents });
  if (shareHas(keys, 'owner') && view.owner) rows.push({ label: 'Besitzer', value: view.owner });
  if (shareHas(keys, 'tags') && view.tags) rows.push({ label: 'Schlagwörter', value: view.tags });

  return { title: view.name, sub, rows, stats, link: shareHas(keys, 'link') ? view.link || '' : '' };
}

// Discord-Formatierung (**fett**, `Code`); der Spiel-Link steht drin, wenn "link" gewählt ist.
function shareText(views, keys) {
  return views.map((view) => {
    const m = shareCardModel(view, keys);
    const lines = [m.sub ? `**${m.title}** – ${m.sub}` : `**${m.title}**`];
    const colorRow = m.rows.find((r) => r.label === 'Farbe');
    if (colorRow) lines.push(`Farbe: ${[colorRow.value, colorRow.code ? `\`${colorRow.code}\`` : ''].filter(Boolean).join(' ')}`);
    if (m.stats.length) lines.push(m.stats.join(' | '));
    for (const r of m.rows) if (r.label !== 'Farbe') lines.push(`${r.label}: ${r.value}`);
    if (m.link) lines.push(m.link);
    return lines.join('\n');
  }).join('\n\n');
}

// Tab-getrennt (Excel/Google Sheets): Kopfzeile + eine Zeile je Pferd.
function shareTsv(views, keys) {
  const cols = SHARE_FIELDS.filter((f) => f.key !== 'image' && shareHas(keys, f.key));
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const header = ['Name', ...cols.map((c) => c.label)];
  const rows = views.map((v) => [v.name, ...cols.map((c) => v[c.key] ?? '')]);
  return [header, ...rows].map((r) => r.map(clean).join('\t')).join('\n');
}

// "Name: Link" je Pferd mit Spiel-Link - gehört zu Bild/Bildlink dazu, weil ein
// Bild selbst keinen klickbaren Link enthalten kann.
function shareLinks(views) {
  return views.filter((v) => v.link).map((v) => `${v.name}: ${v.link}`).join('\n');
}

// Zeilenumbruch für die Kachel (Messfunktion wird übergeben, damit das ohne
// Canvas testbar bleibt).
function shareWrapText(text, maxWidth, measure) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Browser: Datenaufbereitung -----------------------------------------------

function shareViewOf(h) {
  const d = computeDerived(h);
  const affected = affectedDiseaseLabels(h);
  const fmt = (n) => deDecimal(Number(n).toFixed(2));
  const parentNames = [
    h.pedigree_father?.name ? `Vater ${h.pedigree_father.name}` : '',
    h.pedigree_mother?.name ? `Mutter ${h.pedigree_mother.name}` : '',
  ].filter(Boolean).join(' | ');
  return {
    name: h.name || '(ohne Name)',
    imageUrl: h.image_url || '',
    breed: normalizeBreed(h.breed) || 'Rasselos',
    gender: h.gender || '',
    age: h.birthdate ? formatAge(h.birthdate) : '',
    color: h.coat_color || '',
    genes: d.presentGenes || '',
    gp: d.gp != null ? String(d.gp) : '',
    ext: d.extAvg != null ? fmt(d.extAvg) : '',
    extPct: d.extPercent != null ? `${deDecimal(d.extPercent)}%` : '',
    int: d.intAvg != null ? fmt(d.intAvg) : '',
    zzl: zzlDisplay(h.breeding_allowed),
    hlp: hlpSlpDisplay(h.hlp_slp),
    // Ohne Erbkrankheiten ausdruecklich "keine" (leer wuerde die Angabe verschwinden lassen)
    ekh: affected.length ? affected.join(', ') : 'keine',
    parents: parentNames,
    owner: h.owner || '',
    tags: (h.tags || []).map((t) => (t.note ? `${t.label}: ${t.note}` : t.label)).join(', '),
    link: h.external_id
      ? `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(h.external_id)}`
      : '',
  };
}

// --- Browser: Kachel-Bild (Canvas) -----------------------------------------------

const SHARE_CARD = {
  width: 760, pad: 16, gap: 14, imgW: 200, imgH: 150, radius: 12,
  fontStack: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
  colors: { bg: '#cfe9fb', card: '#ffffff', border: '#d8d8d8', text: '#4a4a4a', muted: '#7a7a7a', accent: '#6b9d00', imgBg: '#f1f6e6', code: '#2f5d00', link: '#2f7fd1' },
};

function shareRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Lädt ein Bild für den Canvas. Nur Bilder mit CORS-Freigabe (eigener Speicher)
// dürfen hineingezeichnet werden; Spiel-Bilder scheitern hier und fehlen dann.
function shareLoadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

// Zeichnet alle Pferde untereinander in EIN Bild. Rückgabe: { canvas, missingImages, truncated }.
async function renderShareSheet(views, keys) {
  const C = SHARE_CARD;
  const withImage = shareHas(keys, 'image');
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* egal */ } }
  const images = withImage ? await Promise.all(views.map((v) => shareLoadImage(v.imageUrl))) : [];
  const missingImages = withImage ? views.filter((v, i) => v.imageUrl && !images[i]).length : 0;

  const probe = document.createElement('canvas').getContext('2d');
  const font = (size, weight = 400) => `${weight} ${size}px ${C.fontStack}`;
  // Abstand des Textes vom linken Kartenrand; Karten sind C.width - 2*C.gap breit
  const textOffset = C.pad + (withImage ? C.imgW + C.pad : 0);
  const textW = C.width - C.gap * 2 - textOffset - C.pad;

  // 1. Messen: je Pferd eine Liste von Zeilen {text, font, color, h}
  const cards = views.map((view, i) => {
    const m = shareCardModel(view, keys);
    const lines = [];
    const add = (text, size, weight, color, gapAfter = 4, mono = false) => {
      probe.font = mono ? `${weight} ${size}px ui-monospace, Consolas, monospace` : font(size, weight);
      for (const t of shareWrapText(text, textW, (s) => probe.measureText(s).width)) {
        lines.push({ text: t, font: probe.font, color, h: size * 1.25 });
      }
      lines[lines.length - 1].h += gapAfter;
    };
    add(m.title, 21, 700, C.colors.text, 2);
    if (m.sub) add(m.sub, 15, 400, C.colors.muted, 8);
    const colorRow = m.rows.find((r) => r.label === 'Farbe');
    if (colorRow) {
      if (colorRow.value) add(`Farbe: ${colorRow.value}`, 15, 400, C.colors.text, colorRow.code ? 0 : 5);
      if (colorRow.code) add(colorRow.code, 15, 600, C.colors.code, 5, true);
    }
    if (m.stats.length) add(m.stats.join('  |  '), 15, 700, C.colors.accent, 5);
    for (const r of m.rows) if (r.label !== 'Farbe') add(`${r.label}: ${r.value}`, 14, 400, C.colors.text, 3);
    // Ein Bild kann keinen klickbaren Link enthalten - der Link steht deshalb
    // sichtbar in der Kachel (zum Abtippen/Scannen) UND wird beim Kopieren,
    // Teilen und im Bildlink als Text mitgegeben.
    if (m.link) add(m.link, 12, 400, C.colors.link, 3);
    const textH = lines.reduce((s, l) => s + l.h, 0);
    const height = Math.max(textH, withImage ? C.imgH : 0) + C.pad * 2;
    return { lines, height, image: images[i] || null };
  });

  // 2. Zeichnen (Skalierung 2x für scharfe Darstellung, bei sehr langen Blättern 1x)
  let totalH = C.gap + cards.reduce((s, c) => s + c.height + C.gap, 0);
  const scale = totalH > 6000 ? 1 : 2;
  const maxCanvasH = 16000 / scale;
  let truncated = 0;
  while (totalH > maxCanvasH && cards.length > 1) {
    totalH -= cards.pop().height + C.gap;
    truncated += 1;
  }

  const canvas = document.createElement('canvas');
  canvas.width = C.width * scale;
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.colors.bg;
  ctx.fillRect(0, 0, C.width, totalH);

  let y = C.gap;
  for (const card of cards) {
    const x0 = C.gap;
    const w = C.width - C.gap * 2;
    ctx.fillStyle = C.colors.card;
    ctx.strokeStyle = C.colors.border;
    ctx.lineWidth = 1;
    shareRoundRect(ctx, x0, y, w, card.height, C.radius);
    ctx.fill();
    ctx.stroke();

    if (withImage) {
      const bx = x0 + C.pad;
      const by = y + C.pad;
      ctx.fillStyle = C.colors.imgBg;
      shareRoundRect(ctx, bx, by, C.imgW, C.imgH, 8);
      ctx.fill();
      if (card.image) {
        const s = Math.min(C.imgW / card.image.width, C.imgH / card.image.height);
        const dw = card.image.width * s;
        const dh = card.image.height * s;
        ctx.drawImage(card.image, bx + (C.imgW - dw) / 2, by + (C.imgH - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = C.colors.muted;
        ctx.font = font(13);
        ctx.textAlign = 'center';
        ctx.fillText('kein Bild', bx + C.imgW / 2, by + C.imgH / 2 + 4);
        ctx.textAlign = 'left';
      }
    }

    let ty = y + C.pad;
    ctx.textBaseline = 'top';
    for (const line of card.lines) {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, x0 + textOffset, ty);
      ty += line.h;
    }
    ctx.textBaseline = 'alphabetic';
    y += card.height + C.gap;
  }
  return { canvas, missingImages, truncated };
}

function shareCanvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), 'image/png');
  });
}

// --- Browser: Dialog -----------------------------------------------------------

let shareViews = [];
let shareCurrent = null; // { canvas, missingImages, truncated } der aktuellen Vorschau
let shareRenderToken = 0;

function shareLoadKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(SHARE_PREF_KEY));
    if (Array.isArray(stored)) return stored.filter((k) => SHARE_FIELDS.some((f) => f.key === k));
  } catch { /* ohne Speicher: Standard */ }
  return [...SHARE_DEFAULT_KEYS];
}

function shareSelectedKeys() {
  return SHARE_FIELDS.map((f) => f.key).filter((k) => document.querySelector(`#share-field-${k}`)?.checked);
}

function shareSetStatus(message, isError = false) {
  const el = document.querySelector('#share-status');
  el.textContent = message;
  el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

// Link-Zeilen "Name: Link" - nur, wenn "Spiel-Link" angehakt ist.
function shareLinksText() {
  return shareHas(shareSelectedKeys(), 'link') ? shareLinks(shareViews) : '';
}

function shareFullText() {
  return shareText(shareViews, shareSelectedKeys());
}

async function shareCopyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Kopieren wurde vom Browser blockiert');
  }
}

async function shareUpdatePreview() {
  const token = ++shareRenderToken;
  const keys = shareSelectedKeys();
  try { localStorage.setItem(SHARE_PREF_KEY, JSON.stringify(keys)); } catch { /* egal */ }

  const text = shareFullText();
  const countEl = document.querySelector('#share-text-count');
  countEl.textContent = `Text: ${text.length} Zeichen`;
  countEl.style.color = text.length > SHARE_DISCORD_LIMIT ? 'var(--danger)' : 'var(--muted)';
  countEl.title = text.length > SHARE_DISCORD_LIMIT
    ? `Discord erlaubt ${SHARE_DISCORD_LIMIT} Zeichen pro Nachricht - bitte weniger Pferde/Felder oder in mehreren Nachrichten senden.`
    : '';

  shareSetStatus('Bild wird erstellt …');
  const result = await renderShareSheet(shareViews, keys);
  if (token !== shareRenderToken) return; // veraltet (Auswahl wurde zwischenzeitlich geändert)
  shareCurrent = result;
  const holder = document.querySelector('#share-preview');
  holder.innerHTML = '';
  result.canvas.style.width = '100%';
  result.canvas.style.height = 'auto';
  holder.appendChild(result.canvas);
  const notes = [];
  if (result.missingImages) notes.push(`${result.missingImages} Bild${result.missingImages === 1 ? '' : 'er'} nicht eingebettet (liegt noch nicht im eigenen Speicher)`);
  if (result.truncated) notes.push(`nur die ersten ${shareViews.length - result.truncated} Pferde im Bild (Größenlimit)`);
  shareSetStatus(notes.join(' · '));
}

async function shareDo(action) {
  try {
    if (!shareCurrent) { shareSetStatus('Bild ist noch nicht fertig.', true); return; }
    if (action === 'text') {
      await shareCopyToClipboard(shareFullText());
      shareSetStatus('Text kopiert.');
    } else if (action === 'tsv') {
      await shareCopyToClipboard(shareTsv(shareViews, shareSelectedKeys()));
      shareSetStatus('Tabelle kopiert – in Excel/Google Sheets einfügen.');
    } else if (action === 'image') {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        shareSetStatus('Dieser Browser kann keine Bilder kopieren – bitte „Bild speichern“ nutzen.', true);
        return;
      }
      // Bild UND Link-Text in einer Zwischenablage-Eintragung: Programme, die beides
      // annehmen (z.B. WhatsApp Web beim Einfügen), übernehmen den Link mit; die
      // übrigen nehmen das Bild (der Link steht ohnehin sichtbar in der Kachel).
      const links = shareLinksText();
      const item = { 'image/png': shareCanvasBlob(shareCurrent.canvas) };
      if (links) item['text/plain'] = new Blob([links], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem(item)]);
      shareSetStatus(links
        ? 'Bild kopiert (Link steht in der Kachel und liegt als Text mit in der Zwischenablage).'
        : 'Bild kopiert.');
    } else if (action === 'save') {
      const blob = await shareCanvasBlob(shareCurrent.canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pferde_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      shareSetStatus('Bild gespeichert.');
    } else if (action === 'native') {
      const blob = await shareCanvasBlob(shareCurrent.canvas);
      const file = new File([blob], 'pferde.png', { type: 'image/png' });
      const data = { files: [file], title: 'MDR Pferde', text: shareLinksText() };
      if (!navigator.canShare?.(data)) { shareSetStatus('Teilen mit Bild wird von diesem Browser nicht unterstützt.', true); return; }
      await navigator.share(data);
      shareSetStatus('Geteilt.');
    } else if (action === 'link') {
      shareSetStatus('Bildlink wird erstellt …');
      const url = await shareUploadSheet(shareCurrent.canvas);
      const links = shareLinksText();
      await shareCopyToClipboard(links ? `${url}\n${links}` : url);
      shareSetStatus(`Bildlink kopiert (gültig ca. ${SHARE_LINK_MAX_AGE_DAYS} Tage) – in Discord/WhatsApp einfügen.`);
    }
  } catch (e) {
    if (e?.name === 'AbortError') { shareSetStatus('Teilen abgebrochen.'); return; }
    shareSetStatus('Fehlgeschlagen: ' + (e?.message || e), true);
  }
}

// Legt das Bild unter shares/ im Bucket ab und räumt dabei alte Share-Bilder auf
// (Delete-Recht siehe migration_049). Der Dateiname enthält Zufallsanteil, daher
// ist der Link nicht erratbar; cacheControl 1 Jahr (Dateiname wird nie wiederverwendet).
async function shareUploadSheet(canvas) {
  const blob = await shareCanvasBlob(canvas);
  const bucket = supabaseClient.storage.from(HORSE_IMAGE_BUCKET);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const path = `shares/${Date.now()}-${rand}.png`;
  const { error } = await bucket.upload(path, blob, { contentType: 'image/png', cacheControl: '31536000' });
  if (error) throw new Error('Hochladen fehlgeschlagen: ' + error.message);
  try {
    const { data: files } = await bucket.list('shares', { limit: 1000 });
    const cutoff = Date.now() - SHARE_LINK_MAX_AGE_DAYS * 86400000;
    const old = (files || [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map((f) => `shares/${f.name}`);
    if (old.length) await bucket.remove(old);
  } catch (e) {
    console.warn('Alte Share-Bilder konnten nicht aufgeräumt werden:', e);
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

function openShareModal() {
  const rows = lastRenderedRows.filter((r) => selectedIds.has(r.id));
  if (!rows.length) return;
  shareViews = rows.map(shareViewOf);
  const keys = shareLoadKeys();
  document.querySelector('#share-fields').innerHTML = SHARE_FIELDS.map((f) => `
    <label class="share-field"><input type="checkbox" id="share-field-${f.key}" ${keys.includes(f.key) ? 'checked' : ''} /> ${f.label}</label>`).join('');
  document.querySelector('#share-modal-count').textContent =
    `${shareViews.length} Pferd${shareViews.length === 1 ? '' : 'e'} ausgewählt`;
  document.querySelector('#share-native-btn').hidden = !(navigator.canShare && navigator.share);
  document.querySelector('#share-modal').hidden = false;
  shareUpdatePreview();
}

function closeShareModal() {
  document.querySelector('#share-modal').hidden = true;
  shareRenderToken += 1;
  shareCurrent = null;
}

function wireShareModal() {
  const btn = document.querySelector('#bulk-share-btn');
  if (!btn) return;
  btn.addEventListener('click', openShareModal);
  document.querySelector('#share-modal-close').addEventListener('click', closeShareModal);
  document.querySelector('#share-modal').addEventListener('click', (e) => {
    if (e.target.id === 'share-modal') closeShareModal();
  });
  document.querySelector('#share-fields').addEventListener('change', shareUpdatePreview);
  document.querySelectorAll('[data-share-action]').forEach((b) => {
    b.addEventListener('click', () => shareDo(b.dataset.shareAction));
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', wireShareModal);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHARE_FIELDS, SHARE_DEFAULT_KEYS, shareCardModel, shareText, shareTsv, shareLinks, shareWrapText };
}
