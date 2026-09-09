-- Migration: pg_cron-Takt fuer "recompute-relatedness" von alle 15 Minuten
-- auf jede Minute erhoeht (Nutzerfeedback 2026-09-09).
--
-- Grund: die Edge Function verarbeitet pro Aufruf nur noch so viele Pferde,
-- wie ins CPU-Zeitbudget passen (siehe Kommentar "CPU_BUDGET_MS" in
-- supabase/functions/recompute-relatedness/index.ts - bei ~1200 Pferden
-- reicht ein einzelner Aufruf nicht mehr fuer den kompletten Bestand, das
-- fuehrte vorher zu "CPU Time exceeded"-Abbruechen). Ein urspruenglich
-- geplanter Selbstaufruf-Mechanismus fuer sofortige Fortsetzung hat sich
-- als unzuverlaessig erwiesen (kein zweiter Aufruf in den Logs sichtbar)
-- und wurde wieder entfernt. Stattdessen arbeitet sich ein groesserer
-- Nachholbedarf (z.B. nach einem Bulk-Import) jetzt einfach ueber mehrere
-- der jetzt viel haeufigeren Cron-Ticks ab.
--
-- Haeufigeres Aufrufen ist hier gefahrlos und OHNE zusaetzliche Supabase-
-- Egress-Kosten: die Funktion prueft zuerst guenstig (zwei COUNT-Abfragen),
-- ob ueberhaupt etwas zu tun ist, und antwortet sonst sofort mit
-- "skipped" - und Function<->DB-Traffic zaehlt ohnehin nicht als
-- Egress (genau deshalb wurde ueberhaupt auf Edge Functions gesetzt,
-- siehe migration_039).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren (nach
-- migration_040_relatedness_cron.sql).

select cron.unschedule('recompute-relatedness');

select cron.schedule(
  'recompute-relatedness',
  '* * * * *',
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

-- Status/Historie pruefen: select * from cron.job_run_details order by start_time desc limit 10;
