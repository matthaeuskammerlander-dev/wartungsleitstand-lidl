-- Stunden ↔ Kalender (Büro 03.10.2026: „wird ein Urlaubstag im Kalender automatisch in den Stunden erfasst?“)
--   * Urlaub (nur GENEHMIGT), Krankenstand, Berufsschule/Kurs und Zeitausgleich im Kalender legen
--     von selbst je Arbeitstag einen Stunden-Eintrag mit dem Tagessoll an (ohne Samstag, Sonntag,
--     Feiertag; Soll aus einstellungen.arbeitszeit). Quelle „kalender“, verknüpft über planung_id.
--   * Ändert sich der Kalendereintrag (Tage, Person, Art, Urlaub nicht mehr genehmigt) oder wird er
--     gelöscht, werden die Einträge angepasst bzw. entfernt – nie in einem bestätigten Monat.
--   * Schon von Hand eingetragen (gleiche Art am Tag)? Dann kein zweiter Eintrag.
--   * Anlegen für eine Person nur, wenn sie es selbst einträgt oder das Büro (Inhaber, Admin) –
--     sonst könnte jeder einem Kollegen Krankenstand in die Stunden schreiben. Entfernen immer.
--   * Wer einen Kalender-Eintrag in den Stunden selbst ändert, übernimmt ihn (Quelle wird „hand“);
--     der Kalender fasst ihn dann nicht mehr an.
--   * Neue Kalender-Art „zeitausgleich“.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

alter table public.planung drop constraint if exists planung_kategorie_check;
alter table public.planung add constraint planung_kategorie_check
  check (kategorie in ('wartung','stoerung','projekt','buero','werkstatt','besprechung',
                       'urlaub','krank','schule','zeitausgleich','privat','sonstiges'));

alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_quelle_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_quelle_check
  check (quelle in ('hand','stempel','stempel_geaendert','stempel_nachgetragen','kalender'));

-- gesetzliche Feiertage in Österreich (wie feiertageAT in der App)
create or replace function public.feiertag_at(d date) returns boolean
language plpgsql immutable as $$
declare j int := extract(year from d)::int; a int; b int; c int; dd int; e int; f int; g int; h int; i int; k int; l int; m int; o date;
begin
  if to_char(d,'MM-DD') in ('01-01','01-06','05-01','08-15','10-26','11-01','12-08','12-25','12-26') then return true; end if;
  a := j % 19; b := j / 100; c := j % 100; dd := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19*a + b - dd - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2*e + 2*i - h - k) % 7; m := (a + 11*h + 22*l) / 451;
  o := make_date(j, (h + l - 7*m + 114) / 31, ((h + l - 7*m + 114) % 31) + 1);   -- Ostersonntag
  return d in (o + 1, o + 39, o + 50, o + 60);   -- Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam
end $$;

-- Tagessoll in Minuten (wie sollMinutenTag in der App)
create or replace function public.soll_minuten(d date) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.feiertag_at(d) then 0 else coalesce(round(60 * coalesce(
    (select (wert->'verteilung'->>(extract(isodow from d)::int - 1))::numeric from public.einstellungen where schluessel = 'arbeitszeit'),
    (array[8,8,8,8,6.5,0,0])[extract(isodow from d)::int]))::int, 0) end
$$;

