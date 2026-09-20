// Einmaliges Nachpflegen der Flaxen-Trägerschaft im GESAMTEN Bestand
// (Verwaltung) - siehe fieldset "Flaxen-Trägerschaft nachpflegen" in
// verwaltung.html.
//
// Hintergrund: Flaxen ist rezessiv - ein sichtbar Flaxen-Elternteil
// (reinerbig, "flfl") gibt garantiert mindestens ein Allel an jedes
// Fohlen weiter. autoInheritFlaxenFromParents in horseForm.js trägt das
// seitdem bei JEDEM künftigen Speichern automatisch nach - dieses Tool
// holt das für den kompletten, bereits vorhandenen Bestand rückwirkend
// nach (einmalig, danach hält der laufende Speicher-Hook alles aktuell).
//
// Prüft AUSSERDEM jedes Pferd auf einen früheren Bugfall (Bugreport
// "Hollow Dusk"): war ein Pferd selbst schon sichtbar Flaxen (flfl,
// eigene Fellfarbe/Notiz) UND hatte zusätzlich einen Flaxen-Elternteil,
// trug die alte Version von autoInheritFlaxenFromParents dort fälschlich
// nur "het" (Träger) nach - das unterdrückte die eigentlich korrekte
// "flfl"-Anzeige (Overrides haben Vorrang vor abgeleiteten Hinweisen).
// Wird hier korrigiert (Override entfernt, die richtige "flfl"-Ableitung
// greift danach wieder automatisch).
//
// Läuft komplett im Browser der Verwaltung (kein eigenes Backend nötig) -
// lädt einmal den gesamten Bestand (Name, Stammbaum, Farbe, Notizen,
// Overrides), baut daraus eine Name->Pferd(e)-Zuordnung für die
// Eltern-Suche und aktualisiert dann jedes betroffene Pferd einzeln.
async function runFlaxenBackfill() {
  const statusEl = document.getElementById('flaxen-backfill-status');
  const logList = document.getElementById('flaxen-backfill-log');
  logList.innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, name, pedigree, colors, coat_color, notes, color_gene_overrides'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  const byName = new Map();
  for (const h of horses) {
    const list = byName.get(h.name) || [];
    list.push(h);
    byName.set(h.name, list);
  }

  function isVisiblyFlaxen(h) {
    const genes = presentGenesSummary(h.colors, h.coat_color, h.notes, h.name, null, h.color_gene_overrides);
    return genes.some((g) => g.locus === 'Flaxen' && g.alleles === 'flfl');
  }

  // Wie isVisiblyFlaxen, aber IGNORIERT Overrides - für den Bugfix-Check
  // unten braucht es die "nackte" Ableitung aus Fellfarbe/Notiz, nicht das
  // (evtl. falsche) manuell/automatisch gesetzte "het".
  function isOwnPhenotypeFlaxen(h) {
    const genes = presentGenesSummary(h.colors, h.coat_color, h.notes, h.name, null, null);
    return genes.some((g) => g.locus === 'Flaxen' && g.alleles === 'flfl');
  }

  function logLine(text) {
    const li = document.createElement('li');
    li.textContent = text;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
  }

  let updatedCount = 0;
  let correctedCount = 0;
  let warningCount = 0;
  let failedCount = 0;

  for (let i = 0; i < horses.length; i++) {
    const horse = horses[i];
    statusEl.textContent = `${i + 1}/${horses.length} geprüft…`;

    const current = horse.color_gene_overrides?.Flaxen;
    const ownFlaxen = isOwnPhenotypeFlaxen(horse);

    if (current === 'het' && ownFlaxen) {
      const { Flaxen, ...rest } = horse.color_gene_overrides || {};
      const { error: fixError } = await supabaseClient.from('horses').update({ color_gene_overrides: rest }).eq('id', horse.id);
      if (fixError) {
        failedCount++;
        logLine(`❌ ${horse.name}: Fehler beim Korrigieren (${fixError.message})`);
      } else {
        correctedCount++;
        horse.color_gene_overrides = rest; // für Eltern-Lookups weiter unten aktuell halten
        logLine(`🔧 ${horse.name}: war fälschlich nur als Träger (fl) markiert, ist aber selbst sichtbar Flaxen (flfl) - korrigiert.`);
      }
      continue;
    }
    if (current === 'absent' && ownFlaxen) {
      warningCount++;
      logLine(`⚠️ ${horse.name}: eigene Fellfarbe/Notiz zeigt Flaxen (flfl), aber als "nicht vorhanden" markiert - Widerspruch, bitte manuell prüfen.`);
      continue;
    }
    if (current === 'het' || current === 'hom') continue; // schon (mind.) Träger bestätigt

    const ancestors = Array.isArray(horse.pedigree) ? horse.pedigree.slice(1) : (horse.pedigree?.ancestors || []);
    const parentNames = [ancestors[0]?.name, ancestors[1]?.name].filter(Boolean);
    if (!parentNames.length) continue;

    const flaxenParentName = parentNames.find((name) => (byName.get(name) || []).some(isVisiblyFlaxen));
    if (!flaxenParentName) continue;

    if (current === 'absent') {
      warningCount++;
      logLine(`⚠️ ${horse.name}: als "Flaxen nicht vorhanden" markiert, müsste laut Elternteil „${flaxenParentName}" aber Träger sein - bitte manuell prüfen.`);
      continue;
    }

    const { error: updateError } = await supabaseClient
      .from('horses')
      .update({ color_gene_overrides: { ...(horse.color_gene_overrides || {}), Flaxen: 'het' } })
      .eq('id', horse.id);
    if (updateError) {
      failedCount++;
      logLine(`❌ ${horse.name}: Fehler beim Speichern (${updateError.message})`);
      continue;
    }
    updatedCount++;
    logLine(`✅ ${horse.name}: als Flaxen-Träger markiert (Elternteil „${flaxenParentName}" ist Flaxen).`);
  }

  statusEl.textContent = `Fertig: ${horses.length} Pferde geprüft, ${updatedCount} als Flaxen-Träger nachgetragen, ${correctedCount} fälschlich als "nur Träger" markierte korrigiert, ${warningCount} Widerspruch/-sprüche gefunden, ${failedCount} fehlgeschlagen.`;
  if (!updatedCount && !correctedCount && !warningCount && !failedCount) {
    logLine('Keine Änderungen nötig - der Bestand ist bereits aktuell.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session || !isAdminSession(session)) return;

  const startBtn = document.getElementById('flaxen-backfill-start-btn');
  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
      await runFlaxenBackfill();
    } finally {
      startBtn.disabled = false;
    }
  });
});
