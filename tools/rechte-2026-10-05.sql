-- =====================================================================================================
-- Rechte nach den Antworten des Inhabers vom 05.10.2026
-- =====================================================================================================
-- WAS:   Zusätzliche Sperren (und drei ausdrücklich gewollte Erweiterungen) für Abwesenheiten, Stunden,
--        Tour-Startpunkte, Werkzeug-Bedarf an privaten Terminen, Fahrzeuge/Privatautos, Reisekosten
--        (Belegfoto, Kilometergeld) und den Posteingang.
-- WARUM: Antworten des Inhabers vom 05.10.2026. Grundsatz (wörtlich): „Was Arbeitsstunden und Co betrifft hat
--        immer nur der Inhaber volle Kontrolle. Admin ist nur Admin für den Leitstand, aber nicht für Stunden,
--        Angebote und Rechnungen. Angebote und Rechnungen, alles was zu diesen Themen gehört, darf nur der Inhaber
--        sehen.“ – kurz: Stunden, Angebote, Rechnungen: volle Kontrolle nur der Inhaber; Admin nur für den Leitstand.
--
-- AUSFÜHREN: im Supabase SQL Editor, NACH den anderen Skripten (supabase-setup.sql, tools/rollen.sql, planung.sql,
--        abwesenheit-arbeit.sql, stunden-kalender.sql, stempeluhr*.sql, stempel-abgleich.sql, kunden-projekte-stunden.sql,
--        startpunkte.sql, fahrzeuge.sql, werkzeug.sql, reisekosten.sql, ki-und-posteingang.sql, posteingang-lesen.sql,
--        push.sql). Mehrfach ausführbar (drop … if exists / create or replace).
--        Die neuen Regeln sind RESTRICTIVE (gelten zusätzlich zu allen erlaubenden) bzw. eigene Trigger und Funktionen
--        mit eigenen Namen – ein erneuter Lauf älterer Skripte (die nur ihre eigenen, erlaubenden Regeln neu anlegen)
--        lockert sie nicht. Nach einem erneuten Lauf von supabase-setup.sql bleiben sie ebenfalls bestehen.
--
-- GEWOLLTE ERWEITERUNGEN (Inhaber 05.10.2026), sonst wird nirgends etwas gelockert:
--   * Techniker legen ihre eigenen Privatautos selbst an (Abschnitt 8),
--   * Techniker sehen über fahrzeuge_auswahl() Kennzeichen, Bezeichnung und Fahrernamen aller aktiven Fahrzeuge
--     (Abschnitt 5; die Leseregel der Tabelle fahrzeuge bleibt unverändert),
--   * der Inhaber legt ein Belegfoto in den Ordner einer anderen Person (Abschnitt 7).
--
-- Am Ende EINE Kontrollabfrage: jede Zeile muss „angelegt = ja“ zeigen.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 0. Hilfsfunktionen (security definer: prüfen unabhängig von den Leseregeln der jeweiligen Tabelle;
--    selbst ohne Wirkung auf Rechte – sie werden nur von den Regeln weiter unten benutzt)
-- -----------------------------------------------------------------------------------------------------

-- Bedarf an einem PRIVATEN Termin, den ich weder angelegt habe noch in dem ich eingetragen bin? (Abschnitt 6)
create or replace function public.bedarf_privat_fremd(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planung p
                  where p.id = pid
                    and (p.privat or p.kategorie = 'privat')
                    and p.erstellt_von is distinct from auth.uid()
                    and not coalesce(auth.uid() = any(p.wer), false));
$$;
revoke all on function public.bedarf_privat_fremd(uuid) from public, anon;
grant execute on function public.bedarf_privat_fremd(uuid) to authenticated;

-- Gehört ein Belegfoto zu einem abgegebenen oder ausbezahlten Reisekosten-Eintrag? (Abschnitt 7)
create or replace function public.auslagen_foto_gesperrt(p_pfad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.auslagen a where a.foto = p_pfad and a.status <> 'offen');
$$;
revoke all on function public.auslagen_foto_gesperrt(text) from public, anon;
grant execute on function public.auslagen_foto_gesperrt(text) to authenticated;

-- Admin wie in der App: in admins UND Rolle admin/inhaber (ohne Eintrag in rollen zählt admins) (Abschnitt 10)
create or replace function public.posteingang_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_admin()
     and coalesce((select r.rolle from public.rollen r where r.user_id = auth.uid()), 'admin') in ('admin','inhaber');
$$;
revoke all on function public.posteingang_admin() from public, anon;
grant execute on function public.posteingang_admin() to authenticated;

