-- Rollen: Inhaber, Admin, Techniker, Kunde, Präsentation.
-- Einmal im Supabase SQL Editor ausführen (nach update-2026-09-26.sql).
-- Mehrfach ausführen schadet nicht.
--
--   inhaber       Manfred, Matthäus – alles, dazu Rückgängig, KI-Kosten, Kontenübersicht
--   admin         Darko             – Verwaltung, Protokolle löschen/wiederherstellen
--   techniker     (Standard)        – Protokolle, Störungen, Anlagendaten
--   kunde         Lidl              – nur lesen, ohne Zugangsdaten der Regelungen
--   praesentation Vorführung        – Spielwiese: alles bedienbar wie Admin, gespeichert
--                                     wird nichts (die App hält es nur im Speicher,
--                                     die Datenbank sperrt das Schreiben zusätzlich)
--
-- Wer keinen Eintrag hat, ist Techniker. Admin-Rechte in der Datenbank kommen
-- weiter aus der Tabelle admins – Inhaber stehen dort zusätzlich.

create table if not exists public.rollen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rolle   text not null check (rolle in ('inhaber','admin','techniker','kunde','praesentation')),
  name    text
);
alter table public.rollen enable row level security;
drop policy if exists "rollen lesen" on public.rollen;
create policy "rollen lesen" on public.rollen for select to authenticated
  using (user_id = auth.uid() or public.ist_admin());
-- kein insert/update/delete aus der App: Rollen vergibt nur der SQL Editor
grant select on public.rollen to authenticated;

create or replace function public.meine_rolle() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select rolle from public.rollen where user_id = auth.uid()), 'techniker');
$$;
create or replace function public.darf_schreiben() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meine_rolle() not in ('kunde','praesentation');
$$;
create or replace function public.ist_inhaber() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meine_rolle() = 'inhaber';
$$;

-- ---------------------------------------------------------------------------
-- Schreiben nur, wer schreiben darf – die Datenbank prüft selbst
-- ---------------------------------------------------------------------------
drop policy if exists "angemeldete schreiben eigene" on public.protokolle;
create policy "angemeldete schreiben eigene" on public.protokolle for insert to authenticated
  with check (erstellt_von = auth.uid() and public.darf_schreiben());
drop policy if exists "angemeldete korrigieren" on public.protokolle;
create policy "angemeldete korrigieren" on public.protokolle for update to authenticated
  using (public.darf_schreiben())
  with check (public.darf_schreiben() and korrektur_grund is not null and length(trim(korrektur_grund)) > 0);

drop policy if exists "verlauf lesen"     on public.aenderungen;
drop policy if exists "verlauf ergaenzen" on public.aenderungen;
-- den internen Verlauf sieht nur, wer mitarbeitet
create policy "verlauf lesen"     on public.aenderungen for select to authenticated using (public.darf_schreiben());
create policy "verlauf ergaenzen" on public.aenderungen for insert to authenticated with check (public.darf_schreiben());

drop policy if exists "stammdaten lesen"   on public.stammdaten;
drop policy if exists "stammdaten anlegen" on public.stammdaten;
drop policy if exists "stammdaten aendern" on public.stammdaten;
drop policy if exists "stammdaten zuruecksetzen" on public.stammdaten;
-- Kunde und Präsentation lesen über die Sicht unten, ohne Zugangsdaten
create policy "stammdaten lesen"   on public.stammdaten for select to authenticated using (public.darf_schreiben());
create policy "stammdaten anlegen" on public.stammdaten for insert to authenticated
  with check (public.darf_schreiben() and (public.ist_admin() or typ in ('position','stoerung')));
create policy "stammdaten aendern" on public.stammdaten for update to authenticated
  using (public.darf_schreiben() and (public.ist_admin() or typ in ('position','stoerung')))
  with check (public.darf_schreiben() and (public.ist_admin() or typ in ('position','stoerung')));
create policy "stammdaten zuruecksetzen" on public.stammdaten for delete to authenticated using (public.ist_admin());

-- Stammdaten ohne Zugangsdaten der Regelungen – für Kunde und Präsentation
-- Eine View läuft mit den Rechten ihres Besitzers (umgeht also die RLS der
-- Tabelle). Deshalb: nur für Angemeldete, und nur lesen – die Standardrechte
-- (auch anon, auch insert/update/delete) werden ausdrücklich entzogen.
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' as felder,
         neu, geaendert, von, grund
    from public.stammdaten
   where auth.uid() is not null;
revoke all on public.stammdaten_lesen from public, anon, authenticated;
grant select on public.stammdaten_lesen to authenticated;

drop policy if exists "fotos hochladen" on storage.objects;
create policy "fotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'protokollfotos' and public.darf_schreiben());
drop policy if exists "berichte hochladen" on storage.objects;
drop policy if exists "berichte ersetzen"  on storage.objects;
create policy "berichte hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'berichte' and public.darf_schreiben());
create policy "berichte ersetzen" on storage.objects for update to authenticated
  using (bucket_id = 'berichte' and public.darf_schreiben())
  with check (bucket_id = 'berichte' and public.darf_schreiben());
drop policy if exists "berichte eintragen" on public.berichte;
drop policy if exists "berichte erneuern"  on public.berichte;
create policy "berichte eintragen" on public.berichte for insert to authenticated with check (public.darf_schreiben());
create policy "berichte erneuern"  on public.berichte for update to authenticated
  using (public.darf_schreiben()) with check (public.darf_schreiben());

-- ---------------------------------------------------------------------------
-- Rollen vergeben (Adressen anpassen, dann diesen Teil ausführen)
-- ---------------------------------------------------------------------------
-- insert into public.rollen (user_id, rolle, name)
--   select id, 'inhaber', 'Matthäus' from auth.users where email = 'matthaeus@…'
--   on conflict (user_id) do update set rolle = excluded.rolle, name = excluded.name;
-- insert into public.rollen (user_id, rolle, name)
--   select id, 'inhaber', 'Manfred' from auth.users where email = 'manfred@…'
--   on conflict (user_id) do update set rolle = excluded.rolle, name = excluded.name;
-- insert into public.rollen (user_id, rolle, name)
--   select id, 'admin', 'Darko' from auth.users where email = 'darko@…'
--   on conflict (user_id) do update set rolle = excluded.rolle, name = excluded.name;
-- Inhaber und Admins brauchen zusätzlich den Eintrag in admins:
-- insert into public.admins (user_id) select id from auth.users where email in ('matthaeus@…','manfred@…','darko@…')
--   on conflict do nothing;
-- Kunde / Präsentation: eigenes Konto anlegen (Authentication → Users), dann
-- insert into public.rollen (user_id, rolle, name) select id, 'kunde', 'Lidl' from auth.users where email = '…';

-- Kontrolle: wer hat welche Rolle
select u.email, coalesce(r.rolle,'techniker') as rolle, r.name,
       exists(select 1 from public.admins a where a.user_id = u.id) as admin_in_db
  from auth.users u left join public.rollen r on r.user_id = u.id
 order by 2, 1;
