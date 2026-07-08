// Supabase-Projektzugangsdaten.
// Diese Werte findest du in deinem Supabase-Projekt unter
// "Project Settings" -> "API": "Project URL" und "anon public" Key.
//
// Wichtig: Hier gehört NUR der "anon public" Key hinein, niemals der
// "service_role" Key! Der anon-Key ist bewusst dafür gemacht, im
// Browser/Frontend sichtbar zu sein - der eigentliche Schutz kommt über
// die Row-Level-Security-Regeln in supabase/schema.sql (jede*r sieht nur
// eigene Pferde) und den Login.
const SUPABASE_CONFIG = {
  url: 'https://DEIN-PROJEKT.supabase.co',
  anonKey: 'DEIN-ANON-KEY',
};
