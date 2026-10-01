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
  3 Monate von der Regel abweicht (`standardRegel`) – der Halbjahrestermin
  zusätzlich nur, wenn er 5–7 Monate von der JW entfernt liegt, sonst JW + 6
  (`sollGeduldet`, `sollAbweichend` – auch genau im Regelmonat).
- Nur Jahreswartung (`nurJW`, Büro 29.09.2026): sehr kleine Anlagen brauchen
  nur einen Besuch im Jahr. Bei unbekannter Füllmenge bietet die Frage der
  Standardregel (`regelKgFragen`) zusätzlich „Kein Halbjahrestermin – nur
  Jahreswartung“ – nur solange die Anlage keinen zweiten Termin hat. Dann wird
  kein Halbjahrestermin angelegt, die Anlage gilt nicht als lückenhaft; die
  Entscheidung steht mit Name im Änderungsverlauf und ist in der Verwaltung
  rücknehmbar. Ab 30 kg bleibt die HJW Pflicht (`anlagenOhneHJW`).
- Termine vor Ort prüfen (`termineOffen`, `termineSchritt`): im geführten
  Protokoll je Anlage ein Schritt „Stimmen Inbetriebnahme und Termine?“,
  solange Inbetriebnahme, Soll-Monat oder Kürzel fehlen oder ein Soll-Monat
  unbegründet von der Standardregel abweicht. Bestätigt gilt nur für genau
  diesen Stand (`termineGeprueft`, `terminStand`). Das ist nur eine Frage an
  den Menschen – an der Fälligkeit ändert es nichts.
- Erste JW: im Soll-Monat rund um den ersten Jahrestag der Inbetriebnahme
  (±6 Monate, `ersterTermin`); erster Halbjahrestermin: der erste Soll-Monat
  nach der Inbetriebnahme. Nie fast zwei Jahre ohne JW.
- Ein nachträglich zu einer bestehenden Anlage angelegter Termin zählt ab dem
  Tag des Anlegens (Feld `giltAb`, `mitGiltAb`) – nicht rückwirkend.
- Liegt der letzte Soll-Termin eines solchen neuen Termins höchstens 3 Monate
  zurück, fragt die App beim Anlegen, ob er nachgeholt werden kann (`nachholen`,
  `nachholenFragen`). Ja: nie von selbst überfällig, aber im Protokoll unter
  „zählt als“ wählbar; wird dafür gewartet, gilt er als erledigt. Büro 30.09.2026.
- Altlast-Bereinigung ohne bekannte Füllmenge: HJI. Beim Zusammenführen mit
  Zugangsdaten auf beiden Seiten: nachfragen, immer als ganzer Satz.
- Den Soll-Monat nie automatisch ändern; vorgezogene Wartungen sind normal.
- Einträge ≤ 14 Tage auseinander sind derselbe Besuch (`BESUCH_TAGE`).
- Versäumter Termin: eine spätere Wartung erfüllt ihn als verspätet, wenn sie
  mehr als 3 Monate vor dem nächsten Termin liegt; sonst gilt sie als
  vorgezogen für den nächsten, und der versäumte gilt als mit erledigt.
- Wurde nach einem versäumten Termin eine spätere Wartung gemacht (für den
  nächsten Termin), zählen BEIDE Termine als erledigt – die Wartung für ihren
  Termin und zugleich für den versäumten. Der versäumte bekommt nur den
  Vermerk „mit erledigt durch Wartung vom …“ (keine Warnung in Nachbessern).
  Ohne spätere Wartung bleibt ein versäumter Termin überfällig – auch wenn der
  nächste schon in der 30-Tage-Frist steht; „überfällig seit“ nennt dann den
  ältesten in Folge versäumten Termin – ist eine letzte Wartung bekannt, ohne
  Grenze zurück (es soll zeigen, wie lange tatsächlich nichts gemacht wurde,
  Büro 29.09.2026); ganz ohne Nachweis höchstens drei Jahre.
- Eine aktuelle Wartung an EINEM Termin der Anlage erledigt auch einen
  versäumten ANDEREN Termin derselben Anlage mit (JW gemacht → offene HJI ist
  mit erledigt, egal wie lange sie zurückliegt; Büro 28.09.2026, Braunau).
- Nur die Jahreswartung eingetragen und nie entschieden (`halbjahr` in
  `termineOffen`): vor Ort wird gefragt – „Ja – Halbjahrestermin“ (Admins legen
  ihn an, sonst Meldung ans Büro: `halbWunsch`, steht in Nachbessern) oder
  „Nein – nur Jahreswartung“ (`nurJW`; dürfen auch Techniker, unter 30 kg auch
  bei bekannter Füllmenge). Büro 29.09.2026.
