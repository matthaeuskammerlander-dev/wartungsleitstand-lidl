-- Technikernamen in den Protokollen vereinheitlichen: darko, DARKO, Datko ... -> Darko
--
-- Einmal im Supabase SQL Editor ausfuehren (New query -> einfuegen -> Run).
-- Unten erscheint danach je geaendertem Protokoll eine Zeile. Steht dort
-- "Success. No rows returned", gab es nichts zu aendern.
--
-- Sicher wiederholbar: bereits richtige Eintraege werden nicht angefasst.
-- Jede Aenderung wird wie eine Korrektur aus der App behandelt:
--   * die vorherige Fassung sichert die Datenbank in protokoll_fassungen,
--   * im Aenderungsverlauf der App erscheint ein Eintrag mit alt und neu.
--
-- Fuer einen anderen Namen die beiden Stellen 'darko','datko' und 'Darko'
-- anpassen (Kleinschreibung in der Liste, gewuenschte Schreibweise dahinter).

with vorher as (
  select client_id, standort_id, standort_name, techniker, name_techniker
  from public.protokolle
  where (lower(trim(techniker))      in ('darko','datko') and techniker      is distinct from 'Darko')
     or (lower(trim(name_techniker)) in ('darko','datko') and name_techniker is distinct from 'Darko')
),
geaendert as (
  update public.protokolle p
  set techniker       = case when lower(trim(p.techniker))      in ('darko','datko') then 'Darko' else p.techniker end,
      name_techniker  = case when lower(trim(p.name_techniker)) in ('darko','datko') then 'Darko' else p.name_techniker end,
      version         = p.version + 1,
      geaendert       = now(),
      korrektur_grund = 'Schreibweise des Technikernamens vereinheitlicht: Darko'
  from vorher v
  where p.client_id = v.client_id
  returning p.client_id
)
insert into public.aenderungen (client_id, art, protokoll_id, standort_id, standort_name, von, grund, felder)
select 'e_namen_' || v.client_id || '_' || to_char(now(), 'YYYYMMDDHH24MISS'),
       'korrigiert', v.client_id, v.standort_id, v.standort_name,
       'Admin (SQL Editor)',
       'Schreibweise des Technikernamens vereinheitlicht: Darko',
       jsonb_build_array(
         jsonb_build_object('feld','techniker', 'name','Techniker/in',
           'alt', coalesce(v.techniker,'–'),
           'neu', case when lower(trim(v.techniker)) in ('darko','datko') then 'Darko' else coalesce(v.techniker,'–') end),
         jsonb_build_object('feld','nameTechniker', 'name','Name Techniker/in',
           'alt', coalesce(v.name_techniker,'–'),
           'neu', case when lower(trim(v.name_techniker)) in ('darko','datko') then 'Darko' else coalesce(v.name_techniker,'–') end)
       )
from vorher v
join geaendert g on g.client_id = v.client_id
returning protokoll_id as protokoll, standort_name as markt;
