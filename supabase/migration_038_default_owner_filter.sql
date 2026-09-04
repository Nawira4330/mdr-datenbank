-- Migration: Uebersicht startet standardmaessig mit dem Besitzer-Filter
-- auf das eigene Konto gesetzt (siehe js/list.js applyDefaultOwnerFilter) -
-- abschaltbar in den Einstellungen, dann startet die Uebersicht wie bisher
-- ungefiltert (bzw. mit der eigenen Standard-Filtervorlage, falls gesetzt -
-- die hat weiterhin Vorrang und wird von diesem Standard nicht ueberschrieben).
-- NOT NULL DEFAULT true, damit der neue Standard auch fuer alle bisherigen
-- Konten sofort greift, ohne dass jede*r das erst manuell einschalten muss.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (nach migration_037_security_hardening.sql).

alter table public.user_settings
  add column if not exists default_owner_filter_enabled boolean not null default true;
