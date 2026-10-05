-- Nach einem erneuten Lauf gelten zusätzlich die Sperren aus tools/rechte-2026-10-05.sql (eigene Namen, werden hier nicht entfernt).
-- Fahrzeuge (Büro 02.10.2026): Kilometer je Fahrzeug, Pickerl (§ 57a), Service, Reparaturen, Schäden.
--   * fahrzeuge: Kennzeichen, Bezeichnung, zugeteilte Fahrer, nächstes Pickerl/Service,
--     tracker_id = Kennung des Fahrzeugs im Portal des GPS-Anbieters (X-GPS) für den Import
--   * fahrzeug_eintraege: km-Stand, gefahrene Strecke je Tag (Hand oder GPS-Import), Service,
--     Pickerl, Reparatur, Schaden (erledigt = behoben), Reifen, Sonstiges
--   * fahrzeug_kosten: Beträge zu einem Eintrag – NUR Inhaber (Preise nur Inhaber)
-- GPS: übernommen werden NUR Kilometer (Inhaber 02.10.2026). Orte, Uhrzeiten und Fahrten werden
--   nicht gespeichert – ein Fahrtenbuch mit Orten wäre Standortüberwachung der Mitarbeiter und
--   braucht vorher Zustimmung bzw. Betriebsvereinbarung (ArbVG § 96) und eine DSGVO-Information.
-- Lesen: Inhaber und Admins alle, Techniker nur die eigenen (zugeteilten) Fahrzeuge.
-- Schreiben: Fahrzeuge anlegen/ändern Inhaber und Admins; Einträge: Techniker für ihr Fahrzeug
--   nur km-Stand und Schaden, Inhaber/Admins alles. Archivkonto schreibt nie.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.fahrzeuge (
  id            uuid primary key default gen_random_uuid(),
  kennzeichen   text not null check (length(trim(kennzeichen)) between 1 and 20),
  bezeichnung   text check (bezeichnung is null or length(bezeichnung) <= 100),
  fahrer        uuid[] not null default '{}',
  fahrer_namen  text[] not null default '{}',
  erstzulassung date,
  pickerl_bis   date,                       -- nächste § 57a-Begutachtung (Monat zählt)
  service_bis   date,                       -- nächstes Service spätestens am
  service_km    integer check (service_km is null or service_km between 0 and 2000000),
  tracker_id    text check (tracker_id is null or length(tracker_id) <= 100),
  aktiv         boolean not null default true,
  notiz         text check (notiz is null or length(notiz) <= 2000),
  erstellt      timestamptz not null default now(),
  erstellt_von  uuid not null default auth.uid(),
  geaendert     timestamptz not null default now(),
  geaendert_von text
);

create table if not exists public.fahrzeug_eintraege (
  id           uuid primary key default gen_random_uuid(),
  fahrzeug_id  uuid not null references public.fahrzeuge(id) on delete cascade,
  art          text not null check (art in ('km','service','pickerl','reparatur','schaden','reifen','sonstiges')),
  datum        date not null,
  km           integer check (km is null or km between 0 and 2000000),          -- Kilometerstand
  strecke      numeric(8,1) check (strecke is null or strecke between 0 and 5000), -- gefahren an dem Tag
  text         text check (text is null or length(text) <= 2000),
  quelle       text not null default 'hand' check (quelle in ('hand','gps')),
  erledigt     boolean not null default false,                                  -- Schaden behoben
  erstellt     timestamptz not null default now(),
  erstellt_von uuid not null default auth.uid(),
  erstellt_name text
);
create index if not exists fahrzeug_eintraege_fz_idx on public.fahrzeug_eintraege (fahrzeug_id, datum);

create table if not exists public.fahrzeug_kosten (
  eintrag_id uuid primary key references public.fahrzeug_eintraege(id) on delete cascade,
  betrag     numeric(10,2) check (betrag is null or betrag between -100000 and 1000000),
  rechnung   text check (rechnung is null or length(rechnung) <= 100),
  geaendert  timestamptz not null default now()
);

