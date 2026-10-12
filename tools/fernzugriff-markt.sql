-- -----------------------------------------------------------------------------------------------------
-- Fernzugriff auf die Regelung gehört zum Markt (Inhaber 12.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   1. Die Sicht stammdaten_lesen (Kunde, Präsentation) lässt auch die neuen Markt-Zugangsdaten weg:
--           fernBenutzer, fernPasswort, fernWeitere. Die Adresse (fernLink) bleibt sichtbar – der Kunde darf den Link sehen.
--        2. Bestehende Zugangsdaten, die an allen Anlagen eines Markts dieselbe Adresse haben, kommen auf den Markt
--           (Felder fernLink, fernBenutzer, fernPasswort, fernWeitere am Eintrag standort:<Kennung>). Die Angaben an den
--           Anlagen bleiben unverändert stehen (nichts wird gelöscht).
-- WARUM: Inhaber 12.10.2026: „Der Link zum Fernzugriff gehört zum Markt, nicht unbedingt nur zu einer Anlage … der Link ist
--        für alle Anlagen am Markt, jedoch sollte man wie bisher beim Eingeben der Daten jedes Mal die Art der Regelung
--        auswählen können.“
-- WIE:   Im Supabase-SQL-Editor einmal ausführen – NACH dem App-Stand mit fernLink (sonst zeigt die alte App das Feld nicht).
-- -----------------------------------------------------------------------------------------------------

-- 1. Sicht wie in tools/kunden-projekte-stunden.sql, nur um die Markt-Zugangsdaten erweitert
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' - 'zugangWeitere'
                - 'fernBenutzer' - 'fernPasswort' - 'fernWeitere' as felder,
         neu, geaendert, von, grund
    from public.stammdaten
   where auth.uid() is not null
     and (public.meine_rolle() <> 'kunde'
          or case typ when 'kunde'    then ziel = public.mein_kunde()
                      when 'standort' then public.kunde_sieht(ziel)
                      when 'stoerung' then public.kunde_sieht(ziel)
                      when 'position' then public.kunde_sieht(felder->>'standortId')
                      else true end);
revoke all on public.stammdaten_lesen from public, anon, authenticated;
grant select on public.stammdaten_lesen to authenticated;

-- 2. Zugänge der Anlagen auf den Markt heben – nur wo alle Anlagen des Markts dieselbe Adresse haben
begin;
with je_markt as (
  select felder->>'standortId' as sid,
         count(distinct lower(btrim(felder->>'zugangLink'))) as adressen,
         (array_agg(felder order by geaendert desc))[1] as felder_neu
    from public.stammdaten
   where typ = 'position'
     and coalesce(felder->>'aktiv','true') <> 'false'
     and coalesce(felder->>'geloescht','') = ''
     and nullif(btrim(felder->>'zugangLink'),'') is not null
   group by felder->>'standortId'
), hebe as (
  select sid,
         jsonb_strip_nulls(jsonb_build_object(
           'fernLink',     felder_neu->>'zugangLink',
           'fernBenutzer', felder_neu->>'zugangBenutzer',
           'fernPasswort', felder_neu->>'zugangPasswort',
           'fernWeitere',  felder_neu->'zugangWeitere')) as fern
    from je_markt
   where adressen = 1 and sid is not null
)
insert into public.stammdaten (id, typ, ziel, felder, neu, geaendert, von, grund)
select 'standort:'||h.sid, 'standort', h.sid, h.fern, false, now(), 'Büro (Claude)',
       'Fernzugriff auf den Markt gehoben (Adresse an allen Anlagen gleich; Inhaber 12.10.2026)'
  from hebe h
on conflict (id) do update
   set felder = public.stammdaten.felder || excluded.felder,
       geaendert = now(), von = excluded.von, grund = excluded.grund
 where coalesce(public.stammdaten.felder->>'fernLink','') = '';   -- ein schon am Markt eingetragener Zugang bleibt
commit;

-- Kontrolle: Märkte mit Fernzugriff
select ziel as markt, felder->>'fernLink' as adresse, (felder ? 'fernPasswort') as mit_passwort
  from public.stammdaten where typ='standort' and coalesce(felder->>'fernLink','') <> '' order by 1;
