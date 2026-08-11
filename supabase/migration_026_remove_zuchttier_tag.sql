-- Migration: Schlagwort "Zuchttier" komplett entfernt (siehe
-- HORSE_TAG_OPTIONS in js/parser.js) - entfernt es auch aus bereits
-- vergebenen Schlagwörtern, damit es nicht als verwaistes, in der
-- Oberfläche nicht mehr auswählbares Label bestehen bleibt.
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

update public.horses
set tags = (
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  from jsonb_array_elements(tags) as elem
  where elem->>'label' != 'Zuchttier'
)
where tags @> '[{"label": "Zuchttier"}]'::jsonb;

delete from public.tag_suggestions
where label = 'Zuchttier';
