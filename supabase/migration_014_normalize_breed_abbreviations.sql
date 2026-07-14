-- Migration: bereits gespeicherte Rasse-Kürzel (z.B. "APH") auf den
-- ausgeschriebenen Namen umstellen. Im Supabase Dashboard unter
-- "SQL Editor" einfuegen und ausfuehren.
--
-- Kuenftige Eintraege (Text-Auslesen UND manuelles Eintragen) werden
-- bereits automatisch normalisiert (siehe normalizeBreed in
-- js/parser.js) - diese Migration holt nur die Altdaten nach, damit
-- Anzeige UND der Rasse-Filter (exakter Abgleich auf den gespeicherten
-- Spaltenwert) auch fuer schon vorhandene Pferde konsistent sind.

update public.horses set breed = 'American Paint Horse' where lower(breed) = 'aph';
update public.horses set breed = 'Knabstupper' where lower(breed) = 'knab';
update public.horses set breed = 'Andalusier' where lower(breed) = 'anda';
update public.horses set breed = 'Lusitano' where lower(breed) = 'lusi';
update public.horses set breed = 'Quarter Horse' where lower(breed) = 'qh';
update public.horses set breed = 'Deutsches Reitpony' where lower(breed) = 'drp';

update public.foal_reference_data set breed = 'American Paint Horse' where lower(breed) = 'aph';
update public.foal_reference_data set breed = 'Knabstupper' where lower(breed) = 'knab';
update public.foal_reference_data set breed = 'Andalusier' where lower(breed) = 'anda';
update public.foal_reference_data set breed = 'Lusitano' where lower(breed) = 'lusi';
update public.foal_reference_data set breed = 'Quarter Horse' where lower(breed) = 'qh';
update public.foal_reference_data set breed = 'Deutsches Reitpony' where lower(breed) = 'drp';
