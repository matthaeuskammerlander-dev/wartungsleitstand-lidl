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
