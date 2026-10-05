-- Stempeluhr, Teil 2 (Büro 01.10.2026): Tätigkeitsbereich, Umstempeln und
-- Überschneidungen mit Stunden, die von Hand eingetragen sind.
-- Nach stempeluhr.sql einmal im Supabase SQL Editor ausführen. Mehrfach
-- ausführbar – auch nach den späteren Skripten (stempeluhr-3/-4,
-- bereiche-eigen; Stand 05.10.2026): die Bereich-Prüfregeln stehen auf dem
-- Stand von bereiche-eigen.sql (eigene Bereiche, 1–40 Zeichen). Die Funktion
-- stempeln() legt dieses Skript NICHT mehr an – sie steht heute in
-- stempeluhr-4.sql. Ersteinrichtung: danach stempeluhr-3.sql, -4 und
-- bereiche-eigen.sql ausführen (bis -4 gelaufen ist, gibt es kein stempeln()).
--
-- * Bereich (fahrt, baustelle, wartung, stoerung, werkstatt, buero, sonstiges
--   oder ein eigener) an Stempel und Stunden – etwa um Fahrtzeit getrennt auszuweisen.
-- * Umstempeln (art „wechsel“): während man eingestempelt ist, Bereich, Markt
--   oder Projekt wechseln. Beim Ausstempeln entsteht je Abschnitt ein Eintrag.
-- * p_ersetzen: Einträge von Hand, die sich mit der gestempelten Zeit
--   überschneiden und durch sie ersetzt werden sollen – nur eigene, nur „hand“,
--   nur nicht bestätigte; im selben Schritt wie das Ausstempeln.

alter table public.stempel drop constraint if exists stempel_art_check;
alter table public.stempel add constraint stempel_art_check check (art in ('ein','pause','weiter','wechsel','aus'));
alter table public.stempel add column if not exists bereich text;
-- Bereich: feste Werte oder ein eigener Text – gleiche Fassung wie in bereiche-eigen.sql
alter table public.stempel drop constraint if exists stempel_bereich_check;
alter table public.stempel add constraint stempel_bereich_check
  check (bereich is null or length(btrim(bereich)) between 1 and 40);
alter table public.arbeitszeiten add column if not exists bereich text;
alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_bereich_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_bereich_check
  check (bereich is null or length(btrim(bereich)) between 1 and 40);

-- ---------------------------------------------------------------------------
-- stempeln(): steht heute in stempeluhr-4.sql (mit Umstempeln, erledigter
-- Arbeit, automatischer Pause und eigenen Bereichen). Dieses Skript legte bis
-- 05.10.2026 eine Fassung mit 9 Angaben an. Erneut angelegt läge sie als
-- zweite, veraltete Fassung neben der heutigen (10 Angaben): die App fände
-- stempeln() nicht mehr eindeutig, bereiche-eigen.sql bräche ab. Deshalb hier
-- nur: alte Fassungen (7 bzw. 9 Angaben) entfernen. Die heutige bleibt unberührt.
-- ---------------------------------------------------------------------------
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text);
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[]);

-- Kontrolle (stempeln_fassungen: 1 – bei der Ersteinrichtung 0, bis stempeluhr-4.sql gelaufen ist)
select 'ok' as stempeluhr_teil_2,
       (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = 'stempeln') as stempeln_fassungen;
