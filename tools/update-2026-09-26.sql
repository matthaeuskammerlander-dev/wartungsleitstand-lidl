-- Aktualisierung vom 26.09.2026 – einmal im Supabase SQL Editor ausführen.
-- Mehrfach ausführen schadet nicht. (Steht auch in supabase-setup.sql.)

-- 1. Rapportbericht von Lidl an Wartungs- und Störungsprotokollen
alter table public.protokolle add column if not exists rapport jsonb;

-- 2. „Rückgängig machen“ im Änderungsverlauf: der Stand davor
alter table public.aenderungen add column if not exists rueck jsonb;

-- Kontrolle: muss zwei Zeilen zeigen (protokolle.rapport, aenderungen.rueck)
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'protokolle' and column_name = 'rapport')
     or (table_name = 'aenderungen' and column_name = 'rueck'));
