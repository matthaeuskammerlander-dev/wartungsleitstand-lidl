-- Push-Benachrichtigungen („Es hat sich etwas getan“) – im Supabase SQL Editor
-- einmal ausführen (mehrfach ausführen schadet nicht).
--
-- Ablauf: Jede Änderung, die im Änderungsverlauf landet (Protokoll, Korrektur,
-- Störung, Markt/Anlage), jeder neue Änderungswunsch und jeder Posteingang legt
-- einen Eintrag in push_ereignisse an. Danach stößt die Datenbank die Funktion
-- „push“ an; sie wartet kurz, bündelt alles Neue und schickt es an die Geräte,
-- die in der App „Benachrichtigungen“ eingeschaltet haben – nie an den, der die
-- Änderung selbst gemacht hat, nie an Kunde oder Präsentation.

create extension if not exists pg_net;
-- (gibt es schon, falls supabase-setup.sql vollständig lief)
alter table public.aenderungen add column if not exists rueck jsonb;

-- Geräte, die Benachrichtigungen bekommen (je Browser/Handy ein Eintrag)
create table if not exists public.push_abos (
  endpoint  text primary key,            -- Adresse des Push-Dienstes (Apple/Google/Mozilla)
  user_id   uuid not null references auth.users(id) on delete cascade,
  p256dh    text not null,               -- Schlüssel des Geräts für die Verschlüsselung
  auth      text not null,
  geraet    text,                        -- z. B. „iPhone“, „PC“ – nur zur Anzeige
  arten     jsonb not null default '["stoerung","protokoll","korrektur","stammdaten","wunsch","posteingang"]'::jsonb,
  erstellt  timestamptz not null default now(),
  zuletzt   timestamptz,                 -- letzte erfolgreich zugestellte Nachricht
  fehler    int not null default 0
);
alter table public.push_abos enable row level security;
drop policy if exists "eigene geraete sehen" on public.push_abos;
create policy "eigene geraete sehen" on public.push_abos for select to authenticated using (user_id = auth.uid());
drop policy if exists "eigene geraete abmelden" on public.push_abos;
create policy "eigene geraete abmelden" on public.push_abos for delete to authenticated using (user_id = auth.uid());
-- Anlegen/Ändern nur über push_abo_speichern (dasselbe Gerät kann vorher einem
-- anderen Konto gehört haben – dann wechselt es den Besitzer)

create or replace function public.push_abo_speichern(p_endpoint text, p_p256dh text, p_auth text, p_geraet text, p_arten jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.darf_schreiben() then
    raise exception 'Benachrichtigungen gibt es nur für Büro und Techniker';
  end if;
  if coalesce(length(p_endpoint),0) not between 20 and 1000 or p_endpoint not like 'https://%' then
    raise exception 'Ungültige Geräte-Adresse';
  end if;
  insert into public.push_abos (endpoint, user_id, p256dh, auth, geraet, arten)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_geraet,40), coalesce(p_arten, '[]'::jsonb))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        geraet = excluded.geraet, arten = excluded.arten, fehler = 0;
end $$;
revoke all on function public.push_abo_speichern(text,text,text,text,jsonb) from public, anon;
grant execute on function public.push_abo_speichern(text,text,text,text,jsonb) to authenticated;

-- Was passiert ist – nur die Funktion „push“ liest und leert das (kein Zugriff aus der App)
create table if not exists public.push_ereignisse (
  id        bigserial primary key,
  erstellt  timestamptz not null default now(),
  art       text not null,         -- stoerung | protokoll | korrektur | stammdaten | wunsch | posteingang
  titel     text not null,
  text      text,
  ziel      text,                  -- wohin die App beim Antippen springt
  von_user  uuid,                  -- wer es ausgelöst hat (bekommt es selbst nicht)
  nur_rolle text,                  -- etwa 'inhaber' bei Änderungswünschen
  gesendet  timestamptz
);
-- Einzelheiten für eine ausführliche Nachricht (geänderte Felder, betroffene
-- Störung) – die Funktion „push“ liest damit Protokoll bzw. Störung nach
alter table public.push_ereignisse add column if not exists daten jsonb;
create index if not exists push_ereignisse_offen_idx on public.push_ereignisse (id) where gesendet is null;
alter table public.push_ereignisse enable row level security;

-- Schlüsselpaar des Absenders (VAPID) – legt die Funktion beim ersten Aufruf
-- selbst an; der private Teil ist aus der App nicht lesbar
create table if not exists public.push_schluessel (
  id          int primary key default 1 check (id = 1),
  oeffentlich text not null,
  schluessel  jsonb not null
);
alter table public.push_schluessel enable row level security;

-- Offene Ereignisse übernehmen und als gesendet markieren – in einem Schritt,
-- damit zwei gleichzeitige Aufrufe nie dasselbe doppelt schicken
create or replace function public.push_ereignisse_holen() returns setof public.push_ereignisse
language sql security definer set search_path = public as $$
  update public.push_ereignisse set gesendet = now()
   where gesendet is null
  returning *;
$$;
revoke all on function public.push_ereignisse_holen() from public, anon, authenticated;

