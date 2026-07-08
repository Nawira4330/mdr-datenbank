-- Morning Dust Ranch Datenbank - Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" komplett einfügen und ausführen.

create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- Stammdaten
  name text not null,
  gender text,
  breed text,
  purebred_pct numeric,
  coat_color text,
  disease_free boolean,

  -- Verwaltung
  owner text,

  -- Papiere / Zucht
  breeding_allowed boolean,
  hlp_slp text,
  ico numeric,
  fertility_pct numeric,

  -- Strukturierte Detaildaten (aus dem Text-Parser)
  genetic_diseases jsonb,       -- Erbkrankheiten-Tabelle
  colors jsonb,                 -- Farbgenetik-Tabelle
  exterior_genetics jsonb,      -- Exterieur Genotyp-Tabelle + Gesamtwert
  exterior_descriptive jsonb,   -- Körperbau (Beschreibung je Körperteil)
  temperament jsonb,            -- Interieur / Mentalität
  disciplines jsonb,            -- Disziplin-Werte, gruppiert (Western, Englisch, ...)
  traits jsonb,                 -- Eigenschaften, gruppiert (Grundlagen, Gangarten)
  tournament_potential jsonb,   -- Begabung, Gesamtpotenzial, Erfahrung, ...
  pedigree jsonb,               -- Stammbaum, unsortierte Liste (siehe README)

  -- Sonstiges
  raw_text text,                -- Original eingefügter Text (Fallback / Re-Parsing)
  notes text,
  image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists horses_user_id_idx on public.horses (user_id);
create index if not exists horses_name_idx on public.horses (lower(name));
create index if not exists horses_breed_idx on public.horses (breed);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists horses_set_updated_at on public.horses;
create trigger horses_set_updated_at
before update on public.horses
for each row execute function public.set_updated_at();

-- Row Level Security: jede*r sieht/bearbeitet nur eigene Pferde
alter table public.horses enable row level security;

drop policy if exists "horses_select_own" on public.horses;
create policy "horses_select_own" on public.horses
  for select using (auth.uid() = user_id);

drop policy if exists "horses_insert_own" on public.horses;
create policy "horses_insert_own" on public.horses
  for insert with check (auth.uid() = user_id);

drop policy if exists "horses_update_own" on public.horses;
create policy "horses_update_own" on public.horses
  for update using (auth.uid() = user_id);

drop policy if exists "horses_delete_own" on public.horses;
create policy "horses_delete_own" on public.horses
  for delete using (auth.uid() = user_id);
