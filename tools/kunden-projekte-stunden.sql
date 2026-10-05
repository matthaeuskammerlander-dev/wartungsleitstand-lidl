-- Weitere Kunden, Projekte und Arbeitszeiten (Büro 01.10.2026)
-- Einmal im Supabase SQL Editor ausführen (nach rollen.sql). Mehrfach
-- ausführbar – auch nach den späteren Skripten (Stand 05.10.2026): die Regeln
-- „zeiten erfassen“ und „zeiten loeschen“ stehen hier auf dem Stand von
-- stempeluhr.sql (von Hand nur Einträge „hand“, gestempelte löscht nur der
-- Inhaber), die Regeln für Projektdateien wie in nur-inhaber-buero.sql.
-- Tabellen und die Ablage legt es nur an, wenn sie fehlen – spätere
-- Änderungen (Projekt-Schritte, Dateitypen, weitere Spalten) bleiben.
--
-- 1. Weitere Kunden außer Lidl: ein Kunde ist ein Eintrag in stammdaten
--    (typ 'kunde', ziel = Kennung). Ein Markt/Standort gehört zu einem Kunden
--    über felder.kundeId – ohne Angabe ist es Lidl. Ein Konto mit der Rolle
--    „kunde“ sieht nur die Standorte, Anlagen, Störungen und Protokolle
--    SEINES Kunden (rollen.kunde_id, leer = Lidl). Das prüft die Datenbank
--    selbst – Lidl sieht nie etwas von anderen Kunden und umgekehrt.
-- 2. Projekte (Anfrage → Angebot → Auftrag → Baustelle → Inbetriebnahme →
--    abgeschlossen → abgerechnet) mit Tagebuch und Dateien. Angebote und
--    Rechnungen (Dateien unter buero/…) sehen NUR Inhaber (01.10.2026: keine Admins).
-- 3. Arbeitszeiten: jede Person erfasst ihre Stunden, sieht nur die eigenen.
--    Inhaber sehen alle und bestätigen den Monat – danach ist er gesperrt.

-- ---------------------------------------------------------------------------
-- 1. Kunden: wer darf was sehen
-- ---------------------------------------------------------------------------
alter table public.rollen add column if not exists kunde_id text;   -- nur für Rolle kunde: leer = Lidl

create or replace function public.mein_kunde() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(kunde_id,'') from public.rollen where user_id = auth.uid()), 'lidl');
$$;
-- Kunde eines Standorts: aus seinem Stammdaten-Eintrag, sonst Lidl (die Excel-Liste ist Lidl)
create or replace function public.standort_kunde(sid text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(felder->>'kundeId','') from public.stammdaten where id = 'standort:' || sid), 'lidl');
$$;
-- Darf das angemeldete Konto diesen Standort sehen? Mitarbeiter immer, ein Kunde nur seine eigenen.
create or replace function public.kunde_sieht(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.meine_rolle() <> 'kunde' or public.standort_kunde(sid) = public.mein_kunde();
$$;

-- Stammdaten für Kunde und Präsentation: ohne Zugangsdaten, ein Kunde nur seine eigenen
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' as felder,
         neu, geaendert, von, grund
    from public.stammdaten
   where auth.uid() is not null
     and (public.meine_rolle() <> 'kunde'
          or case typ when 'kunde'    then ziel = public.mein_kunde()
                      when 'standort' then public.kunde_sieht(ziel)
                      when 'stoerung' then public.kunde_sieht(ziel)
                      when 'position' then public.kunde_sieht(felder->>'standortId')
                      else true end);
revoke all on public.stammdaten_lesen from public, anon, authenticated;
grant select on public.stammdaten_lesen to authenticated;

-- Protokolle: ein Kunde nur die seiner Standorte
drop policy if exists "angemeldete lesen alle protokolle" on public.protokolle;
create policy "angemeldete lesen alle protokolle" on public.protokolle for select to authenticated
  using (public.kunde_sieht(standort_id));

drop policy if exists "fassungen lesen" on public.protokoll_fassungen;
create policy "fassungen lesen" on public.protokoll_fassungen for select to authenticated
  using (public.meine_rolle() <> 'kunde'
         or exists (select 1 from public.protokolle p where p.id = protokoll_fassungen.protokoll_id));

-- Archiv-PDFs: ein Kunde nur die seiner Protokolle
drop policy if exists "berichte lesen" on public.berichte;
create policy "berichte lesen" on public.berichte for select to authenticated
  using (public.meine_rolle() <> 'kunde'
         or exists (select 1 from public.protokolle p where p.client_id = berichte.client_id));
drop policy if exists "berichte ansehen" on storage.objects;
create policy "berichte ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'berichte'
         and (public.meine_rolle() <> 'kunde'
              or exists (select 1 from public.berichte b where b.pfad = storage.objects.name)));

