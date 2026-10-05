-- Nach einem erneuten Lauf gelten zusätzlich die Sperren aus tools/rechte-2026-10-05.sql (eigene Namen, werden hier nicht entfernt).
-- Reisekosten und Kilometergeld (Büro 04.10.2026): „Techniker kaufen manchmal im Bauhaus mit privatem Geld
-- Material oder Werkzeug – mit Foto vom Beleg erfassen, am Monatsende als Liste an den Chef, damit er es
-- auszahlen kann“ und „die Abrechnung für Kilometer mit Privatauto“. Wie die bisherigen Excel-Blätter
-- „UKT Reisekosten: Barbelege“ und „Kilometer mit Privatauto“.
--   * auslagen: art 'beleg' (Datum, was/wo, Betrag, Foto im Speicher) oder 'km' (Datum, Strecke, km × Satz)
--   * offen → eingereicht (die Person gibt den Monat ab) → ausbezahlt (nur Inhaber). Eingereicht ändert nur noch
--     der Inhaber (oder er gibt zurück).
--   * jede Person sieht nur ihre eigenen, der Inhaber alle (wie Arbeitszeiten) – keine Admins.
--   * Kilometergeld-Satz aus einstellungen 'kilometergeld' (Standard 0,50 €/km), Betrag rechnet der Server.
--   * auslagen_konto: wohin ausbezahlt wird (IBAN) – die Person selbst und der Inhaber.
--   * fahrzeuge.privat_von: ein Privatauto (Kilometergeld an diese Person) – nur dafür gibt es Kilometergeld.
--   * Speicher „auslagen“: Belegfotos unter <user_id>/… – die Person und der Inhaber.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.auslagen (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text,
  art            text not null default 'beleg' check (art in ('beleg','km')),
  datum          date not null,
  text           text check (text is null or length(text) <= 300),         -- Beleg: wo/was; km: Strecke
  kategorie      text check (kategorie is null or kategorie in ('material','werkzeug','parken','maut','tanken','naechtigung','oeffis','post','sonstiges')),
  betrag         numeric(10,2) check (betrag is null or (betrag >= 0 and betrag <= 100000)),
  km             numeric(8,1) check (km is null or (km > 0 and km <= 5000)),
  km_satz        numeric(5,3),
  fahrzeug_id    uuid,
  fahrzeug_name  text check (fahrzeug_name is null or length(fahrzeug_name) <= 60),
  foto           text,                                                       -- Pfad im Speicher „auslagen“
  ohne_beleg     text check (ohne_beleg is null or length(ohne_beleg) <= 300), -- Grund, wenn es kein Foto gibt
  projekt_id     uuid,
  standort_id    text,
  bedarf_id      uuid,
  notiz          text check (notiz is null or length(notiz) <= 500),
  status         text not null default 'offen' check (status in ('offen','eingereicht','ausbezahlt')),
  eingereicht    timestamptz,
  ausbezahlt     timestamptz,
  ausbezahlt_von text,
  erstellt       timestamptz not null default now(),
  geaendert      timestamptz not null default now(),
  check (art <> 'beleg' or betrag is not null),
  check (art <> 'km' or km is not null)
);
create index if not exists auslagen_user_datum_idx on public.auslagen (user_id, datum);
create index if not exists auslagen_projekt_idx on public.auslagen (projekt_id);

-- Regeln, die die App nicht umgehen kann
create or replace function public.auslagen_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
declare satz numeric;
begin
  if tg_op = 'INSERT' then
    new.erstellt := now();
    if not public.ist_inhaber() then new.user_id := auth.uid(); new.status := 'offen'; new.eingereicht := null; new.ausbezahlt := null; new.ausbezahlt_von := null; end if;
  else
    new.erstellt := old.erstellt;
    if not public.ist_inhaber() then
      new.user_id := old.user_id;
      if old.status <> 'offen' then raise exception 'Schon abgegeben – ändern kann das nur noch der Inhaber'; end if;
      if new.status = 'ausbezahlt' then raise exception 'Ausbezahlt setzt nur der Inhaber'; end if;
      new.ausbezahlt := null; new.ausbezahlt_von := null;
    end if;
  end if;
  if new.status = 'eingereicht' and (tg_op = 'INSERT' or old.status <> 'eingereicht') then new.eingereicht := now(); end if;
  if new.status = 'offen' then new.eingereicht := null; end if;
  if new.status = 'ausbezahlt' and (tg_op = 'INSERT' or old.status <> 'ausbezahlt') then new.ausbezahlt := now(); end if;
  if new.status <> 'ausbezahlt' then new.ausbezahlt := null; new.ausbezahlt_von := null; end if;
  -- Kilometergeld: der Satz kommt aus den Einstellungen (der Inhaber darf ihn je Eintrag ändern), den Betrag rechnet der Server
  if new.art = 'km' then
    select (wert->>'satz')::numeric into satz from public.einstellungen where schluessel = 'kilometergeld';
    if new.km_satz is null or not public.ist_inhaber() then
      new.km_satz := case when tg_op = 'UPDATE' and old.km_satz is not null and old.art = 'km' then old.km_satz else coalesce(satz, 0.50) end;
    end if;
    new.betrag := round(new.km * new.km_satz, 2);
  else
    new.km := null; new.km_satz := null; new.fahrzeug_id := null; new.fahrzeug_name := null;
  end if;
  new.geaendert := now();
  return new;
