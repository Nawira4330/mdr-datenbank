-- Migration: pg_cron-Takt fuer "recompute-relatedness" von jeder Minute
-- zurueck auf alle 15 Minuten (Bugreport: Supabase-Egress deutlich ueber
-- dem Free-Plan-Kontingent, Sperrung drohte).
--
-- migration_041_relatedness_cron_more_frequent.sql hatte den Takt mit der
-- Begruendung "Function<->DB-Traffic zaehlt ohnehin nicht als Egress" auf
-- jede Minute erhoeht - das ist FALSCH: laut Supabase-Dashboard zaehlt
-- Egress ausdruecklich "Database, Storage, Realtime, Auth, API,
-- EDGE FUNCTIONS, Pooler and Log Drains". Bei ~1440 statt 96 Aufrufen/Tag
-- (die Funktion prueft zwar guenstig per COUNT, ob ueberhaupt etwas zu tun
-- ist - aber jeder einzelne Aufruf ist trotzdem ein echter HTTP-Roundtrip
-- zur Datenbank, der zaehlt) war das seit der Einfuehrung (09.09.) ein
-- dauerhafter, nicht nur einmaliger Mehrverbrauch - siehe die "Egress per
-- day"-Kurve im Supabase-Dashboard, durchgehend hoch seit dem 09.09. statt
-- eines einmaligen Ausschlags direkt nach dem Backfill.
--
-- Der urspruengliche Grund fuer die Erhoehung (grosser Nachholbedarf nach
-- einem Bulk-Import/dem einmaligen Umstellen des kompletten Bestands auf
-- relatedness_cache liess sich in 15-Minuten-Takten nicht schnell genug
-- abarbeiten) bleibt SICHER geloest: die Funktion selbst begrenzt sich
-- bereits per CPU_BUDGET_MS (Wanduhr-Zeitlimit, siehe
-- supabase/functions/recompute-relatedness/index.ts) auf ca. 1,5 Sekunden
-- Arbeit pro Aufruf und bricht danach sauber ab, ohne einen "CPU Time
-- exceeded"-Fehler zu riskieren - ein grosser Rueckstand arbeitet sich
-- einfach ueber mehrere Ticks ab, nur eben wieder alle 15 statt jede
-- Minute. Fuer den NORMALEN Fall (ein einzelnes Pferd wird gespeichert)
-- reicht ein einzelner Tick ohnehin locker aus - der schnellere Takt half
-- also nur im seltenen Bulk-Fall, kostete dafuer aber dauerhaft ~15x mehr
-- Egress.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

select cron.unschedule('recompute-relatedness');

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

-- Status/Historie pruefen: select * from cron.job_run_details order by start_time desc limit 10;