-- Gehört eine Datei im Speicher „posteingang“ zu einem Lidl-Auftrag oder Rapport? (Abschnitt 10)
create or replace function public.posteingang_lidl_datei(p_pfad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posteingang p where p.pfad = p_pfad and p.art in ('auftrag','rapport'));
$$;
revoke all on function public.posteingang_lidl_datei(text) from public, anon;
grant execute on function public.posteingang_lidl_datei(text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 1. planung – Abwesenheiten anderer Personen: nur der Inhaber
--    Was:   Urlaub, Krankenstand, Schule/Kurs und Zeitausgleich (Kalender-Termine) einer ANDEREN Person – auch
--           gemeinsame mit mehreren Personen (Betriebsurlaub, Kurs) – legt an, ändert, kürzt, nimmt Tage heraus und
--           löscht nur der Inhaber.
--    Warum: Inhaber 05.10.2026. Beispiel Krankmeldung per Telefon: nur der Inhaber oder der Kranke selbst trägt ein.
--           Ein Admin wird dabei wie ein Techniker behandelt (Admin ist nicht für Stunden zuständig).
--    Danach: Inhaber alles. Jede Person (auch Admins) ihre EIGENE Abwesenheit – SELBST angelegt UND nur sie (bzw.
--           niemand) eingetragen – anlegen, ändern, löschen. Was der Inhaber für jemanden eingetragen hat (etwa den
--           Krankenstand nach einem Anruf), ändert und löscht nur der Inhaber; die Person gibt dazu nur ihre Antwort
--           (ausnahmen) bzw. bittet in der App um Herausnehmen. Aus einer gemeinsamen nimmt sie nur sich selbst heraus
--           und gibt ihre eigene Antwort (Spalte ausnahmen: eingesprungen / Urlaubstag zurückgegeben).
--           Andere Termine (Wartung, Baustelle, Büro …) bleiben wie bisher.
--    Wie:   drei Sperrregeln (anlegen, ändern, löschen), die nur bei Abwesenheits-Arten greifen; was sich an einer
--           gemeinsamen Abwesenheit ändern darf, prüft der Trigger planung_rechte_abwesenheit. Er läuft NACH
--           planung_pruefen (Postgres: BEFORE-Trigger alphabetisch): ein Urlaub, den planung_pruefen beim Herausnehmen
--           wieder auf „beantragt“ setzen würde, bleibt so für Nicht-Inhaber gesperrt (der Inhaber nimmt ihn heraus).
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "abwesenheit anlegen nur selbst oder inhaber" on public.planung;
create policy "abwesenheit anlegen nur selbst oder inhaber" on public.planung as restrictive for insert to authenticated
  with check (art <> 'termin' or kategorie not in ('urlaub','krank','schule','zeitausgleich') or public.ist_inhaber()
              or (wer <@ array[auth.uid()] and erstellt_von = auth.uid()));

-- ändern: nur, wer im Eintrag steht bzw. ihn ohne Personen angelegt hat (oder der Inhaber); was genau, prüft der Trigger
drop policy if exists "abwesenheit aendern nur selbst oder inhaber" on public.planung;
create policy "abwesenheit aendern nur selbst oder inhaber" on public.planung as restrictive for update to authenticated
  using (art <> 'termin' or kategorie not in ('urlaub','krank','schule','zeitausgleich') or public.ist_inhaber()
         or auth.uid() = any(wer) or (cardinality(wer) = 0 and erstellt_von = auth.uid()))
  with check (true);

drop policy if exists "abwesenheit loeschen nur selbst oder inhaber" on public.planung;
create policy "abwesenheit loeschen nur selbst oder inhaber" on public.planung as restrictive for delete to authenticated
  using (art <> 'termin' or kategorie not in ('urlaub','krank','schule','zeitausgleich') or public.ist_inhaber()
         or (erstellt_von = auth.uid() and wer <@ array[auth.uid()]));

create or replace function public.planung_rechte_abwesenheit() returns trigger
language plpgsql set search_path = public as $$
declare
  ich uuid := auth.uid();
  abw_alt boolean := old.art = 'termin' and old.kategorie in ('urlaub','krank','schule','zeitausgleich');
  abw_neu boolean := new.art = 'termin' and new.kategorie in ('urlaub','krank','schule','zeitausgleich');
  frei constant text[] := array['wer','wer_namen','ausnahmen','geaendert','geaendert_von'];
  i integer;
begin
  -- Inhaber und der Server selbst (SQL Editor, ohne Anmeldung) dürfen alles; andere Termine wie bisher
  if ich is null or public.ist_inhaber() or not (abw_alt or abw_neu) then return new; end if;
  -- eigene Abwesenheit (selbst angelegt und nur selbst eingetragen; bzw. ein eigener Termin, der eine wird): ändern ja –
  -- aber keine anderen Personen dazu
  if old.erstellt_von = ich and (not abw_alt or old.wer <@ array[ich]) then
    if abw_neu and not (new.wer <@ array[ich]) then
      raise exception 'Urlaub, Krankenstand, Schule und Zeitausgleich anderer trägt nur der Inhaber ein';
    end if;
    return new;
  end if;
  if not abw_alt then raise exception 'Diesen Termin kann nur zur eigenen Abwesenheit machen, wer ihn angelegt hat'; end if;
  -- fremde bzw. gemeinsame Abwesenheit: nur die eigene Antwort (ausnahmen) und – aus einer gemeinsamen – sich selbst herausnehmen
  if not (ich = any(old.wer)) then raise exception 'Diese Abwesenheit ändert nur der Inhaber'; end if;
  if (to_jsonb(new) - frei) is distinct from (to_jsonb(old) - frei) then
    raise exception 'Diese Abwesenheit ändert nur der Inhaber – du kannst nur dich selbst herausnehmen';
  end if;
  if new.wer is distinct from old.wer then
    if cardinality(old.wer) < 2 then raise exception 'Diese Abwesenheit hat der Inhaber eingetragen – ändern kann sie nur er'; end if;
    i := array_position(old.wer, ich);
    if new.wer is distinct from array_remove(old.wer, ich)
       or new.wer_namen is distinct from (old.wer_namen[1:i-1] || old.wer_namen[i+1:greatest(cardinality(old.wer_namen), i)]) then
      raise exception 'Aus einer gemeinsamen Abwesenheit nimmst du nur dich selbst heraus';
    end if;
  elsif new.wer_namen is distinct from old.wer_namen then
    raise exception 'Diese Abwesenheit ändert nur der Inhaber';
  end if;
  return new;
end $$;
drop trigger if exists planung_rechte_abwesenheit on public.planung;
create trigger planung_rechte_abwesenheit before update on public.planung
  for each row execute function public.planung_rechte_abwesenheit();


-- -----------------------------------------------------------------------------------------------------
-- 2. planung – schon genehmigten Urlaub löscht nur der Inhaber
--    Was:   Ein Urlaub mit Stand „genehmigt“ lässt sich nur vom Inhaber löschen – auch nicht von der Person selbst.
--    Warum: Inhaber 05.10.2026. In der App zieht die Person ihn stattdessen zurück („Urlaub zurückziehen“: Rückfrage,
--           dann Chat-Nachricht an den Inhaber, der ihn löscht).
--    Danach: Inhaber löscht jeden Urlaub; die Person ihren eigenen nur, solange er beantragt oder abgelehnt ist.
--           Ändert die Person Zeitraum oder Personen eines genehmigten Urlaubs, setzt planung_pruefen ihn wie bisher
--           auf „beantragt“ zurück (so gewollt, nicht geändert).
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "genehmigter urlaub loeschen nur inhaber" on public.planung;
create policy "genehmigter urlaub loeschen nur inhaber" on public.planung as restrictive for delete to authenticated
  using (art <> 'termin' or kategorie <> 'urlaub' or status <> 'genehmigt' or public.ist_inhaber());


-- -----------------------------------------------------------------------------------------------------
-- 3. arbeitszeiten – bestätigter Monat sperrt auch NEUE Einträge der Person
--    Was:   „Monat bestätigt“ steht je Eintrag in arbeitszeiten.bestaetigt (der Inhaber setzt es beim „Bestätigen“ für
--           alle Einträge der Person im Monat). Ein Monat gilt für eine Person als bestätigt, sobald sie dort einen
--           bestätigten Eintrag hat (so prüft es auch planung_stunden_sync). Bisher waren nur diese Einträge gesperrt –
--           neue ließen sich weiter anlegen (von Hand, Stempeln, Abgleich).
--    Warum: Inhaber 05.10.2026 – „bestätigt“ heißt: zu. Nur der Inhaber trägt danach noch etwas ein oder öffnet den Monat
--           wieder („Wieder öffnen“ setzt bestaetigt auf leer – erlaubt schon „zeiten aendern“).
--    Danach: im bestätigten Monat einer Person legt niemand außer dem Inhaber einen Eintrag an, ändert oder löscht einen –
--           auch nicht über die security-definer-Funktionen stempeln() und stempel_abgleich() (deshalb ein BEFORE-Trigger
--           statt einer Regel; Ausstempeln in einen bestätigten Monat schlägt fehl, die Person bleibt eingestempelt, bis
--           der Inhaber den Monat wieder öffnet). Ausgenommen: Inhaber, der Server selbst (SQL Editor) und die
--           automatische Kalender-Übernahme (planung_stunden_sync, Merker ukt.kalender_sync) – die fasst bestätigte
--           Monate ohnehin nie an. tools/stempeluhr*.sql bleiben unverändert.
-- -----------------------------------------------------------------------------------------------------

create or replace function public.arbeitszeit_monat_gesperrt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  gesperrt boolean := false;
begin
  if not (auth.uid() is null or public.ist_inhaber() or coalesce(current_setting('ukt.kalender_sync', true), '') = '1') then
    -- der bisherige Monat (ändern, löschen) und der neue (anlegen, ändern – auch ein Verschieben hinein)
    if tg_op in ('UPDATE','DELETE') then
      gesperrt := exists (select 1 from public.arbeitszeiten x where x.user_id = old.user_id and x.bestaetigt is not null
        and x.datum >= date_trunc('month', old.datum)::date and x.datum < (date_trunc('month', old.datum) + interval '1 month')::date);
    end if;
    if not gesperrt and tg_op in ('INSERT','UPDATE') then
      gesperrt := exists (select 1 from public.arbeitszeiten x where x.user_id = new.user_id and x.bestaetigt is not null
        and x.datum >= date_trunc('month', new.datum)::date and x.datum < (date_trunc('month', new.datum) + interval '1 month')::date);
    end if;
    if gesperrt then raise exception 'Monat ist bestätigt – nur der Inhaber kann noch etwas eintragen'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists arbeitszeiten_monat_gesperrt on public.arbeitszeiten;
create trigger arbeitszeiten_monat_gesperrt before insert or update or delete on public.arbeitszeiten
  for each row execute function public.arbeitszeit_monat_gesperrt();


-- -----------------------------------------------------------------------------------------------------
-- 4. einstellungen – Tour-Startpunkt: jeder nur seinen eigenen, Inhaber und Admins für alle
--    Was:   einstellungen 'startpunkt:<Konto>' (startpunkte.sql) durfte bisher jeder anlegen und ändern, der schreiben
--           darf – auch den Startpunkt einer anderen Person.
--    Warum: Inhaber 05.10.2026: jeder setzt nur seinen EIGENEN; Inhaber und Admin dürfen ihn für alle setzen (Touren planen).
--    Danach: Techniker anlegen/ändern nur 'startpunkt:<eigene Kennung>'. Inhaber und Admins (Tabelle admins) alle.
--           Lesen unverändert (alle Mitarbeiter). Andere Einstellungen: unverändert (nur Inhaber).
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "startpunkt nur eigener anlegen" on public.einstellungen;
create policy "startpunkt nur eigener anlegen" on public.einstellungen as restrictive for insert to authenticated
  with check (schluessel not like 'startpunkt:%' or schluessel = 'startpunkt:' || auth.uid()::text
              or public.ist_inhaber() or public.ist_admin());

drop policy if exists "startpunkt nur eigener aendern" on public.einstellungen;
create policy "startpunkt nur eigener aendern" on public.einstellungen as restrictive for update to authenticated
  using (schluessel not like 'startpunkt:%' or schluessel = 'startpunkt:' || auth.uid()::text
         or public.ist_inhaber() or public.ist_admin())
  with check (schluessel not like 'startpunkt:%' or schluessel = 'startpunkt:' || auth.uid()::text
              or public.ist_inhaber() or public.ist_admin());


-- -----------------------------------------------------------------------------------------------------
-- 5. fahrzeuge – Auswahl fürs Werkzeug („im Fahrzeug eines Kollegen“): nur Kennzeichen, Bezeichnung, Fahrer
--    Was:   neue Lese-Funktion public.fahrzeuge_auswahl() – alle AKTIVEN Fahrzeuge (Firmen- und Mitarbeiterfahrzeuge)
--           mit genau diesen Spalten: id, kennzeichen, bezeichnung, fahrer_namen. Keine Kosten, km, Pickerl/Service,
--           Schäden, GPS-Kennung, Notiz, Fahrer-Kennungen.
--    Warum: Inhaber 05.10.2026 („Ja, nur Kennzeichen“): Techniker sollen beim Werkzeug als Ort jedes Fahrzeug wählen
--           können – bisher sahen sie nur ihr eigenes (Leseregel „fahrzeuge lesen“, fahrzeuge.sql). GEWOLLTE ERWEITERUNG.
--    Danach: ausführen dürfen alle, die mitarbeiten (darf_schreiben – Kunde und Präsentation bekommen nichts). Die
--           Leseregeln von fahrzeuge und fahrzeug_eintraege bleiben UNVERÄNDERT. Die App nutzt die Funktion nur für die
--           Ortswahl beim Werkzeug.
-- -----------------------------------------------------------------------------------------------------

create or replace function public.fahrzeuge_auswahl()
returns table (id uuid, kennzeichen text, bezeichnung text, fahrer_namen text[])
language sql stable security definer set search_path = public as $$
  select f.id, f.kennzeichen, f.bezeichnung, f.fahrer_namen
    from public.fahrzeuge f
   where public.darf_schreiben() and f.aktiv
   order by f.kennzeichen;
$$;
revoke all on function public.fahrzeuge_auswahl() from public, anon;
grant execute on function public.fahrzeuge_auswahl() to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 6. bedarf – Material/Werkzeug an PRIVATEN Terminen: die Datenbank sperrt es selbst
--    Was:   public.bedarf (werkzeug.sql) hängt über planung_id an einem Kalendertermin. Ist der Termin privat (privat =
--           true bzw. kategorie 'privat'), sahen bisher alle Mitarbeiter den Eintrag – nur die App blendete ihn aus.
--    Warum: Inhaber 05.10.2026: die Datenbank soll es selbst sperren – bei einem privaten Termin sehen andere nur
--           „Abwesend“ (wie planung_privat).
--    Danach: einen Bedarf-Eintrag an einem privaten Termin lesen nur, wer den Termin angelegt hat oder dort eingetragen
--           ist – und der Inhaber (volle Kontrolle, bleibt in der Sicherung). Kollegen inkl. Admins nicht. Weil Postgres
--           beim Ändern und Löschen die Leseregel mit anwendet, können die anderen ihn auch nicht ändern oder löschen.
--           Einträge ohne Termin oder an nicht privaten Terminen: unverändert.
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "bedarf privat nur eigene" on public.bedarf;
create policy "bedarf privat nur eigene" on public.bedarf as restrictive for select to authenticated
  using (planung_id is null or public.ist_inhaber() or not public.bedarf_privat_fremd(planung_id));


-- -----------------------------------------------------------------------------------------------------
-- 7. storage.objects (Speicher „auslagen“) – Reisekosten-Belegfoto nach der Abgabe
--    Was:   Ist ein Eintrag abgegeben oder ausbezahlt (auslagen.status <> 'offen'), kann die Person ihr Belegfoto nicht
--           mehr entfernen oder austauschen – nur noch der Inhaber. Gibt der Inhaber den Monat zurück (status wieder
--           'offen'), darf die Person wieder. Der Inhaber darf das Foto eines fremden Eintrags ersetzen: das neue Foto
--           liegt im Ordner DER PERSON (<user_id>/…), das alte entfernt die App erst, wenn der Eintrag gespeichert ist.
--    Warum: Inhaber 05.10.2026 (kehrt die Tiefentest-Entscheidung RK-05 „Chef ersetzt kein fremdes Foto“ um,
--           ENTSCHEIDUNGEN.md E20).
--    Danach: Person – ablegen im eigenen Ordner (wie bisher, reisekosten.sql); entfernen/ändern nur, solange kein
--           abgegebener oder ausbezahlter Eintrag dieses Foto nennt. Inhaber – lesen, ablegen (GEWOLLTE ERWEITERUNG:
--           auch in fremden Ordnern) und entfernen in jedem Ordner. Archivkonto weiter nie (archiv-rolle.sql).
--           Andere Speicherbereiche bleiben unberührt.
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "auslagen foto abgegeben nur inhaber loeschen" on storage.objects;
create policy "auslagen foto abgegeben nur inhaber loeschen" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'auslagen' or public.ist_inhaber() or not public.auslagen_foto_gesperrt(name));
drop policy if exists "auslagen foto abgegeben nur inhaber aendern" on storage.objects;
create policy "auslagen foto abgegeben nur inhaber aendern" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'auslagen' or public.ist_inhaber() or not public.auslagen_foto_gesperrt(name))
  with check (bucket_id <> 'auslagen' or public.ist_inhaber() or not public.auslagen_foto_gesperrt(name));

