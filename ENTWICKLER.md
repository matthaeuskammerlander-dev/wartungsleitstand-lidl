# Entwickler-Anleitung

Kurz und praktisch: wie die App gebaut ist, wo was liegt, wie man testet und welche Regeln gelten.
Die Fachregeln (Termine, Rechte, Datenschutz) stehen ausführlich in **CLAUDE.md** – sie gelten immer.

## Aufbau

- **Eine Datei: `index.html`** – HTML, CSS (oben) und JavaScript (ein großer Skriptblock). Kein Build,
  keine Bibliotheken außer eingebundenen (Supabase, Leaflet, pdf.js, jsQR, SheetJS werden bei Bedarf geladen).
- Stil: `var`/`function`, deutsche Namen, Hilfen `el()` (HTML → Element), `esc()` (Text sicher einsetzen),
  `toast()` (Meldung unten), `ansichtOeffnen()` (Fenster/Dialog), `render()` (aktuellen Reiter neu zeichnen).
- **Daten**: Anlagenstamm aus `daten.enc.js` (verschlüsselt, Passwort beim Start) + Änderungen aus Supabase
  (`stammdaten`); alles Weitere direkt in Supabase-Tabellen (`tools/*.sql` legt sie an, mit Rechte-Regeln).
- **Rollen**: inhaber, admin, techniker, kunde (nur lesen), praesentation (`demo()`: nichts speichern).
  Die Datenbank setzt die Rechte selbst durch – die App blendet nur aus.

## Wo was liegt (Abschnitte in `index.html`, Suche nach der Überschrift bzw. dem Funktionsnamen)

| Bereich | Einstieg | Wichtige Funktionen |
|---|---|---|
| Fälligkeit | „Fälligkeit“ | `berechneFaelligkeiten`, `termineOffen`, `standardRegel` |
| Reiter Fällig | `viewFaellig` | offene Störungen, Wochenübersicht, Folgeaufträge-Hinweis |
| Kalender / Aufgaben | `viewKalender` | `kalenderEintraege`, `planEditor`, `zeitRaster`, `planungPruefen` |
| Karte / Tour | `viewKarte` | `planeTour`, `arbeitStunden` (gelernte Zeit), `tourPanel` |
| Protokoll | `viewProtokoll` (sehr groß), `protokollAssistent` (geführt) | `speichereProtokoll`, `rapTextRein`, `kaeltemittelAusForm` |
| Anlagen / Markt | `viewAnlagen`, `marktAnsicht` | `anlagenDesMarkts`, `verbundenKarte`, `anlageAssistent` |
| Stunden / Stempeluhr | `viewStunden` | `zeitEditor`, `stempeln` (Datenbank), `lohnAuswertung` |
| Fahrzeuge | `viewFahrzeuge` | `fzEditor`, `fzEintragEditor`, `fzGpsImport` |
| Projekte | `viewProjekte`, `projektAnsicht` | `projektNeu`, `folgeKarte`, Baustellenbuch |
| Rechnungen (nur Inhaber) | `viewBelege` | `belegEditor`, `einsatzPositionen`, `fahrtZone`, `katalogLernen` |
| Kunden & Kontakte | `viewKunden` | `kontaktErfassen` (lernt neue Personen), `kontaktAusProtokoll` |
| Verlauf | `viewVerlauf` | `stammRueckgaengig`, `korrekturRueckgaengig` |
| Verwaltung | `viewVerwaltung` | `verwaltungEditor`, Nachbessern, `datenpflegeAnsicht` |
| Spielwiese | `spielwieseOeffnen` | `schattenClient` (Schattendatenbank), `vorschauSchutz` |
| Gemeinsame Bausteine | „Helper“ | `textAbfrage`, `fussKnoepfe`, `nachMarktname`, `nurAnsehenAbweisen`, `technikDeutsch`, `diktatKnopf` |

## Testen

```
node tools/pruefen.mjs                    # Syntax und Regeln (schnell)
npm install --no-save playwright@1        # einmal
node tests/app-tests.mjs                  # Abläufe im Browser (ca. 2 Minuten)
node tests/app-tests.mjs kalender         # nur Tests mit „kalender“ im Namen
node tests/app-tests.mjs --gruendlich     # zusätzlich jeden Knopf in jedem Reiter (ca. 6 Minuten)
```

- Die Tests laufen mit **erfundenen Daten** (`tests/testdaten.js`) und einer **nachgebauten Datenbank**
  (`tests/attrappe.js`, Startbestand `tests/seed.json`). Nichts geht ins Netz, nichts Echtes ins Repository.
- Testkonten: `inhaber@`, `admin@`, `tech@`, `kunde@`, `praes@test.at`, Passwort `test123`.
- `window.__netzWeg=true` in der Attrappe lässt Schreiben scheitern wie ohne Netz.
- Die GitHub-Prüfung („App prüfen“) führt `pruefen.mjs` und `tests/app-tests.mjs` bei jedem Stand aus.

## Neue Funktion – Checkliste

1. Speichern fängt `demo()` ab (Präsentation speichert nie); Schreibendes für Kunden über `nurAnsehenAbweisen()`.
2. Rechte in der Datenbank (Regel in `tools/…sql`), nicht nur in der App. Preise/Belege nur `nurInhaber()`.
3. Jede Aktion mit sichtbarer Rückmeldung; Fehler im Klartext (`toast`/Fehlerkästchen – `technikDeutsch` übersetzt Netzfehler).
4. Nichts Unwiderrufliches ohne Nachfrage; Textabfragen mit `textAbfrage`, nicht `window.prompt`.
5. Am Handy prüfen (schmal, Finger); lange Listen einklappbar.
6. Test in `tests/app-tests.mjs` ergänzen; Handbuch (`handbuchKarte`) und ggf. Rundgang (`RUNDGAENGE`) mitpflegen.
7. Regel in CLAUDE.md eintragen, wenn sie eine Fachregel oder Grenze ist.
8. **Keine echten Daten** in Code, Kommentare, Tests oder Commit-Texte – das Repository ist öffentlich.
