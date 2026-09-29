-- Rückfragen des Kunden: Listen offener Wartungen und Störungsaufträge mit
-- Frist – im Supabase SQL Editor einmal ausführen. Mehrfach ausführen schadet
-- nicht. Die Zeilen selbst (Nummern, Märkte, Fristen) stehen nur in der
-- Datenbank, nie in dieser Datei – das Repository ist öffentlich.
--
-- Lesen darf, wer mitarbeitet (Kunde und Präsentation nicht); eintragen und
-- ändern nur das Büro (Admins und Inhaber).
create table if not exists public.kundenliste (
  id          text primary key,            -- art:nummer
  art         text not null check (art in ('wartung','stoerung')),
  nummer      text not null,               -- IH-Nr. bzw. Auftragsnummer des Kunden
  bezeichnung text,
  filial_code text,
  markt_name  text,                        -- wie es in der Liste des Kunden steht
  standort_id text,                        -- unser Markt (S…)
  position_id text,                        -- unser Termin (P…), nur bei Wartungen
  prio        text,
  frist       date,                        -- späteste Ausführung bzw. Rückmeldung bis
  liste_vom   date not null,
  geplant     date,
  erledigt    date,                        -- von Hand, falls bei uns kein Protokoll steht
  gemeldet    date,                        -- Antwort an den Kunden geschickt
  notiz       text check (notiz is null or length(notiz) <= 200),
  geaendert   timestamptz not null default now(),
  von         text
);
alter table public.kundenliste enable row level security;

drop policy if exists "kundenliste lesen" on public.kundenliste;
create policy "kundenliste lesen" on public.kundenliste for select to authenticated
  using (public.darf_schreiben());
drop policy if exists "kundenliste anlegen" on public.kundenliste;
create policy "kundenliste anlegen" on public.kundenliste for insert to authenticated
  with check (public.ist_admin());
drop policy if exists "kundenliste aendern" on public.kundenliste;
create policy "kundenliste aendern" on public.kundenliste for update to authenticated
  using (public.ist_admin()) with check (public.ist_admin());
drop policy if exists "kundenliste loeschen" on public.kundenliste;
create policy "kundenliste loeschen" on public.kundenliste for delete to authenticated
  using (public.ist_admin());

revoke all on public.kundenliste from anon;
grant select, insert, update, delete on public.kundenliste to authenticated;