-- erlaubend (gewollt): der Inhaber legt ein Belegfoto auch in den Ordner einer anderen Person
drop policy if exists "auslagen fotos inhaber ablegen" on storage.objects;
create policy "auslagen fotos inhaber ablegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'auslagen' and public.ist_inhaber() and public.darf_schreiben());


-- -----------------------------------------------------------------------------------------------------
-- 8. fahrzeuge – eigenes Privatauto selbst eintragen
--    Was:   Jede Person, die mitarbeitet (auch Techniker), legt ihre EIGENEN Privatautos selbst an und bearbeitet sie –
--           auch mehrere: privat_von = sie selbst, sie ist Fahrer; Kennzeichen, Bezeichnung, Name, „in Verwendung“.
--    Warum: Inhaber 05.10.2026 (Kilometergeld gibt es nur mit eingetragenem Privatauto – Abschnitt 9). GEWOLLTE ERWEITERUNG.
--    Danach: Büro (Inhaber, Admins) wie bisher alle Fahrzeuge (fahrzeuge.sql). Nicht-Büro: anlegen/ändern NUR Fahrzeuge
--           mit privat_von = auth.uid(); privat_von nie auf andere; Fahrer, Fristen (Pickerl, Service), GPS-Kennung, Notiz,
--           Erstzulassung setzt der Trigger zurück bzw. leer. Löschen weiter nur der Inhaber; Einträge (km, Schaden) und
--           Kosten unverändert (fahrzeug_eintraege, fahrzeug_kosten). Der Server selbst (SQL Editor) ist ausgenommen.
--    Voraussetzung: fahrzeuge.privat_von / privat_name (reisekosten.sql), fahrzeug_buero() (fahrzeuge.sql).
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "fahrzeuge eigenes privatauto anlegen" on public.fahrzeuge;
create policy "fahrzeuge eigenes privatauto anlegen" on public.fahrzeuge for insert to authenticated
  with check (privat_von = auth.uid() and auth.uid() = any (fahrer) and public.darf_schreiben());
