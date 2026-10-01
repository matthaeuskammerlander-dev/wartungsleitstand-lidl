-- Stempeluhr (Büro 01.10.2026): Ein- und Ausstempeln wie früher in Crewmeister.
-- Einmal im Supabase SQL Editor ausführen (nach kunden-projekte-stunden.sql).
-- Mehrfach ausführen schadet nicht.
--
-- * Die Zeit eines Stempels setzt die Datenbank (now()) – nicht das Handy. Wer
--   die Uhr am Handy verstellt, ändert nichts.
-- * Beim Ausstempeln rechnet die Datenbank selbst den Eintrag in arbeitszeiten
--   aus (von–bis, Pausen) – Quelle „stempel“. Von Hand lässt sich kein Eintrag
--   als „gestempelt“ ausgeben; ändert jemand einen gestempelten Eintrag
--   nachträglich, steht er als „stempel_geaendert“ da (sichtbar für den Inhaber).
-- * Standort: nur wenn der Inhaber ihn eingeschaltet hat (einstellungen,
--   stempel_standort). Dann fragt die App beim Stempeln EINMAL die Position ab
--   und speichert nur die Entfernung zum Markt bzw. Betrieb – nie Koordinaten
--   (die Datenbank weist lat/lon zurück), keine Verfolgung danach.
--   Vor dem Einschalten: Betriebsvereinbarung bzw. Zustimmung jeder Person,
--   Information nach DSGVO, Datenschutz-Folgenabschätzung prüfen.

-- ---------------------------------------------------------------------------
-- Einstellungen (nur der Inhaber ändert sie)
-- ---------------------------------------------------------------------------
create table if not exists public.einstellungen (
  schluessel text primary key,
  wert       jsonb not null,
  geaendert  timestamptz not null default now(),
  von        text
);
alter table public.einstellungen enable row level security;
drop policy if exists "einstellungen lesen"   on public.einstellungen;
drop policy if exists "einstellungen anlegen" on public.einstellungen;
drop policy if exists "einstellungen aendern" on public.einstellungen;
create policy "einstellungen lesen"   on public.einstellungen for select to authenticated using (public.darf_schreiben());
create policy "einstellungen anlegen" on public.einstellungen for insert to authenticated with check (public.ist_inhaber());
create policy "einstellungen aendern" on public.einstellungen for update to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());
revoke all on public.einstellungen from anon;
grant select, insert, update on public.einstellungen to authenticated;
insert into public.einstellungen (schluessel, wert) values ('stempel_standort', '{"an": false}'::jsonb)
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- Stempel: jeder Druck auf Ein / Pause / Weiter / Aus
-- ---------------------------------------------------------------------------
create table if not exists public.stempel (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text,
  art         text not null check (art in ('ein','pause','weiter','aus')),
  zeit        timestamptz not null default now(),
  standort_id text,
  projekt_id  uuid,
  taetigkeit  text check (taetigkeit is null or length(taetigkeit) <= 300),
  ort         jsonb check (ort is null or not (ort ? 'lat' or ort ? 'lon' or ort ? 'latitude' or ort ? 'longitude')),
  eintrag_id  uuid                                   -- beim Ausstempeln: der entstandene Eintrag
);
create index if not exists stempel_user_zeit_idx on public.stempel (user_id, zeit desc);
alter table public.stempel enable row level security;
drop policy if exists "stempel lesen"   on public.stempel;
drop policy if exists "stempel loeschen" on public.stempel;
create policy "stempel lesen" on public.stempel for select to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());
-- angelegt wird nur über die Funktion stempeln() (Zeit vom Server); ändern nie, löschen nur der Inhaber
create policy "stempel loeschen" on public.stempel for delete to authenticated using (public.ist_inhaber());
revoke all on public.stempel from anon, authenticated;
grant select, delete on public.stempel to authenticated;

