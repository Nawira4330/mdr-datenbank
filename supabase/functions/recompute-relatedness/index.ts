// Rechnet fuer die Pferdeprofil-Reiter "Zuchtbuch" und "Turnierwerte" die
// dort vorberechnet gespeicherten Werte serverseitig neu (kein Client-
// Egress) - per pg_cron periodisch aufgerufen (siehe
// supabase/migration_040_relatedness_cron.sql, dort auch die manuellen
// Einrichtungsschritte).
//
// 1. relatedness_cache ("Zuchtbuch"): fuer ALLE Pferde neu, wenn
//    mindestens eines als veraltet markiert ist (siehe
//    mark_relatedness_stale-Trigger in
//    supabase/migration_039_profile_relatedness_and_tournament_cache.sql).
//    Portiert 1:1 aus MDR-Planer/js/zuchtbuch.js (parentNames/
//    findRelatives) und MDR-Planer/js/breeding.js (normalizeName/
//    pedigreeAncestorNames/foalPedigreeNodes/findSharedNames).
// 2. computed_tournament_values/computed_lp_result ("Turnierwerte"):
//    NUR fuer Pferde, die das noch gar nicht haben (Nutzerwunsch
//    2026-09-07 - einmaliger Nachtrag fuer den Altbestand, der beim
//    Speichern in horseForm.js hinzugekommene Weg fuer alle KUENFTIG
//    gespeicherten Pferde bleibt unveraendert - die Rohdaten dafuer
//    stehen ja schon in jedem Datensatz, muessen nur einmal
//    uebertragen/berechnet werden). Einmal berechnet, wird hier NICHT
//    erneut ueberschrieben (aendert sich nur durch erneutes Speichern in
//    horseForm.js) - dieser Teil laeuft also von selbst leer, sobald
//    jedes Pferd einmal erfasst ist.
//
// GP/Ext/Ext%/Int- und Turnierwerte-Berechnung 1:1 aus js/parser.js bzw.
// js/tournamentScoring.js DIESES Repos (MDR-Datenbank) - bewusst NICHT
// aus MDR-Planer uebernommen, da dessen TEMPERAMENT_TERM_SCORES
// zusaetzlich "miserabel"=5 kennt, dieses Repo aber nicht - fuer
// Konsistenz mit den woanders auf derselben Profilseite bereits
// angezeigten Werten muss hier exakt dieselbe Tabelle wie in diesem Repo
// gelten.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface HorseRow {
  id: string;
  name: string | null;
  owner: string | null;
  gender: string | null;
  pedigree: unknown;
  tournament_potential: Record<string, unknown> | null;
  exterior_descriptive: { label: string; value: string }[] | null;
  exterior_genetics: { overall?: { percent?: number } } | null;
  temperament: { label: string; value: string }[] | null;
  traits: Record<string, { name: string; potential: number | null }[]> | null;
  disciplines: Record<string, { name: string; potential: number | null }[]> | null;
  genetic_diseases: { label: string; value: string }[] | null;
  computed_tournament_values: unknown;
  relatedness_stale: boolean;
  tags: { label: string; note?: string }[] | null;
}

interface RelatedEntry {
  id: string;
  name: string | null;
  owner: string | null;
  gender: string | null;
  beziehung: string;
  beziehungDetail: string | null;
  otherParent: { label: string; name: string } | null;
  gp: number | null;
  ext: number | null;
  extPct: number | null;
  int: number | null;
  inbreeding: boolean;
  // Nutzerwunsch 2026-09-09 - dieselben Schlagwörter wie sonst überall
  // (Übersicht, Profil), siehe tagsBadgesHtml/HORSE_TAG_OPTIONS in
  // js/parser.js - hier nur roh durchgereicht, das Rendern übernimmt der
  // Client (horseForm.js).
  tags: { label: string; note?: string }[] | null;
}

function normalizeName(name: string | null | undefined): string {
  return String(name || '').trim().toLowerCase();
}

// Siehe pedigreeAncestorNames in MDR-Planer/js/breeding.js - zwei
// vorkommende Pedigree-Formate: altes flaches Array (Index 0 = Pferd
// selbst) oder neues Objekt "{ sections, ancestors }".
function pedigreeAncestorNames(pedigree: unknown): string[] {
  if (Array.isArray(pedigree)) {
    return pedigree.slice(1, 15).map((p: any) => p?.name).filter(Boolean);
  }
  if (pedigree && typeof pedigree === 'object' && Array.isArray((pedigree as any).ancestors)) {
    return (pedigree as any).ancestors.slice(0, 14).map((p: any) => p?.name).filter(Boolean);
  }
  return [];
}

function parentNames(horse: HorseRow): { father: string | null; mother: string | null } {
  const anc = pedigreeAncestorNames(horse.pedigree);
  const father = anc[0] && normalizeName(anc[0]) !== 'unbekannt' ? anc[0] : null;
  const mother = anc[1] && normalizeName(anc[1]) !== 'unbekannt' ? anc[1] : null;
  return { father, mother };
}

const GENERATION_LABELS = ['Kind', 'Enkelkind', 'Urenkelkind', 'Ururenkelkind'];
function generationLabel(n: number): string {
  return GENERATION_LABELS[n - 1] || `Nachkomme (Generation ${n})`;
}

