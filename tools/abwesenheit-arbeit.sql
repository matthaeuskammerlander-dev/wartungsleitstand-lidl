-- Abwesenheit und Arbeit am selben Tag (Büro 04.10.2026: „für sowas sollte man vorbereitet sein“):
-- Stempelt jemand an einem Tag mit Urlaub, Krankenstand, Schule oder Zeitausgleich ein bzw. erfasst Arbeit,
-- fragt die App nach. Die Antwort steht je Tag am Kalendereintrag:
--   planung.ausnahmen = {"2026-10-05": {"art":"eingesprungen"|"zurueck", "von":"Name", "zeit":"…"}}
--   „eingesprungen“: beides zählt, keine Warnung mehr; „zurueck“: Urlaubstag zurückgegeben – der Inhaber
--   nimmt den Tag aus dem Urlaub (dann passt der Trigger planung_stunden die Stunden von selbst an).
-- Die Spalte ändert weder den Urlaubsstatus noch die Stunden (Trigger planung_pruefen und planung_stunden
-- schauen nur auf Datum, Personen, Art, Status).
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

alter table public.planung add column if not exists ausnahmen jsonb not null default '{}';

select count(*) as planung_mit_ausnahmen from public.planung where ausnahmen <> '{}'::jsonb;
