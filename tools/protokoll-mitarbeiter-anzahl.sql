-- Weitere Arbeitskräfte ohne Namen im Protokoll (Inhaber 09.10.2026: „es sollte auch möglich sein, einfach nur die Anzahl der
-- weiteren Arbeitskräfte mit anzugeben“). Im Supabase SQL Editor einmal ausführen; mehrfach ausführen schadet nicht.
-- Muss VOR der App-Fassung laufen, die die Spalte liest (Protokolle laden sonst nicht).
alter table public.protokolle add column if not exists mitarbeiter_anzahl integer not null default 0;
alter table public.protokolle drop constraint if exists protokolle_mitarbeiter_anzahl_check;
alter table public.protokolle add constraint protokolle_mitarbeiter_anzahl_check check (mitarbeiter_anzahl between 0 and 50);
