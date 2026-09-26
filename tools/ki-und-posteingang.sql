-- KI-Erkennung und Mail-Posteingang – vorbereitet, erst ausführen, wenn es
-- losgehen soll (siehe KI-EINRICHTUNG.md und POSTEINGANG-EINRICHTUNG.md).
-- Mehrfach ausführen schadet nicht.
-- Setzt tools/rollen.sql voraus (Funktion darf_schreiben).

-- -------------------------------------------------------------A--------------
-- 1. KI-Nutzung: jeder Aufruf der Funktion ki-lesen mit Art, Bildzahl und
--    Tokens – für die Kostenübersicht und das Tageslimit je Person.
-- ---------------------------------------------------------------------------
create table if not exists public.ki_nutzung (
  id         bigint generated always as identity primary key,
  zeit       timestamptz not null default now(),
  user_id    uuid not null default auth.uid(),
  email      text,
  art        text not null,           -- pruefbuch | typenschild | auftrag
  bilder     integer,
  modell     text,
  tokens_ein integer,
  tokens_aus integer
);
create index if not exists ki_nutzung_user_zeit_idx on public.ki_nutzung (user_id, zeit desc);
alter table public.ki_nutzung enable row level security;
drop policy if exists "ki eigene lesen"   on public.ki_nutzung;
drop policy if exists "ki eintragen"      on public.ki_nutzung;
create policy "ki eigene lesen" on public.ki_nutzung for select to authenticated
  using (user_id = auth.uid() or public.ist_admin());
create policy "ki eintragen" on public.ki_nutzung for insert to authenticated
  with check (user_id = auth.uid() and public.darf_schreiben());
-- kein update, kein delete: die Liste ist der Kostennachweis
grant select, insert on public.ki_nutzung to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Posteingang: was ins Datenbank-Postfach kommt (Aufträge und Rapporte von
--    Lidl). Das Skript auf der Synology legt jede PDF hier ab; in der App wird
--    sie einem Protokoll angehängt oder als offene Störung erfasst.
-- ---------------------------------------------------------------------------
create table if not exists public.posteingang (
  id           uuid primary key default gen_random_uuid(),
  eingang      timestamptz not null default now(),
  nachricht_id text,                  -- Message-ID der Mail: dieselbe Mail nie doppelt
  absender     text,
  betreff      text,
  dateiname    text not null,
  pfad         text not null,         -- im Bucket posteingang
  bytes        integer,
  art          text,                  -- rapport | auftrag | unbekannt (aus Dateiname/Betreff)
  status       text not null default 'neu',   -- neu | erledigt | verworfen
  bezug        text,                  -- Protokoll- bzw. Störungskennung, sobald zugeordnet
  erledigt_von text,
  erledigt_am  timestamptz,
  notiz        text
);
create unique index if not exists posteingang_mail_datei_idx on public.posteingang (nachricht_id, dateiname);
create index if not exists posteingang_status_idx on public.posteingang (status, eingang desc);
alter table public.posteingang enable row level security;
drop policy if exists "posteingang lesen"    on public.posteingang;
drop policy if exists "posteingang anlegen"  on public.posteingang;
drop policy if exists "posteingang erledigen" on public.posteingang;
create policy "posteingang lesen"     on public.posteingang for select to authenticated using (true);
create policy "posteingang anlegen"   on public.posteingang for insert to authenticated with check (public.darf_schreiben());
create policy "posteingang erledigen" on public.posteingang for update to authenticated
  using (public.darf_schreiben()) with check (public.darf_schreiben());
-- kein delete: „verworfen“ statt löschen, der Eingang bleibt nachvollziehbar
grant select, insert, update on public.posteingang to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posteingang', 'posteingang', false, 15728640,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
drop policy if exists "posteingang hochladen" on storage.objects;
drop policy if exists "posteingang ansehen"   on storage.objects;
create policy "posteingang hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'posteingang' and public.darf_schreiben());
create policy "posteingang ansehen"   on storage.objects for select to authenticated
  using (bucket_id = 'posteingang');

-- Kontrolle: zwei Tabellen und ein Bucket
select 'tabelle' as was, table_name as name from information_schema.tables
 where table_schema = 'public' and table_name in ('ki_nutzung','posteingang')
union all
select 'bucket', id from storage.buckets where id = 'posteingang';
