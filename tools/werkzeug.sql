-- Werkzeug und Material (Büro 04.10.2026): „dass man nichts vergisst – womöglich muss man es noch irgendwo
-- abholen; Werkzeug in Reparatur; für Projekte immer wieder dieselben Werkzeuge; wo liegt es gerade –
-- bei Darko im Auto, im Lager oder sonst wo“.
--   * werkzeug: Geräte und Werkzeuge mit Standort (Lager, Fahrzeug, bei Person, Baustelle/Markt, Reparatur,
--     sonst), Zustand, Prüfung/Kalibrierung fällig, zurück am. KEINE Preise.
--   * werkzeug_verlauf: jeder Standortwechsel mit Zeit und Name – schreibt nur der Trigger.
--   * bedarf: was für einen Einsatz gebraucht wird (Werkzeug oder Material) – mitnehmen, abholen (wo),
--     bestellen; Bezug Projekt, Störung, Kalendertermin oder Markt; offen → bestellt → abholbereit → erledigt.
--   * packlisten: wiederkehrende Listen (z. B. „VRV-Montage“), auf ein Projekt/einen Termin übernehmbar.
-- Lesen und Schreiben: wer mitarbeitet (nicht Kunde, nicht Präsentation, Archiv schreibt nie).
-- Löschen: Werkzeug und Packlisten nur Büro (Inhaber, Admin); Bedarf, wer ihn angelegt hat, oder Büro.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.werkzeug (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 120),
  nummer         text check (nummer is null or length(nummer) <= 40),          -- Inventar-Nr.
  gruppe         text check (gruppe is null or length(gruppe) <= 60),          -- z. B. Messgerät, Kälte, Elektro
  seriennummer   text check (seriennummer is null or length(seriennummer) <= 80),
  standort_art   text not null default 'lager'
                 check (standort_art in ('lager','fahrzeug','person','baustelle','reparatur','sonst')),
  standort_text  text check (standort_text is null or length(standort_text) <= 200),  -- Regal, Werkstatt, Reparatur bei …
  fahrzeug_id    uuid,
  fahrzeug_name  text check (fahrzeug_name is null or length(fahrzeug_name) <= 60),   -- Kennzeichen (Techniker sehen nur ihr Fahrzeug)
  person_id      uuid,
  person_name    text check (person_name is null or length(person_name) <= 80),
  projekt_id     uuid,
  standort_id    text,                                                            -- Markt
  zurueck_am     date,                                                            -- Reparatur/verliehen: erwartet zurück
  pruefen_bis    date,                                                            -- Prüfung/Kalibrierung fällig
  zustand        text not null default 'ok' check (zustand in ('ok','defekt','verloren')),
  notiz          text check (notiz is null or length(notiz) <= 1000),
  aktiv          boolean not null default true,
  erstellt       timestamptz not null default now(),
  erstellt_von   uuid default auth.uid(),
  geaendert      timestamptz not null default now(),
  geaendert_von  text
);
create index if not exists werkzeug_person_idx on public.werkzeug (person_id);
create index if not exists werkzeug_fahrzeug_idx on public.werkzeug (fahrzeug_id);
create index if not exists werkzeug_projekt_idx on public.werkzeug (projekt_id);

create table if not exists public.werkzeug_verlauf (
  id           uuid primary key default gen_random_uuid(),
  werkzeug_id  uuid not null references public.werkzeug(id) on delete cascade,
  zeit         timestamptz not null default clock_timestamp(),   -- mehrere Wechsel in einem Zug: richtige Reihenfolge
  von          uuid,
  von_name     text,
  standort     text,
  zustand      text,
  notiz        text
);
alter table public.werkzeug_verlauf alter column zeit set default clock_timestamp();
create index if not exists werkzeug_verlauf_idx on public.werkzeug_verlauf (werkzeug_id, zeit desc);

