-- Protokoll im Auftrag erfassen (Büro 02.10.2026): Admins und Inhaber dürfen ein
-- Protokoll für eine andere Person ausfüllen (Techniker/in = wer gearbeitet hat).
-- Wer es eingetragen hat, steht sichtbar daneben – hier als Name; das Konto steht
-- ohnehin in erstellt_von. Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.
alter table public.protokolle add column if not exists erfasst_von text;

-- Kontrolle
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'protokolle' and column_name = 'erfasst_von';