// Siehe foalPedigreeNodes/findSharedNames in MDR-Planer/js/breeding.js -
// baut den sichtbaren Stammbaum EINES HYPOTHETISCHEN FOHLENS aus zwei
// Pferden (Eltern + Großeltern + Urgroßeltern, max. 14 Positionen + die
// beiden Pferde selbst) und prueft auf Namensdopplung - das ist die
// tatsaechliche "wuerde bei Verpaarung Inzucht verursachen"-Pruefung,
// staerker eingegrenzt als "irgendwo im ganzen sichtbaren Stammbaum
// verwandt" (das deckt bereits findRelatives/Beziehung ab).
function wouldCauseInbreeding(a: HorseRow, b: HorseRow): boolean {
  const ancA = pedigreeAncestorNames(a.pedigree);
  const ancB = pedigreeAncestorNames(b.pedigree);
  const pool = [
    a.name, b.name,
    ...ancA.slice(0, 2), ...ancB.slice(0, 2),
    ...ancA.slice(2, 6), ...ancB.slice(2, 6),
  ].filter((n) => n && normalizeName(n) !== 'unbekannt');
  const seen = new Set<string>();
  for (const name of pool) {
    const key = normalizeName(name);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

// --- GP/Ext/Ext%/Int - 1:1 aus js/parser.js dieses Repos. ---
const EXTERIOR_TERM_SCORES: [RegExp, number][] = [
  [/viel zu (klein|groß|tief|hoch|hoh|flach|steil|schmal|breit|eng|kurz|lang|weich|hart)/i, 5],
  [/starker (unterbiss|überbiss|senkrücken|karpfenrücken)/i, 5],
  [/speckhals|hirschhals|zeheneng|zehenweit/i, 5],
  [/zu (klein|groß|tief|hoch|hoh|flach|steil|schmal|breit|eng|kurz|lang|weich|hart)/i, 4],
  [/unterbiss|überbiss|senkrücken|karpfenrücken|schwanenhals|dicker hals|bodeneng|bodenweit/i, 4],
  [/passab/i, 3],
  [/exzellent/i, 1],
  [/\bgut/i, 2],
];
const TEMPERAMENT_TERM_SCORES: [RegExp, number][] = [
  [/exzellent/i, 1],
  [/ordnung/i, 3],
  [/schlecht/i, 4],
  [/\bgut/i, 2],
];
function scoreTerm(text: string | null | undefined, table: [RegExp, number][]): number | null {
  if (!text) return null;
  for (const [re, score] of table) if (re.test(text)) return score;
  return null;
}
function scoreExteriorTerm(text: string | null | undefined) { return scoreTerm(text, EXTERIOR_TERM_SCORES); }
function scoreTemperamentTerm(text: string | null | undefined) { return scoreTerm(text, TEMPERAMENT_TERM_SCORES); }
function averageScore(rows: { value: string }[] | null | undefined, scoreFn: (t: string | null | undefined) => number | null): number | null {
  if (!rows || !rows.length) return null;
  const scores = rows.map((r) => scoreFn(r.value)).filter((s): s is number => s != null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
function computeDerived(h: HorseRow): { gp: number | null; ext: number | null; extPct: number | null; int: number | null } {
  const gpRaw = h.tournament_potential?.['Gesamtpotenzial'];
  return {
    gp: gpRaw != null && gpRaw !== '' ? Number(gpRaw) : null,
    ext: averageScore(h.exterior_descriptive, scoreExteriorTerm),
    extPct: h.exterior_genetics?.overall?.percent ?? null,
    int: averageScore(h.temperament, scoreTemperamentTerm),
  };
}

// Siehe findRelatives in MDR-Planer/js/zuchtbuch.js - identische Logik:
// 1. Voll-/Halbgeschwister ueber exakten Vater-/Mutter-Namensvergleich.
// 2. Nachkommen ueber eine Generationen-BFS (bis 10 Generationen tief)
//    entlang "wer hat dieses Pferd als Vater oder Mutter eingetragen".
// Jeder Treffer bekommt zusaetzlich die eigenen GP/Ext/Ext%/Int-Werte
// (fuer die Farbcodierung gegen das Profil-Pferd im Client) sowie ein
// "inbreeding"-Flag (wouldCauseInbreeding, siehe oben) mit.
function findRelatives(
  horse: HorseRow,
  allHorses: HorseRow[],
  childrenByParentName: Map<string, HorseRow[]>,
): RelatedEntry[] {
  const results: RelatedEntry[] = [];
  const { father, mother } = parentNames(horse);

  const toEntry = (other: HorseRow, beziehung: string, otherParent: RelatedEntry['otherParent']): RelatedEntry => {
    const d = computeDerived(other);
    return {
      id: other.id, name: other.name, owner: other.owner, gender: other.gender, beziehung, beziehungDetail: null, otherParent,
      gp: d.gp, ext: d.ext, extPct: d.extPct, int: d.int,
      inbreeding: wouldCauseInbreeding(horse, other),
      tags: other.tags,
    };
  };

  for (const other of allHorses) {
    if (other.id === horse.id) continue;
    const p = parentNames(other);
    const sameFather = father && p.father && normalizeName(p.father) === normalizeName(father);
    const sameMother = mother && p.mother && normalizeName(p.mother) === normalizeName(mother);
    if (sameFather && sameMother) {
      results.push(toEntry(other, 'Vollgeschwister', null));
    } else if (sameFather) {
      results.push(toEntry(other, 'Halbgeschwister (Vater)', p.mother ? { label: 'Mutter', name: p.mother } : null));
    } else if (sameMother) {
      results.push(toEntry(other, 'Halbgeschwister (Mutter)', p.father ? { label: 'Vater', name: p.father } : null));
    }
  }

  let frontier: HorseRow[] = [horse];
  const visited = new Set<string>([horse.id]);
  for (let generation = 1; generation <= 10 && frontier.length; generation++) {
    const next: HorseRow[] = [];
    for (const parent of frontier) {
      const children = childrenByParentName.get(normalizeName(parent.name)) || [];
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        let otherParent: RelatedEntry['otherParent'] = null;
        if (generation === 1) {
          const cp = parentNames(child);
          const isFather = !!(cp.father && normalizeName(cp.father) === normalizeName(parent.name));
          const otherName = isFather ? cp.mother : cp.father;
          if (otherName) otherParent = { label: isFather ? 'Mutter' : 'Vater', name: otherName };
        }
        results.push(toEntry(child, generationLabel(generation), otherParent));
        next.push(child);
      }
    }
    frontier = next;
  }

  return results;
}

// Siehe pedigreeNamePool in MDR-Planer/js/breeding.js - der VOLLSTAENDIGE
// Namenspool eines Pferds: es selbst + seine 14 sichtbaren Vorfahren, je
// mit Positions-Label.
interface PoolEntry { name: string; position: string; }
function pedigreeNamePool(horse: HorseRow): PoolEntry[] {
  if (!horse?.name) return [];
  const pool: PoolEntry[] = [{ name: horse.name, position: 'Pferd selbst' }];
  pedigreeAncestorNames(horse.pedigree).forEach((name, i) => {
    if (!name || normalizeName(name) === 'unbekannt') return;
    pool.push({ name, position: i < 2 ? 'Elternteil' : i < 6 ? 'Großeltern' : 'Urgroßeltern' });
  });
  return pool;
}

function extendedRelationDetail(name: string, positionOwn: string, positionOther: string): string {
  if (positionOther === 'Pferd selbst') {
    return `${positionOwn} dieses Pferds, selbst in der Datenbank: ${name}`;
  }
  return `Gemeinsamer Vorfahre: ${name} – bei diesem Pferd: ${positionOwn}, beim gefundenen Pferd: ${positionOther}`;
}

// Siehe findExtendedRelatives in MDR-Planer/js/zuchtbuch.js - "entfernte
// Verwandtschaft" (Nutzerwunsch 2026-09-08: soll bei "Alle Verwandtschaft"
// mit auftauchen, nicht nur die enge Verwandtschaft aus findRelatives
// oben): jedes Pferd, das IRGENDEINEN Namen mit dem sichtbaren
// 14-Vorfahren-Pool DIESES Pferds teilt (z.B. gemeinsamer Urgroßvater,
// Cousin/Cousine ueber Ecken) - unabhaengig von einer direkten Eltern-
// Kind-Beziehung, die deckt findRelatives bereits vollstaendig ab.
// "excludeIds" verhindert Dopplungen: das Pferd selbst, seine eigenen
// Eltern (falls als eigene Datensaetze vorhanden) und alles, was
// findRelatives bereits gefunden hat.
//
// PERFORMANCE: das MDR-Planer-Original prueft dafuer pro Pferd JEDES
// andere Pferd einzeln (voller Namenspool-Abgleich) - bei ~1200 Pferden
// waere das ~1200*1200*15 Vergleiche und hat die Edge Function mit
// WORKER_RESOURCE_LIMIT abstuerzen lassen. Stattdessen hier ein einmalig
// vorberechneter, umgekehrter Namensindex (name -> welche Pferde haben
// diesen Namen wo in ihrem Pool): so werden nur noch echte
// Namensueberschneidungen angeschaut, nicht mehr alle Paare - liefert
// exakt dieselben Treffer (fuer jedes gefundene Pferd wird weiterhin
// dessen EIGENER Pool in dessen EIGENER Reihenfolge nach dem ersten
// Treffer durchsucht, identisch zum Original), nur ohne die volle
// Doppelschleife ueber alle Pferde.
function findExtendedRelatives(
  horse: HorseRow,
  excludeIds: Set<string>,
  poolByHorseId: Map<string, PoolEntry[]>,
  ownPositionByNameById: Map<string, Map<string, string>>,
  nameToCandidateIds: Map<string, Set<string>>,
  horseById: Map<string, HorseRow>,
): RelatedEntry[] {
  const ownPositionByName = ownPositionByNameById.get(horse.id);
  if (!ownPositionByName) return [];

  const candidateIds = new Set<string>();
  for (const key of ownPositionByName.keys()) {
    const ids = nameToCandidateIds.get(key);
    if (!ids) continue;
    for (const id of ids) candidateIds.add(id);
  }

  const results: RelatedEntry[] = [];
  for (const candidateId of candidateIds) {
    if (candidateId === horse.id || excludeIds.has(candidateId)) continue;
    const other = horseById.get(candidateId);
    const otherPool = poolByHorseId.get(candidateId);
    if (!other || !otherPool) continue;
    for (const entry of otherPool) {
      const positionOwn = ownPositionByName.get(normalizeName(entry.name));
      if (positionOwn) {
        const d = computeDerived(other);
        results.push({
          id: other.id, name: other.name, owner: other.owner, gender: other.gender,
          beziehung: 'Weitere Verwandtschaft',
          beziehungDetail: extendedRelationDetail(entry.name, positionOwn, entry.position),
          otherParent: null,
          gp: d.gp, ext: d.ext, extPct: d.extPct, int: d.int,
          inbreeding: wouldCauseInbreeding(horse, other),
          tags: other.tags,
        });
        break;
      }
    }
  }
  return results;
}

// --- Turnierwerte + LP-Prognose - 1:1 aus js/tournamentScoring.js
// dieses Repos (MDR-Datenbank). ---
const DISCIPLINE_REQUIREMENTS: Record<string, { grundlagen: string[]; interieur: string[] }> = {
  'Dressur': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Kraft', 'Präzision', 'Ausdruck'], interieur: ['Gelehrigkeit', 'Aufmerksamkeit', 'Intelligenz'] },
  'Springen': { grundlagen: ['Galopp', 'Beschleunigung', 'Wendigkeit', 'Kondition', 'Kraft', 'Tempo'], interieur: ['Furchtlosigkeit', 'Leistungsbereitschaft', 'Temperament'] },
  'Cross Country': { grundlagen: ['Galopp', 'Beschleunigung', 'Wendigkeit', 'Kondition', 'Kraft', 'Tempo'], interieur: ['Nervenstärke', 'Aufmerksamkeit', 'Leistungsbereitschaft'] },
  'Distanz': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Kondition', 'Tempo', 'Gelassenheit'], interieur: ['Gutmütigkeit', 'Nervenstärke', 'Temperament'] },
  'Flachrennen': { grundlagen: ['Renngalopp', 'Beschleunigung', 'Kondition', 'Tempo', 'Kraft', 'Gelassenheit'], interieur: ['Siegeswille', 'Leistungsbereitschaft', 'Temperament'] },
  'Hindernisrennen': { grundlagen: ['Renngalopp', 'Beschleunigung', 'Kondition', 'Tempo', 'Kraft', 'Gelassenheit'], interieur: ['Siegeswille', 'Nervenstärke', 'Aufmerksamkeit'] },
  'Seejagdrennen': { grundlagen: ['Renngalopp', 'Beschleunigung', 'Kondition', 'Tempo', 'Kraft', 'Gelassenheit'], interieur: ['Siegeswille', 'Nervenstärke', 'Furchtlosigkeit'] },
  'Trabrennen': { grundlagen: ['Trab', 'Beschleunigung', 'Kondition', 'Tempo', 'Kraft', 'Gelassenheit'], interieur: ['Temperament', 'Siegeswille', 'Leistungsbereitschaft'] },
  'Reining': { grundlagen: ['Schritt', 'Galopp', 'Beschleunigung', 'Wendigkeit', 'Kondition', 'Präzision'], interieur: ['Temperament', 'Leistungsbereitschaft', 'Intelligenz'] },
  'Trail': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Wendigkeit', 'Präzision', 'Gelassenheit'], interieur: ['Aufmerksamkeit', 'Gelehrigkeit', 'Intelligenz'] },
  'Pleasure': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Ausdruck', 'Präzision', 'Gelassenheit'], interieur: ['Sozialverhalten', 'Gutmütigkeit', 'Gelehrigkeit'] },
  'Horsemanship': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Ausdruck', 'Präzision', 'Gelassenheit'], interieur: ['Gutmütigkeit', 'Gelehrigkeit', 'Intelligenz'] },
  'Cutting': { grundlagen: ['Galopp', 'Beschleunigung', 'Wendigkeit', 'Kraft', 'Tempo', 'Gelassenheit'], interieur: ['Furchtlosigkeit', 'Nervenstärke', 'Intelligenz'] },
  'Roping': { grundlagen: ['Galopp', 'Beschleunigung', 'Präzision', 'Kraft', 'Tempo', 'Gelassenheit'], interieur: ['Aufmerksamkeit', 'Furchtlosigkeit', 'Nervenstärke'] },
  'Pole Bending': { grundlagen: ['Galopp', 'Beschleunigung', 'Wendigkeit', 'Präzision', 'Kraft', 'Tempo'], interieur: ['Leistungsbereitschaft', 'Siegeswille', 'Temperament'] },
  'Barrel Racing': { grundlagen: ['Galopp', 'Beschleunigung', 'Wendigkeit', 'Präzision', 'Kraft', 'Tempo'], interieur: ['Leistungsbereitschaft', 'Siegeswille', 'Temperament'] },
  'Dressurfahren': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Wendigkeit', 'Präzision', 'Ausdruck'], interieur: ['Sozialverhalten', 'Gelehrigkeit', 'Intelligenz'] },
  'Hindernisfahren': { grundlagen: ['Galopp', 'Tempo', 'Wendigkeit', 'Präzision', 'Kondition', 'Kraft'], interieur: ['Sozialverhalten', 'Aufmerksamkeit', 'Furchtlosigkeit'] },
  'Geländefahren': { grundlagen: ['Galopp', 'Tempo', 'Wendigkeit', 'Kondition', 'Kraft', 'Gelassenheit'], interieur: ['Sozialverhalten', 'Nervenstärke', 'Furchtlosigkeit'] },
  'Holzrücken': { grundlagen: ['Schritt', 'Kraft', 'Kondition', 'Wendigkeit', 'Ausdruck', 'Gelassenheit'], interieur: ['Nervenstärke', 'Furchtlosigkeit', 'Gutmütigkeit'] },
  'Klassische Dressur': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Kraft', 'Präzision', 'Ausdruck'], interieur: ['Gelehrigkeit', 'Aufmerksamkeit', 'Intelligenz'] },
  'Spanische Gänge': { grundlagen: ['Schritt', 'Trab', 'Wendigkeit', 'Präzision', 'Ausdruck', 'Gelassenheit'], interieur: ['Gutmütigkeit', 'Aufmerksamkeit', 'Intelligenz'] },
  'Schulsprünge': { grundlagen: ['Kraft', 'Präzision', 'Ausdruck', 'Kondition', 'Wendigkeit', 'Gelassenheit'], interieur: ['Temperament', 'Leistungsbereitschaft', 'Nervenstärke'] },
  'Hohe Schule': { grundlagen: ['Schritt', 'Trab', 'Galopp', 'Kraft', 'Präzision', 'Ausdruck'], interieur: ['Gelehrigkeit', 'Leistungsbereitschaft', 'Intelligenz'] },
  'Tölt-Prüfung': { grundlagen: ['Tölt', 'Kraft', 'Präzision', 'Ausdruck', 'Kondition', 'Gelassenheit'], interieur: ['Gutmütigkeit', 'Sozialverhalten', 'Aufmerksamkeit'] },
  'Passrennen': { grundlagen: ['Pass', 'Beschleunigung', 'Kondition', 'Tempo', 'Kraft', 'Gelassenheit'], interieur: ['Sozialverhalten', 'Siegeswille', 'Temperament'] },
  'Foxtrott Pleasure': { grundlagen: ['Foxtrott', 'Ausdruck', 'Präzision', 'Kondition', 'Wendigkeit', 'Gelassenheit'], interieur: ['Gutmütigkeit', 'Sozialverhalten', 'Gelehrigkeit'] },
  'Racking': { grundlagen: ['Rack', 'Tempo', 'Ausdruck', 'Präzision', 'Kondition', 'Beschleunigung'], interieur: ['Gutmütigkeit', 'Sozialverhalten', 'Gelehrigkeit'] },
};

function lkFromPercent(pct: number | null | undefined): number | null {
  if (pct == null || Number.isNaN(pct)) return null;
  const bucket = Math.min(9, Math.max(0, Math.floor(pct / 10)));
  return 10 - bucket;
}

function flattenTraitPotentials(traits: HorseRow['traits']): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const entries of Object.values(traits || {})) {
    for (const e of entries) map[e.name] = e.potential;
  }
  return map;
}

function temperamentScoreMap(temperament: HorseRow['temperament']): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of temperament || []) {
    const score = scoreTemperamentTerm(row.value);
    if (score != null) map[row.label] = score;
  }
  return map;
}

