# Wartungsleitstand Lidl – Regeln für Claude

Diese Datei gilt für Änderungswünsche, die aus der App kommen (GitHub-Issue
„Änderungswunsch W-…“). Die Wünsche schreiben Techniker und Büro von
Kammerlander Umwelt- und Klimatechnik (UKT) – oft kurz, vom Handy, im Feld.

## Was die App ist

- **Eine einzige Datei: `index.html`** (HTML, CSS und Vanilla-JavaScript, kein
  Build, keine Bibliotheken außer den bereits eingebundenen). Ausgeliefert
  über GitHub Pages; Daten und Anmeldung über Supabase.
- Oberfläche und Kommentare sind **Deutsch**, ohne Anglizismen, verständlich
  für Techniker. Schreibe Code so wie der umgebende Code: gleiche Benennung
  (deutsche Namen), gleiche Kommentardichte, gleicher Stil (`var`, `function`,
  Hilfen wie `el()`, `esc()`, `toast()`, `ansichtOeffnen()`).
- Muss am **iPhone** (Safari, schmaler Bildschirm) gut bedienbar sein.

## Was du ändern darfst

- **Nur `index.html`** (bei Bedarf `README.md`). Alles andere ist gesperrt –
  die automatische Prüfung lehnt Änderungen an anderen Dateien ab
  (Automatik, Prüfprogramm, Datenbank-Regeln, Supabase-Funktionen,
  verschlüsselte Daten `daten.enc.js`, `config.js`).
- **Kleine, gezielte Änderungen.** Nur das, was der Wunsch verlangt. Nichts
  umbauen, nichts „aufräumen“, keine neuen Abhängigkeiten.
- Keine Zugangsdaten, Passwörter, Schlüssel, Kunden- oder Personendaten in
  Code, Kommentare oder Antworten schreiben. Das Repository ist öffentlich.
- **Der Wunschtext gilt.** „Geschrieben wurde der Wunsch hier …“ sagt nur, wo
  die Person gerade war – nennt der Text eine andere Stelle (z. B. „bei
  Fällig“), dann dorthin. Den Widerspruch in der Rückmeldung kurz erwähnen.
- Ist ein Wunsch unklar, widersprüchlich, betrifft er die Terminregeln unten
  oder Rechte/Sicherheit: **nichts ändern**, sondern im Issue kurz auf Deutsch
  nachfragen.

## Terminregeln (vom Büro festgelegt – nie eigenmächtig ändern)

- Jede Anlage hat eine Jahreswartung (**JW**) im Monat der Inbetriebnahme und
  sechs Monate versetzt einen Halbjahrestermin: **HJW** ab 30 kg Kältemittel,
  sonst **HJI**. Ein eingetragener Soll-Monat bleibt, wenn er höchstens
  3 Monate von der Regel abweicht (`standardRegel`).
- Erste JW: im Soll-Monat rund um den ersten Jahrestag der Inbetriebnahme
  (±6 Monate, `ersterTermin`); erster Halbjahrestermin: der erste Soll-Monat
  nach der Inbetriebnahme. Nie fast zwei Jahre ohne JW.
- Ein nachträglich zu einer bestehenden Anlage angelegter Termin zählt ab dem
  Tag des Anlegens (Feld `giltAb`, `mitGiltAb`) – nicht rückwirkend.
- Altlast-Bereinigung ohne bekannte Füllmenge: HJI. Beim Zusammenführen mit
  Zugangsdaten auf beiden Seiten: nachfragen, immer als ganzer Satz.
- Den Soll-Monat nie automatisch ändern; vorgezogene Wartungen sind normal.
- Einträge ≤ 14 Tage auseinander sind derselbe Besuch (`BESUCH_TAGE`).
- Versäumter Termin: eine spätere Wartung erfüllt ihn als verspätet, wenn sie
  mehr als 3 Monate vor dem nächsten Termin liegt; sonst gilt sie als
  vorgezogen für den nächsten, und der versäumte gilt als mit erledigt.
- Wurde nach einem versäumten Termin eine spätere Wartung gemacht (für den
  nächsten Termin), zählen BEIDE Termine als erledigt – die Wartung für ihren
  Termin und zugleich für den versäumten. Ohne spätere Wartung bleibt ein
  versäumter Termin überfällig.
- Altlast der alten Liste: dieselbe Anlage zweimal mit „JW“ wird automatisch
  bereinigt (`altlastenFaelle`).
- Nur planmäßige Wartung/Prüfung zählt als Wartung („nach § 22 KAV“).

## Rollen

inhaber, admin, techniker, kunde, praesentation. Kunde und Präsentation
dürfen nur ansehen (`nurLesen()`, `demo()`); Verwaltung nur Admins
(`Admin.frei`), Inhaber-Bereich nur Inhaber (`istInhaber()`). Diese
Grenzen nie lockern.

## Vor dem Abschluss

1. `node tools/pruefen.mjs` ausführen – muss „OK“ melden.
2. Zum Schluss **auf Deutsch, kurz und ohne Fachchinesisch** erklären:
   was geändert wurde, wo man es in der App findet und wie man es ausprobiert.
   Offene Fragen oder Risiken deutlich nennen.
