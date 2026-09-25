-- Wartungsprotokolle für den Wartungsleitstand Lidl
-- Einmalig im Supabase-Projekt ausführen: SQL Editor -> New query -> einfügen -> Run.
-- Das Skript lässt sich jederzeit erneut ausführen; bereits Vorhandenes bleibt.
-- Ganz unten stehen die Tabellenrechte für die Data API – seit 30.10.2026
-- vergibt Supabase sie nicht mehr von selbst (siehe Erklärung dort).

create table if not exists public.protokolle (
  id                    uuid primary key default gen_random_uuid(),
  erstellt              timestamptz not null default now(),
  erstellt_von          uuid not null references auth.users(id) on delete restrict,

  -- Zuordnung zum Anlagenstamm
  standort_id           text,
  position_id           text,
  position_ids          jsonb not null default '[]'::jsonb,  -- alle bei diesem Besuch gewarteten Anlagen
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
  unterschrift          text,         -- PNG als Data-URL

  -- Verweise auf die Bilder im Speicher-Bucket "protokollfotos".
  -- Die Bilddaten selbst liegen dort, nicht in dieser Tabelle.
  fotos                 jsonb not null default '[]'::jsonb
);

-- Wer das Skript schon einmal ausgefuehrt hat: "create table if not exists"
-- legt spaeter ergaenzte Spalten nicht an. Das holen diese Zeilen nach.
alter table public.protokolle add column if not exists position_ids    jsonb not null default '[]'::jsonb;
alter table public.protokolle add column if not exists fotos           jsonb not null default '[]'::jsonb;
-- Kennung aus der App: unter ihr liegen die Fotos, und eine wiederholte
-- Uebertragung legt kein doppeltes Protokoll an
alter table public.protokolle add column if not exists client_id       text;
alter table public.protokolle add column if not exists version         integer not null default 1;
alter table public.protokolle add column if not exists geaendert       timestamptz;
alter table public.protokolle add column if not exists korrektur_grund text;
-- Loeschen = als geloescht markieren; das Protokoll bleibt nachvollziehbar
alter table public.protokolle add column if not exists geloescht       timestamptz;
alter table public.protokolle add column if not exists geloescht_von   text;
alter table public.protokolle add column if not exists loesch_grund    text;
-- Stoerungseinsaetze: Angaben aus dem Lidl-Auftrag und zur Behebung.
-- Leer bei Wartungen. Stoerungen haben wartungsart = 'Stoerung' und
-- verschieben deshalb keine Faelligkeit.
alter table public.protokolle add column if not exists stoerung        jsonb;
-- Rapportbericht von Lidl (Wartung und Störung): Name, Größe und was sich aus
-- der PDF lesen ließ. Die Datei selbst liegt im Bucket protokollfotos unter
-- <client_id>/rapport.pdf.
alter table public.protokolle add column if not exists rapport         jsonb;
-- zweiter und dritter Techniker, falls zu mehreren gearbeitet wurde
alter table public.protokolle add column if not exists mitarbeiter     jsonb;
create index if not exists protokolle_auftrag_idx on public.protokolle (auftragsnummer);
create unique index if not exists protokolle_client_id_idx on public.protokolle (client_id);

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

drop policy if exists "angemeldete korrigieren" on public.protokolle;

-- Korrigieren darf jeder angemeldete Techniker und das Buero – aber nur
-- mit Begruendung, und der urspruengliche Verfasser bleibt eingetragen.
create policy "angemeldete korrigieren"
  on public.protokolle for update
  to authenticated
  using (true)
  with check (korrektur_grund is not null and length(trim(korrektur_grund)) > 0);

-- Kein echtes delete: ein abgegebenes Protokoll ist ein Nachweis. Geloescht
-- wird durch Markieren (Spalte geloescht) – das duerfen nur Admins, siehe
-- Trigger "loeschen_nur_admins" weiter unten.