function computeTournamentValues(profile: HorseRow) {
  if (!profile) return [];
  const traitMap = flattenTraitPotentials(profile.traits);
  const tempMap = temperamentScoreMap(profile.temperament);

  const results: { category: string; name: string; wert: number | null; interieur: number | null; lk: number | null; complete: boolean }[] = [];
  for (const [category, entries] of Object.entries(profile.disciplines || {})) {
    for (const entry of entries) {
      const req = DISCIPLINE_REQUIREMENTS[entry.name];
      const disziplinPotential = entry.potential;

      let wert: number | null = null;
      let lk: number | null = null;
      let complete = false;
      if (req) {
        const grundlagenValues = req.grundlagen.map((n) => traitMap[n]);
        complete = disziplinPotential != null && grundlagenValues.every((v) => v != null && !Number.isNaN(v));
        if (complete) {
          wert = 3 * (disziplinPotential as number) + (grundlagenValues as number[]).reduce((a, b) => a + b, 0);
          lk = lkFromPercent(Math.min(disziplinPotential as number, ...(grundlagenValues as number[])));
        }
      }

      let interieur: number | null = null;
      if (req) {
        const scores = req.interieur.map((n) => tempMap[n]).filter((v) => v != null);
        if (scores.length) interieur = scores.reduce((a, b) => a + b, 0) / scores.length;
      }

      results.push({ category, name: entry.name, wert, interieur, lk, complete });
    }
  }
  return results;
}