-- Funktion „push“ anstoßen (läuft nach dem Speichern, bremst also nichts)
create or replace function public.push_anstossen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://crvqnsmepwmqdplrenqm.supabase.co/functions/v1/push',
    body := '{"aktion":"senden"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return null;
exception when others then
  return null;   -- eine Benachrichtigung darf nie das Speichern verhindern
end $$;
drop trigger if exists push_anstossen on public.push_ereignisse;
create trigger push_anstossen after insert on public.push_ereignisse
  for each statement execute function public.push_anstossen();

-- Änderungsverlauf → Ereignis
create or replace function public.push_aus_verlauf() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  markt text := coalesce(nullif(new.standort_name,''), 'ohne Markt');
  wer   text := coalesce(nullif(new.von,''), 'jemand');
  f     jsonb;
  a text; t text; x text; z text;
begin
  if new.art = 'angelegt' then
    a := 'protokoll'; t := 'Neues Protokoll – ' || markt; x := 'von ' || wer;
    z := 'protokoll:' || coalesce(new.protokoll_id,'');
  elsif new.art in ('korrigiert','geloescht','wiederhergestellt') then
    a := 'korrektur';
    t := case new.art when 'korrigiert' then 'Protokoll korrigiert' when 'geloescht' then 'Protokoll gelöscht'
         else 'Protokoll wiederhergestellt' end || ' – ' || markt;
    x := 'von ' || wer || coalesce(': ' || nullif(new.grund,''), '');
    z := 'protokoll:' || coalesce(new.protokoll_id,'');
  elsif new.art = 'stammdaten' and new.felder @> '[{"feld":"stoerung"}]'::jsonb then
    select v into f from jsonb_array_elements(new.felder) as el(v) where v->>'feld' = 'stoerung' limit 1;
    a := 'stoerung'; t := coalesce(nullif(new.grund,''), 'Störung geändert') || ' – ' || markt;
    x := coalesce(nullif(f->>'neu',''), '') || case when coalesce(f->>'neu','') <> '' then ' · ' else '' end || 'von ' || wer;
    z := 'stoerungen:' || coalesce(new.standort_id,'');
  elsif new.art = 'stammdaten' then
    a := 'stammdaten'; t := 'Geändert – ' || markt;
    x := coalesce(nullif(new.grund,''), 'Markt- oder Anlagendaten') || ' · von ' || wer;
    z := 'markt:' || coalesce(new.standort_id,'');
  else
    a := 'stammdaten'; t := 'Änderung – ' || markt; x := new.art || ' · von ' || wer; z := 'verlauf';
  end if;
  insert into public.push_ereignisse (art, titel, text, ziel, von_user, daten)
  values (a, left(t,120), left(x,240), z, new.eingetragen_von, jsonb_build_object(
    'wer', wer, 'grund', new.grund, 'protokoll', new.protokoll_id, 'standort', new.standort_id,
    'felder', (select jsonb_agg(v) from (select v from jsonb_array_elements(case when jsonb_typeof(new.felder)='array' then new.felder else '[]'::jsonb end) as e(v) limit 8) s),
    'bezug', (select jsonb_agg(k) from (select k from jsonb_object_keys(case when jsonb_typeof(new.rueck)='object' then new.rueck else '{}'::jsonb end) as e(k) limit 5) s)));
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists push_aus_verlauf on public.aenderungen;
create trigger push_aus_verlauf after insert on public.aenderungen
  for each row execute function public.push_aus_verlauf();

-- Änderungswünsche → Ereignis (nur für Inhaber): neu, Vorschau fertig, Fehler
create or replace function public.push_aus_wunsch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.push_ereignisse (art, titel, text, ziel, von_user, nur_rolle)
    values ('wunsch', 'Neuer Änderungswunsch W-' || new.id,
            coalesce(nullif(new.von_name,''),'jemand') || ': ' || left(new.text, 160),
            'wunsch:' || new.id, new.von, 'inhaber');
  elsif new.status is distinct from old.status and new.status in ('vorschau','fehler') then
    insert into public.push_ereignisse (art, titel, text, ziel, nur_rolle)
    values ('wunsch',
            'Änderungswunsch W-' || new.id || case new.status when 'vorschau' then ': Vorschau bereit' else ': Fehler' end,
            left(new.text, 160), 'wunsch:' || new.id, 'inhaber');
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists push_aus_wunsch on public.aenderungswuensche;
create trigger push_aus_wunsch after insert or update of status on public.aenderungswuensche
  for each row execute function public.push_aus_wunsch();

-- Posteingang → Ereignis
create or replace function public.push_aus_posteingang() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_ereignisse (art, titel, text, ziel)
  values ('posteingang',
          'Posteingang: ' || case new.art when 'rapport' then 'Rapport' when 'auftrag' then 'Auftrag' else 'neue Datei' end,
          left(coalesce(nullif(new.betreff,''), new.dateiname), 200), 'posteingang');
  return null;
exception when others then
  return null;
end $$;
-- der Posteingang ist nicht überall eingerichtet
do $$ begin
  if to_regclass('public.posteingang') is not null then
    drop trigger if exists push_aus_posteingang on public.posteingang;
    create trigger push_aus_posteingang after insert on public.posteingang
      for each row execute function public.push_aus_posteingang();
  end if;
end $$;
