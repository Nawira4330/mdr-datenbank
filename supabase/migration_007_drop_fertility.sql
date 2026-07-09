-- Migration: entfernt das nicht mehr benoetigte Feld "Fruchtbarkeit".
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

alter table public.horses
  drop column if exists fertility_pct;