drop policy if exists "fahrzeuge eigenes privatauto aendern" on public.fahrzeuge;
create policy "fahrzeuge eigenes privatauto aendern" on public.fahrzeuge for update to authenticated
  using (privat_von = auth.uid())
  with check (privat_von = auth.uid() and auth.uid() = any (fahrer) and public.darf_schreiben());
-- Sperrregeln: wer nicht Büro ist, schreibt nur eigene Privatautos (gilt zusätzlich, auch wenn später weitere
-- erlaubende Regeln dazukommen)
drop policy if exists "fahrzeuge nicht buero nur eigenes privatauto anlegen" on public.fahrzeuge;
create policy "fahrzeuge nicht buero nur eigenes privatauto anlegen" on public.fahrzeuge as restrictive for insert to authenticated
  with check (public.fahrzeug_buero() or privat_von = auth.uid());
drop policy if exists "fahrzeuge nicht buero nur eigenes privatauto aendern" on public.fahrzeuge;
create policy "fahrzeuge nicht buero nur eigenes privatauto aendern" on public.fahrzeuge as restrictive for update to authenticated
  using (public.fahrzeug_buero() or privat_von = auth.uid())
  with check (public.fahrzeug_buero() or privat_von = auth.uid());

-- welche Spalten Nicht-Büro setzen darf (eigener Trigger)
create or replace function public.fahrzeuge_privat_pruefen() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.fahrzeug_buero() then return new; end if;   -- Server (SQL Editor) und Büro wie bisher
  if new.privat_von is distinct from auth.uid() or (tg_op = 'UPDATE' and old.privat_von is distinct from auth.uid()) then
    raise exception 'Nur das eigene Privatauto – andere Fahrzeuge trägt das Büro ein';
  end if;
  if tg_op = 'INSERT' then
    new.fahrer := array[auth.uid()]; new.fahrer_namen := array[coalesce(new.privat_name, '')];
    new.erstzulassung := null; new.pickerl_bis := null; new.service_bis := null; new.service_km := null;
    new.tracker_id := null; new.notiz := null; new.aktiv := coalesce(new.aktiv, true);
    new.erstellt := now(); new.erstellt_von := auth.uid();
  else
    -- nur Kennzeichen, Bezeichnung, Name und „in Verwendung“ – alles andere bleibt, wie das Büro es eingetragen hat
    new.id := old.id; new.fahrer := old.fahrer; new.fahrer_namen := old.fahrer_namen; new.erstzulassung := old.erstzulassung;
    new.pickerl_bis := old.pickerl_bis; new.service_bis := old.service_bis; new.service_km := old.service_km;
    new.tracker_id := old.tracker_id; new.notiz := old.notiz; new.erstellt := old.erstellt; new.erstellt_von := old.erstellt_von;
  end if;
  new.geaendert := now();
  return new;
