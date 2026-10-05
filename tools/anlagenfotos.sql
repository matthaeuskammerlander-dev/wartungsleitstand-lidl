-- Prüfbuch- und Typenschild-Fotos an der Anlage – im Supabase SQL Editor einmal
-- ausführen. Mehrfach ausführen schadet nicht.
--
-- Die Bilder liegen im Speicher „protokollfotos“ unter anlagen/…; je Foto eine
-- Zeile. Sehen und speichern darf, wer mitarbeitet (Kunde und Präsentation
-- nicht); löschen nur das Büro.
create table if not exists public.anlagenfotos (
  id          uuid primary key default gen_random_uuid(),
  erstellt    timestamptz not null default now(),
  von         uuid default auth.uid() references auth.users(id) on delete set null,
  von_name    text,
  anlage_id   text,                         -- Leitzeile der Anlage (P…/NP…), leer bei noch nicht gespeicherter Anlage
  standort_id text,
  art         text not null check (art in ('pruefbuch','typenschild','anlage')),
  pfad        text not null unique,
  pruefsumme  text                          -- gleiches Foto nicht doppelt
);
create index if not exists anlagenfotos_anlage_idx on public.anlagenfotos (anlage_id);
alter table public.anlagenfotos enable row level security;

drop policy if exists "anlagenfotos lesen" on public.anlagenfotos;
create policy "anlagenfotos lesen" on public.anlagenfotos for select to authenticated using (public.darf_schreiben());
drop policy if exists "anlagenfotos speichern" on public.anlagenfotos;
create policy "anlagenfotos speichern" on public.anlagenfotos for insert to authenticated with check (public.darf_schreiben() and von = auth.uid());
drop policy if exists "anlagenfotos loeschen" on public.anlagenfotos;
create policy "anlagenfotos loeschen" on public.anlagenfotos for delete to authenticated using (public.ist_admin());
revoke all on public.anlagenfotos from anon;
grant select, insert, delete on public.anlagenfotos to authenticated;

-- Dateien: Bilder unter anlagen/… sieht nur, wer mitarbeitet (wie Chat-Fotos) –
-- dieselbe Fassung von „fotos ansehen“ wie in tools/chat.sql und tools/wunsch-fotos.sql.
-- Alles übrige liegt unter <client_id>/… (Protokollfotos, auftrag.pdf,
-- rapport….pdf): ein Kunden-Konto nur zu Protokollen, die es selbst lesen darf –
-- die Leseregel der Protokolle (tools/kunden-projekte-stunden.sql) sperrt es
-- auf die Standorte seines Kunden (seit 05.10.2026; vorher sah es alle).
drop policy if exists "fotos ansehen" on storage.objects;
create policy "fotos ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'protokollfotos'
         and case when name like 'wunsch/%'  then (owner = auth.uid() or public.ist_inhaber())
                  when name like 'chat/%'    then public.darf_schreiben()
                  when name like 'anlagen/%' then public.darf_schreiben()
                  else (public.meine_rolle() <> 'kunde'
                        or exists (select 1 from public.protokolle p
                                    where p.client_id = split_part(storage.objects.name, '/', 1)))
             end);

-- seit 01.10.2026: allgemeine Fotos der Anlage mit Beschriftung (Außengerät, Verrohrung …)
alter table public.anlagenfotos add column if not exists beschriftung text check (beschriftung is null or length(beschriftung) <= 80);
alter table public.anlagenfotos drop constraint if exists anlagenfotos_art_check;
alter table public.anlagenfotos add constraint anlagenfotos_art_check check (art in ('pruefbuch','typenschild','anlage'));
