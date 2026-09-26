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

## Einrichten (einmalig)

1. **Postfach anlegen** (nur für die Datenbank), IMAP-Zugang notieren.
   Bei Lidl als Empfänger für Aufträge und Rapportzettel hinterlegen.
2. **SQL:** `tools/ki-und-posteingang.sql` im Supabase SQL Editor ausführen.
3. **Synology:** `ukt_posteingang.py` und `ukt_posteingang.beispiel.json` in den
   Skriptordner des Archivs kopieren (nur für Administratoren sichtbar!), die
   JSON-Datei in `ukt_posteingang.json` umbenennen und ausfüllen – Supabase-Konto
   wie beim Archiv, dazu Server, Benutzer und Passwort des Postfachs.
4. **Testen:** Aufgabe mit `python3 …/ukt_posteingang.py --pruefen` einmal
   ausführen – zeigt, was abgeholt würde, schreibt nichts.
5. **Aufgabenplaner:** Benutzer `root`, alle 5 Minuten,
   `python3 /volume1/homes/<admin>/ukt-archiv/ukt_posteingang.py`.
6. **Einschalten:** in `config.js` `posteingangAktiv: true` setzen und hochladen.

Protokoll des Skripts: `ukt_posteingang.log` im Skriptordner.

## Hinweis

Das Skript ist nur gegen die Beschreibung geschrieben, nicht gegen ein echtes
Postfach getestet (auf diesem PC gibt es kein Python). Beim ersten Einrichten
deshalb zuerst mit `--pruefen` laufen lassen.
