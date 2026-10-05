# Datenbank-Postfach einrichten

Lidl schickt Aufträge und Rapportberichte direkt an ein eigenes Postfach, das
nur für die Datenbank da ist. Ein Skript auf der Synology holt die Mails ab und
legt die PDFs in den **Posteingang** der App. Alles ist vorbereitet und
**ausgeschaltet**, bis diese Schritte erledigt sind.

## Ablauf

1. Mail an z. B. `auftraege@ukt.at` (mit Georg einrichten).
2. `synology/ukt_posteingang.py` läuft alle 5 Minuten, holt neue Mails per IMAP,
   legt jede PDF bzw. jedes Bild in Supabase ab (Bucket und Tabelle
   `posteingang`) und verschiebt die Mail in den Ordner „Verarbeitet“. Nichts
   wird gelöscht; dieselbe Mail kommt nie doppelt an.
3. In der App steht unter **Fällig** oben die Karte **Posteingang**:
   - **Rapport zuordnen:** Die App liest Filiale, Datum und Stunden aus dem
     Rapport, schlägt das passende Protokoll vor (gleiche Filiale, derselbe
     Besuch) und hängt ihn dort an – „Korrektur speichern“, fertig.
   - **Als offene Störung erfassen:** öffnet die Störungserfassung mit dem
     Auftrag schon eingelesen.
   - **verwerfen:** mit Grund; bleibt nachvollziehbar in der Tabelle.
   Erledigt ist ein Eingang erst, wenn Protokoll bzw. Störung gespeichert sind.
4. **Weitergeleitete Mails zu Projekten** (seit 02.10.2026): Jede Mail, die kein
   Lidl-Auftrag oder Rapport ist, kommt zusätzlich als `.eml` mit – auch ganz ohne
   Anhang. Anhänge dürfen auch Word, Excel, DWG, ZIP usw. sein (bis 20 MB). In der
   App steht sie als **eine** Karte mit allen Dateien: **Zu Projekt legen** schlägt
   das Projekt vor (Projektnummer im Betreff, Kunde, Absender-Domain eines
   Beteiligten), die Art jeder Datei ist vorgewählt (Mail, Plan, Unterlage …).
   Erst wenn alle Dateien im Projekt liegen, ist die Mail im Posteingang erledigt.
   Ist ein Anhang (oder die Mail selbst) größer als 20 MB, legt das Skript ihn nicht still weg,
   sondern meldet ihn als Eintrag ohne Datei: der Inhaber sieht im Posteingang „⚠ … nicht
   abgeholt“ mit der Größe, holt die Datei von Hand aus dem Postfach (Ordner „Verarbeitet“) und
   hakt „Von Hand geholt – erledigt“ ab.
   Lidl-Aufträge und Rapporte erkennt das Skript am Betreff, am Dateinamen der PDF („rapport“,
   „auftrag“, „störung“) und am Absender (jede Adresse `…@lidl.<Endung>`); schickt ein
   Dienstleister im Auftrag von Lidl, seine Domain in `ukt_posteingang.json` unter
   `"lidl_domains": ["…"]` eintragen – seine PDFs gelten dann als Aufträge.
   Dafür einmal `tools/posteingang-projekte.sql` ausführen (erledigt am 02.10.2026).
   Wer was sieht (Inhaber 05.10.2026, `tools/rechte-2026-10-05.sql`): weitergeleitete Mails
   (Projekte) samt Anhängen NUR der Inhaber; Lidl-Aufträge und Rapporte Inhaber und Admins;
   Techniker, Kunden-Konto und Präsentation gar nichts (Liste, Dateien, Benachrichtigungen).

## Einrichten (einmalig)

1. **Postfach anlegen** (nur für die Datenbank), IMAP-Zugang notieren.
   Bei Lidl als Empfänger für Aufträge und Rapportzettel hinterlegen.
2. **SQL:** `tools/ki-und-posteingang.sql` im Supabase SQL Editor ausführen.
3. **Synology:** `ukt_posteingang.py` und `ukt_posteingang.beispiel.json` in den
   Skriptordner des Archivs kopieren (nur für Administratoren sichtbar!), die
   JSON-Datei in `ukt_posteingang.json` umbenennen und ausfüllen – ein **eigenes
   Supabase-Konto nur für den Posteingang** (z. B. `posteingang@…`), dazu Server,
   Benutzer und Passwort des Postfachs. Für dieses Konto gilt:
   - **nicht das Archivkonto** – die Rolle „archiv“ schreibt nirgends, das Ablegen scheitert;
   - **nicht das Konto des Inhabers oder eines Admins** – sein Passwort läge sonst auf der Synology;
   - **keine Rolle eintragen** (es zählt dann als Techniker): es darf ablegen, den Posteingang aber
     nicht lesen. Das Skript braucht seit 05.10.2026 kein Leserecht mehr (fester Ablagepfad je Mail
     und Datei, „on conflict do nothing“, keine Rückgabe) – ein zweiter Lauf legt nichts doppelt ab.
   - Es erscheint sonst in Team-Listen (Chat, Kalender) wie ein Techniker – deshalb unter
     Verwaltung › Inhaber beim Konto den Haken „ausblenden“ setzen (Inhaber 05.10.2026); den Namen
     trotzdem eindeutig wählen (Adresse `posteingang@…`).
4. **Testen:** Aufgabe mit `python3 …/ukt_posteingang.py --pruefen` einmal
   ausführen – zeigt, was abgeholt würde, schreibt nichts.
5. **Aufgabenplaner:** Benutzer `root`, alle 5 Minuten,
   `python3 /volume1/homes/<admin>/ukt-archiv/ukt_posteingang.py`.
6. **Einschalten:** in `config.js` `posteingangAktiv: true` setzen und hochladen.

Protokoll des Skripts: `ukt_posteingang.log` im Skriptordner.

## Hinweis

Das Skript ist nicht gegen ein echtes Postfach getestet – `tools/posteingang_test.py`
prüft es mit ausgedachten Mails und einem nachgebauten Supabase (auch ein Konto ohne
Leserecht und einen zweiten Lauf nach einem Teilfehler). Beim ersten Einrichten
deshalb zuerst mit `--pruefen` laufen lassen.
