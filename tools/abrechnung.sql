-- „Abgerechnet“-Haken für Protokolle – nur Inhaber sehen und setzen ihn.
-- Im Supabase SQL Editor einmal ausführen (mehrfach schadet nicht).
--
-- Eigene Tabelle statt einer Spalte in protokolle: ein Haken ist keine
-- Korrektur des Protokolls (keine neue Fassung, kein Eintrag im Verlauf der
-- Techniker), und Techniker, Kunde und Präsentation sehen davon nichts.
create table if not exists public.abrechnung (
  protokoll_id text primary key,          -- id des Protokolls
  abgerechnet  timestamptz not null default now(),
  von          text,                      -- Name aus „Meine Angaben“
  notiz        text                       -- z. B. Rechnungsnummer
);
alter table public.abrechnung enable row level security;
drop policy if exists "abrechnung inhaber lesen"   on public.abrechnung;
drop policy if exists "abrechnung inhaber setzen"  on public.abrechnung;
drop policy if exists "abrechnung inhaber aendern" on public.abrechnung;
drop policy if exists "abrechnung inhaber loeschen" on public.abrechnung;
create policy "abrechnung inhaber lesen"    on public.abrechnung for select to authenticated using (public.ist_inhaber());
create policy "abrechnung inhaber setzen"   on public.abrechnung for insert to authenticated with check (public.ist_inhaber());
create policy "abrechnung inhaber aendern"  on public.abrechnung for update to authenticated using (public.ist_inhaber()) with check (public.ist_inhaber());
create policy "abrechnung inhaber loeschen" on public.abrechnung for delete to authenticated using (public.ist_inhaber());
grant select, insert, update, delete on public.abrechnung to authenticated;