- Neuer Soll-Monat, der den Termin sofort überfällig machte (`sollMonatFolge`):
  der Termine-Schritt warnt; „behalten – nach der nächsten Wartung umstellen“
  lässt den alten Monat stehen und merkt die Umstellung als Notiz an der Anlage
  vor (Nachbessern meldet sie, sobald seither gewartet wurde). Umgestellt wird
  von Hand – nie automatisch.
- Vor Ort bestätigter abweichender Soll-Monat (`termineGeprueft`): in
  Nachbessern nur noch eine Notiz, kein Befund.
- Monatsbericht: jeder Besuch steht drin. Zwei Wartungen für denselben Termin:
  die erste zählt für die Frist, die spätere steht als „zusätzlich“ da.
  Störungseinsätze sind eigene Einsätze und berühren die Wartungen nicht.
- Wiederkehrende Störungen: ab 3 Störungen in 90 Tagen an derselben Anlage
  (`WIEDERKEHR_ANZAHL`, `WIEDERKEHR_TAGE`) – Markierung, kein Eingriff.
- „Zählt als“ im Protokoll (`fillPos`): ist ein Termin versäumt und liegt der
  nächste Termin der Anlage höchstens 3 Monate nach dem Protokolldatum, ist
  der nächste vorgewählt.
- Markt-Status (Verwaltung): **betreut** · **zur Zeit nicht betreut**
  (`pausiert`, `pausiertGrund` am Markt, `marktPausiert`: bleibt in Anlagen,
  Karte und Suche sichtbar mit Vermerk und Grund, alle Anlagen wie „zur Zeit
  nicht gewartet“ – keine Fälligkeit, nicht in Fällig/Tour, offene Störungen
  bleiben sichtbar) · **stillgelegt** (`aktiv=false`: geschlossen, verschwindet,
  Historie bleibt). Ein stillgelegter Markt lässt sich wieder umstellen.
- Altlast der alten Liste: dieselbe Anlage zweimal mit „JW“ wird automatisch
  bereinigt (`altlastenFaelle`).
- Nur planmäßige Wartung/Prüfung zählt als Wartung („nach § 22 KAV“).

## Weitere Kunden, Projekte, Stunden (seit 01.10.2026)

- **Weitere Kunden außer Lidl:** Kunde = Stammdaten-Eintrag typ „kunde“, ein
  Markt/Standort gehört über `kundeId` zu ihm (leer = Lidl, `kundeVon`,
  `istLidl`). Für sie geht alles wie für Lidl, nur ohne Lidl-Felder
  (Filialnummer, FM-Region, Lidl-Auftrag, Rapport, Rechnungshinweis –
  `data-nurlidl` im Protokoll). In den Übersichten vorgegeben nur Lidl,
  dazuwählbar über `S.kunden` (`kundeImFilter` in `filtered()`). Offene
  Störungen stehen immer alle da. Monatsbericht an Lidl: nur Lidl.
- **Datenschutz:** Das Kunden-Konto (Lidl) sieht nie Daten anderer Kunden –
  die Datenbank sperrt es (`kunde_sieht`, tools/kunden-projekte-stunden.sql),
  die App filtert zusätzlich. Diese Grenze nie lockern.
- **Projekte** (Tabelle `projekte`): Anfrage → Angebot → Auftrag → Baustelle →
  Inbetriebnahme → abgeschlossen → abgerechnet. Dateien unter `buero/…`
  (Angebot, Rechnung) nur für Admins/Inhaber.
- **Arbeitszeiten** (Tabelle `arbeitszeiten`): jede Person sieht nur ihre
  eigenen, der Inhaber alle; ein bestätigter Monat ist gesperrt.
- **Stempeluhr** (Tabelle `stempel`, Funktion `stempeln()`, tools/stempeluhr.sql):
  Zeit vom Server, Eintrag beim Ausstempeln vom Server berechnet (Quelle
  „stempel“); nachträglich geändert = „stempel_geaendert“. Standort nur, wenn
  der Inhaber ihn eingeschaltet hat (`einstellungen`), und nur als Entfernung –
  nie Koordinaten speichern, nie den Standort verfolgen. Diese Grenzen nie lockern.

## Rollen

inhaber, admin, techniker, kunde, praesentation. Der Kunde darf nur ansehen
(`nurLesen()`). Die Präsentation darf alles bedienen wie ein Admin, gespeichert
wird aber nichts (`demo()` – jedes Speichern muss `demo()` abfangen; die
Vorschau eines Änderungswunsches läuft genauso). Verwaltung nur Admins
(`Admin.frei`), Inhaber-Bereich nur Inhaber (`istInhaber()`). Diese
Grenzen nie lockern.

## Vor dem Abschluss

1. `node tools/pruefen.mjs` ausführen – muss „OK“ melden.
2. Zum Schluss **auf Deutsch, kurz und ohne Fachchinesisch** erklären:
   was geändert wurde, wo man es in der App findet und wie man es ausprobiert.
   Offene Fragen oder Risiken deutlich nennen.