function isDiseaseAusgepraegt(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return false;
  return parts[0] !== 'NN' && parts[0] === parts[1];
}

function findDisciplineCategory(disciplines: HorseRow['disciplines'], name: unknown): string | null {
  if (!disciplines || !name) return null;
  for (const [category, entries] of Object.entries(disciplines)) {
    if (entries.some((e) => e.name === name)) return category;
  }
  return null;
}

const LP_RELEVANT_GANGARTEN = ['Schritt', 'Trab', 'Galopp', 'Renngalopp'];

function checkLP(profile: HorseRow) {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!profile) return { possible: null, reasons, warnings: ['Kein Pferd ausgewählt.'] };

  if (profile.genetic_diseases && profile.genetic_diseases.length) {
    const affected = profile.genetic_diseases.filter((d) => isDiseaseAusgepraegt(d.value));
    if (affected.length) {
      reasons.push(`Ausgeprägte Erbkrankheit(en): ${affected.map((d) => d.label).join(', ')} (Träger sind erlaubt, homozygot betroffen nicht)`);
    }
  } else {
    warnings.push('Erbkrankheiten: keine Daten vorhanden, Kriterium nicht geprüft.');
  }

  if (profile.temperament && profile.temperament.length) {
    const scored = profile.temperament
      .map((r) => ({ label: r.label, score: scoreTemperamentTerm(r.value) }))
      .filter((r): r is { label: string; score: number } => r.score != null);
    const miserabel = scored.filter((r) => r.score === 5);
    const schlecht = scored.filter((r) => r.score === 4);
    const gutPlus = scored.filter((r) => r.score <= 2);
    if (miserabel.length) reasons.push(`Interieur: miserabler Wert vorhanden (${miserabel.map((r) => r.label).join(', ')})`);
    if (schlecht.length > 2) reasons.push(`Interieur: ${schlecht.length} schlechte Werte, max. 2 erlaubt (${schlecht.map((r) => r.label).join(', ')})`);
    if (gutPlus.length < 5) reasons.push(`Interieur: nur ${gutPlus.length}x gut/exzellent, mind. 5 nötig`);
  } else {
    warnings.push('Interieur: keine Daten vorhanden, Kriterium nicht geprüft.');
  }

  if (profile.exterior_descriptive && profile.exterior_descriptive.length) {
    const scored = profile.exterior_descriptive
      .map((r) => ({ label: r.label, score: scoreExteriorTerm(r.value) }))
      .filter((r): r is { label: string; score: number } => r.score != null);
    const sehrSchlecht = scored.filter((r) => r.score === 5);
    const gelbGruen = scored.filter((r) => r.score <= 3);
    const gruen = scored.filter((r) => r.score <= 2);
    if (sehrSchlecht.length > 2) reasons.push(`Exterieur: ${sehrSchlecht.length} sehr schlechte Werte, max. 2 erlaubt (${sehrSchlecht.map((r) => r.label).join(', ')})`);
    if (gelbGruen.length < 5) reasons.push(`Exterieur: nur ${gelbGruen.length}x gelb/grün, mind. 5 nötig`);
    if (gruen.length < 1) reasons.push('Exterieur: kein grüner Wert vorhanden, mind. 1 nötig');
  } else {
    warnings.push('Exterieur: keine Daten vorhanden, Kriterium nicht geprüft.');
  }

  const begabung = profile.tournament_potential?.['Begabung'];
  const hauptkategorie = findDisciplineCategory(profile.disciplines, begabung);
  const relevantDisciplines = hauptkategorie ? ((profile.disciplines as any)[hauptkategorie] || []) : [];
  if (relevantDisciplines.length) {
    const under20 = relevantDisciplines.filter((e: any) => e.potential != null && e.potential < 20);
    const ab25 = relevantDisciplines.filter((e: any) => e.potential != null && e.potential >= 25);
    if (under20.length) reasons.push(`Disziplinen (Hauptdisziplin ${hauptkategorie}) unter 20% Potenzial: ${under20.map((e: any) => `${e.name} (${e.potential}%)`).join(', ')}`);
    if (ab25.length < 1) reasons.push(`Keine Disziplin in der Hauptdisziplin (${hauptkategorie}) mit mind. 25% Potenzial vorhanden`);
  } else {
    warnings.push('Disziplinen: Hauptdisziplin (Kategorie der Begabung) konnte nicht ermittelt werden, Kriterium nicht geprüft.');
  }

  const grundlagen = profile.traits?.['Grundlagen'] || [];
  const gangarten = (profile.traits?.['Gangarten'] || []).filter((e) => LP_RELEVANT_GANGARTEN.includes(e.name));
  if (grundlagen.length || gangarten.length) {
    const alle = [...grundlagen, ...gangarten];
    const under15 = alle.filter((e) => e.potential != null && e.potential < 15);
    const grundlagenAb20 = grundlagen.filter((e) => e.potential != null && (e.potential as number) >= 20);
    const gangartenAb20 = gangarten.filter((e) => e.potential != null && (e.potential as number) >= 20);
    const totalAb20 = grundlagenAb20.length + gangartenAb20.length;
    if (under15.length) reasons.push(`Eigenschaften unter 15% Potenzial: ${under15.map((e) => `${e.name} (${e.potential}%)`).join(', ')}`);
    if (totalAb20 < 6 || grundlagenAb20.length < 4 || gangartenAb20.length < 1) {
      reasons.push(`Nur ${totalAb20}x ≥20% in den Eigenschaften (${grundlagenAb20.length}x Grundlagen, ${gangartenAb20.length}x Gangarten) - nötig: mind. 6 gesamt, davon mind. 4x Grundlagen und mind. 1x Gangarten`);
    }
  } else {
    warnings.push('Eigenschaften: keine Daten vorhanden, Kriterium nicht geprüft.');
  }

  if (warnings.length === 5) return { possible: null, reasons, warnings };
  return { possible: reasons.length === 0, reasons, warnings };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Guenstige Vorabpruefungen - ist weder etwas an Verwandtschaft veraltet
  // NOCH gibt es Pferde ohne Turnierwerte-Nachtrag, ist nichts zu tun
  // (spart die teurere Volltabellen-Abfrage danach).
  const { count: staleCount, error: staleCheckError } = await supabase
    .from('horses')
    .select('id', { count: 'exact', head: true })
    .eq('relatedness_stale', true);
  if (staleCheckError) {
    return new Response(JSON.stringify({ error: staleCheckError.message }), { status: 500 });
  }
  const { count: missingTournamentCount, error: tournamentCheckError } = await supabase
    .from('horses')
    .select('id', { count: 'exact', head: true })
    .is('computed_tournament_values', null);
  if (tournamentCheckError) {
    return new Response(JSON.stringify({ error: tournamentCheckError.message }), { status: 500 });
  }
  const needRelatedness = !!staleCount;
  const needTournamentBackfill = !!missingTournamentCount;
  if (!needRelatedness && !needTournamentBackfill) {
    return new Response(JSON.stringify({ skipped: true, reason: 'nothing to do' }), { status: 200 });
  }

  // PostgREST liefert pro Anfrage max. 1000 Zeilen ("max-rows") - ohne
  // Pagination wuerden bei ueber 1000 Pferden die hinteren stillschweigend
  // fehlen (derselbe Bug, der letzte Woche im Frontend gefunden und mit
  // fetchAllRows() behoben wurde - hier dieselbe Loesung, nur lokal in der
  // Edge Function, da hier kein Zugriff auf js/supabaseClient.js besteht).
  const horses: HorseRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: fetchError } = await supabase
      .from('horses')
      .select('id, name, owner, gender, pedigree, tournament_potential, exterior_descriptive, exterior_genetics, temperament, traits, disciplines, genetic_diseases, computed_tournament_values, relatedness_stale, tags')
      .range(from, from + PAGE_SIZE - 1);
    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }
    horses.push(...((page || []) as HorseRow[]));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const childrenByParentName = new Map<string, HorseRow[]>();
  const nameIndex = new Map<string, HorseRow>();
  const horseById = new Map<string, HorseRow>();
  // Vorberechnung fuer findExtendedRelatives (siehe dortiger
  // Performance-Kommentar): je Pferd einmal der eigene Namenspool +
  // "erstes Vorkommen je Name gewinnt"-Map, sowie ein umgekehrter Index
  // name -> Pferde-IDs, die diesen Namen irgendwo in ihrem Pool haben.
  const poolByHorseId = new Map<string, PoolEntry[]>();
  const ownPositionByNameById = new Map<string, Map<string, string>>();
  const nameToCandidateIds = new Map<string, Set<string>>();
  if (needRelatedness) {
    for (const h of horses) {
      const key = normalizeName(h.name);
      if (key && !nameIndex.has(key)) nameIndex.set(key, h);
      horseById.set(h.id, h);
      const { father, mother } = parentNames(h);
      for (const parentName of [father, mother]) {
        if (!parentName) continue;
        const pKey = normalizeName(parentName);
        if (!childrenByParentName.has(pKey)) childrenByParentName.set(pKey, []);
        childrenByParentName.get(pKey)!.push(h);
      }

      const pool = pedigreeNamePool(h);
      poolByHorseId.set(h.id, pool);
      const positionByName = new Map<string, string>();
      for (const entry of pool) {
        if (entry.position === 'Pferd selbst') continue;
        const nKey = normalizeName(entry.name);
        if (!positionByName.has(nKey)) positionByName.set(nKey, entry.position);
      }
      ownPositionByNameById.set(h.id, positionByName);
      for (const entry of pool) {
        const nKey = normalizeName(entry.name);
        if (!nameToCandidateIds.has(nKey)) nameToCandidateIds.set(nKey, new Set());
        nameToCandidateIds.get(nKey)!.add(h.id);
      }
    }
  }

  // Batches werden SOFORT weggeschrieben statt erst fuer alle ~1200
  // Pferde gesammelt zu werden - "Weitere Verwandtschaft" (siehe
  // findExtendedRelatives) kann bei stark verzweigten Blutlinien pro
  // Pferd hunderte Eintraege liefern (~40MB JSON insgesamt bei allen
  // Pferden zusammen im Test) - alles gleichzeitig im Speicher zu halten
  // haette die Edge Function mit einem Speicherproblem abstuerzen lassen.
  // Kleine Batch-Groesse, damit auch ein einzelnes Batch mit mehreren
  // "datenreichen" Pferden nicht zu gross wird.
  const BATCH_SIZE = 40;
  let pendingUpdates: Record<string, unknown>[] = [];
  let totalUpdated = 0;

  async function flushUpdates(): Promise<Response | null> {
    if (!pendingUpdates.length) return null;
    const batch = pendingUpdates;
    pendingUpdates = [];
    const { error: applyError } = await supabase.rpc('apply_relatedness_updates', { updates: batch });
    if (applyError) {
      return new Response(JSON.stringify({ error: applyError.message, atCount: totalUpdated }), { status: 500 });
    }
    totalUpdated += batch.length;
    return null;
  }

  // CPU-ZEITBUDGET (Nutzerfeedback 2026-09-09, Supabase-Logs: "CPU Time
  // exceeded"): bei ~1200 Pferden UND der viel teureren "Weitere
  // Verwandtschaft"-Suche (siehe findExtendedRelatives) reicht selbst nach
  // der Index-Optimierung die pro Aufruf erlaubte CPU-Zeit nicht mehr fuer
  // ALLE Pferde in einem Rutsch. Deshalb hier eine bewusst konservative
  // Wanduhr-Zeitgrenze (fast ausschliesslich synchrone Rechenarbeit in
  // dieser Schleife, Wanduhrzeit ist hier also ein guter Näherungswert fuer
  // CPU-Zeit) - wird sie erreicht, bricht die Schleife ab, das bereits
  // Berechnete wird trotzdem gespeichert, und der Rest bleibt fuer den
  // naechsten Aufruf "relatedness_stale" (naechster pg_cron-Tick, siehe
  // migration_041 - deutlich haeufiger als die urspruenglichen 15 Minuten).
  const CPU_BUDGET_MS = 1500;
  const startTime = Date.now();
  let stoppedEarly = false;

  for (const h of horses) {
    if (Date.now() - startTime > CPU_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    const entry: Record<string, unknown> = { id: h.id };
    let hasChange = false;
    // NUR fuer tatsaechlich veraltete Pferde neu berechnen (nicht schon,
    // sobald IRGENDEIN Pferd veraltet ist - Bugfix Nutzerfeedback
    // 2026-09-09: sonst wurden bei jedem Aufruf immer wieder dieselben
    // ersten Pferde in Array-Reihenfolge neu gerechnet, bis das
    // Zeitbudget aufgebraucht war, ohne je die wirklich noch veralteten
    // weiter hinten zu erreichen - "relatedness_stale" wird von
    // apply_relatedness_updates bereits zuverlaessig pro Pferd geloescht,
    // sobald es einen frischen relatedness_cache bekommt).
    if (needRelatedness && h.relatedness_stale) {
      const closeRelatives = findRelatives(h, horses, childrenByParentName);
      const { father, mother } = parentNames(h);
      const parentIds: string[] = [];
      for (const parentName of [father, mother]) {
        if (!parentName) continue;
        const parentHorse = nameIndex.get(normalizeName(parentName));
        if (parentHorse) parentIds.push(parentHorse.id);
      }
      const excludeIds = new Set<string>([h.id, ...parentIds, ...closeRelatives.map((r) => r.id)]);
      const extendedRelatives = findExtendedRelatives(
        h, excludeIds, poolByHorseId, ownPositionByNameById, nameToCandidateIds, horseById,
      );
      entry.relatedness_cache = [...closeRelatives, ...extendedRelatives];
      hasChange = true;
    }
    if (h.computed_tournament_values == null) {
      entry.computed_tournament_values = computeTournamentValues(h);
      entry.computed_lp_result = checkLP(h);
      hasChange = true;
    }
    if (hasChange) {
      pendingUpdates.push(entry);
      if (pendingUpdates.length >= BATCH_SIZE) {
        const errResponse = await flushUpdates();
        if (errResponse) return errResponse;
      }
    }
  }
  const finalErrResponse = await flushUpdates();
  if (finalErrResponse) return finalErrResponse;

  // KEIN Selbstaufruf mehr fuer die naechste Portion (Versuch verworfen,
  // Nutzerfeedback 2026-09-09: die Logs zeigten keinen zweiten Aufruf -
  // ein "fire and forget"-fetch auf die eigene Function-URL kam
  // offenbar nie zuverlaessig an bzw. haengt). Stattdessen laeuft
  // pg_cron jetzt deutlich haeufiger (siehe migration_041), sodass sich
  // ein grosser Nachholbedarf (z.B. nach einem Bulk-Import) innerhalb
  // weniger Minuten in mehreren kurzen, garantiert budget-sicheren
  // Haeppchen von selbst abarbeitet, statt in einem einzigen riskanten
  // Aufruf oder einer fragilen Selbstverkettung.
  return new Response(JSON.stringify({
    updated: totalUpdated,
    relatednessRecomputed: needRelatedness ? horses.length : 0,
    tournamentBackfilled: needTournamentBackfill,
    stoppedEarly,
  }), { status: 200 });
});