-- ---------------------------------------------------------------------------
-- 2. Projekte
-- ---------------------------------------------------------------------------
create table if not exists public.projekte (
  id            uuid primary key default gen_random_uuid(),
  nummer        text unique,                    -- P-2026-001 (vergibt die App)
  titel         text not null check (length(trim(titel)) between 1 and 200),
  kunde_id      text,                           -- 'lidl' oder Kennung des Kunden (stammdaten typ kunde)
  standort_id   text,                           -- Standort/Markt, falls schon angelegt
  status        text not null default 'anfrage'
                check (status in ('anfrage','angebot','auftrag','baustelle','inbetriebnahme','abgeschlossen','abgerechnet','verloren')),
  daten         jsonb not null default '{}'::jsonb,   -- Angaben je Schritt, Dateien, verknüpfte Anlagen
  verlauf       jsonb not null default '[]'::jsonb,   -- Tagebuch: [{zeit, wer, text, status}]
  erstellt      timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert     timestamptz not null default now(),
  geaendert_von text
);
create index if not exists projekte_status_idx on public.projekte (status);
alter table public.projekte enable row level security;
drop policy if exists "projekte lesen"    on public.projekte;
drop policy if exists "projekte anlegen"  on public.projekte;
drop policy if exists "projekte aendern"  on public.projekte;
drop policy if exists "projekte loeschen" on public.projekte;
create policy "projekte lesen"    on public.projekte for select to authenticated using (public.darf_schreiben());
create policy "projekte anlegen"  on public.projekte for insert to authenticated with check (public.darf_schreiben());
create policy "projekte aendern"  on public.projekte for update to authenticated
  using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "projekte loeschen" on public.projekte for delete to authenticated using (public.ist_inhaber());
revoke all on public.projekte from anon;
grant select, insert, update, delete on public.projekte to authenticated;

-- Dateien zu Projekten (Pläne, Fotos, Angebote, Rechnungen, Unterlagen)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projektdateien', 'projektdateien', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/heic','text/plain','text/csv',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/zip'])
on conflict (id) do nothing;
drop policy if exists "projektdateien ansehen"   on storage.objects;
drop policy if exists "projektdateien hochladen" on storage.objects;
drop policy if exists "projektdateien loeschen"  on storage.objects;
-- buero/… (Angebote, Rechnungen, Preise): NUR Inhaber – keine Admins
-- (Büro 01.10.2026: nur die Inhaber, auch keine Admins)
create policy "projektdateien ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien' and public.darf_schreiben()
         and (name not like 'buero/%' or public.ist_inhaber()));
create policy "projektdateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'projektdateien' and public.darf_schreiben()
              and (name not like 'buero/%' or public.ist_inhaber()));
create policy "projektdateien loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'projektdateien'
         and (case when name like 'buero/%' then public.ist_inhaber()
                   else (owner = auth.uid() or public.ist_admin()) end));

-- Team-Chat: Nachrichten können auch an einem Projekt hängen
alter table public.chat drop constraint if exists chat_bezug_art_check;
alter table public.chat add constraint chat_bezug_art_check
  check (bezug_art in ('markt','anlage','stoerung','protokoll','projekt'));

-- ---------------------------------------------------------------------------
-- 3. Arbeitszeiten
-- ---------------------------------------------------------------------------
create table if not exists public.arbeitszeiten (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text,
  datum        date not null,
  beginn       text check (beginn is null or beginn ~ '^\d\d:\d\d$'),
  ende         text check (ende   is null or ende   ~ '^\d\d:\d\d$'),
  pause_min    integer not null default 0 check (pause_min between 0 and 600),
  minuten      integer not null check (minuten between 0 and 1440),   -- angerechnete Zeit
  art          text not null default 'arbeit'
               check (art in ('arbeit','urlaub','krank','feiertag','zeitausgleich','schule','sonstiges')),
  taetigkeit   text check (taetigkeit is null or length(taetigkeit) <= 300),
  standort_id  text,
  projekt_id   uuid,
  notiz        text check (notiz is null or length(notiz) <= 500),
  erstellt     timestamptz not null default now(),
  geaendert    timestamptz not null default now(),
  bestaetigt   timestamptz,                 -- vom Inhaber bestätigt: danach gesperrt
  bestaetigt_von text
);
-- woher der Eintrag kommt (Stempeluhr, Kalender …) – hier nur, damit die Regeln unten sie
-- kennen; die erlaubten Werte setzen stempeluhr.sql, stunden-kalender.sql und stempel-abgleich.sql
alter table public.arbeitszeiten add column if not exists quelle text not null default 'hand';
create index if not exists arbeitszeiten_user_datum_idx on public.arbeitszeiten (user_id, datum);
create index if not exists arbeitszeiten_datum_idx on public.arbeitszeiten (datum);
alter table public.arbeitszeiten enable row level security;
drop policy if exists "zeiten lesen"     on public.arbeitszeiten;
drop policy if exists "zeiten erfassen"  on public.arbeitszeiten;
drop policy if exists "zeiten aendern"   on public.arbeitszeiten;
drop policy if exists "zeiten loeschen"  on public.arbeitszeiten;
create policy "zeiten lesen" on public.arbeitszeiten for select to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());
-- von Hand: nur Einträge „hand“; gestempelte darf man nicht löschen (nur der Inhaber) – wie stempeluhr.sql
create policy "zeiten erfassen" on public.arbeitszeiten for insert to authenticated
  with check ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand' and public.darf_schreiben()) or public.ist_inhaber());
create policy "zeiten aendern" on public.arbeitszeiten for update to authenticated
  using ((user_id = auth.uid() and bestaetigt is null) or public.ist_inhaber())
  with check ((user_id = auth.uid() and bestaetigt is null) or public.ist_inhaber());
create policy "zeiten loeschen" on public.arbeitszeiten for delete to authenticated
  using ((user_id = auth.uid() and bestaetigt is null and quelle = 'hand') or public.ist_inhaber());
revoke all on public.arbeitszeiten from anon;
grant select, insert, update, delete on public.arbeitszeiten to authenticated;

-- Kontrolle
select 'projekte' as tabelle, count(*) from public.projekte
union all select 'arbeitszeiten', count(*) from public.arbeitszeiten
union all select 'kunden', count(*) from public.stammdaten where typ = 'kunde';