end $$;
drop trigger if exists auslagen_pruefen on public.auslagen;
create trigger auslagen_pruefen before insert or update on public.auslagen
  for each row execute function public.auslagen_pruefen();

alter table public.auslagen enable row level security;
drop policy if exists "auslagen lesen"    on public.auslagen;
drop policy if exists "auslagen erfassen" on public.auslagen;
drop policy if exists "auslagen aendern"  on public.auslagen;
drop policy if exists "auslagen loeschen" on public.auslagen;
create policy "auslagen lesen"    on public.auslagen for select to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());
create policy "auslagen erfassen" on public.auslagen for insert to authenticated
  with check ((user_id = auth.uid() and public.darf_schreiben()) or public.ist_inhaber());
create policy "auslagen aendern"  on public.auslagen for update to authenticated
  using ((user_id = auth.uid() and status = 'offen') or public.ist_inhaber())
  with check ((user_id = auth.uid() and status in ('offen','eingereicht')) or public.ist_inhaber());
create policy "auslagen loeschen" on public.auslagen for delete to authenticated
  using ((user_id = auth.uid() and status = 'offen') or public.ist_inhaber());
revoke all on public.auslagen from anon;
grant select, insert, update, delete on public.auslagen to authenticated;

-- wohin ausbezahlt wird
create table if not exists public.auslagen_konto (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kontoinhaber  text check (kontoinhaber is null or length(kontoinhaber) <= 120),
  iban          text check (iban is null or length(iban) <= 40),
  geaendert     timestamptz not null default now()
);
alter table public.auslagen_konto enable row level security;
drop policy if exists "konto lesen"   on public.auslagen_konto;
drop policy if exists "konto eigenes" on public.auslagen_konto;
drop policy if exists "konto anlegen" on public.auslagen_konto;
drop policy if exists "konto aendern" on public.auslagen_konto;
create policy "konto lesen"   on public.auslagen_konto for select to authenticated using (user_id = auth.uid() or public.ist_inhaber());
create policy "konto anlegen" on public.auslagen_konto for insert to authenticated with check (user_id = auth.uid() and public.darf_schreiben());
create policy "konto aendern" on public.auslagen_konto for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.auslagen_konto from anon;
grant select, insert, update on public.auslagen_konto to authenticated;

-- Privatauto: Kilometergeld an diese Person (das Büro stellt es beim Fahrzeug ein)
alter table public.fahrzeuge add column if not exists privat_von uuid;
alter table public.fahrzeuge add column if not exists privat_name text;

-- Archivkonto schreibt nie (wie tools/archiv-rolle.sql – gilt zusätzlich)
do $$
declare t text; a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach t in array array['auslagen','auslagen_konto'] loop
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

-- Belegfotos: privater Speicher, je Person ein Ordner <user_id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auslagen', 'auslagen', false, 8388608, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','application/pdf'];
drop policy if exists "auslagen fotos lesen"     on storage.objects;
drop policy if exists "auslagen fotos ablegen"   on storage.objects;
drop policy if exists "auslagen fotos entfernen" on storage.objects;
create policy "auslagen fotos lesen"     on storage.objects for select to authenticated
  using (bucket_id = 'auslagen' and ((storage.foldername(name))[1] = auth.uid()::text or public.ist_inhaber()));
create policy "auslagen fotos ablegen"   on storage.objects for insert to authenticated
  with check (bucket_id = 'auslagen' and (storage.foldername(name))[1] = auth.uid()::text and public.darf_schreiben());
create policy "auslagen fotos entfernen" on storage.objects for delete to authenticated
  using (bucket_id = 'auslagen' and ((storage.foldername(name))[1] = auth.uid()::text or public.ist_inhaber()));

-- Kilometergeld-Satz (amtliches Kilometergeld, seit 2025: 0,50 €/km) – nur anlegen, wenn noch nicht da
insert into public.einstellungen (schluessel, wert, geaendert, von)
values ('kilometergeld', '{"satz":0.50}'::jsonb, now(), 'Einrichtung')
on conflict (schluessel) do nothing;

-- Kontrolle
select 'auslagen' as tabelle, count(*) from public.auslagen
union all select 'auslagen_konto', count(*) from public.auslagen_konto;
