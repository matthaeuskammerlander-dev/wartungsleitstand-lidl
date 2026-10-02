-- Gelernte Einsatzdauer je Markt (Büro 02.10.2026: „so handsome to optimize everything for the future“).
-- Die Tourenplanung rechnet nicht mehr nur mit einem festen Richtwert je Anlage, sondern mit der
-- tatsächlichen Zeit vor Ort aus den Stunden (Einträge mit Markt, Tätigkeit „Wartung …“ / „Störung …“).
-- Datenschutz: jede Person sieht ihre Stunden weiter nur selbst – diese Funktion gibt NUR den Median
-- je Markt und Art zurück (ab 2 Einträgen), keine Personen, keine einzelnen Tage.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create or replace function public.einsatz_dauern()
returns table(standort_id text, art text, anzahl integer, minuten integer)
language sql stable security definer set search_path = public as $$
  select a.standort_id,
         case when a.taetigkeit ilike 'st_rung%' or a.taetigkeit ilike 'stoerung%' then 'stoerung' else 'wartung' end as art,
         count(*)::integer as anzahl,
         round(percentile_cont(0.5) within group (order by a.minuten))::integer as minuten
  from public.arbeitszeiten a
  where public.darf_schreiben()
    and a.standort_id is not null
    and a.art = 'arbeit'
    and a.minuten between 15 and 720
    and a.datum >= current_date - interval '2 years'
    and (a.taetigkeit ilike 'wartung%' or a.taetigkeit ilike 'st_rung%' or a.taetigkeit ilike 'stoerung%')
  group by 1, 2
  having count(*) >= 2;
$$;
revoke all on function public.einsatz_dauern() from public;
grant execute on function public.einsatz_dauern() to authenticated;