end $$;
drop trigger if exists fahrzeuge_privat_pruefen on public.fahrzeuge;
create trigger fahrzeuge_privat_pruefen before insert or update on public.fahrzeuge
  for each row execute function public.fahrzeuge_privat_pruefen();


-- -----------------------------------------------------------------------------------------------------
-- 9. auslagen – Kilometergeld nur MIT eingetragenem Privatauto
--    Was:   Ein km-Eintrag (auslagen.art = 'km') braucht fahrzeug_id eines Fahrzeugs mit privat_von = user_id des
--           Eintrags (das Privatauto der Person). Ohne Fahrzeug, mit Firmenfahrzeug oder dem Privatauto einer anderen
--           Person lehnt die Datenbank ab.
--    Warum: Inhaber 05.10.2026 („Kilometergeld nur mit eingetragenem Privatauto – Pflicht“).
--    Danach: Person – km-Eintrag nur mit ihrem Privatauto. Inhaber – ändert einen fremden km-Eintrag weiter, mit dem
--           Privatauto DER PERSON. Nicht geprüft wird eine reine Statusänderung eines schon gespeicherten km-Eintrags
--           (abgeben, zurückgeben, ausbezahlt): ältere Einträge ohne Fahrzeug bleiben abgebbar und auszahlbar; wer sie
--           inhaltlich ändert (km, Strecke, Datum, Fahrzeug), braucht das Privatauto. Der Server selbst (SQL Editor) ist
--           ausgenommen. Eigener Trigger (neuer Name), auslagen_pruefen bleibt unverändert; die Person des Eintrags wird
--           hier selbst bestimmt (unabhängig von der Reihenfolge der Trigger).
-- -----------------------------------------------------------------------------------------------------

