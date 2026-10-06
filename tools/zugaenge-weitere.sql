-- ---------------------------------------------------------------------------
-- Weitere Zugänge zur Regelung (Inhaber 06.10.2026: „Es soll möglich sein,
-- mehrere Benutzernamen zu hinterlegen.“)
-- Was: Die App speichert weitere Benutzer/Passwörter einer Regelung im neuen
--      Feld felder->'zugangWeitere' (Liste {bez, benutzer, passwort, link}).
-- Warum: Wie zugangLink/zugangBenutzer/zugangPasswort sind das Zugangsdaten –
--      Kunde und Präsentation lesen über die Sicht stammdaten_lesen und dürfen
--      sie nie bekommen. Daher nimmt die Sicht auch das neue Feld heraus.
-- Wer danach was darf: unverändert – Mitarbeiter lesen die Tabelle stammdaten
--      (mit Zugangsdaten), Kunde/Präsentation nur die Sicht (ohne; ein Kunde
--      weiterhin nur seine eigenen Standorte, Kunden-Sperre wie in
--      tools/kunden-projekte-stunden.sql).
-- Mehrfach ausführbar (create or replace view, gleiche Spalten).
-- ---------------------------------------------------------------------------
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' - 'zugangWeitere' as felder,
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