-- ---------------------------------------------------------------------------
-- Arbeitszeiten: woher der Eintrag kommt, und die Entfernung beim Stempeln
-- ---------------------------------------------------------------------------
alter table public.arbeitszeiten add column if not exists quelle text not null default 'hand';
alter table public.arbeitszeiten add column if not exists ort jsonb;
alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_quelle_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_quelle_check
  check (quelle in ('hand','stempel','stempel_geaendert','stempel_nachgetragen'));

-- von Hand: nur Einträge „hand“; gestempelte darf man nicht löschen (nur der Inhaber)
drop policy if exists "zeiten erfassen" on public.arbeitszeiten;
create policy "zeiten erfassen" on public.arbeitszeiten for insert to authenticated
  with check ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand' and public.darf_schreiben()) or public.ist_inhaber());
drop policy if exists "zeiten loeschen" on public.arbeitszeiten;
create policy "zeiten loeschen" on public.arbeitszeiten for delete to authenticated
  using ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand') or public.ist_inhaber());

-- nachträglich geänderte Zeiten eines gestempelten Eintrags: kennzeichnen
create or replace function public.arbeitszeit_stempel_merken() returns trigger
language plpgsql as $$
begin
  if old.quelle in ('stempel','stempel_nachgetragen')
     and (new.datum is distinct from old.datum or new.beginn is distinct from old.beginn
          or new.ende is distinct from old.ende or new.pause_min is distinct from old.pause_min
          or new.minuten is distinct from old.minuten) then
    new.quelle := 'stempel_geaendert';
  elsif new.quelle is distinct from old.quelle and not public.ist_inhaber() then
    new.quelle := old.quelle;     -- die Quelle selbst setzt niemand von Hand um
  end if;
  return new;
end $$;
drop trigger if exists arbeitszeit_stempel_merken on public.arbeitszeiten;
create trigger arbeitszeit_stempel_merken before update on public.arbeitszeiten
  for each row execute function public.arbeitszeit_stempel_merken();

