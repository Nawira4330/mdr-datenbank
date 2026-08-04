-- Migration: Vorgeschlagene Schlagwoerter (Staging-Tabelle) - analog zum
-- Verpaarungs-Log/Fohlen-Tracker-Muster (pairings, siehe
-- migration_010_pairings_public_insert.sql): der MDR-Planer (anderes
-- Repo) kann hier Schlagwort-Vorschlaege OHNE eigenen Login eintragen,
-- sie wirken sich aber nicht sofort auf horses.tags aus, sondern
-- erscheinen als Hinweis in der Uebersicht (siehe js/list.js) zum
-- manuellen Uebernehmen oder Verwerfen.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

create table if not exists public.tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  -- Label aus HORSE_TAG_OPTIONS (js/parser.js) - wird beim Uebernehmen
  -- nicht validiert, ein unbekanntes Label wuerde beim Anzeigen einfach
  -- mit der Standardfarbe (--muted) dargestellt.
  label text not null,
  note text,
  -- Optionaler Hinweis, woher der Vorschlag kommt (z.B. "Zuchtbuch",
  -- "Fohlen-Tracker", "Verwandtschaftsmatrix") - rein informativ fuer
  -- die Anzeige, keine Logik haengt daran.
  source text,
  created_at timestamptz not null default now()
);

alter table public.tag_suggestions enable row level security;

-- Lesen/Loeschen (Uebernehmen kombiniert ein Update auf horses mit einem
-- Loeschen hier) bleibt eingeloggten Konten vorbehalten, wie bei horses
-- selbst.
drop policy if exists "tag_suggestions_select_authenticated" on public.tag_suggestions;
create policy "tag_suggestions_select_authenticated" on public.tag_suggestions
  for select to authenticated using (true);

drop policy if exists "tag_suggestions_delete_authenticated" on public.tag_suggestions;
create policy "tag_suggestions_delete_authenticated" on public.tag_suggestions
  for delete to authenticated using (true);

-- Einfuegen bleibt oeffentlich moeglich, damit der MDR-Planer Vorschlaege
-- eintragen kann, ohne dort eingeloggt zu sein (wie bei pairings).
grant insert on public.tag_suggestions to anon;

drop policy if exists "tag_suggestions_insert_public" on public.tag_suggestions;
create policy "tag_suggestions_insert_public" on public.tag_suggestions
  for insert to anon with check (true);
