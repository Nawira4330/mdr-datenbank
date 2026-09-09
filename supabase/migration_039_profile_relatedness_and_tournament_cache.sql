-- Migration: neue Spalten fuer zwei im Pferdeprofil (horse.html/view.html)
-- neu integrierte Reiter - "Turnierwerte" (Turnierplaner-Berechnung) und
-- "Zuchtbuch" (Verwandtschaft), beide vorberechnet statt live beim
-- Ansehen des Profils, um Supabase-Egress zu sparen (Organisation war im
-- vorigen Abrechnungszeitraum bereits ueber dem Free-Plan-Kontingent).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_038_default_owner_filter.sql).

-- --- Turnierwerte: einmalig beim Speichern in horseForm.js berechnet
-- (computeTournamentValues/checkLP aus js/tournamentScoring.js, 1:1 aus
-- MDR-Planer uebernommen) und hier abgelegt - aendert sich nicht mehr, bis
-- das Pferd erneut gespeichert wird, deshalb keine Neuberechnung beim
-- blossen Ansehen des Profils noetig. ---
alter table public.horses
  add column if not exists computed_tournament_values jsonb,
  add column if not exists computed_lp_result jsonb;

-- --- Zuchtbuch: Verwandten-Liste je Pferd, vorberechnet (siehe
-- supabase/functions/recompute-relatedness) statt bei jedem Profilaufruf
-- gegen die komplette Pferdeliste neu zu rechnen (das waere bei >1200
-- Pferden ein spuerbarer Zusatzabruf pro Ansicht). "relatedness_stale"
-- markiert, welche Pferde seit der letzten Neuberechnung veraltet sind -
-- wird per Trigger gesetzt, von der Edge Function per Cron-Zeitplan
-- abgearbeitet (siehe dortige Datei). ---
alter table public.horses
  add column if not exists relatedness_cache jsonb,
  add column if not exists relatedness_stale boolean not null default true,
  add column if not exists relatedness_updated_at timestamptz;

-- Bewusst pauschal: loescht/aendert sich EIN Pferd (Name oder Stammbaum),
-- kann sich die gespeicherte Verwandten-Liste potenziell vieler ANDERER
-- Pferde aendern (jedes, das mit ihm verwandt war/werden koennte) - die
-- genaue betroffene Teilmenge zu bestimmen waere selbst schon so aufwendig
-- wie eine komplette Neuberechnung. Das Markieren selbst ist eine reine
-- Datenbank-Operation ohne Netzwerk-Egress, die eigentliche teure Arbeit
-- (Namensabgleich ueber alle Pferde) passiert erst in der Edge Function.
create or replace function public.mark_relatedness_stale()
returns trigger
language plpgsql
as $$
begin
  update public.horses set relatedness_stale = true where relatedness_stale = false;
  return coalesce(new, old);
end;
$$;

drop trigger if exists horses_mark_relatedness_stale on public.horses;
create trigger horses_mark_relatedness_stale
after insert or delete or update of name, pedigree on public.horses
for each statement execute function public.mark_relatedness_stale();

-- Wird von supabase/functions/recompute-relatedness aufgerufen (per
-- service_role, umgeht damit RLS bereits) - EIN Bulk-Update-Statement
-- statt eines Einzel-Updates pro Pferd. "security definer" + enges
-- Berechtigungs-Grant unten, damit diese Funktion NICHT ueber die
-- oeffentliche API (anon/authenticated) aufrufbar ist - nur der
-- service_role-Schluessel der Edge Function darf hier hinein schreiben.
--
-- "computed_tournament_values"/"computed_lp_result" sind pro Eintrag
-- OPTIONAL (die Edge Function fuellt sie nur fuer Pferde, die das noch
-- nicht haben, siehe dortiger Nachtrag-Mechanismus) - fehlt ein Eintrag
-- im uebergebenen JSON, bleibt der bisherige DB-Wert dank coalesce()
-- unangetastet, statt faelschlich auf NULL zurueckgesetzt zu werden.
-- Gleiches gilt fuer relatedness_cache: nur wenn im Update-Objekt
-- vorhanden, wird relatedness_stale/relatedness_updated_at mit
-- aktualisiert.
create or replace function public.apply_relatedness_updates(updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.horses h
  set relatedness_cache = coalesce(u.relatedness_cache, h.relatedness_cache),
      relatedness_stale = case when u.relatedness_cache is not null then false else h.relatedness_stale end,
      relatedness_updated_at = case when u.relatedness_cache is not null then now() else h.relatedness_updated_at end,
      computed_tournament_values = coalesce(u.computed_tournament_values, h.computed_tournament_values),
      computed_lp_result = coalesce(u.computed_lp_result, h.computed_lp_result)
  from jsonb_to_recordset(updates) as u(
    id uuid, relatedness_cache jsonb, computed_tournament_values jsonb, computed_lp_result jsonb
  )
  where h.id = u.id;
end;
$$;

revoke all on function public.apply_relatedness_updates(jsonb) from public, anon, authenticated;
