-- Migration: periodischer Aufruf der Edge Function
-- "recompute-relatedness" (siehe supabase/functions/recompute-relatedness)
-- per pg_cron - haelt relatedness_cache (Zuchtbuch-Reiter im Pferdeprofil)
-- aktuell, ohne dass ein Browser dafuer die komplette Pferdeliste laden
-- muesste.
--
-- WICHTIG - dieser Teil ENTHAELT KEIN Geheimnis und ist sicher zu
-- committen, ABER er allein reicht nicht: nach dem Ausfuehren dieser
-- Datei muss EINMALIG noch der echte service_role-Schluessel manuell im
-- SQL-Editor hinterlegt werden (siehe Schritt 2 unten, NICHT hier in
-- dieser Datei, NICHT ins Git-Repo).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_039_profile_relatedness_and_tournament_cache.sql UND NACHDEM
-- die Edge Function per "supabase functions deploy recompute-relatedness"
-- deployt wurde).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schritt 2 (MANUELL, separat ausfuehren, NICHT Teil dieser Datei/dieses
-- Commits): den echten service_role-Schluessel (Project Settings -> API
-- -> service_role, "secret") einmalig sicher in Supabase Vault ablegen:
--
--   select vault.create_secret('DEIN-ECHTER-SERVICE-ROLE-KEY', 'service_role_key');
--
-- Falls der Secret-Name schon existiert (z.B. bei erneutem Einrichten):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     'DEIN-ECHTER-SERVICE-ROLE-KEY'
--   );

-- Ruft die Edge Function alle 15 Minuten auf - reicht nach dem
-- Loeschen/Anlegen eines Pferds fuer eine im Vergleich zum bisherigen
-- Zustand ("gar keine Verwandtschaftsdaten im Profil") sehr zeitnahe
-- Aktualisierung, ohne den Cron-Job unnoetig oft laufen zu lassen (die
-- Funktion selbst prueft zuerst guenstig, ob ueberhaupt etwas veraltet
-- ist, und tut sonst nichts - haeufigeres Aufrufen waere also auch bei
-- Bedarf gefahrlos moeglich, 15 Minuten ist ein guter Mittelweg).
select cron.schedule(
  'recompute-relatedness',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://spxkqemomrggjdprdfgr.supabase.co/functions/v1/recompute-relatedness',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Zum manuellen Testen (z.B. direkt nach dem Einrichten, statt 15 Minuten
-- zu warten) im SQL-Editor:
--   select cron.schedule('recompute-relatedness-once', '* * * * *', $$ ... derselbe net.http_post-Aufruf ... $$);
--   -- nach dem ersten Lauf wieder entfernen: select cron.unschedule('recompute-relatedness-once');
-- Status/Historie pruefen: select * from cron.job_run_details order by start_time desc limit 5;
