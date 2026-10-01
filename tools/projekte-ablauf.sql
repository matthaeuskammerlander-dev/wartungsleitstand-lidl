-- Baustellen-Ablauf A–Z (Büro 01.10.2026, am Projekt Deutschlandsberg):
-- Anfrage (Planer) → Begehung/Bestand → Konzept → Angebot → Auftrag →
-- Vorbereitung (Bestellungen, Termine) → Baustelle → Inbetriebnahme →
-- Dokumentation (Prüfbücher) → abgerechnet.
--
-- Dazu zwei Tabellen NUR für Inhaber (keine Admins – Preise sind Sache der
-- Geschäftsführung):
--   katalog  – Positionskatalog (Text, Einheit, Preis, Herkunft z. B. FB035/Pos. 38)
--   belege   – Angebote und Rechnungen. Solange KPlus führt, sind App-Belege
--              TEST-Belege mit eigener Nummer (T-…), damit sich nichts mit den
--              KPlus-Nummern überschneidet.
-- Es stehen KEINE Preise im Repository – Katalog und Belege liegen nur hier.
--
-- Einmal im Supabase SQL Editor ausführen (nach kunden-projekte-stunden.sql).
-- Mehrfach ausführbar.

-- 1. Projekt-Schritte
alter table public.projekte drop constraint if exists projekte_status_check;
alter table public.projekte add constraint projekte_status_check
  check (status in ('anfrage','begehung','konzept','angebot','auftrag','vorbereitung','baustelle',
                    'inbetriebnahme','abgeschlossen','abgerechnet','verloren'));

-- 2. Positionskatalog (nur Inhaber)
create table if not exists public.katalog (
  id          uuid primary key default gen_random_uuid(),
  nummer      text,                                   -- eigene Kurznummer, frei
  text        text not null check (length(trim(text)) between 1 and 4000),
  eh          text not null default 'Stk',            -- Stk, psh, Std, kg, lfm …
  preis       numeric(12,2),
  quelle      text,                                   -- z. B. „FB035/Pos.38“, „KPlus Angebot 413951“
  kunde_id    text,                                   -- Rahmenvertrag eines Kunden (lidl) oder leer = allgemein
  gruppe      text,                                   -- Geräte, Montage, Regie, Zuschläge …
  aktiv       boolean not null default true,
  erstellt    timestamptz not null default now(),
  geaendert   timestamptz not null default now(),
  geaendert_von text
);
alter table public.katalog enable row level security;
drop policy if exists "katalog inhaber" on public.katalog;
create policy "katalog inhaber" on public.katalog for all to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());

-- 3. Angebote und Rechnungen (nur Inhaber)
create table if not exists public.belege (
  id          uuid primary key default gen_random_uuid(),
  projekt_id  uuid references public.projekte(id) on delete set null,
  art         text not null check (art in ('angebot','rechnung')),
  nummer      text not null,
  test        boolean not null default true,          -- solange KPlus führt: Test-Beleg
  extern      boolean not null default false,         -- aus KPlus übernommen (nur zum Vergleich/Katalog)
  datum       date not null default current_date,
  status      text not null default 'entwurf'
              check (status in ('entwurf','versendet','angenommen','abgelehnt','bezahlt','storniert')),
  bezug_id    uuid references public.belege(id) on delete set null,   -- Rechnung → Angebot
  kopf        jsonb not null default '{}'::jsonb,     -- Empfänger, Betreff, Bestellung, Leistungszeitraum, Texte
  positionen  jsonb not null default '[]'::jsonb,     -- [{nr, menge, eh, text, preis, alternativ, katalog_id, gruppe}]
  summen      jsonb not null default '{}'::jsonb,     -- {netto, mwst, brutto, satz}
  pdf_pfad    text,
  erstellt    timestamptz not null default now(),
  geaendert   timestamptz not null default now(),
  geaendert_von text,
  unique (art, nummer)
);
create index if not exists belege_projekt_idx on public.belege (projekt_id);
alter table public.belege enable row level security;
drop policy if exists "belege inhaber" on public.belege;
create policy "belege inhaber" on public.belege for all to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());

-- Kontrolle
select (select count(*) from public.katalog) as katalog, (select count(*) from public.belege) as belege,
       pg_get_constraintdef((select oid from pg_constraint where conname = 'projekte_status_check')) as schritte;
