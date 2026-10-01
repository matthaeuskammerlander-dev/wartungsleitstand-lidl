-- Kalender und Aufgaben (Büro 01.10.2026): „Ich will alles hier drinnen planen können“.
--   * Termine: Wartung, Störung, Projekt/Baustelle, Büro, Werkstatt, Besprechung,
--     Urlaub, Krankenstand, Schule, privat (OOO), Sonstiges – mit Person(en),
--     Datum (auch mehrtägig), von–bis oder ganztägig
--   * Aufgaben (ToDo): mit Zuständigen, Details, Fälligkeit, Bezug (Projekt mit
--     Schritt, Markt, Anlage, Störung), erledigt
--   * PRIVAT: die anderen sehen nur „Abwesend“ und die Zeit – Titel und Details
--     stehen in planung_privat und sind nur für die Person selbst lesbar
--   * Urlaub: wer nicht Inhaber ist, beantragt ihn – genehmigt nur der Inhaber
--     (Trigger setzt sonst auf „beantragt“ zurück)
--   * Stunden: arbeitszeiten.planung_id verknüpft erfasste Zeit mit dem Termin
-- Lesen: wer mitarbeitet (nicht Kunde, nicht Präsentation). Archivkonto schreibt nie.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.planung (
  id              uuid primary key default gen_random_uuid(),
  art             text not null default 'termin' check (art in ('termin','aufgabe')),
  kategorie       text not null default 'sonstiges'
                  check (kategorie in ('wartung','stoerung','projekt','buero','werkstatt','besprechung',
                                       'urlaub','krank','schule','privat','sonstiges')),
  titel           text not null check (length(titel) between 1 and 200),
  details         text check (details is null or length(details) <= 4000),
  datum           date,                       -- Termin: Beginn; Aufgabe: fällig am (darf fehlen)
  datum_bis       date,                       -- mehrtägig (Urlaub, Baustelle)
  beginn          text check (beginn is null or beginn ~ '^\d\d:\d\d$'),
  ende            text check (ende   is null or ende   ~ '^\d\d:\d\d$'),
  wer             uuid[] not null default '{}',
  wer_namen       text[] not null default '{}',
  standort_id     text,
  anlage_id       text,
  projekt_id      uuid,
  projekt_schritt text,
  stoerung_id     text,
  status          text not null default 'offen'
                  check (status in ('offen','erledigt','beantragt','genehmigt','abgelehnt')),
  erledigt        timestamptz,
  erledigt_von    text,
  privat          boolean not null default false,
  erstellt        timestamptz not null default now(),
  erstellt_von    uuid not null default auth.uid(),
  erstellt_name   text,
  geaendert       timestamptz not null default now(),
  geaendert_von   text,
  check (art = 'aufgabe' or datum is not null),
  check (datum_bis is null or datum is null or datum_bis >= datum)
);
create index if not exists planung_datum_idx on public.planung (datum);
create index if not exists planung_projekt_idx on public.planung (projekt_id);
create index if not exists planung_wer_idx on public.planung using gin (wer);

-- private Einzelheiten: nur die Person selbst
create table if not exists public.planung_privat (
  planung_id uuid primary key references public.planung(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  titel      text check (titel is null or length(titel) <= 200),
  details    text check (details is null or length(details) <= 4000)
);

-- Regeln, die die App nicht umgehen kann
create or replace function public.planung_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- privat: in der allgemeinen Zeile steht nur „Abwesend“
  if new.privat then
    new.titel := 'Abwesend'; new.details := null;
    new.kategorie := 'privat';
    new.standort_id := null; new.anlage_id := null; new.projekt_id := null; new.projekt_schritt := null; new.stoerung_id := null;
  end if;
  if new.kategorie = 'privat' then new.privat := true; new.titel := 'Abwesend'; new.details := null; end if;
  -- Urlaub genehmigt/ablehnt nur der Inhaber; geänderter genehmigter Urlaub wird wieder beantragt
  if new.kategorie = 'urlaub' and not public.ist_inhaber() then
    if tg_op = 'INSERT' then
      new.status := 'beantragt';
    elsif new.status is distinct from old.status
       or new.datum is distinct from old.datum or new.datum_bis is distinct from old.datum_bis
       or new.wer is distinct from old.wer then
      if new.status in ('genehmigt','abgelehnt') and new.status is distinct from old.status then
        raise exception 'Urlaub genehmigt nur der Inhaber';
      end if;
      new.status := 'beantragt';
    end if;
  end if;
  if new.kategorie = 'urlaub' and new.status in ('offen','erledigt') then new.status := 'beantragt'; end if;
  if tg_op = 'INSERT' then new.erstellt_von := auth.uid(); new.erstellt := now();
  else new.erstellt_von := old.erstellt_von; new.erstellt := old.erstellt; end if;
  new.geaendert := now();
  return new;
end $$;
drop trigger if exists planung_pruefen on public.planung;
create trigger planung_pruefen before insert or update on public.planung
  for each row execute function public.planung_pruefen();

alter table public.planung enable row level security;
alter table public.planung_privat enable row level security;
drop policy if exists "planung lesen"    on public.planung;
drop policy if exists "planung anlegen"  on public.planung;
drop policy if exists "planung aendern"  on public.planung;
drop policy if exists "planung loeschen" on public.planung;
create policy "planung lesen"   on public.planung for select to authenticated using (public.darf_schreiben());
create policy "planung anlegen" on public.planung for insert to authenticated with check (public.darf_schreiben());
-- einen privaten Termin ändert nur, wer ihn angelegt hat oder eingetragen ist
create policy "planung aendern" on public.planung for update to authenticated
  using (public.darf_schreiben() and (not privat or erstellt_von = auth.uid() or auth.uid() = any(wer)))
  with check (public.darf_schreiben() and (not privat or erstellt_von = auth.uid() or auth.uid() = any(wer)));
create policy "planung loeschen" on public.planung for delete to authenticated
  using (erstellt_von = auth.uid() or auth.uid() = any(wer) or (not privat and public.ist_admin()) or (not privat and public.ist_inhaber()));
drop policy if exists "planung privat eigene" on public.planung_privat;
create policy "planung privat eigene" on public.planung_privat for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.darf_schreiben());
-- Archivkonto schreibt nie (wie tools/archiv-rolle.sql – gilt zusätzlich)
do $$
declare t text; a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach t in array array['planung','planung_privat'] loop
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
revoke all on public.planung, public.planung_privat from anon;
grant select, insert, update, delete on public.planung, public.planung_privat to authenticated;

-- Wartung einplanen: welche Wartungstermine (Positionen der Anlagen) eingeplant sind (Büro 01.10.2026)
alter table public.planung add column if not exists position_ids text[] not null default '{}';

-- Stunden ↔ Termin
alter table public.arbeitszeiten add column if not exists planung_id uuid;
create index if not exists arbeitszeiten_planung_idx on public.arbeitszeiten (planung_id);

-- Kontrolle
select 'planung' as tabelle, count(*) from public.planung
union all select 'planung_privat', count(*) from public.planung_privat;