create or replace function public.auslagen_km_privatauto() returns trigger
language plpgsql security definer set search_path = public as $$
declare besitzer uuid;
begin
  if new.art is distinct from 'km' or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and old.art = 'km'
     and new.fahrzeug_id is not distinct from old.fahrzeug_id and new.user_id is not distinct from old.user_id
     and new.km is not distinct from old.km and new.datum is not distinct from old.datum and new.text is not distinct from old.text then
    return new;   -- nur Status (abgeben, zurückgeben, ausbezahlt) oder Notiz/Projekt geändert
  end if;
  -- wem der Eintrag gehört – wie auslagen_pruefen: nur der Inhaber legt bzw. ändert Einträge anderer Personen
  besitzer := case when public.ist_inhaber() then coalesce(new.user_id, auth.uid())
                   when tg_op = 'UPDATE' then old.user_id
                   else auth.uid() end;
  if new.fahrzeug_id is null or not exists (
       select 1 from public.fahrzeuge f where f.id = new.fahrzeug_id and f.privat_von = besitzer) then
    raise exception 'Kilometergeld nur mit eingetragenem Privatauto – zuerst im Reiter Fahrzeuge das Privatauto eintragen';
  end if;
  return new;
end $$;
drop trigger if exists auslagen_pruefen_privatauto on public.auslagen;
create trigger auslagen_pruefen_privatauto before insert or update on public.auslagen
  for each row execute function public.auslagen_km_privatauto();


