-- Rapportbericht von Lidl an Wartungs- und Störungsprotokollen.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführen schadet nicht.
-- (Steht auch in supabase-setup.sql.)

alter table public.protokolle add column if not exists rapport jsonb;

-- Kontrolle: muss eine Zeile "rapport | jsonb" zeigen
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'protokolle' and column_name = 'rapport';
