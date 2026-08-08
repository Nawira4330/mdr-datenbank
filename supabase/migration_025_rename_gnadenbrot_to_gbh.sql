-- Migration: Schlagwort "Gnadenbrot" in "GBH" umbenannt (siehe
-- HORSE_TAG_OPTIONS in js/parser.js) - aktualisiert bereits vergebene
-- Schlagwörter in der Datenbank, damit sie nicht als verwaistes, in der
-- Oberfläche nicht mehr auswählbares Label bestehen bleiben (und beim
-- naechsten Speichern eines betroffenen Pferds nicht versehentlich
-- verloren gehen, siehe syncTagsFromCheckboxes in js/horseForm.js).
--
-- Im Supabase Dashboard unter "SQL Editor" einfuegen und ausfuehren.

update public.horses
set tags = (
  select jsonb_agg(
    case when elem->>'label' = 'Gnadenbrot'
      then jsonb_set(elem, '{label}', '"GBH"')
      else elem
    end
  )
  from jsonb_array_elements(tags) as elem
)
where tags @> '[{"label": "Gnadenbrot"}]'::jsonb;

update public.tag_suggestions
set label = 'GBH'
where label = 'Gnadenbrot';