-- ---------------------------------------------------------------------------
-- Aenderungsverlauf
-- ---------------------------------------------------------------------------
create table if not exists public.aenderungen (
  id             uuid primary key default gen_random_uuid(),
  client_id      text unique,
  zeit           timestamptz not null default now(),
  art            text not null,          -- angelegt | korrigiert | geloescht
  protokoll_id   text,
  standort_id    text,
  standort_name  text,
  von            text,
  grund          text,
  felder         jsonb not null default '[]'::jsonb,   -- [{feld, name, alt, neu}]
  eingetragen_von uuid default auth.uid()
);
-- Stand davor bei Stammdaten-Änderungen – damit „Rückgängig machen“ exakt
-- zurücksetzen kann (je Eintrag die vorherige Fassung der Stammdaten-Zeile)
alter table public.aenderungen add column if not exists rueck jsonb;
create index if not exists aenderungen_zeit_idx      on public.aenderungen (zeit desc);
create index if not exists aenderungen_protokoll_idx on public.aenderungen (protokoll_id);

alter table public.aenderungen enable row level security;
drop policy if exists "verlauf lesen"     on public.aenderungen;
drop policy if exists "verlauf ergaenzen" on public.aenderungen;
create policy "verlauf lesen"     on public.aenderungen for select to authenticated using (true);
create policy "verlauf ergaenzen" on public.aenderungen for insert to authenticated with check (true);
-- Keine update- und keine delete-Regel: der Verlauf laesst sich nur ergaenzen.

-- ---------------------------------------------------------------------------
-- Fassungen: jede Korrektur sichert die vorherige Fassung vollstaendig.
-- Das passiert in der Datenbank selbst und laesst sich aus der App heraus
-- nicht umgehen – auch wenn jemand am Aenderungsverlauf vorbei schreibt.
-- ---------------------------------------------------------------------------
create table if not exists public.protokoll_fassungen (
  id           bigint generated always as identity primary key,
  protokoll_id uuid not null,
  client_id    text,
  version      integer,
  gesichert    timestamptz not null default now(),
  gesichert_von uuid default auth.uid(),
  daten        jsonb not null
);
alter table public.protokoll_fassungen enable row level security;
drop policy if exists "fassungen lesen" on public.protokoll_fassungen;
create policy "fassungen lesen" on public.protokoll_fassungen for select to authenticated using (true);

create or replace function public.protokoll_fassung_sichern() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.protokoll_fassungen (protokoll_id, client_id, version, daten)
  values (old.id, old.client_id, old.version, to_jsonb(old));
  return new;
end $$;

drop trigger if exists protokoll_fassung_sichern on public.protokolle;
create trigger protokoll_fassung_sichern
  before update on public.protokolle
  for each row execute function public.protokoll_fassung_sichern();


-- ---------------------------------------------------------------------------
-- Verwaltung: Admin-Rolle und Stammdaten-Aenderungen
-- ---------------------------------------------------------------------------
-- Wer hier eingetragen ist, darf Maerkte und Anlagen aendern. Eintragen nur
-- im Supabase-Dashboard – die App selbst kann niemanden zum Admin machen:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'ihre@adresse.at';
create table if not exists public.admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  hinzugefuegt timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "eigene rolle sehen" on public.admins;
create policy "eigene rolle sehen" on public.admins for select to authenticated using (user_id = auth.uid());
-- keine insert-, update- oder delete-Regel: aus der App heraus unveraenderbar