-- -----------------------------------------------------------------------------------------------------
-- 10. posteingang (Tabelle und Speicher) – nach Rollen
--    Was:   Projektmails (weitergeleitete Mails, ihre Anhänge – alles außer art 'auftrag'/'rapport') sieht NUR der
--           Inhaber. Lidl-Störungsaufträge und Rapporte (art 'auftrag'/'rapport') sehen Inhaber UND Admins. Techniker
--           sehen den Posteingang gar nicht (Tabelle, Dateien, Benachrichtigungen – Abschnitt 11).
--    Warum: Inhaber 05.10.2026 (Projektmails enthalten Preise, Angebote und Kundendaten).
--    Danach: Inhaber – alles lesen und erledigen. Admin – Aufträge/Rapporte lesen und erledigen (Datei über
--           posteingang.pfad zugeordnet). Techniker/Kunde/Präsentation – nichts lesen, nichts erledigen.
--           ANLEGEN bleibt wie bisher für alle, die schreiben dürfen (ki-und-posteingang.sql) – so legt das Konto der
--           Synology weiter ab, ohne lesen zu können (synology/ukt_posteingang.py braucht kein Leserecht: fester
--           Ablagepfad, „on conflict do nothing“, return=minimal). Das Konto der Synology darf NICHT das Archivkonto
--           sein (Rolle „archiv“ schreibt nirgends) – siehe POSTEINGANG-EINRICHTUNG.md.
-- -----------------------------------------------------------------------------------------------------

drop policy if exists "posteingang nach rolle" on public.posteingang;
create policy "posteingang nach rolle" on public.posteingang as restrictive for select to authenticated
  using (public.ist_inhaber() or (public.posteingang_admin() and art in ('auftrag','rapport')));
drop policy if exists "posteingang nach rolle erledigen" on public.posteingang;
create policy "posteingang nach rolle erledigen" on public.posteingang as restrictive for update to authenticated
  using (public.ist_inhaber() or (public.posteingang_admin() and art in ('auftrag','rapport')))
  with check (public.ist_inhaber() or (public.posteingang_admin() and art in ('auftrag','rapport')));

-- Dateien im Speicher „posteingang“: Inhaber alle, Admins nur die der Aufträge/Rapporte (andere Speicher unberührt)
drop policy if exists "posteingang dateien nach rolle" on storage.objects;
create policy "posteingang dateien nach rolle" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'posteingang' or public.ist_inhaber() or (public.posteingang_admin() and public.posteingang_lidl_datei(name)));

-- (Synology-Posteingang, zu großer Anhang: keine Änderung an der Datenbank nötig – er kommt als Zeile ohne Datei:
--  pfad = '' (not null erlaubt den leeren Text), bytes leer, Hinweis in notiz, art 'unbekannt'.)


-- -----------------------------------------------------------------------------------------------------
-- 11. push_ereignisse – Benachrichtigungen zum Posteingang nur an die, die ihn sehen dürfen
--    Was:   push.sql legt bei jedem neuen Eingang ein Ereignis für ALLE an, mit dem Betreff im Text. Ein eigener Trigger
--           setzt die Empfänger: Aufträge/Rapporte „inhaber,admin“, alles andere nur „inhaber“; eine schon engere Angabe
--           bleibt (nur die Schnittmenge). Gilt für die Push-Nachricht und die Meldungen in der App (meldungen.sql).
--    Warum: wie Abschnitt 10 (Inhaber 05.10.2026).
--    Danach: Techniker bekommen keine Posteingang-Benachrichtigung mehr; Admins nur zu Aufträgen und Rapporten.
--           Fehlt die Tabelle (push.sql nicht ausgeführt), wird der Trigger übersprungen.
-- -----------------------------------------------------------------------------------------------------