create or replace function public.planung_stunden_sync(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.planung; z public.arbeitszeiten;
  zart text := null; personen uuid[] := '{}'; bis date; u uuid; d date; soll int; min int; spanne int; nm text; idx int;
begin
  perform set_config('ukt.kalender_sync', '1', true);
  select * into p from public.planung where id = p_id;
  if found and p.art = 'termin' and p.datum is not null and p.status <> 'abgelehnt'
     and p.kategorie in ('urlaub','krank','schule','zeitausgleich')
     and (p.kategorie <> 'urlaub' or p.status = 'genehmigt') then
    zart := p.kategorie;
    personen := case when coalesce(array_length(p.wer,1),0) > 0 then p.wer else array[p.erstellt_von] end;
    bis := least(greatest(coalesce(p.datum_bis, p.datum), p.datum), p.datum + 92);
  end if;
  -- 1. was nicht mehr passt, entfernen (nie in einem bestätigten Monat)
  for z in select * from public.arbeitszeiten where planung_id = p_id and quelle = 'kalender' and bestaetigt is null loop
    if zart is null or not (z.user_id = any(personen)) or z.datum < p.datum or z.datum > bis or public.soll_minuten(z.datum) = 0
       or exists (select 1 from public.arbeitszeiten x where x.user_id = z.user_id and x.bestaetigt is not null
                  and date_trunc('month', x.datum) = date_trunc('month', z.datum)) then
      delete from public.arbeitszeiten where id = z.id;
    end if;
  end loop;
  if zart is null then perform set_config('ukt.kalender_sync', '', true); return; end if;
  -- 2. je Person und Arbeitstag anlegen bzw. angleichen
  foreach u in array personen loop
    if not (auth.uid() is null or auth.uid() = u or public.ist_inhaber() or public.ist_admin()) then continue; end if;
    idx := array_position(p.wer, u);
    nm := coalesce(case when idx is not null then p.wer_namen[idx] end,
                   (select x.name from public.arbeitszeiten x where x.user_id = u and x.name is not null order by x.datum desc limit 1));
    d := p.datum;
    while d <= bis loop
      soll := public.soll_minuten(d);
      if soll > 0 and not exists (select 1 from public.arbeitszeiten x where x.user_id = u and x.bestaetigt is not null
                                  and date_trunc('month', x.datum) = date_trunc('month', d)) then
        min := soll;
        -- ein einzelner Tag mit von–bis (etwa halber Tag Zeitausgleich): diese Zeit, höchstens das Tagessoll
        if bis = p.datum and p.beginn is not null and p.ende is not null then
          spanne := (split_part(p.ende,':',1)::int*60 + split_part(p.ende,':',2)::int) - (split_part(p.beginn,':',1)::int*60 + split_part(p.beginn,':',2)::int);
          if spanne > 0 then min := least(spanne, soll); end if;
        end if;
        select * into z from public.arbeitszeiten where planung_id = p_id and quelle = 'kalender' and user_id = u and datum = d limit 1;
        if found then
          if z.art <> zart or z.minuten <> min or z.taetigkeit is distinct from p.titel then
            update public.arbeitszeiten set art = zart, minuten = min, taetigkeit = p.titel, geaendert = now()
              where id = z.id and bestaetigt is null;
          end if;
        elsif not exists (select 1 from public.arbeitszeiten x where x.user_id = u and x.datum = d and (x.art = zart or x.planung_id = p_id)) then
          insert into public.arbeitszeiten (user_id, name, datum, minuten, art, taetigkeit, quelle, planung_id, pause_min)
            values (u, nm, d, min, zart, p.titel, 'kalender', p_id, 0);
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  perform set_config('ukt.kalender_sync', '', true);
end $$;
revoke all on function public.planung_stunden_sync(uuid) from public, anon, authenticated;

create or replace function public.planung_stunden_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform set_config('ukt.kalender_sync', '1', true);
    delete from public.arbeitszeiten a where a.planung_id = old.id and a.quelle = 'kalender' and a.bestaetigt is null
      and not exists (select 1 from public.arbeitszeiten x where x.user_id = a.user_id and x.bestaetigt is not null
                      and date_trunc('month', x.datum) = date_trunc('month', a.datum));
    perform set_config('ukt.kalender_sync', '', true);
    return old;
  end if;
  -- nur wenn es die Stunden betrifft (Art, Tage, Zeit, Personen, Status, Titel)
  if tg_op = 'INSERT' or new.kategorie is distinct from old.kategorie or new.datum is distinct from old.datum
     or new.datum_bis is distinct from old.datum_bis or new.beginn is distinct from old.beginn or new.ende is distinct from old.ende
     or new.wer is distinct from old.wer or new.status is distinct from old.status or new.titel is distinct from old.titel
     or new.art is distinct from old.art then
    if new.kategorie in ('urlaub','krank','schule','zeitausgleich') or (tg_op = 'UPDATE' and old.kategorie in ('urlaub','krank','schule','zeitausgleich')) then
      perform public.planung_stunden_sync(new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists planung_stunden on public.planung;
create trigger planung_stunden after insert or update or delete on public.planung
  for each row execute function public.planung_stunden_trigger();

-- Kalender-Einträge in den Stunden: wer sie selbst ändert, übernimmt sie („hand“);
-- sonst wie bisher (gestempelt → „stempel_geaendert“, die Quelle setzt niemand von Hand um)
create or replace function public.arbeitszeit_stempel_merken() returns trigger
language plpgsql as $$
declare zeit_geaendert boolean := new.datum is distinct from old.datum or new.beginn is distinct from old.beginn
          or new.ende is distinct from old.ende or new.pause_min is distinct from old.pause_min or new.minuten is distinct from old.minuten;
begin
  if coalesce(current_setting('ukt.kalender_sync', true), '') = '1' then return new; end if;
  if old.quelle = 'kalender' and (zeit_geaendert or new.art is distinct from old.art) then
    new.quelle := 'hand';
  elsif old.quelle in ('stempel','stempel_nachgetragen') and zeit_geaendert then
    new.quelle := 'stempel_geaendert';
  elsif new.quelle is distinct from old.quelle and not public.ist_inhaber() then
    new.quelle := old.quelle;     -- die Quelle selbst setzt niemand von Hand um
  end if;
  return new;
end $$;

-- bestehende Kalendereinträge einmal nachziehen
do $$
declare r record;
begin
  for r in select id from public.planung where kategorie in ('urlaub','krank','schule','zeitausgleich') and art = 'termin' loop
    perform public.planung_stunden_sync(r.id);
  end loop;
end $$;

-- Kontrolle
select art, count(*) from public.arbeitszeiten where quelle = 'kalender' group by art;