create or replace function public.ist_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Je Markt bzw. Anlage die Felder, die von der Excel-Liste abweichen
create table if not exists public.stammdaten (
  id        text primary key,            -- "standort:S12" oder "position:P9"
  typ       text not null,               -- standort | position
  ziel      text not null,
  felder    jsonb not null default '{}'::jsonb,
  neu       boolean not null default false,
  geaendert timestamptz not null default now(),
  von       text,
  grund     text
);
alter table public.stammdaten enable row level security;
drop policy if exists "stammdaten lesen"   on public.stammdaten;
drop policy if exists "stammdaten anlegen" on public.stammdaten;
drop policy if exists "stammdaten aendern" on public.stammdaten;
drop policy if exists "stammdaten zuruecksetzen" on public.stammdaten;
create policy "stammdaten lesen"   on public.stammdaten for select to authenticated using (true);
-- Maerkte aendern nur Admins. Anlagendaten (typ 'position') duerfen alle
-- angemeldeten Techniker ergaenzen – das passiert vor Ort beim Protokoll.
-- Offene Stoerungen (typ 'stoerung') ebenso: der Auftrag von Lidl kommt
-- herein, bevor jemand vor Ort war.
-- Jede Aenderung steht mit Name und Grund im Aenderungsverlauf.
create policy "stammdaten anlegen" on public.stammdaten for insert to authenticated
  with check (public.ist_admin() or typ in ('position','stoerung'));
create policy "stammdaten aendern" on public.stammdaten for update to authenticated
  using (public.ist_admin() or typ in ('position','stoerung'))
  with check (public.ist_admin() or typ in ('position','stoerung'));
create policy "stammdaten zuruecksetzen" on public.stammdaten for delete to authenticated using (public.ist_admin());

-- Protokolle loeschen und wiederherstellen: nur Admins. Das prueft die
-- Datenbank bei jeder Aenderung selbst, auch wenn jemand die App umgeht.
create or replace function public.loeschen_nur_admins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.geloescht is distinct from old.geloescht) and not public.ist_admin() then
    raise exception 'Nur Admins duerfen Protokolle loeschen oder wiederherstellen';
  end if;
  return new;
end $$;

drop trigger if exists loeschen_nur_admins on public.protokolle;
create trigger loeschen_nur_admins
  before update on public.protokolle
  for each row execute function public.loeschen_nur_admins();


-- Die Urheberschaft eines Protokolls bleibt, was sie ist. Die App schickt das
-- Feld bei einer Korrektur ohnehin nicht mit; dieser Trigger sorgt dafuer,
-- dass es auch sonst niemand umschreiben kann. Ein abgegebenes Protokoll ist
-- ein Nachweis - wer es geschrieben hat, muss nachvollziehbar bleiben.
create or replace function public.urheber_bleibt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.erstellt_von := old.erstellt_von;
  new.erstellt     := old.erstellt;
  return new;
end $$;

drop trigger if exists urheber_bleibt on public.protokolle;
create trigger urheber_bleibt
  before update on public.protokolle
  for each row execute function public.urheber_bleibt();


-- ---------------------------------------------------------------------------
-- Fotospeicher (und das Auftrags-PDF von Lidl)
-- ---------------------------------------------------------------------------
-- Nicht oeffentlich: die Dateien werden ueber zeitlich begrenzte Links
-- ausgeliefert, die die App fuer angemeldete Techniker erzeugt.
-- Im selben Bucket liegt bei einem Stoerungsprotokoll der Auftrag von Lidl
-- im Original, unter <protokollkennung>/auftrag.pdf, und der Rapportbericht,
-- den Lidl nach Abschluss des Auftrags erzeugt, unter <protokollkennung>/rapport.pdf.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protokollfotos', 'protokollfotos', false, 5242880,
        array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- Bestehende Ablage nachziehen: "on conflict do nothing" oben laesst einen
-- schon angelegten Bucket unberuehrt. Ohne diese Zeilen weist er das
-- Auftrags-PDF ab ("mime type not supported").
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','application/pdf'],
       file_size_limit    = greatest(coalesce(file_size_limit, 0), 5242880)
 where id = 'protokollfotos';

drop policy if exists "fotos hochladen"  on storage.objects;
drop policy if exists "fotos ansehen"    on storage.objects;

create policy "fotos hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'protokollfotos');

create policy "fotos ansehen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'protokollfotos');

-- Kein update, kein delete: Foto und Auftrags-PDF sind Teil des Nachweises
-- und verschwinden nicht nachtraeglich. Eine Korrektur kann ein Auftrags-PDF
-- nachreichen, aber keines ersetzen.

