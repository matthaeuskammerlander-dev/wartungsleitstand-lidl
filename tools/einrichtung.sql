-- -----------------------------------------------------------------------------------------------------
-- Einrichtung, Fernzugriff vor Ort und Bestandspläne (Inhaber 15.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   1. Die Sicht stammdaten_lesen (Kunde, Präsentation) lässt auch den neuen geheimen Markt-Zugang „fernVorOrt“ weg
--           (Passwörter vor Ort am Display: Displaysperre, Administrator, Passwort für Wartung, Freischalten).
--        2. Die Einstellung „einrichtung“ (Anleitungen, Dokumente, Standard-Zugänge zur Regelung) dürfen neben dem Inhaber
--           auch Admins anlegen und ändern – lesen wie alle Einstellungen nur, wer mitarbeitet (darf_schreiben), nie Kunden.
--        3. Speicher „dokumente“ (privat): einrichtung/… (Anleitungen) und markt/<Kennung>/… (Bestandspläne) – lesen und
--           hochladen, wer mitarbeitet; entfernen, wer hochgeladen hat, Admins und der Inhaber. Kunden und Präsentation nie.
-- WARUM: Inhaber 15.10.2026: „Es sollte zur Einrichtung einen eigenen Menüpunkt geben, wo alle Möglichkeiten, Dokumentation und
--        Anleitung gesammelt sind … bei den Märkten einen Bestandsplan hinterlegen, damit die Techniker schon im Vorhinein sehen,
--        welche Anlagen wo stehen.“ Keine Zugangsdaten in diesem Skript – die stehen nur in der Datenbank.
-- WIE:   Im Supabase-SQL-Editor einmal ausführen (nach tools/fernzugriff-markt.sql). Mehrfach ausführbar.
-- -----------------------------------------------------------------------------------------------------

-- 1. Sicht wie in tools/fernzugriff-markt.sql, zusätzlich ohne fernVorOrt
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' - 'zugangWeitere'
                - 'fernBenutzer' - 'fernPasswort' - 'fernWeitere' - 'fernVorOrt' as felder,
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

-- 2. Einstellung „einrichtung“: auch Admins (zusätzlich zu den bestehenden Regeln des Inhabers)
drop policy if exists "einstellungen einrichtung anlegen" on public.einstellungen;
drop policy if exists "einstellungen einrichtung aendern" on public.einstellungen;
create policy "einstellungen einrichtung anlegen" on public.einstellungen for insert to authenticated
  with check (schluessel = 'einrichtung' and public.ist_admin());
create policy "einstellungen einrichtung aendern" on public.einstellungen for update to authenticated
  using (schluessel = 'einrichtung' and public.ist_admin()) with check (schluessel = 'einrichtung' and public.ist_admin());

-- 3. Speicher „dokumente“
insert into storage.buckets (id, name, public) values ('dokumente', 'dokumente', false) on conflict (id) do nothing;
drop policy if exists "dokumente ansehen"   on storage.objects;
drop policy if exists "dokumente hochladen" on storage.objects;
drop policy if exists "dokumente aendern"   on storage.objects;
drop policy if exists "dokumente loeschen"  on storage.objects;
create policy "dokumente ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and public.darf_schreiben());
create policy "dokumente hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and public.darf_schreiben());
create policy "dokumente aendern" on storage.objects for update to authenticated
  using (bucket_id = 'dokumente' and (owner = auth.uid() or public.ist_admin() or public.ist_inhaber()));
create policy "dokumente loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and (owner = auth.uid() or public.ist_admin() or public.ist_inhaber()));

-- Kontrolle: Sicht ohne fernVorOrt, zwei neue Einstellungs-Regeln, Speicher da, vier Speicher-Regeln
select 'ok' as einrichtung,
       (select count(*) from pg_policies where tablename = 'einstellungen' and policyname like 'einstellungen einrichtung%') as einstellungs_regeln,
       (select count(*) from storage.buckets where id = 'dokumente') as speicher,
       (select count(*) from pg_policies where tablename = 'objects' and policyname like 'dokumente %') as speicher_regeln,
       (select position('fernVorOrt' in pg_get_viewdef('public.stammdaten_lesen'::regclass)) > 0) as sicht_ohne_vorort;
