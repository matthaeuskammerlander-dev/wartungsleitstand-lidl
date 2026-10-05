-- Eigene Tätigkeitsbereiche (Büro 01.10.2026): Unter „Sonstiges“ lässt sich
-- ein neuer Bereich eintippen (etwa „Datenbank“, „Schulung“). Er wird wie ein
-- fester Bereich gespeichert und steht danach allen in der Auswahl.
-- Lohnverrechnung: eigene Bereiche zählen als normale Arbeit – nicht als
-- Montage, nicht als Fahrt.
--
-- Einmal im Supabase SQL Editor ausführen (nach stempeluhr-4.sql). Mehrfach
-- ausführbar.

-- 1. Bereich: feste Werte oder ein eigener Text (1–40 Zeichen)
alter table public.stempel drop constraint if exists stempel_bereich_check;
alter table public.stempel add constraint stempel_bereich_check
  check (bereich is null or length(btrim(bereich)) between 1 and 40);
alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_bereich_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_bereich_check
  check (bereich is null or length(btrim(bereich)) between 1 and 40);

-- 2. Stempeln: dieselbe Regel (die Funktion bleibt sonst unverändert). Seit
--    05.10.2026 legt stempeluhr-4.sql stempeln() schon so an – dann ändert
--    sich hier nichts („schon umgestellt“).
do $$
declare d text; n integer;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'stempeln';
  if n <> 1 then raise exception 'stempeln: % Fassungen gefunden – erwartet 1', n; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'stempeln';
  if position($x$p_bereich not in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges')$x$ in d) = 0 then
    if position('length(btrim(p_bereich))' in d) > 0 then return; end if;   -- schon umgestellt
    raise exception 'stempeln: Bereichsprüfung nicht gefunden';
  end if;
  d := replace(d, $x$p_bereich not in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges')$x$,
                  $x$length(btrim(p_bereich)) not between 1 and 40$x$);
  execute d;
end $$;

-- 3. Vorauswahl: die eigenen Bereiche der Firma, die häufigsten zuerst.
--    Nur die Bezeichnungen – keine Namen, Zeiten oder Personen.
create or replace function public.bereiche_eigene()
returns table(bereich text, anzahl bigint)
language sql stable security definer set search_path = public as $$
  select b, count(*) from (
    select btrim(a.bereich) b from public.arbeitszeiten a
     where a.datum > current_date - 730
    union all
    select btrim(s.bereich) from public.stempel s
     where s.zeit > now() - interval '730 days'
  ) x
  where public.darf_schreiben()
    and b is not null and b <> ''
    and b not in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges')
  group by b order by count(*) desc, b limit 30;
$$;
revoke all on function public.bereiche_eigene() from public, anon;
grant execute on function public.bereiche_eigene() to authenticated;

-- Kontrolle
select pg_get_functiondef('public.stempeln'::regproc) like '%length(btrim(p_bereich))%' as stempeln_umgestellt;
