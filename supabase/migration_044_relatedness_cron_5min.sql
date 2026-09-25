-- Migration: pg_cron-Takt fuer "recompute-relatedness" von 15 Minuten
-- (migration_043, Egress-Notfallmassnahme) auf 5 Minuten angepasst -
-- Nutzerwunsch: schnellere Aktualisierung von Zuchtbuch-/Turnierwerte-
-- Cache nach dem Speichern eines Pferds, ohne wieder auf den vorherigen,
-- deutlich teureren 1-Minuten-Takt (migration_041, dort auch die
-- Begruendung, warum der so teuer war) zurueckzugehen.
--
-- 5 Minuten = 288 Aufrufe/Tag statt 96 (15 Min) oder 1440 (1 Min) - liegt
-- bewusst in der Mitte: rund 80% weniger Aufrufe als der bisherige teure
-- 1-Minuten-Takt, aber Aenderungen sind trotzdem binnen weniger Minuten
-- statt bis zu 15 sichtbar. Der Funktions-eigene CPU_BUDGET_MS-Schutz
-- (siehe supabase/functions/recompute-relatedness/index.ts) bleibt
-- unveraendert wirksam, unabhaengig vom Takt.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

select cron.unschedule('recompute-relatedness');

select cron.schedule(
  'recompute-relatedness',
  '*/5 * * * *',
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
