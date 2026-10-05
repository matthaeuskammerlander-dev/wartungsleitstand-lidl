-- Stempeluhr, Teil 3 (Büro 01.10.2026): beim Umstempeln wird nach der
-- erledigten Arbeit im endenden Abschnitt gefragt. Die Antwort steht am
-- Umstempel-Stempel (Spalte erledigt) und kommt beim Ausstempeln zum Eintrag
-- des vorigen Abschnitts. Nach stempeluhr-2.sql einmal ausführen. Mehrfach
-- ausführbar – auch nach stempeluhr-4.sql und bereiche-eigen.sql (Stand
-- 05.10.2026): die Funktion stempeln() legt dieses Skript NICHT mehr an – sie
-- steht heute in stempeluhr-4.sql. Ersteinrichtung: danach stempeluhr-4.sql
-- und bereiche-eigen.sql ausführen (bis -4 gelaufen ist, gibt es kein stempeln()).

alter table public.stempel add column if not exists erledigt text;
alter table public.stempel drop constraint if exists stempel_erledigt_check;
alter table public.stempel add constraint stempel_erledigt_check check (erledigt is null or length(erledigt) <= 300);

-- ---------------------------------------------------------------------------
-- stempeln(): steht heute in stempeluhr-4.sql. Dieses Skript legte bis
-- 05.10.2026 die Fassung mit 10 Angaben an – ohne automatische Pause und nur
-- mit den festen Bereichen. Erneut ausgeführt hätte es die heutige Fassung
-- (stempeluhr-4.sql und bereiche-eigen.sql) überschrieben. Deshalb hier nur:
-- die alte Fassung mit 9 Angaben (aus stempeluhr-2.sql) entfernen.
-- ---------------------------------------------------------------------------
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[]);

-- Kontrolle (stempeln_fassungen: 1 – bei der Ersteinrichtung 0, bis stempeluhr-4.sql gelaufen ist)
select 'ok' as stempeluhr_teil_3,
       (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = 'stempeln') as stempeln_fassungen;
