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
Empfehlung: nur mit Tests im Rücken und in kleinen Schritten zerlegen (benannte Teilschritte).

### 3. Bedienung uneinheitlich
- **Native Browser-Abfragen**: 76× `confirm`, 8× `prompt`, 4× `alert` – sehen am iPhone anders aus als
  die App, `prompt` ist am Handy unhandlich (z. B. „Kein Angebot – Grund?“).
- **Vier eigene Dialog-Bauweisen** neben `ansichtOeffnen` (Störung, Anlage, Protokoll-Assistent, Ansicht).
- **Fußzeile „Abbrechen / Speichern“** neunmal fast gleich von Hand gebaut.
- 1 330 Inline-Stile – Abstände und Schriftgrößen weichen leicht voneinander ab.

### 4. Vernetzung (siehe Etappe 4)
- Gut: Markt ↔ Anlagen ↔ Termine ↔ Protokolle, Störung ↔ Protokoll, Projekt ↔ Dateien/Belege.
- Lücken: Fahrzeug ↔ Fahrer (Stunden/Kalender), Kontakt ↔ Herkunft ist da, aber vom Markt aus nicht
  sichtbar; Folgeauftrag ↔ Projekt nur in eine Richtung.

### 5. Kleinkram
- 57 Schreibzugriffe ohne Fehlerzweig in derselben Zeile – Stichproben zeigen: Fehlerzweig meist in der
  Folgezeile vorhanden; die wichtigen Dialoge sind per Test geprüft.
- 2 ungenutzte Funktionen.
- Wiederholte Zeilen (z. B. „Mit diesem Konto lässt sich nur ansehen.“ 5×, Sortierung nach Marktname 3×).
