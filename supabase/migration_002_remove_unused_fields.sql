-- Migration: entfernt Felder, die nicht benötigt werden.
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen
-- (nur nötig, wenn du schema.sql bereits vorher ausgeführt hattest).

drop index if exists public.horses_folder_idx;

alter table public.horses
  drop column if exists birth_date,
  drop column if exists age_text,
  drop column if exists height_cm,
  drop column if exists rider_partner,
  drop column if exists value_dd,
  drop column if exists folder,
  drop column if exists subfolder,
  drop column if exists breeder,
  drop column if exists offspring_count,
  drop column if exists pregnant,
  drop column if exists covering_sire,
  drop column if exists foaling_date;
