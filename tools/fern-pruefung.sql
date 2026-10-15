-- -----------------------------------------------------------------------------------------------------
-- Automatische Prüfung der Fernzugriffe (Inhaber 15.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   Die Datenbank ruft jeden Tag früh am Morgen selbst jede Fernzugriff-Adresse der Märkte auf (Feld fernLink in den
--        Stammdaten) und merkt je Markt, ob die Regelung geantwortet hat:
--          · Tabelle fern_pruefung (je Aufruf eine Zeile: erreichbar, Regelung antwortet, Status, Hinweis)
--          · Sicht fern_pruefung_stand (letzter Stand je Markt, zuletzt erreichbar, gestört seit)
--          · fern_pruefung_starten()  – schickt die Anfragen (pg_net, Zeitüberschreitung 25 s)
--          · fern_pruefung_auswerten() – liest die Antworten und trägt das Ergebnis ein
--          · Zeitplan (pg_cron): starten 04:30 UTC (06:30 Sommerzeit / 05:30 Winterzeit), auswerten 04:32, 04:36, 04:45 UTC
--          · fern_pruefung_jetzt() – aus der App „Jetzt prüfen“ (Admins, Inhaber); fern_pruefung_nachsehen() – offene Antworten
--            auswerten, bevor die App den Stand liest (alle, die mitarbeiten)
--        Erreichbar heißt: die Fernzugriff-Plattform (Teltonika RMS) liefert die Seite der Regelung (Daikin ITM, erkennbar am
--        Schriftnamen „ITMFont“ bzw. „intelligent Touch Manager“). Ist der Router offline, bleibt die Antwort aus
--        (Zeitüberschreitung); erreicht die Plattform die Regelung hinter dem Router nicht, antwortet sie selbst mit 502
--        „Connection unsuccessful“. Angemeldet wird nirgends – es wird nur die Startseite aufgerufen, keine Zugangsdaten.
--        Erster Lauf 15.10.2026: 7 Märkte erreichbar, 9× 502, 1× Zeitüberschreitung (S40, laut Liste vom 12.10. Router offline).
-- WARUM: Inhaber 15.10.2026: „eine automatische Überprüfung täglich laufen lassen, die überprüft, ob die Fernzugriffe
--        funktionieren und ob sie online sind.“ Der Schalter online/offline in der App bleibt von Hand – die Prüfung zeigt nur.
-- WIE:   Im Supabase-SQL-Editor einmal ausführen (nach tools/einrichtung.sql). Mehrfach ausführbar. Lesen dürfen alle, die
--        mitarbeiten (darf_schreiben), nie Kunden; schreiben nur die Funktionen.
-- -----------------------------------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1. Tabelle: je Aufruf eine Zeile
create table if not exists public.fern_pruefung (
  id          bigserial primary key,
  standort_id text        not null,                 -- Kennung des Markts wie in der App (ziel der Stammdaten-Zeile)
  zeit        timestamptz not null default now(),   -- wann die Anfrage losging
  anfrage_id  bigint,                               -- Kennung bei pg_net
  erreichbar  boolean,                              -- es kam eine Antwort (egal welche)
  regelung    boolean,                              -- die Antwort ist die Seite der Regelung
  status      integer,                              -- HTTP-Status
  hinweis     text,                                 -- lesbar für die App
  ausgewertet timestamptz                           -- leer = Antwort noch nicht gelesen
);
create index if not exists fern_pruefung_markt_zeit on public.fern_pruefung (standort_id, zeit desc);
alter table public.fern_pruefung enable row level security;
drop policy if exists "fern pruefung lesen" on public.fern_pruefung;
create policy "fern pruefung lesen" on public.fern_pruefung for select to authenticated using (public.darf_schreiben());
revoke all on public.fern_pruefung from public, anon;
grant select on public.fern_pruefung to authenticated;

-- 2. Anfragen schicken: jeder aktive Markt mit Fernzugriff-Adresse (http/https), nie zweimal innerhalb von 2 Minuten
create or replace function public.fern_pruefung_starten() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; rid bigint;
begin
  for r in select ziel, felder->>'fernLink' as link
             from public.stammdaten
            where typ = 'standort'
              and coalesce(felder->>'fernLink', '') ~* '^https?://'
              and coalesce(felder->>'aktiv', 'true') <> 'false'
              and coalesce(felder->>'geloescht', '') = ''
            order by ziel
  loop
    if exists (select 1 from public.fern_pruefung p where p.standort_id = r.ziel and p.zeit > now() - interval '2 minutes') then
      continue;
    end if;
    select net.http_get(url := r.link,
                        headers := '{"User-Agent": "UKT-Leitstand Fernzugriff-Pruefung"}'::jsonb,
                        timeout_milliseconds := 25000) into rid;
    insert into public.fern_pruefung (standort_id, anfrage_id) values (r.ziel, rid);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 3. Antworten lesen und eintragen; alte Zeilen nach 180 Tagen entfernen
create or replace function public.fern_pruefung_auswerten() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; a record; n integer := 0; ist_regelung boolean; plattform boolean;
begin
  for r in select id, anfrage_id, zeit from public.fern_pruefung where ausgewertet is null loop
    if r.anfrage_id is null then
      update public.fern_pruefung set erreichbar = false, regelung = false, hinweis = 'Anfrage konnte nicht gestartet werden', ausgewertet = now() where id = r.id;
      n := n + 1; continue;
    end if;
    select status_code, content, timed_out, error_msg, created into a from net._http_response where id = r.anfrage_id;
    if not found then
      -- pg_net hat (noch) nichts – nach 10 Minuten gilt die Anfrage als verloren
      if r.zeit < now() - interval '10 minutes' then
        update public.fern_pruefung set erreichbar = false, regelung = false, hinweis = 'keine Antwort (Anfrage verloren)', ausgewertet = now() where id = r.id;
        n := n + 1;
      end if;
      continue;
    end if;
    ist_regelung := a.status_code = 200 and (a.content like '%ITMFont%' or a.content ilike '%intelligent touch manager%');
    -- die Fernzugriff-Plattform (Teltonika RMS) antwortet selbst mit 502 „Connection unsuccessful“, wenn sie die Regelung hinter dem Router nicht erreicht
    plattform := a.status_code = 502 and a.content ilike '%connection unsuccessful%';
    update public.fern_pruefung
       set status     = a.status_code,
           erreichbar = (a.status_code is not null and coalesce(a.timed_out, false) = false and a.error_msg is null),
           regelung   = coalesce(ist_regelung, false),
           hinweis    = case when coalesce(a.timed_out, false) or a.error_msg ilike '%timeout%' or a.error_msg ilike '%timed out%'
                                  then 'keine Antwort (Zeitüberschreitung) – Router oder Verbindung offline'
                             when a.error_msg is not null then 'Fehler: ' || a.error_msg
                             when plattform then 'Fernzugriff-Plattform meldet „Verbindung nicht möglich“ (502) – Router oder Regelung dahinter antwortet nicht'
                             when ist_regelung then 'Regelung antwortet'
                             when a.status_code = 200 then 'antwortet, aber nicht die Regelung (Seite der Fernzugriff-Plattform)'
                             else 'antwortet mit Fehler ' || coalesce(a.status_code::text, '?') end,
           ausgewertet = now()
     where id = r.id;
    n := n + 1;
  end loop;
  delete from public.fern_pruefung where zeit < now() - interval '180 days';
  return n;
end $$;

-- 4. Sicht: letzter Stand je Markt
create or replace view public.fern_pruefung_stand with (security_invoker = true) as
  with letzte as (
    select distinct on (standort_id) * from public.fern_pruefung where ausgewertet is not null order by standort_id, zeit desc),
  ok as (
    select standort_id, max(zeit) as zuletzt_ok from public.fern_pruefung where ausgewertet is not null and regelung group by standort_id)
  select l.standort_id, l.zeit, l.erreichbar, l.regelung, l.status, l.hinweis, ok.zuletzt_ok,
         case when l.regelung then null
              else (select min(f.zeit) from public.fern_pruefung f
                     where f.standort_id = l.standort_id and f.ausgewertet is not null and not coalesce(f.regelung, false)
                       and f.zeit > coalesce(ok.zuletzt_ok, '-infinity'::timestamptz)) end as gestoert_seit,
         (select count(*) from public.fern_pruefung f where f.standort_id = l.standort_id and f.ausgewertet is not null) as anzahl
    from letzte l left join ok on ok.standort_id = l.standort_id;
revoke all on public.fern_pruefung_stand from public, anon;
grant select on public.fern_pruefung_stand to authenticated;

-- 5. Aus der App: „Jetzt prüfen“ (Admins, Inhaber) und offene Antworten auswerten (alle, die mitarbeiten)
create or replace function public.fern_pruefung_jetzt() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not (public.ist_admin() or public.ist_inhaber()) then
    raise exception 'Die Prüfung starten nur Admins und der Inhaber';
  end if;
  return public.fern_pruefung_starten();
end $$;
create or replace function public.fern_pruefung_nachsehen() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.darf_schreiben() then return 0; end if;
  return public.fern_pruefung_auswerten();
end $$;
revoke all on function public.fern_pruefung_starten()   from public, anon, authenticated;
revoke all on function public.fern_pruefung_auswerten() from public, anon, authenticated;
revoke all on function public.fern_pruefung_jetzt()     from public, anon;
revoke all on function public.fern_pruefung_nachsehen() from public, anon;
grant execute on function public.fern_pruefung_jetzt()     to authenticated;
grant execute on function public.fern_pruefung_nachsehen() to authenticated;

-- 6. Zeitplan (pg_cron rechnet in UTC): starten 04:30, auswerten 04:32 / 04:36 / 04:45
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('fern-pruefung-starten', 'fern-pruefung-auswerten') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select cron.schedule('fern-pruefung-starten',   '30 4 * * *',       $$select public.fern_pruefung_starten()$$);
select cron.schedule('fern-pruefung-auswerten', '32,36,45 4 * * *', $$select public.fern_pruefung_auswerten()$$);

-- 7. Gleich einmal laufen lassen (Ergebnis liest die App beim nächsten Öffnen der Übersicht)
select public.fern_pruefung_starten() as gestartet;

-- Kontrolle: Tabelle, Sicht, zwei Zeitplan-Einträge, Anzahl gestarteter Anfragen
select 'ok' as fern_pruefung,
       (select count(*) from cron.job where jobname like 'fern-pruefung-%') as zeitplan,
       (select count(*) from public.fern_pruefung where ausgewertet is null) as offen,
       (select count(*) from pg_policies where tablename = 'fern_pruefung') as regeln;