-- Standort als Text (für den Verlauf)
create or replace function public.werkzeug_standort_text(w public.werkzeug) returns text
language sql stable security definer set search_path = public as $$
  select case w.standort_art
    when 'lager'     then 'Lager'
    when 'fahrzeug'  then 'Fahrzeug ' || coalesce(w.fahrzeug_name, (select kennzeichen from public.fahrzeuge where id = w.fahrzeug_id), '?')
    when 'person'    then 'bei ' || coalesce(w.person_name, '?')
    when 'baustelle' then coalesce('Projekt ' || (select nummer from public.projekte where id = w.projekt_id), 'Baustelle/Markt')
    when 'reparatur' then 'in Reparatur'
    else 'sonst' end
    || coalesce(' – ' || nullif(btrim(w.standort_text), ''), '')
$$;

create or replace function public.werkzeug_merken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.erstellt := now(); new.erstellt_von := auth.uid();
  else new.erstellt := old.erstellt; new.erstellt_von := old.erstellt_von; end if;
  new.geaendert := now();
  -- Ort ohne passende Angabe aufräumen
  if new.standort_art <> 'fahrzeug' then new.fahrzeug_id := null; new.fahrzeug_name := null; end if;
  if new.standort_art <> 'person' then new.person_id := null; new.person_name := null; end if;
  if new.standort_art <> 'baustelle' then new.projekt_id := null; new.standort_id := null; end if;
  return new;
end $$;
drop trigger if exists werkzeug_merken on public.werkzeug;
create trigger werkzeug_merken before insert or update on public.werkzeug
  for each row execute function public.werkzeug_merken();

create or replace function public.werkzeug_verlauf_schreiben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.standort_art is distinct from old.standort_art or new.standort_text is distinct from old.standort_text
     or new.fahrzeug_id is distinct from old.fahrzeug_id or new.person_id is distinct from old.person_id
     or new.projekt_id is distinct from old.projekt_id or new.standort_id is distinct from old.standort_id
     or new.zustand is distinct from old.zustand then
    insert into public.werkzeug_verlauf (werkzeug_id, von, von_name, standort, zustand)
      values (new.id, auth.uid(), new.geaendert_von, public.werkzeug_standort_text(new), new.zustand);
  end if;
  return new;
end $$;
drop trigger if exists werkzeug_verlauf_schreiben on public.werkzeug;
create trigger werkzeug_verlauf_schreiben after insert or update on public.werkzeug
  for each row execute function public.werkzeug_verlauf_schreiben();

create table if not exists public.bedarf (
  id             uuid primary key default gen_random_uuid(),
  art            text not null default 'material' check (art in ('werkzeug','material')),
  text           text not null check (length(btrim(text)) between 1 and 200),
  menge          text check (menge is null or length(menge) <= 40),
  werkzeug_id    uuid references public.werkzeug(id) on delete set null,
  projekt_id     uuid,
  stoerung_id    text,
  planung_id     uuid references public.planung(id) on delete set null,   -- Termin gelöscht: der Eintrag bleibt (ohne Termin)
  standort_id    text,
  benoetigt_am   date,
  beschaffung    text not null default 'mitnehmen' check (beschaffung in ('mitnehmen','abholen','bestellen')),
  bezugsquelle   text check (bezugsquelle is null or length(bezugsquelle) <= 200),   -- wo abholen / bei wem bestellen
  status         text not null default 'offen' check (status in ('offen','bestellt','abholbereit','erledigt')),
  wer            uuid,
  wer_name       text,
  notiz          text check (notiz is null or length(notiz) <= 500),
  erledigt       timestamptz,
  erledigt_von   text,
  erstellt       timestamptz not null default now(),
  erstellt_von   uuid default auth.uid(),
  erstellt_name  text,
  geaendert      timestamptz not null default now()
);
-- nach dem Einsatz einmal gefragt: „Wo ist das Werkzeug jetzt?“ (Büro 04.10.2026)
alter table public.bedarf add column if not exists nachgefragt timestamptz;
create index if not exists bedarf_projekt_idx on public.bedarf (projekt_id);
create index if not exists bedarf_planung_idx on public.bedarf (planung_id);
create index if not exists bedarf_stoerung_idx on public.bedarf (stoerung_id);
create index if not exists bedarf_status_idx on public.bedarf (status);

