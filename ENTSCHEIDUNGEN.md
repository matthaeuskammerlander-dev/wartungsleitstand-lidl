# Entscheidungen bei der Überarbeitung

Was ohne Rückfrage entschieden wurde – mit Grund und wie man es zurücknimmt.
Jede Entscheidung steht in einem eigenen Commit (Commit-Nachricht nennt sie).

| # | Entscheidung | Warum | Zurücknehmen |
|---|---|---|---|
| E1 | **Automatische Tests in `tests/`** (Playwright, erfundene Daten, nachgebaute Datenbank), in der GitHub-Prüfung als Schritt „App-Tests (Abläufe)“ | Vor jedem Umbau ein Sicherheitsnetz; die Endlosschleife im Kalender wäre damit nie live gegangen (per Gegenprobe nachgewiesen) | Schritt in `.github/workflows/pruefen.yml` entfernen |
| E2 | **Testdaten komplett erfunden** (Testfiliale 901 …, Konten `*@test.at`) | Repository ist öffentlich – keine echten Märkte, Adressen, Personen | – |
| E3 | **Technische Fehlermeldungen in Klartext** (`technikDeutsch` in `toast` und den Fehlerkästchen der Dialoge) | Techniker lasen „Failed to fetch“ | Funktion `technikDeutsch` gibt den Text unverändert zurück |
| E4 | **Fehlermeldungen bleiben 6,5 s statt 3,2 s stehen** | Fehler muss man lesen können, Bestätigungen nicht | Zeitwert in `toast` |
| E5 | `node_modules/` in `.gitignore` | Playwright nur zum Testen, nicht Teil der App | – |
| E6 | **Zwei nachweislich ungenutzte Funktionen entfernt** (`planAbwesend`, `stempelLaeuft`) | Nirgends aufgerufen (auch nicht aus Tests, Python oder HTML) | aus der Git-Geschichte wiederherstellen |
| E7 | **Eingabe-Dialog der App statt Browser-Abfrage** (`textAbfrage`: großes Feld, 🎤, Pflichtprüfung im Dialog) für alle 8 Textabfragen; die 4 Browser-Hinweisfenster als Meldung der App | Am iPhone waren die Browser-Fenster klein, ohne Diktat, und sahen nicht nach der App aus | `textAbfrage` durch `window.prompt` ersetzen |
| E8 | **Bestätigungsfragen (confirm, 76×) bleiben Browser-Fenster** | Sie halten den Ablauf an der richtigen Stelle an; ein Umbau aller 76 Stellen auf asynchrone Dialoge wäre ein großes Risiko ohne spürbaren Gewinn – sie sind kurz, klar und am iPhone gut bedienbar | – |
| E9 | **Riesenfunktionen noch nicht zerlegt** (`viewProtokoll` 2 300 Zeilen u. a.), stattdessen Zerlegungsplan in BESTANDSAUFNAHME.md | Die Tests decken diese Abläufe erst grob ab; ein Fehler träfe die tägliche Arbeit der Techniker. Zerlegen erst, wenn je Teil ein Test steht | – |
| E10 | **Kleine Hilfen für exakte Doppelungen** (`nachMarktname`, `nurAnsehenAbweisen`, `fussKnoepfe`) | Gleicher Code an vielen Stellen; nur exakt gleiche Stellen ersetzt, Verhalten unverändert | Aufrufe durch den früheren Code ersetzen |
| E11 | **Entwickler-Anleitung** ENTWICKLER.md | Aufbau, Wo-liegt-was, Testen, Checkliste für neue Funktionen | – |
| E13 | **Riesenfunktionen zerlegt** (Inhaber 03.10.: „fang mit dem Protokoll-Formular an und mache dann mit dem ganzen Rest weiter“): Teile mit Kontext `P`, zwei Phasen (anmelden, dann aufbauen) – maschinell über den Syntaxbaum umgebaut, nicht von Hand | Gleiches Verhalten nachgewiesen: Vergleichslauf alt/neu ohne Abweichung (Formular, Datensätze, Entwürfe, Meldungen, globale Variablen), alle App-Tests grün | Commit zurücknehmen |
| E12 | **Adressen nachgetragen** (14 Märkte) aus der Lidl-Filialsuche bzw. Pressemitteilungen, Kartenlage über OpenStreetMap; zwei Leerzeilen der alten Liste („Jahreswartung Lüftung“) stillgelegt | Inhaber 03.10.: ja – ohne PLZ keine Fahrtzone, keine genaue Karte | im Änderungsverlauf je Markt zurücknehmen |

## Tiefentest (05.10.2026)

148 bestätigte Funde in 7 Bereichen; 143 behoben, je mit Test („Tiefentest …“ in tests/app-tests.mjs). Fachfragen stehen in OFFENE-FRAGEN.md (F6–F33). Die wichtigsten Entscheidungen dabei:

| # | Entscheidung | Warum | Zurücknehmen |
|---|---|---|---|
| E14 | **Posteingang nur für Mitarbeiter lesbar** (tools/posteingang-lesen.sql, auch in ki-und-posteingang.sql) | Regel: Kunden-Konto sieht nie fremde Daten; Präsentation keine echten | Regeln wieder auf `true` bzw. nur bucket_id |
| E15 | **KPlus-PDF, Gutschrift und Mail mit Rechnung/Angebot** aus Posteingang und „Mail zu Projekt“ nur für den Inhaber (Büro-Ordner); Admin/Techniker legen sie nicht ab, sie bleiben für den Inhaber im Posteingang | Regel: Rechnungen und Preise nur Inhaber | `kplusDateiArt` |
| E16 | **Mailverlauf überschreibt keine vorhandenen Belege** – gleiche Art und Nummer: nur fehlende PDF dazu, Status und Projekt bleiben | Bezahlte Rechnung wurde wieder „versendet“ | insert → upsert |
| E17 | **Abgleich**: Lücken behalten Bereich, Markt und Projekt der gestempelten Zeit; Termin innerhalb eines anderen unterbricht ihn; mehrtägige Termine werden nie verschoben; Ziel beim Verschieben ist der nächste Arbeitstag ab heute | Montage wurde Fahrt, Projektstunden verschwanden | `abgleichTeile` |
| E18 | **planung.ausnahmen je Person** (`ausnahmen[Tag][user_id]`); ältere Antworten gelten weiter für alle; „Tag herausnehmen“ bei mehreren Personen mit Auswahl „für alle / nur …“ | Eine Antwort klärte den Tag für alle, „beenden“ nahm allen den Tag | Format zurück auf `ausnahmen[Tag]` |
| E19 | **Zeit erfassen**: Urlaub/Krankenstand nur als Hinweis, nicht antippbar; ungültige Dauer („-3“, „7:75“) abgelehnt; nur Notiz geändert → Minuten bleiben | Doppelter Krankenstand, beantragter Urlaub als Ist | `zeitEditor` |
| E20 | **Reisekosten**: ~~Chef ersetzt kein fremdes Belegfoto mehr (nur die Person)~~ – **geändert vom Inhaber 05.10.2026**: der Chef ersetzt das Foto eines fremden Eintrags, das neue liegt im Ordner der Person, das alte wird erst nach dem Speichern entfernt; nach der Abgabe ersetzt/entfernt das Foto nur noch der Chef (Speicher-Regel). Fremder km-Eintrag behält das Privatauto; Server-Antworten höchstens 20 s; CSV mit Formelschutz | Foto landete im Ordner des Chefs, Privatauto ging verloren | `akEditor`, `akFotoHochladen`, `akInhaberKarte` |
| E21 | **Werkzeug**: Termin auf „Privat“ → Rückfrage, ob Material mitgelöscht wird; Packliste übernehmen in einer Warteschlange (keine Doppel); Ausscheiden mit Rückfrage und Filter „Ausgeschieden“ | Andere sahen Material am privaten Termin; Doppel bei schnellem Tippen | `planEditor`, `packlisteUebernehmen`, `viewWerkzeug` |
| E22 | **Rechnungen**: kaufmännische Rundung je Position (`centRund`/`posBetrag`); Dezimalpunkt wird nicht mehr als Tausenderpunkt gelesen; jede Auffälligkeit sperrt Katalog-Lernen und Preisänderung; IBAN mit falscher Prüfziffer abgelehnt; „+ Neue Position“ verlangt einen Preis | 0,005 € wurde abgerundet, 1.5 wurde 15 | `posBetrag`, `geldLesen` |
| E23 | **Route**: 15 s gelten für die ganze Anfrage über alle Dienste (`ROUTER_FRIST`), nicht je Dienst | Knopf war bis 45 s gesperrt | `ROUTER_FRIST` |
| E24 | **Tag mitten aus einer Abwesenheit herausnehmen**: scheitert der zweite Schritt, nimmt die App den ersten zurück | Eintrag war sonst halb gekürzt | eigene SQL-Funktion (offen, technisch) |
| E25 | **Präsentation**: Abgleich, „Reihenfolge übernehmen“, „mit einplanen“ und „Tag herausnehmen“ schreiben nicht in die Datenbank; Meldungen sagen „nicht gespeichert“ | Präsentation speichert nie | `demo()`-Abfragen |
| E26 | **Testattrappe** näher an der echten Datenbank (Kopien bei Schreiben, Prüfregeln von auslagen, Werkzeug-Verlauf, Startpunkte, Lesesperren für Kunde/Präsentation) | Tests prüften teils anderes Verhalten | tests/attrappe.js |