create or replace function public.push_posteingang_rolle() returns trigger
language plpgsql set search_path = public as $$
declare erlaubt text;
begin
  if new.art = 'posteingang' then
    erlaubt := case when new.titel in ('Posteingang: Rapport', 'Posteingang: Auftrag') then 'inhaber,admin' else 'inhaber' end;
    new.nur_rolle := coalesce(nullif(array_to_string(array(
      select x from unnest(string_to_array(coalesce(new.nur_rolle, erlaubt), ',')) x
       where x = any (string_to_array(erlaubt, ','))), ','), ''), 'inhaber');
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.push_ereignisse') is not null then
    drop trigger if exists push_posteingang_rolle on public.push_ereignisse;
    create trigger push_posteingang_rolle before insert on public.push_ereignisse
      for each row execute function public.push_posteingang_rolle();
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- Ohne Datenbank-Änderung (nur in der App) – hier nichts auszuführen:
--   * Krankenstand anderer sehen Kollegen nur als „Abwesend“: die Zeile in planung bleibt für alle Mitarbeiter lesbar
--     (Regel „planung lesen“) – wer die Datenbank direkt abfragt, sieht die Art. Ganz sperren ginge nur wie bei
--     Privatem mit einer eigenen, nur für Person und Inhaber lesbaren Tabelle.
--   * Freitag-Vorgabe beim Planen 07:00–14:00, halber Tag mit Uhrzeit, Warnung „noch eingestempelt“: nur die App.
--   * Testkonten ausblenden: einstellungen 'personen_ausblenden' – die Regeln aus stempeluhr.sql passen schon (lesen
--     alle Mitarbeiter, ändern nur der Inhaber).
--   * Rechnungen (Belegnummer erst beim Speichern, Wartungspreis je Art und Anlagentyp, Lernen aus KPlus) nutzen die
--     vorhandenen Tabellen und beleg_nummer() aus belege-ausbau.sql.
-- -----------------------------------------------------------------------------------------------------


-- =====================================================================================================
-- KONTROLLE: jede Zeile muss „angelegt = ja“ zeigen (17 Regeln, 5 Trigger, 10 Funktionen).
-- „push_posteingang_rolle (Trigger)“ zeigt nur dann „nein“, wenn push.sql nie ausgeführt wurde.
-- =====================================================================================================
with soll(was, name, tabelle) as (values
  ('Regel',    'abwesenheit anlegen nur selbst oder inhaber',          'planung'),
  ('Regel',    'abwesenheit aendern nur selbst oder inhaber',          'planung'),
  ('Regel',    'abwesenheit loeschen nur selbst oder inhaber',         'planung'),
  ('Regel',    'genehmigter urlaub loeschen nur inhaber',              'planung'),
  ('Regel',    'startpunkt nur eigener anlegen',                       'einstellungen'),
  ('Regel',    'startpunkt nur eigener aendern',                       'einstellungen'),
  ('Regel',    'bedarf privat nur eigene',                             'bedarf'),
  ('Regel',    'auslagen foto abgegeben nur inhaber loeschen',         'objects'),
  ('Regel',    'auslagen foto abgegeben nur inhaber aendern',          'objects'),
  ('Regel',    'auslagen fotos inhaber ablegen',                       'objects'),
  ('Regel',    'fahrzeuge eigenes privatauto anlegen',                 'fahrzeuge'),
  ('Regel',    'fahrzeuge eigenes privatauto aendern',                 'fahrzeuge'),
  ('Regel',    'fahrzeuge nicht buero nur eigenes privatauto anlegen', 'fahrzeuge'),
  ('Regel',    'fahrzeuge nicht buero nur eigenes privatauto aendern', 'fahrzeuge'),
  ('Regel',    'posteingang nach rolle',                               'posteingang'),
  ('Regel',    'posteingang nach rolle erledigen',                     'posteingang'),
  ('Regel',    'posteingang dateien nach rolle',                       'objects'),
  ('Trigger',  'planung_rechte_abwesenheit',                           'planung'),
  ('Trigger',  'arbeitszeiten_monat_gesperrt',                         'arbeitszeiten'),
  ('Trigger',  'fahrzeuge_privat_pruefen',                             'fahrzeuge'),
  ('Trigger',  'auslagen_pruefen_privatauto',                          'auslagen'),
  ('Trigger',  'push_posteingang_rolle',                               'push_ereignisse'),
  ('Funktion', 'bedarf_privat_fremd',                                  null),
  ('Funktion', 'auslagen_foto_gesperrt',                               null),
  ('Funktion', 'posteingang_admin',                                    null),
  ('Funktion', 'posteingang_lidl_datei',                               null),
  ('Funktion', 'planung_rechte_abwesenheit',                           null),
  ('Funktion', 'arbeitszeit_monat_gesperrt',                           null),
  ('Funktion', 'fahrzeuge_auswahl',                                    null),
  ('Funktion', 'fahrzeuge_privat_pruefen',                             null),
  ('Funktion', 'auslagen_km_privatauto',                               null),
  ('Funktion', 'push_posteingang_rolle',                               null))
select s.was, s.name, s.tabelle,
       case when case s.was
              when 'Regel'    then exists (select 1 from pg_policies p where p.policyname = s.name and p.tablename = s.tabelle)
              when 'Trigger'  then exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                                            where t.tgname = s.name and c.relname = s.tabelle and not t.tgisinternal)
              else exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
                            where n.nspname = 'public' and f.proname = s.name) end
            then 'ja' else 'NEIN' end as angelegt,
       (select p.permissive from pg_policies p where p.policyname = s.name and p.tablename = s.tabelle) as art
  from soll s
 order by s.was desc, s.tabelle, s.name;