-- ---------------------------------------------------------------------------
-- stempeln(): der einzige Weg zu einem Stempel. Prüft die Reihenfolge, nimmt
-- die Zeit vom Server und legt beim Ausstempeln den Eintrag an.
-- p_ende_hand ('HH:MM'): vergessen auszustempeln – das tatsächliche Ende (muss
-- vor jetzt liegen); der Eintrag heißt dann „stempel_nachgetragen“.
-- ---------------------------------------------------------------------------
create or replace function public.stempeln(p_art text, p_standort text default null, p_projekt uuid default null,
  p_taetigkeit text default null, p_ort jsonb default null, p_name text default null, p_ende_hand text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'Europe/Vienna';
  letzt public.stempel; ein public.stempel; s public.stempel;
  pause_ab timestamptz := null; pause_sek numeric := 0; ende timestamptz := now();
  quelle text := 'stempel'; min integer; neu_id uuid; tag date;
begin
  if auth.uid() is null or not public.darf_schreiben() then raise exception 'Stempeln ist mit diesem Konto nicht möglich'; end if;
  if p_art not in ('ein','pause','weiter','aus') then raise exception 'unbekannte Stempelart'; end if;
  if p_ort is not null and (p_ort ? 'lat' or p_ort ? 'lon' or p_ort ? 'latitude' or p_ort ? 'longitude') then
    raise exception 'Koordinaten werden nicht gespeichert';
  end if;
  select * into letzt from public.stempel where user_id = auth.uid() order by zeit desc limit 1;
  if p_art = 'ein' and letzt.id is not null and letzt.art <> 'aus' then raise exception 'Du bist schon eingestempelt'; end if;
  if p_art = 'pause' and (letzt.id is null or letzt.art not in ('ein','weiter')) then raise exception 'Pause geht nur nach dem Einstempeln'; end if;
  if p_art = 'weiter' and (letzt.id is null or letzt.art <> 'pause') then raise exception 'Weiter geht nur nach einer Pause'; end if;
  if p_art = 'aus' and (letzt.id is null or letzt.art = 'aus') then raise exception 'Du bist nicht eingestempelt'; end if;

  if p_art <> 'aus' then
    insert into public.stempel (user_id, name, art, standort_id, projekt_id, taetigkeit, ort)
    values (auth.uid(), p_name, p_art,
            coalesce(p_standort, case when p_art <> 'ein' then letzt.standort_id end),
            coalesce(p_projekt,  case when p_art <> 'ein' then letzt.projekt_id end),
            coalesce(p_taetigkeit, case when p_art <> 'ein' then letzt.taetigkeit end), p_ort)
    returning * into s;
    return jsonb_build_object('stempel', to_jsonb(s));
  end if;

  -- Ausstempeln: ab dem letzten „ein“ rechnen
  select * into ein from public.stempel where user_id = auth.uid() and art = 'ein' order by zeit desc limit 1;
  if p_ende_hand is not null then
    if p_ende_hand !~ '^\d\d:\d\d$' then raise exception 'Ende bitte als HH:MM'; end if;
    ende := ((ein.zeit at time zone tz)::date + p_ende_hand::time) at time zone tz;
    if ende <= ein.zeit then ende := ende + interval '1 day'; end if;
    if ende > now() then raise exception 'Das Ende liegt in der Zukunft'; end if;
    quelle := 'stempel_nachgetragen';
  end if;
  for s in select * from public.stempel where user_id = auth.uid() and zeit >= ein.zeit order by zeit loop
    if s.art = 'pause' then pause_ab := s.zeit;
    elsif s.art = 'weiter' and pause_ab is not null then pause_sek := pause_sek + extract(epoch from s.zeit - pause_ab); pause_ab := null;
    end if;
  end loop;
  if pause_ab is not null then pause_sek := pause_sek + greatest(0, extract(epoch from ende - pause_ab)); end if;
  min := floor((extract(epoch from ende - ein.zeit) - pause_sek) / 60);
  if min > 1440 then raise exception 'Länger als 24 Stunden eingestempelt – bitte das tatsächliche Ende angeben'; end if;
  min := greatest(0, min);
  tag := (ein.zeit at time zone tz)::date;
  insert into public.arbeitszeiten (user_id, name, datum, beginn, ende, pause_min, minuten, art, taetigkeit,
                                    standort_id, projekt_id, quelle, ort)
  values (auth.uid(), coalesce(p_name, ein.name), tag,
          to_char(ein.zeit at time zone tz, 'HH24:MI'), to_char(ende at time zone tz, 'HH24:MI'),
          least(600, round(pause_sek / 60)), min, 'arbeit', coalesce(p_taetigkeit, ein.taetigkeit),
          coalesce(p_standort, ein.standort_id), coalesce(p_projekt, ein.projekt_id), quelle,
          case when ein.ort is null and p_ort is null then null else jsonb_build_object('ein', ein.ort, 'aus', p_ort) end)
  returning id into neu_id;
  insert into public.stempel (user_id, name, art, standort_id, projekt_id, taetigkeit, ort, eintrag_id)
  values (auth.uid(), p_name, 'aus', coalesce(p_standort, ein.standort_id), coalesce(p_projekt, ein.projekt_id),
          coalesce(p_taetigkeit, ein.taetigkeit), p_ort, neu_id)
  returning * into s;
  return jsonb_build_object('stempel', to_jsonb(s), 'eintrag', (select to_jsonb(a) from public.arbeitszeiten a where a.id = neu_id));
end $$;
revoke all on function public.stempeln(text, text, uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.stempeln(text, text, uuid, text, jsonb, text, text) to authenticated;

-- Kontrolle
select (select count(*) from public.stempel) as stempel,
       (select wert from public.einstellungen where schluessel = 'stempel_standort') as standort;
