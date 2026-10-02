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
