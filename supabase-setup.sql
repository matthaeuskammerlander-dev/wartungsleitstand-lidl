-- Wartungsprotokolle für den Wartungsleitstand Lidl
-- Einmalig im Supabase-Projekt ausführen: SQL Editor -> New query -> einfügen -> Run.

create table if not exists public.protokolle (
  id                    uuid primary key default gen_random_uuid(),
  erstellt              timestamptz not null default now(),
  erstellt_von          uuid not null references auth.users(id) on delete restrict,

  -- Zuordnung zum Anlagenstamm
  standort_id           text,
  position_id           text,
  filiale               text,
  standort_name         text,
  adresse               text,
  region                text,

  -- Einsatz
  datum                 date,
  uhrzeit               text,
  bestellnummer         text,
  auftragsnummer        text,
  wartungsart           text,

  -- Wartungsunternehmen
  firma                 text,
  techniker             text,
  kontakt               text,
  subunternehmen        text,
  zert_unternehmen      text,
  zert_person           text,

  -- Anlagen, Arbeiten, Mängel als JSON-Listen
  anlagen               jsonb not null default '[]'::jsonb,
  arbeiten              jsonb not null default '[]'::jsonb,
  arbeiten_sonstiges    text,
  maengel               jsonb not null default '[]'::jsonb,

  -- Ergebnis
  betriebsbereit        text,
  sofortmassnahme       text,
  ergebnis              jsonb not null default '[]'::jsonb,
  bemerkungen           text,

  -- Abschluss
  name_techniker        text,
  auftraggebervertreter text,
  unterschrift          text          -- PNG als Data-URL
);

create index if not exists protokolle_erstellt_idx  on public.protokolle (erstellt desc);
create index if not exists protokolle_standort_idx  on public.protokolle (standort_id);
create index if not exists protokolle_datum_idx     on public.protokolle (datum);

-- Ohne RLS wäre die Tabelle mit dem öffentlichen anon-Key für jeden les- und
-- schreibbar. Die Seite liegt öffentlich auf GitHub Pages, also ist das Pflicht.
alter table public.protokolle enable row level security;

drop policy if exists "angemeldete lesen alle protokolle"    on public.protokolle;
drop policy if exists "angemeldete schreiben eigene"         on public.protokolle;
drop policy if exists "niemand aendert im nachhinein"        on public.protokolle;

-- Jeder angemeldete Techniker sieht alle Protokolle (Büro und Kollegen).
create policy "angemeldete lesen alle protokolle"
  on public.protokolle for select
  to authenticated
  using (true);

-- Schreiben nur im eigenen Namen, damit die Urheberschaft echt bleibt.
create policy "angemeldete schreiben eigene"
  on public.protokolle for insert
  to authenticated
  with check (erstellt_von = auth.uid());

-- Kein update, kein delete: ein abgegebenes Protokoll ist ein Nachweis.
-- Korrekturen laufen über ein neues Protokoll mit Bemerkung.

-- WICHTIG, sonst kann sich jeder aus dem Internet selbst einen Zugang anlegen:
-- Authentication -> Sign In / Providers -> "Allow new users to sign up" AUS.
-- Techniker-Konten legen Sie unter Authentication -> Users -> Add user an.