create or replace function public.fahrzeug_buero() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_admin() or public.ist_inhaber();
$$;
create or replace function public.fahrzeug_meins(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fahrzeuge f where f.id = fid and auth.uid() = any(f.fahrer));
$$;

alter table public.fahrzeuge          enable row level security;
alter table public.fahrzeug_eintraege enable row level security;
alter table public.fahrzeug_kosten    enable row level security;

drop policy if exists "fahrzeuge lesen"    on public.fahrzeuge;
drop policy if exists "fahrzeuge anlegen"  on public.fahrzeuge;
drop policy if exists "fahrzeuge aendern"  on public.fahrzeuge;
drop policy if exists "fahrzeuge loeschen" on public.fahrzeuge;
create policy "fahrzeuge lesen"    on public.fahrzeuge for select to authenticated
  using (public.fahrzeug_buero() or auth.uid() = any(fahrer));
create policy "fahrzeuge anlegen"  on public.fahrzeuge for insert to authenticated with check (public.fahrzeug_buero() and public.darf_schreiben());
create policy "fahrzeuge aendern"  on public.fahrzeuge for update to authenticated
  using (public.fahrzeug_buero()) with check (public.fahrzeug_buero() and public.darf_schreiben());
create policy "fahrzeuge loeschen" on public.fahrzeuge for delete to authenticated using (public.ist_inhaber());

drop policy if exists "fz eintraege lesen"    on public.fahrzeug_eintraege;
drop policy if exists "fz eintraege anlegen"  on public.fahrzeug_eintraege;
drop policy if exists "fz eintraege aendern"  on public.fahrzeug_eintraege;
drop policy if exists "fz eintraege loeschen" on public.fahrzeug_eintraege;
create policy "fz eintraege lesen" on public.fahrzeug_eintraege for select to authenticated
  using (public.fahrzeug_buero() or public.fahrzeug_meins(fahrzeug_id));
create policy "fz eintraege anlegen" on public.fahrzeug_eintraege for insert to authenticated
  with check (public.darf_schreiben() and erstellt_von = auth.uid() and
    (public.fahrzeug_buero() or (public.fahrzeug_meins(fahrzeug_id) and art in ('km','schaden') and quelle = 'hand')));
create policy "fz eintraege aendern" on public.fahrzeug_eintraege for update to authenticated
  using (public.fahrzeug_buero()) with check (public.fahrzeug_buero() and public.darf_schreiben());
-- eigene Einträge am selben Tag zurücknehmen (vertippt), sonst nur das Büro
create policy "fz eintraege loeschen" on public.fahrzeug_eintraege for delete to authenticated
  using (public.fahrzeug_buero() or (erstellt_von = auth.uid() and erstellt > now() - interval '1 day'));

drop policy if exists "fz kosten nur inhaber" on public.fahrzeug_kosten;
create policy "fz kosten nur inhaber" on public.fahrzeug_kosten for all to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());

-- Archivkonto schreibt nie (wie überall)
do $$
declare t text; a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach t in array array['fahrzeuge','fahrzeug_eintraege','fahrzeug_kosten'] loop
      foreach a in array array['insert','update','delete'] loop
        execute format('drop policy if exists %I on public.%I', 'archiv schreibt nie ' || a, t);
        if a = 'insert' then
          execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.ist_archiv())', 'archiv schreibt nie ' || a, t);
        else
          execute format('create policy %I on public.%I as restrictive for %s to authenticated using (not public.ist_archiv())', 'archiv schreibt nie ' || a, t, a);
        end if;
      end loop;
    end loop;
  end if;
end $$;

grant select, insert, update, delete on public.fahrzeuge, public.fahrzeug_eintraege, public.fahrzeug_kosten to authenticated;
