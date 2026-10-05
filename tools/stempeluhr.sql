-- Nach einem erneuten Lauf gelten zusätzlich die Sperren aus tools/rechte-2026-10-05.sql (eigene Namen, werden hier nicht entfernt).
-- Stempeluhr (Büro 01.10.2026): Ein- und Ausstempeln wie früher in Crewmeister.
-- Einmal im Supabase SQL Editor ausführen (nach kunden-projekte-stunden.sql).
-- Mehrfach ausführbar – auch nach den späteren Skripten (stempeluhr-2/-3/-4,
-- bereiche-eigen, stunden-kalender, stempel-abgleich; Stand 05.10.2026):
-- erlaubte Quellen und Trigger unten stehen auf deren Stand. Die Funktion
-- stempeln() legt dieses Skript NICHT mehr an – sie steht heute nur in
-- stempeluhr-4.sql (seit 05.10.2026 mit der Bereichsprüfung aus
-- bereiche-eigen.sql). Ersteinrichtung: danach stempeluhr-2.sql, -3, -4 und
-- bereiche-eigen.sql ausführen.
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
-- erlaubte Quellen: Stand von stempel-abgleich.sql und stunden-kalender.sql
alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_quelle_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_quelle_check
  check (quelle in ('hand','stempel','stempel_geaendert','stempel_nachgetragen','stempel_abgeglichen','kalender'));

-- von Hand: nur Einträge „hand“; gestempelte darf man nicht löschen (nur der Inhaber)
drop policy if exists "zeiten erfassen" on public.arbeitszeiten;
create policy "zeiten erfassen" on public.arbeitszeiten for insert to authenticated
  with check ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand' and public.darf_schreiben()) or public.ist_inhaber());
drop policy if exists "zeiten loeschen" on public.arbeitszeiten;
create policy "zeiten loeschen" on public.arbeitszeiten for delete to authenticated
  using ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand') or public.ist_inhaber());

-- nachträglich geänderte Zeiten eines gestempelten (auch abgeglichenen) Eintrags: kennzeichnen;
-- Kalender-Einträge, die jemand selbst ändert, werden „hand“; die Quelle setzt niemand von Hand um.
-- Gleiche Fassung wie in stempel-abgleich.sql und stunden-kalender.sql.
create or replace function public.arbeitszeit_stempel_merken() returns trigger
language plpgsql as $$
declare zeit_geaendert boolean := new.datum is distinct from old.datum or new.beginn is distinct from old.beginn
          or new.ende is distinct from old.ende or new.pause_min is distinct from old.pause_min or new.minuten is distinct from old.minuten;
begin
  if coalesce(current_setting('ukt.kalender_sync', true), '') = '1' then return new; end if;
  if old.quelle = 'kalender' and (zeit_geaendert or new.art is distinct from old.art) then
    new.quelle := 'hand';
  elsif old.quelle in ('stempel','stempel_nachgetragen','stempel_abgeglichen') and zeit_geaendert then
    new.quelle := 'stempel_geaendert';
  elsif new.quelle is distinct from old.quelle and not public.ist_inhaber() then
    new.quelle := old.quelle;
  end if;
  return new;
end $$;
drop trigger if exists arbeitszeit_stempel_merken on public.arbeitszeiten;
create trigger arbeitszeit_stempel_merken before update on public.arbeitszeiten
  for each row execute function public.arbeitszeit_stempel_merken();

-- ---------------------------------------------------------------------------
-- stempeln(): der einzige Weg zu einem Stempel. Prüft die Reihenfolge, nimmt
-- die Zeit vom Server und legt beim Ausstempeln den Eintrag an.
-- Die Funktion steht heute nur in stempeluhr-4.sql (seit 05.10.2026 mit der
-- Bereichsprüfung aus bereiche-eigen.sql). Dieses Skript legte bis 05.10.2026 eine erste Fassung
-- mit 7 Angaben an, die stempeluhr-2.sql entfernt und ersetzt hat. Erneut
-- angelegt läge sie als zweite, veraltete Fassung neben der heutigen
-- (ohne Umstempeln, Bereich und automatische Pause; bereiche-eigen.sql
-- bricht dann ab). Deshalb hier nur: eine solche alte Fassung entfernen –
-- dasselbe tut stempeluhr-2.sql. Die heutige Fassung bleibt unberührt.
-- ---------------------------------------------------------------------------
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text);

-- Kontrolle (stempeln_fassungen: 1 – bei der Ersteinrichtung 0, bis stempeluhr-4.sql gelaufen ist)
select (select count(*) from public.stempel) as stempel,
       (select wert from public.einstellungen where schluessel = 'stempel_standort') as standort,
       (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = 'stempeln') as stempeln_fassungen;
