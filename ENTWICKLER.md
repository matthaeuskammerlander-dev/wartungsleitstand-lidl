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
| Kalender / Aufgaben | `viewKalender` | `kalenderEintraege`, `planEditor`, `zeitRaster`, `planungPruefen`, `auslastungKarte` (Büro) |
| Karte / Tour | `viewKarte` | `planeTour`, `arbeitStunden` (gelernte Zeit), `tourPanel` |
| Protokoll | `viewProtokoll` (setzt 12 Teile `protoTeilMarkt` … `protoTeilSpeichern` zusammen), `protokollFormHtml`, `protokollAssistent` (geführt) | `speichereProtokoll`, `rapTextRein`, `kaeltemittelAusForm` |
| Anlagen / Markt | `viewAnlagen`, `marktAnsicht` | `anlagenDesMarkts`, `verbundenKarte`, `anlageAssistent` → `anlageAssistentDialog` (Teile `anlageDialogTeilKi`, `…Felder`, `…Schritte`) |
| Stunden / Stempeluhr | `viewStunden` | `zeitEditor`, `stempeln` (Datenbank), `lohnAuswertung` |
| Fahrzeuge | `viewFahrzeuge` | `fzEditor`, `fzEintragEditor`, `fzGpsImport` |
| Projekte | `viewProjekte`, `projektAnsicht` | `projektNeu`, `folgeKarte`, Baustellenbuch, Arbeitsnachweise (`anKarte`, `anEditor`, `anPdfAblegen`, `anRechnungPositionen`) |
| Rechnungen (nur Inhaber) | `viewBelege` | `belegEditor`, `einsatzPositionen`, `fahrtZone`, `katalogLernen`, `angebotAusFolge` |
| Kunden & Kontakte | `viewKunden` | `kontaktErfassen` (lernt neue Personen), `kontaktAusProtokoll` |
| Verlauf | `viewVerlauf` | `stammRueckgaengig`, `korrekturRueckgaengig` |
| Verwaltung | `viewVerwaltung` | `verwaltungEditor` (Teile `verwaltungTeilAnlagen`, `…Bedienung`, `…Entfernen`, `…Speichern`), Nachbessern, `datenpflegeAnsicht`, `vorOrtUebersichtKarte` / `vorOrtKasten` (Vor Ort klären), `altlisteKarte`, `sicherungKarte` (Inhaber) |
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
- `window.__netzWeg=true` in der Attrappe lässt Schreiben in Tabellen scheitern wie ohne Netz (fetch wirft);
  `window.__netzWeg="antwort"` wie supabase-js ohne Netz: Schreiben und Funktionen (rpc) liefern `{error}`.
- Die GitHub-Prüfung („App prüfen“) führt `pruefen.mjs` und `tests/app-tests.mjs` bei jedem Stand aus.

## Große Formulare: Teile mit gemeinsamem Kontext

Sehr große Funktionen sind in Teile zerlegt (z. B. `viewProtokoll` → `protoTeilMarkt`, `protoTeilAnlagen`, … `protoTeilSpeichern`).
Jeder Teil bekommt den Kontext `P` (Formular, Markt, Korrektur …). Ablauf: erst melden **alle** Teile ihre
Funktionen in `P` an (`P.fillPos=fillPos`), dann baut jeder Teil in der ursprünglichen Reihenfolge auf
(die zurückgegebene Funktion). So existiert jede Funktion vor jedem Aufbau, und gemeinsamer Zustand
(`P.fotos`, `P.auftragPdf` …) ist bis zu seiner Zuweisung `undefined` – genau wie vorher in der einen großen Funktion.
Nur was ein anderer Teil braucht, steht in `P`; alles andere bleibt im Teil. Werte aus dem Anfang der Funktion
bekommt jeder Teil als Kopie (`var form=P.form`) – außer sie werden später neu zugewiesen, dann liest der Teil
sie über einen Getter frisch (`P.geschlossen`). So zerlegt: `viewProtokoll` (`protoTeil…`), `verwaltungEditor`
(`verwaltungTeil…`), `protokollAssistent` (`protoAssistentTeil…`), `anlageAssistentDialog` (`anlageDialogTeil…`),
`stoerungDialog` (`stoerungTeil…`).

**Zerlegen selbst:** `node tools/zerlege.mjs plan.json` baut maschinell über den Syntaxbaum um (Plan: Funktion,
letzte Zeile des Anfangs, Teile mit Zeilenbereichen) und bricht ab, wenn etwas nicht sicher geht (z. B. ein Teil
verändert eine Variable des Anfangs). Braucht `npm install --no-save --no-package-lock playwright@1 acorn acorn-walk`.

**Umbauten ohne Verhaltensänderung prüfen:** `node tools/ab-vergleich.mjs` spielt die Protokoll-Abläufe
(Protokoll: Wartung, Störung, Pflichtfelder, Entwurf, Korrektur, aus offener Störung, Fotos, Leeren, Anlage fehlt,
Schritt für Schritt für Wartung/Störung/Korrektur, Ausgefüllt für; Verwaltung: Markt bearbeiten, Anlage dazu, Termin
und Status, entfernen/zurücksetzen, neuer Markt; Anlagendaten-Dialog; Störungsauftrag: anlegen, Termin, abhaken, löschen) mit fester Uhrzeit auf dem letzten Commit und dem Arbeitsstand durch und
vergleicht Formular, Feldwerte, gespeicherte Datensätze, Meldungen und globale Variablen. Keine Abweichung = gleiches Verhalten.

## Neue Funktion – Checkliste

1. Speichern fängt `demo()` ab (Präsentation speichert nie); Schreibendes für Kunden über `nurAnsehenAbweisen()`.
2. Rechte in der Datenbank (Regel in `tools/…sql`), nicht nur in der App. Preise/Belege nur `nurInhaber()`.
3. Jede Aktion mit sichtbarer Rückmeldung; Fehler im Klartext (`toast`/Fehlerkästchen – `technikDeutsch` übersetzt Netzfehler).
4. Nichts Unwiderrufliches ohne Nachfrage; Textabfragen mit `textAbfrage`, nicht `window.prompt`.
5. Am Handy prüfen (schmal, Finger); lange Listen einklappbar.
6. Test in `tests/app-tests.mjs` ergänzen; Handbuch (`handbuchKarte`) und ggf. Rundgang (`RUNDGAENGE`) mitpflegen.
7. Regel in CLAUDE.md eintragen, wenn sie eine Fachregel oder Grenze ist.
8. **Keine echten Daten** in Code, Kommentare, Tests oder Commit-Texte – das Repository ist öffentlich.