-- ---------------------------------------------------------------------------
-- Archiv: ein PDF je Protokoll, abgeholt von der Synology
-- ---------------------------------------------------------------------------
-- Die App legt nach jedem Speichern und jeder Korrektur das Protokoll als PDF
-- unter berichte/<jahr>/<kennung>.pdf ab und traegt es in die Tabelle
-- "berichte" ein. Das Skript auf der Synology liest diese Tabelle und holt
-- neue oder geaenderte PDFs in den Ordner Ukt/<jahr>/Lidl/Wartungen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('berichte', 'berichte', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "berichte hochladen"  on storage.objects;
drop policy if exists "berichte ersetzen"   on storage.objects;
drop policy if exists "berichte ansehen"    on storage.objects;
create policy "berichte hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'berichte');
-- ersetzen noetig, weil eine Korrektur das PDF unter gleichem Namen neu ablegt
create policy "berichte ersetzen" on storage.objects for update to authenticated
  using (bucket_id = 'berichte') with check (bucket_id = 'berichte');
create policy "berichte ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'berichte');

create table if not exists public.berichte (
  client_id    text primary key,     -- Kennung des Protokolls
  version      integer not null default 1,
  pfad         text not null,
  erstellt     timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
alter table public.berichte enable row level security;
drop policy if exists "berichte lesen"     on public.berichte;
drop policy if exists "berichte eintragen" on public.berichte;
drop policy if exists "berichte erneuern"  on public.berichte;
create policy "berichte lesen"     on public.berichte for select to authenticated using (true);
create policy "berichte eintragen" on public.berichte for insert to authenticated with check (true);
create policy "berichte erneuern"  on public.berichte for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Tabellenrechte fuer die Data API
--
-- Supabase hat neu angelegten Tabellen im Schema "public" bisher automatisch
-- die Rechte fuer die Data API mitgegeben. Ab 30. Oktober 2026 ist damit
-- Schluss: eine neu angelegte Tabelle ist ohne ausdrueckliches "grant" ueber
-- supabase-js nicht erreichbar, und die Antwort lautet "permission denied".
--
-- Fuer das laufende Projekt aendert sich nichts, die bestehenden Tabellen
-- behalten ihre Rechte. Die Zeilen hier stehen fuer den Fall, dass dieses
-- Skript einmal in einem frischen Projekt, einem Vorschau-Zweig oder nach
-- einem Zuruecksetzen laeuft. Ein zweites "grant" schadet nie.
--
-- Was hier steht, ist nur die Grundberechtigung auf die Tabelle. Welche
-- Zeilen jemand tatsaechlich sieht und schreiben darf, regeln weiterhin die
-- Policies weiter oben. "anon" – also jeder ohne Anmeldung – bekommt
-- bewusst gar nichts: ohne Anmeldung liest die App keine einzige Tabelle.
-- ---------------------------------------------------------------------------

grant select, insert, update          on public.protokolle          to authenticated;
grant select, insert                  on public.aenderungen         to authenticated;
grant select                          on public.protokoll_fassungen to authenticated;
grant select                          on public.admins              to authenticated;
grant select, insert, update, delete  on public.stammdaten          to authenticated;
grant select, insert, update          on public.berichte            to authenticated;

-- service_role umgeht die Policies und wird nur serverseitig verwendet
-- (Supabase-Oberflaeche, spaetere Hilfsprogramme). Der dazugehoerige
-- Schluessel gehoert ins Buero und nie in die App.
grant select, insert, update, delete on public.protokolle          to service_role;
grant select, insert, update, delete on public.aenderungen         to service_role;
grant select, insert, update, delete on public.protokoll_fassungen to service_role;
grant select, insert, update, delete on public.admins              to service_role;
grant select, insert, update, delete on public.stammdaten          to service_role;
grant select, insert, update, delete on public.berichte            to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- WICHTIG, sonst kann sich jeder aus dem Internet selbst einen Zugang anlegen:
-- Authentication -> Sign In / Providers -> "Allow new users to sign up" AUS.
-- Techniker-Konten legen Sie unter Authentication -> Users -> Add user an.