create or replace function public.bedarf_merken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.erstellt := now(); new.erstellt_von := auth.uid();
  else new.erstellt := old.erstellt; new.erstellt_von := old.erstellt_von; end if;
  new.geaendert := now();
  if new.status = 'erledigt' and (tg_op = 'INSERT' or old.status is distinct from 'erledigt') then new.erledigt := now();
  elsif new.status <> 'erledigt' then new.erledigt := null; new.erledigt_von := null; end if;
  return new;
end $$;
drop trigger if exists bedarf_merken on public.bedarf;
create trigger bedarf_merken before insert or update on public.bedarf
  for each row execute function public.bedarf_merken();

create table if not exists public.packlisten (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 80),
  eintraege      jsonb not null default '[]',      -- [{art, text, menge, werkzeug_id}]
  erstellt       timestamptz not null default now(),
  geaendert      timestamptz not null default now(),
  geaendert_von  text
);

alter table public.werkzeug         enable row level security;
alter table public.werkzeug_verlauf enable row level security;
alter table public.bedarf           enable row level security;
alter table public.packlisten       enable row level security;

drop policy if exists "werkzeug lesen"    on public.werkzeug;
drop policy if exists "werkzeug anlegen"  on public.werkzeug;
drop policy if exists "werkzeug aendern"  on public.werkzeug;
drop policy if exists "werkzeug loeschen" on public.werkzeug;
create policy "werkzeug lesen"    on public.werkzeug for select to authenticated using (public.darf_schreiben());
create policy "werkzeug anlegen"  on public.werkzeug for insert to authenticated with check (public.darf_schreiben());
create policy "werkzeug aendern"  on public.werkzeug for update to authenticated using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "werkzeug loeschen" on public.werkzeug for delete to authenticated using (public.ist_admin() or public.ist_inhaber());

drop policy if exists "werkzeug verlauf lesen" on public.werkzeug_verlauf;
create policy "werkzeug verlauf lesen" on public.werkzeug_verlauf for select to authenticated using (public.darf_schreiben());

drop policy if exists "bedarf lesen"    on public.bedarf;
drop policy if exists "bedarf anlegen"  on public.bedarf;
drop policy if exists "bedarf aendern"  on public.bedarf;
drop policy if exists "bedarf loeschen" on public.bedarf;
create policy "bedarf lesen"    on public.bedarf for select to authenticated using (public.darf_schreiben());
create policy "bedarf anlegen"  on public.bedarf for insert to authenticated with check (public.darf_schreiben());
create policy "bedarf aendern"  on public.bedarf for update to authenticated using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "bedarf loeschen" on public.bedarf for delete to authenticated
  using (public.darf_schreiben() and (erstellt_von = auth.uid() or public.ist_admin() or public.ist_inhaber()));

drop policy if exists "packlisten lesen"    on public.packlisten;
drop policy if exists "packlisten anlegen"  on public.packlisten;
drop policy if exists "packlisten aendern"  on public.packlisten;
drop policy if exists "packlisten loeschen" on public.packlisten;
create policy "packlisten lesen"    on public.packlisten for select to authenticated using (public.darf_schreiben());
create policy "packlisten anlegen"  on public.packlisten for insert to authenticated with check (public.darf_schreiben());
create policy "packlisten aendern"  on public.packlisten for update to authenticated using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "packlisten loeschen" on public.packlisten for delete to authenticated using (public.ist_admin() or public.ist_inhaber());

-- Archivkonto schreibt nie (wie tools/archiv-rolle.sql – gilt zusätzlich)
do $$
declare t text; a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach t in array array['werkzeug','bedarf','packlisten'] loop
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
revoke all on public.werkzeug, public.werkzeug_verlauf, public.bedarf, public.packlisten from anon;
grant select, insert, update, delete on public.werkzeug, public.bedarf, public.packlisten to authenticated;
grant select on public.werkzeug_verlauf to authenticated;

-- Kontrolle
select 'werkzeug' as tabelle, count(*) from public.werkzeug
union all select 'bedarf', count(*) from public.bedarf
union all select 'packlisten', count(*) from public.packlisten;
