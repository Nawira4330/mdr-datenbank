-- Migration: globale App-Einstellungen (Schluessel/Wert) - erste Einstellung:
-- "store_raw_text" (siehe js/horseForm.js/js/verpaarung.js): ob der beim
-- Anlegen/Bearbeiten eingefuegte Spieltext (horses.raw_text) mitgespeichert
-- wird. Standard: an. Schaltbar nur im Admin-Profil (Einstellungen).
--
-- Lesen darf jedes angemeldete Konto (der Speichervorgang fragt den Wert ab),
-- schreiben nur die beiden Admin-Konten - dieselbe Liste wie ADMIN_EMAILS in
-- js/auth.js, hier serverseitig per E-Mail-Claim des Logins geprueft (bis
-- jetzt gab es Admin-Rechte nur im Browser, das hier sperrt auch direkte
-- API-Aufrufe fremder Konten).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.
-- Ohne diese Migration bleibt alles wie bisher (Text wird gespeichert, der
-- Schalter in den Einstellungen meldet dann einen Fehler).

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings lesen" on public.app_settings;
create policy "app_settings lesen" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "app_settings admin einfuegen" on public.app_settings;
create policy "app_settings admin einfuegen" on public.app_settings
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') in ('lisa-jacobi@hotmail.com', 'nawira13@benutzer.mdr-datenbank.local'));

drop policy if exists "app_settings admin aendern" on public.app_settings;
create policy "app_settings admin aendern" on public.app_settings
  for update to authenticated
  using ((auth.jwt() ->> 'email') in ('lisa-jacobi@hotmail.com', 'nawira13@benutzer.mdr-datenbank.local'))
  with check ((auth.jwt() ->> 'email') in ('lisa-jacobi@hotmail.com', 'nawira13@benutzer.mdr-datenbank.local'));

insert into public.app_settings (key, value)
values ('store_raw_text', 'true'::jsonb)
on conflict (key) do nothing;
