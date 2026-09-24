-- Technikernamen in den Protokollen der Datenbank vereinheitlichen.
--
-- Wofuer das da ist: Die App gleicht Schreibweisen seit der Namensliste in
-- index.html (NAMEN_ALIAS) beim Speichern selbst an - neu geschriebene
-- Protokolle sind also schon richtig. Dieses Skript raeumt auf, was vorher
-- gespeichert wurde. Die Wartungshistorie aus der Excel-Liste steht gar nicht
-- in der Datenbank; die wird allein ueber NAMEN_ALIAS angeglichen.
--
-- SCHRITT 1: nur nachsehen. Den ersten Block im SQL Editor ausfuehren. Er
-- aendert nichts und zeigt, welche Protokolle betroffen waeren.
-- SCHRITT 2: wenn die Liste passt, den zweiten Block ausfuehren.
--
-- Wiederholtes Ausfuehren schadet nicht: bereits richtige Eintraege bleiben
-- unberuehrt. Jede Aenderung wird wie eine Korrektur aus der App behandelt
-- und erscheint im Aenderungsverlauf mit altem und neuem Wert.
--
-- Neue Schreibweise ergaenzen: in BEIDEN Bloecken dieselbe Zeile in die
-- Liste "kanon" eintragen - links klein geschrieben, rechts so, wie es
-- ueberall stehen soll. Und dieselbe Zeile in NAMEN_ALIAS in index.html.

-- ===========================================================================
-- SCHRITT 1 - nur ansehen, aendert nichts
-- ===========================================================================
with kanon(variante, richtig) as (values
    ('darko','Darko'),   ('datko','Darko'),
    ('mat','Matthäus'),  ('matti','Matthäus'), ('mattäus','Matthäus'),
    ('mattaeus','Matthäus'), ('matthaeus','Matthäus'),
    ('tobi','Tobias')
),
neu as (
  select p.client_id, p.standort_name,
         p.techniker      as alt_tech,  coalesce(kt.richtig, p.techniker)      as neu_tech,
         p.name_techniker as alt_name,  coalesce(kn.richtig, p.name_techniker) as neu_name,
         coalesce(p.mitarbeiter,'[]'::jsonb) as alt_mit,
         (select coalesce(jsonb_agg(coalesce(km.richtig, m.wert) order by m.nr), '[]'::jsonb)
            from jsonb_array_elements_text(coalesce(p.mitarbeiter,'[]'::jsonb))
                 with ordinality as m(wert, nr)
            left join kanon km on km.variante = lower(btrim(m.wert))) as neu_mit
    from public.protokolle p
    left join kanon kt on kt.variante = lower(btrim(p.techniker))
    left join kanon kn on kn.variante = lower(btrim(p.name_techniker))
)
select standort_name as markt, client_id as protokoll,
       alt_tech, neu_tech, alt_name, neu_name, alt_mit, neu_mit
  from neu
 where neu_tech is distinct from alt_tech
    or neu_name is distinct from alt_name
    or neu_mit  is distinct from alt_mit
 order by standort_name;

-- ===========================================================================
-- SCHRITT 2 - aendern. Erst ausfuehren, wenn die Liste oben passt.
-- ===========================================================================
with kanon(variante, richtig) as (values
    ('darko','Darko'),   ('datko','Darko'),
    ('mat','Matthäus'),  ('matti','Matthäus'), ('mattäus','Matthäus'),
    ('mattaeus','Matthäus'), ('matthaeus','Matthäus'),
    ('tobi','Tobias')
),
neu as (
  select p.client_id, p.standort_id, p.standort_name,
         p.techniker      as alt_tech,  coalesce(kt.richtig, p.techniker)      as neu_tech,
         p.name_techniker as alt_name,  coalesce(kn.richtig, p.name_techniker) as neu_name,
         p.mitarbeiter    as roh_mit,
         coalesce(p.mitarbeiter,'[]'::jsonb) as alt_mit,
         (select coalesce(jsonb_agg(coalesce(km.richtig, m.wert) order by m.nr), '[]'::jsonb)
            from jsonb_array_elements_text(coalesce(p.mitarbeiter,'[]'::jsonb))
                 with ordinality as m(wert, nr)
            left join kanon km on km.variante = lower(btrim(m.wert))) as neu_mit
    from public.protokolle p
    left join kanon kt on kt.variante = lower(btrim(p.techniker))
    left join kanon kn on kn.variante = lower(btrim(p.name_techniker))
),
vorher as (
  select * from neu
   where neu_tech is distinct from alt_tech
      or neu_name is distinct from alt_name
      or neu_mit  is distinct from alt_mit
),
geaendert as (
  update public.protokolle p
     set techniker       = v.neu_tech,
         name_techniker  = v.neu_name,
         -- war nie ein zweiter Techniker eingetragen, bleibt das Feld leer
         mitarbeiter     = case when v.roh_mit is null then null else v.neu_mit end,
         version         = p.version + 1,
         geaendert       = now(),
         korrektur_grund = 'Schreibweise der Technikernamen vereinheitlicht'
    from vorher v
   where p.client_id = v.client_id
  returning p.client_id
)
insert into public.aenderungen (client_id, art, protokoll_id, standort_id, standort_name, von, grund, felder)
select 'e_namen_' || v.client_id || '_' || to_char(now(), 'YYYYMMDDHH24MISS'),
       'korrigiert', v.client_id, v.standort_id, v.standort_name,
       'Admin (SQL Editor)',
       'Schreibweise der Technikernamen vereinheitlicht',
       jsonb_build_array(
         jsonb_build_object('feld','techniker',     'name','Techniker/in',
           'alt', coalesce(v.alt_tech,'–'), 'neu', coalesce(v.neu_tech,'–')),
         jsonb_build_object('feld','nameTechniker', 'name','Name Techniker/in',
           'alt', coalesce(v.alt_name,'–'), 'neu', coalesce(v.neu_name,'–')),
         jsonb_build_object('feld','mitarbeiter',   'name','Weitere Techniker/innen',
           'alt', coalesce(nullif(array_to_string(array(select jsonb_array_elements_text(v.alt_mit)), ', '),''),'–'),
           'neu', coalesce(nullif(array_to_string(array(select jsonb_array_elements_text(v.neu_mit)), ', '),''),'–'))
       )
  from vorher v
  join geaendert g on g.client_id = v.client_id
returning protokoll_id as protokoll, standort_name as markt;
