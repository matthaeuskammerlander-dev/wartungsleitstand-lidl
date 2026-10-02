# Bestandsaufnahme der App (Stand 02.10.2026)

Grundlage: automatische Auswertung von `index.html` (Skript in der Arbeitssitzung) plus
Durchsicht der Abläufe. Nach Nutzen sortiert – oben das, was im Alltag am meisten bringt.

## Aufbau in Zahlen

| | |
|---|---|
| Datei | eine einzige `index.html`, 28 500 Zeilen, knapp 2 MB |
| JavaScript | ca. 27 800 Zeilen, 979 Funktionen, Stil `var`/`function` (einheitlich) |
| CSS | ca. 650 Zeilen, dazu 1 330 Inline-`style="…"` |
| Datenbank | Supabase, 35 Tabellen über `Store.sb.from(…)`, 5 Datenbank-Funktionen |
| Ungenutzte Funktionen | 2 (`planAbwesend`, `stempelLaeuft`) – sonst kaum toter Code |
| Doppelt definierte Funktionen | keine |

## Datenflüsse (vereinfacht)

1. **Anlagenstamm**: `daten.enc.js` (verschlüsselte Basis aus der alten Excel-Liste) →
   entschlüsselt in `LIDL_DB` → **Stammdaten-Überlagerungen** aus Supabase (`stammdaten`,
   je Markt/Anlage nur die geänderten Felder) → `ALLE_ST`, `ALLE_POS`, Anlagen-Gruppen (`ANLAGEN`).
2. **Protokolle**: Formular → Gerät (IndexedDB-Warteschlange) → Supabase `protokolle` →
   `alleProtokolle()` → **Fälligkeiten** (`berechneFaelligkeiten`) → Fällig, Tour, Kalender, Bericht.
3. **Planung**: `planung` (Termine/Aufgaben) ↔ Kalender, Tour, Stunden, Fällig („Heute für dich“).
4. **Büro**: Projekte (`projekte`), Belege/Katalog (nur Inhaber), Kontakte, Posteingang, Fahrzeuge.
5. **Verlauf**: jede Stammdaten-Änderung als Ereignis in `aenderungen` (rücknehmbar).

## Befunde, nach Nutzen sortiert

### 1. Abstürze, Hängen, still falsches Speichern (erledigt bzw. jetzt durch Tests abgesichert)
- **Präsentation/Spielwiese hing im Kalender** (Endlos-Neuzeichnen, über 3 000×/s) – behoben,
  Test „Endlosschleifen“ fängt das künftig.
- **Postleitzahl mit Buchstaben** und **Dichtheitskontrolle „-5“** wurden still gespeichert – behoben.
- **„Failed to fetch“** stand bei Verbindungsabbruch in mehreren Dialogen (englisch, technisch) – jetzt
  überall Klartext (`technikDeutsch`), Fehlermeldungen bleiben länger stehen.
- Geprüft und in Ordnung: Zahlfelder in Protokoll, Rechnung, Markt-Editor, Stunden, Fahrzeuge;
  bei Verbindungsabbruch bleiben Dialoge offen, kein Knopf hängt.

### 2. Riesenfunktionen (schwer wartbar, Fehler schwer zu finden)
| Funktion | Zeilen | Inhalt |
|---|---|---|
| `viewProtokoll` | 2 322 | ganzes Protokollformular samt Speichern, Rapport, Störung, Material |
| `verwaltungEditor` | 931 | Markt-/Anlagen-Editor |
| `protokollAssistent` | 751 | geführtes Protokoll |
| `anlageAssistent` | 585 | Anlagendaten-Dialog |
| `stoerungDialog` | 444 | Störungsauftrag |
| weitere 20 Funktionen | 170–300 | Detailansichten, Editoren |
**Zerlegungsplan** (siehe ENTSCHEIDUNGEN E9/E13), je Schritt erst ein eigener Test:
1. ✓ **umgesetzt 03.10.2026** – `viewProtokoll`: `protokollFormHtml` + 12 Teile `protoTeil…`; geprüft mit `tools/ab-vergleich.mjs`. Plan war: (a) Formular-HTML bauen, (b) Rapport-Teil (`rapZeigen`, `rapTextRein` …), (c) Störung/Material/QR,
   (d) Entwurf merken/wiederherstellen, (e) Speichern (`pflichtPruefung`, Sammeln, `speichereProtokoll`). Teile bekommen das
   Formular als Parameter statt über die gemeinsame Funktion.
2. ✓ **umgesetzt 03.10.2026** – `verwaltungEditor`: 4 Teile. Plan war: Markt-Teil, Anlagen-Teil, Speichern (Abgleich mit dem Ausgangsstand) trennen.
3. ✓ **umgesetzt 03.10.2026** – `protokollAssistent` (5 Teile), `anlageAssistent` (Dialog + 3 Teile). Plan war: je Schritt eine eigene Funktion (`schritte.push({…})` ist schon die Naht).
4. ✓ **umgesetzt 03.10.2026** – `stoerungDialog` (3 Teile). Plan war: Auftrag lesen (PDF/QR), Formular, Speichern.

### 3. Bedienung uneinheitlich – Textabfragen und Hinweisfenster umgesetzt (`textAbfrage`), Bestätigungen bewusst belassen (E8)
- **Native Browser-Abfragen**: 76× `confirm`, 8× `prompt`, 4× `alert` – sehen am iPhone anders aus als
  die App, `prompt` ist am Handy unhandlich (z. B. „Kein Angebot – Grund?“).
- **Vier eigene Dialog-Bauweisen** neben `ansichtOeffnen` (Störung, Anlage, Protokoll-Assistent, Ansicht).
- **Fußzeile „Abbrechen / Speichern“** neunmal fast gleich von Hand gebaut.
- 1 330 Inline-Stile – Abstände und Schriftgrößen weichen leicht voneinander ab.

### 4. Vernetzung – umgesetzt: Markt zeigt Projekte und Kontakte, Projekt ↔ Protokoll in beide Richtungen
- Gut: Markt ↔ Anlagen ↔ Termine ↔ Protokolle, Störung ↔ Protokoll, Projekt ↔ Dateien/Belege.
- Neu: Markt → Kontakte (Marktleitung, Lidl-Kontakt, Beteiligte), Folgeauftrag ↔ Projekt in beide Richtungen.
- Noch offen: Fahrzeug ↔ Fahrer in Stunden/Kalender (geringer Nutzen, später).

### 5. Kleinkram
- 57 Schreibzugriffe ohne Fehlerzweig in derselben Zeile – Stichproben zeigen: Fehlerzweig meist in der
  Folgezeile vorhanden; die wichtigen Dialoge sind per Test geprüft.
- 2 ungenutzte Funktionen – entfernt.
- Wiederholte Zeilen (Hinweis „nur ansehen“ 5×, Sortierung nach Marktname 11×, Dialog-Fuß 3×) – zu Hilfen zusammengeführt.
