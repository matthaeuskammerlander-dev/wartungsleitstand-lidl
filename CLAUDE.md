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
- Halbjahrestermin wie am Markt üblich (`hjMarktFaelle`, `hjMarktAutomatisch`,
  Büro 01.10.2026): Hat eine Anlage am Markt einen Halbjahrestermin (HJI oder
  HJW), bekommen die weiteren Anlagen dort mit nur JW automatisch einen (ab
  30 kg HJW, sonst HJI; Gaswarnanlagen nicht), zählt ab heute, Monat wie die
  andere Anlage (Feld `hjiMarkt`). Vor Ort bestätigt der Termine-Schritt den
  Monat: gleicher Besuch oder 6 Monate nach der JW. Ein Merker (typ „merker“)
  verhindert, dass ein zurückgenommener Termin wiederkommt.
- Geführtes Protokoll im Einsatz (Büro 01.10.2026, nach dem ersten Härtetest):
  bis 25 Fotos je Protokoll (`FOTO_MAX`, Dateien im Speicher), im Schritt
  „Fotos und Rapport“ mit Notiz je Foto und Rapportbericht; Datum, Uhrzeit
  und Korrekturgrund im Schritt „Abschluss“; die Übersicht zeigt alles und
  führt zu jedem Schritt; gespeichert wird erst, wenn `form._fehltNoch()`
  leer ist (sonst bleibt der Dialog offen). Auch „Korrigieren“ geht Schritt
  für Schritt. „+ Anlage fehlt“ fragt zuerst, ob die Anlage schon in der
  Liste steht (`anlageSchonDa`) – sonst bleibt die Zeile der alten Liste als
  Doppel zurück. Bezeichnung jeder Anlage in der Übersicht des Anlagendialogs
  änderbar. KI-Fotos: Prüfbuch und Typenschilder bis 30 Bilder, gelesen in
  Teilen zu 8 (`kiTeilLesen`, `kiTeileZusammen`; der Server nimmt 12 je Aufruf).
  Wartungspunkt „Kondensatwanne“ (früher „Kondensatwanne/-ablauf“, alte
  Protokolle über `arbeitenAktuell`).
- Techniker/in = angemeldetes Konto (Büro 01.10.2026: „er ist verantwortlich für
  die Arbeit und das Protokoll“): `kontoTechName()` setzt Techniker/in fest
  (nicht änderbar), der Name im Abschluss ist immer derselbe (`verantwortlich`
  beim Speichern, Trigger tools/protokoll-techniker.sql). Korrektur: es bleibt,
  wer es gemacht hat. Wer noch dabei war: Weitere/r Techniker/in. Ausnahme (Büro
  02.10.2026, ohne Bestätigung): Admins und Inhaber dürfen „Ausgefüllt für“ eine andere
  Person wählen (`#f_fuer`) – Techniker/in = wer gearbeitet hat, Spalte `erfasst_von`
  (tools/protokoll-im-auftrag.sql) = wer eingetragen hat, sichtbar in Protokoll und PDF
  („erfasst von … im Auftrag“). Techniker füllen nur für sich selbst aus. Ungleiche Angaben (Abschluss ≠ Techniker,
  `protokollUngleich`): KEIN PDF (`protokollPdfSperre` – Drucken, Archiv-PDF,
  Synology `ungleich()` → `_gesperrt`). Vermerke des Inhabers in eigener Tabelle
  (`protokoll_vermerke`, tools/protokoll-vermerke.sql), Protokoll bleibt unverändert.
  Nie lockern.
- Je Anlage ein Schritt (`anlageSchritte`, Büro 01.10.2026): der Termin gehört
  zur Anlage – Anlagendaten (Ergänzen auch per KI), Termine und „Heute
  gewartet als“ in einem Schritt. Neu erfasste Anlage mit zwei Terminen: die
  Wahl (`_zaehltAls`) bestimmt, welcher Termin die erste Zeile wird
  (`neueAnlageReihenfolge`) – nur sie steht im Protokoll und gilt als gewartet.
  Kommt bei einer bestehenden Anlage ein Termin dazu, wird vor dem Weitergehen
  nochmals nach „Heute gewartet als“ gefragt.
- Nach dem Speichern oben „✓ … gespeichert“ (`S.gespeichert`,
  `gespeichertKarte`); nach einer Störung mit fälligen Wartungen am Markt
  „Wartung gleich mitmachen“ (`faelligeWartungen`).
- Eigene Tätigkeitsbereiche (`bereichListe`, `bereichNeu`, tools/bereiche-eigen.sql):
  unter „Sonstiges“ eintippen, danach für alle in der Auswahl (Datenbank-
  Funktion `bereiche_eigene`); Lohn: normale Arbeit (nicht Montage, nicht Fahrt).
- Baustellen-Ablauf (Büro 01.10.2026, tools/projekte-ablauf.sql): Projekt-Schritte
  Anfrage → Begehung → Konzept → Einreichung (Büro 02.10.2026, tools/projekt-einreichung.sql) → Angebot → Auftrag → Vorbereitung → Baustelle →
  Inbetriebnahme → Dokumentation → abgerechnet; Listen Beteiligte/Termine/
  Bestellungen (`PROJEKT_LISTEN`), Baustellenbuch (`baubuchKarte`, Mengen, keine
  Preise; `BAUBUCH_RECHNUNG` = was für die Rechnung zählt).
- Angebote/Rechnungen NUR Inhaber (Tabellen `belege`, `katalog`): KPlus-PDFs
  liest `kplusLesen` ohne KI aus dem PDF-Text nach Spaltenlage (Position x<90,
  Menge+EH 90–150, Text 150–395, Preis 395–480, Betrag/„Alternativ“ ab 480;
  Zeilen nach Abstand, nicht gerundet) und rechnet gegen die PDF-Summe nach.
  App-Belege sind TEST (T-A-/T-R-Nummern), solange KPlus führt. Rechnung aus
  Angebot: Mengenvorschläge aus dem Baustellenbuch (`baubuchVorschlaege`).
  Echte Preise und Belege nie ins Repository – nur in Supabase.
- Quellen (Büro 01.10.2026: „man soll immer alles von beiden Seiten finden“):
  Schritte (`daten.quellen[schritt]`), Listeneinträge und Baustellenbuch führen
  `quellen` – Pfad einer Projektdatei oder {name, hinweis}, solange nicht
  hochgeladen (`quelleDatei` verknüpft am Namen). Dateien zeigen „gehört zu“
  (`dateiGehoertZu`), die Synology-Mappe verlinkt relativ in den Projektordner.
  Projekttyp in `daten.typ` (`PROJEKT_TYPEN` + eigene).
- Projektzusammenfassung als PDF (`projektPdfDialog`, `projektPdfErzeugen`, Büro
  01.10.2026): Eckdaten und alle Angaben, KEINE Anhänge (Dokumente liegen auf der
  Synology); abgelegt `daten.mappePdf`, Synology → `Projekt_<Nr>.pdf`. Zum Testen
  MIT Belegen nur Inhaber (Beträge, Stunden, Beleg-PDFs auf Wunsch; abgelegt nur
  unter `buero/` = `daten.mappePdfBuero`, nie in den Projektordner der Synology).
- Aufgeräumt (Büro 01.10.2026): Reiter Fällig, Kalender, Karte, Protokoll, Anlagen,
  Stunden, Projekte, Kunden, Rechnungen, Verlauf, Verwaltung, Datenbasis. Am PC zwei
  Spalten (`ANSICHT_ORDNUNG`, `ansichtOrdnen`, `kartenOrdnen`, `spaltenAnordnen` –
  schmal bleibt die Reihenfolge über `order`), breite Fenster für Projekt und Markt
  (`ansichtOeffnen(…, {breit:true})`); jede Karte einklappbar (`einklappbar` mit
  `standardZu` am Handy, `klappLeiste` „Alles zu-/aufklappen“). Geführte Rundgänge
  (`RUNDGAENGE`, `rundgangStarten`: hebt echte Elemente hervor, trägt nie etwas ein) –
  bei neuen Funktionen den passenden Schritt und das Handbuch (`handbuchKarte`) ergänzen.
  Je Schritt ein Kasten „Im Hintergrund“ (`RG_HG`: was die App dort selbst übernimmt, speichert, weiterreicht),
  dazu der Rundgang „hintergrund“ (Daten, Verknüpfungen, Fälligkeit, Automatik, Lernen, Nachrichten, Rechte; Büro 03.10.2026).
  Neue Automatik dort mit eintragen.
  Themen-Rundgänge (`thema:true`, `fuer()`; Büro 03.10.2026 „noch detaillierter“): Kalender und Wochenplanung, Protokoll,
  Störungen, Tourenplanung, Stunden/Fahrzeuge, Projekte/Kontakte, Märkte/Anlagen/Verlauf, Verwaltung, Rechnungen – Auswahl
  „Nach Rolle“ / „Nach Thema“ (`rundgangAuswahl`). Der Test klickt jeden angebotenen Rundgang je Rolle durch.
  Knopf „🧭 Rundgänge“ unten neben „Handbuch“ (`rundgangAuswahlFenster`); nach „Fertig“ gleich die Auswahl mit ✓ und „Weiter mit …“
  (`rundgangFertig`, `rundgangNaechster`; Büro 04.10.2026).
  Am Handy darf die Erklärung die gezeigte Stelle nie verdecken (`rundgangPlatzieren`: unten, oben oder niedriger; `rundgangPlatzUnten`
  schafft Platz zum Scrollen; Knöpfe angeheftet) – der Test „Rundgänge am Handy“ prüft jeden Schritt jeder Rolle.
- Schmale Navigationsleiste (`sprungleiste`, `seitenLeiste`, Büro 02.10.2026): rechts ein Punkt
  je Abschnitt auf langen Seiten und in großen Fenstern; Protokoll-Abschnitte einklappbar
  (`fieldsetsKlappbar`, `fs-zu`; Pflichtprüfung und Sprünge klappen von selbst auf).
  „Alles zu-/aufklappen“ nur als ⊟/⊞ unten in der Leiste (keine Knopfzeilen – Büro 02.10.2026).
- Verwaltung/Datenbasis aufgeräumt (Büro 02.10.2026): Nachbessern je Markt eine zugeklappte
  Zeile mit Kurzfassung (am PC zwei Spalten, `.nb-liste`), Marktliste zuerst 40 (`A.alleMaerkte`),
  Datenbasis: Zu klären → Export → Handbuch (zugeklappt).
- Angebot/Rechnung bearbeiten (`belegEditor`, Büro 01.10.2026 „gründlich überarbeiten“): großes
  Fenster, Positionen als Tabelle (`.bpos`, am Handy Block), Bezeichnung wächst mit
  (`feldHoehe`), Summe immer sichtbar im Fuß, Kopf/Texte einklappbar, Vorschau (PDF)
  vor dem Speichern, Zeile kopieren/verschieben, Textzeilen.
- Synology-Ablage der Baustellen (`synology/ukt_archiv.py`, `projekte_abgleich`):
  je Projekt `{jahr}/Lidl/Baustellen/…` bzw. `{jahr}/Kunden/{kunde}/Baustellen/{Filiale Ort}_{Nummer}/`
  (Protokolle `…/Wartungen` und `…/Störungen` getrennt, Büro 02.10.2026) mit
  Unterordnern je Dateiart und Projektmappe (HTML + JSON). Angebote und
  Rechnungen (Belege, Büro-Dateien `buero/…`, Beträge) kommen NICHT auf die
  Synology – den Projektordner sehen auch Techniker (Büro 01.10.2026;
  sie gehen NUR in den Büro-Ordner, den nur der Chef sieht: `buero_basis`, `buero_an`,
  `buero_ordner`, gleiche Gliederung; ohne `buero_basis` gar nicht). Das Archivkonto hat
  die Rolle „archiv“ (tools/archiv-rolle.sql): liest wie ein Techniker plus
  Belege und Büro-Dateien, schreibt nirgends (restriktive Regeln). Test:
  `tools/archiv_test.py` läuft in der automatischen Prüfung.
- Stempeluhr: von Hand eingetragene Zeit, die in die Stempelzeit fällt, zählt
  für die 10-/12-Stunden-Hinweise nicht dazu (wird beim Ausstempeln abgeglichen).
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
  dazuwählbar über `S.kunden` (`kundeImFilter` in `filtered()`). Die Kundenauswahl gilt
  auch für offene Störungen, „Lidl fragt nach“, Rückfragen von Lidl und laufende Projekte in Fällig, Karte und Anlagen
  (`offeneStoerungenKunde`, `lidlInAuswahl`, `kundeIdImFilter`; Büro 03.10.2026) – Störungen anderer Kunden nur als Hinweis
  mit „Alle Kunden zeigen“. Suche und Region blenden offene Störungen nie aus (markiert „außerhalb der Auswahl“).
  „Diese Woche“ (Montag-Nachricht) zählt alle Kunden. Monatsbericht an Lidl: nur Lidl.
- **Datenschutz:** Das Kunden-Konto (Lidl) sieht nie Daten anderer Kunden –
  die Datenbank sperrt es (`kunde_sieht`, tools/kunden-projekte-stunden.sql),
  die App filtert zusätzlich. Diese Grenze nie lockern.
- **Projekte** (Tabelle `projekte`): Anfrage → Angebot → Auftrag → Baustelle →
  Inbetriebnahme → abgeschlossen → abgerechnet. Dateien unter `buero/…`
  (Angebot, Rechnung) NUR für Inhaber – keine Admins (`nurInhaber()`,
  tools/nur-inhaber-buero.sql; Büro 01.10.2026). Preise, Angebote,
  Rechnungen und Positionskatalog kommen nie in `projekte.daten` (das sehen
  alle), sondern in eigene, nur für Inhaber lesbare Tabellen bzw. Dateien.
- **Arbeitszeiten** (Tabelle `arbeitszeiten`): jede Person sieht nur ihre
  eigenen, der Inhaber alle; ein bestätigter Monat ist gesperrt.
- **Stempeluhr** (Tabelle `stempel`, Funktion `stempeln()`, tools/stempeluhr.sql):
  Zeit vom Server, Eintrag beim Ausstempeln vom Server berechnet (Quelle
  „stempel“); nachträglich geändert = „stempel_geaendert“. Standort nur, wenn
  der Inhaber ihn eingeschaltet hat (`einstellungen`), und nur als Entfernung –
  nie Koordinaten speichern, nie den Standort verfolgen. Diese Grenzen nie lockern.
  Umstempeln (art „wechsel“, tools/stempeluhr-2.sql): je Abschnitt ein Eintrag
  mit Bereich; überschneidende Einträge von Hand ersetzt nur die Funktion
  `stempeln()` (p_ersetzen), sonst bleiben beide und sind mit ⚠ markiert.
- **Arbeitszeitgesetz und KV Metallgewerbe** (Büro 01.10.2026): Pause über 6 h
  mind. 30 min wird ergänzt (`pause_auto`, tools/stempeluhr-4.sql), 12 h/Tag,
  60 h/Woche, 11 h Ruhezeit als Hinweis; Soll aus `einstellungen.arbeitszeit`
  (38,5 h, Verteilung je Wochentag) ohne österreichische Feiertage
  (`feiertageAT`). `lohnAuswertung` ist ein Vorschlag für die Lohnverrechnung
  (Überstunden als MONATSBILANZ Ist Mo–Fr gegen Soll – nicht je Tag; Samstag,
  Sonntag, Feiertag getrennt; Montage = Montage/Wartung/Störung,
  Fahrt = Wegzeit, Entfernungszulage ca.) – Regeln nur auf Anweisung ändern.
- **Kalender und Aufgaben** (Büro 01.10.2026, tools/planung.sql, Reiter
  „Kalender“): Tabelle `planung` mit Terminen (`PLAN_KAT`: Wartung, Störung,
  Baustelle, Büro, Werkstatt, Besprechung, Urlaub, Krank, Schule, Zeitausgleich, privat,
  Sonstiges; Personen `wer`, mehrtägig `datum_bis`) und Aufgaben (Zuständige,
  fällig, Bezug Projekt+Schritt/Markt/Störung, erledigt). PRIVAT: andere sehen
  nur „Abwesend“, Titel/Details in `planung_privat` (nur die Person selbst –
  Trigger `planung_pruefen` erzwingt es). Urlaub genehmigt nur der Inhaber
  (Trigger). Der Kalender zeigt dazu Störungen (Einsatztag bleibt in der
  Störung), Projekttermine, erledigte Protokolle und fällige Wartungen zum
  Einplanen (`wartungenImMonat`; eingeplant werden die Wartungstermine der
  Anlagen: `planung.position_ids`, `wartungEinplanen`, `planFuerPosition`, in
  Fällig „📅 eingeplant“; erledigt, sobald seit dem Tag − `BESUCH_TAGE` gewartet).
  Stunden: geplante Termine am Tag, „erfassen“
  → `arbeitszeiten.planung_id`. Abwesenheit (`PLAN_ABWESEND`: Urlaub erst GENEHMIGT, Krankenstand, Schule,
  Zeitausgleich) legt die Datenbank selbst in die Stunden (tools/stunden-kalender.sql, Trigger `planung_stunden`,
  Quelle „kalender“): je Arbeitstag das Tagessoll (`soll_minuten`, `feiertag_at` wie `sollMinutenTag`/`feiertageAT`),
  angepasst/entfernt mit dem Kalendereintrag, nie im bestätigten Monat; anlegen für eine Person nur sie selbst oder
  das Büro; selbst geändert → „hand“. Zeitausgleich zählt nicht als Ist (baut Überstunden ab). Stempeluhr: „📅 Heute
  geplant“ (`stempelPlanChips`), nach dem Ausstempeln Verknüpfung mit dem Termin (`zeitenMitPlanungVerknuepfen`).
  Soll je Tag/Woche in „Meine Arbeitszeit“ (`sollIstTag`) nur zur Info – Überstunden bleiben MONATSBILANZ.
  Vor dem Bestätigen: `monatLuecken` (Tage ohne Eintrag, Abwesenheit ohne Stunden, Geplantes nicht erfasst) mit
  „Nachricht an …“. Büro 03.10.2026. Neu Eingetragene bekommen eine Chat-Nachricht
  (nicht bei Privatem). Diese Grenzen nie lockern.
- **Posteingang → Projekt** (Büro 02.10.2026): weitergeleitete Mails (nicht Lidl-Auftrag/Rapport)
  kommen mit `.eml` (art „mail“, `eintraege` in synology/ukt_posteingang.py, Test
  tools/posteingang_test.py); in der App eine Karte je Mail (`posteingangMailBox`), „Zu Projekt
  legen“ (`posteingangZuProjekt`, Vorschlag `posteingangProjektPunkte`) – erledigt erst, wenn alle
  Dateien hochgeladen sind. Angebot/Rechnung als Art nur für den Inhaber.
- **Mail-Programm am PC** (Büro 04.10.2026, `mailBruecke`, `mailUebernehmen`, `mailProjektNeu`, `mailZuProjekt`,
  `mailStoerung`, `mailsDazuKarte`): das Programm „Mail mit Claude“ läuft NUR auf dem PC des Inhabers
  (http://localhost:4317, nicht in diesem Repository). Verbunden per 6-stelligem Code aus dem Mail-Programm unter
  Verwaltung › Inhaber › „Mail-Programm am PC“ (`mailKoppelnKasten`; Links öffnen nie die installierte App) oder
  `#mailkopplung=<Schlüssel>` – localStorage `ukt_mailbruecke` mit Konto, gilt nur für das Inhaber-Konto, das ihn
  angenommen hat (`nurInhaber()`), nie in Präsentation/Spielwiese. „↗ Leitstand“ im Mail-Programm legt einen Auftrag
  bereit, den der offene Leitstand alle 3 s abholt (`mailAbholenStarten`, `/api/leitstand/abholen`; ohne Antwort 30 s
  Pause). Am Handy erreicht der Leitstand das Mail-Programm über Tailscale: Adresse je Gerät in `ukt_mailbruecke.url`
  (`mailUrl`, `mailAdresse`; am PC localhost:4317); Aufträge vom Handy holt nur der Leitstand am Handy ab; `#mail=…` geht ebenso. Geöffnet wird „Projekt aus Mail“ (Titel/Datum/Absender vorbelegt, „✦ Mit Claude
  ausfüllen“ über das Mail-Programm), „Mail zu Projekt legen“ oder die Störungserfassung. Mail (.eml) + gewählte
  Anhänge → Projektdateien (Herkunft), Verweis in `daten.mails`, bei neuer Anfrage `.eml` als Quelle
  (`daten.quellen.anfrage`), Absender ins Adressbuch. „Mails dazu“ bei Projekt, Kunde (nicht Lidl) und Markt – ohne
  Verbindung gar keine Karte. Der Leitstand darf dort nur lesen/suchen (das Mail-Programm sperrt Senden,
  Verschieben, Löschen). Mailinhalte nie ins Repository. Test: „Mail-Programm am PC …“.
- **Katalog lernt mit** (`katalogLernen`, Büro 02.10.2026, nur Inhaber): neue Positionen aus KPlus-PDFs und
  aus gespeicherten App-Belegen kommen dazu (Herkunft in `quelle`, ohne Preis nichts); Preise bestehender
  Positionen ändert nur KPlus (alter Preis in der Herkunft). „+ Neue Position“ im Katalog; Auswahl nach Häufigkeit.
- **Tour → Kalender** (`tourSchicken`, `tourBuero`, Büro 03.10.2026): Inhaber und Admins planen für sich und alle
  (Admins auch für den Inhaber), Techniker nur für sich selbst; für sich selbst nur Kalendereinträge, für andere
  zusätzlich Tour + Nachricht, die Person nimmt sie unter „Touren für dich“ an (`tourAnnehmen`). Störungen der Tour
  bekommen „Einsatz geplant am“ (ohne zweite Nachricht, `_ohneMeldung`), Wartungen stehen in Fällig als „📅 eingeplant“.
- **Arbeitszeit lernt** (`arbeitStunden`, `stoerDauerMin`, Büro 02.10.2026): Tour und Kalender rechnen mit der
  tatsächlichen Zeit vor Ort – Lidl-Rapport (von–bis), Störung Ankunft–Fertig, Stunden mit Markt (`einsatz_dauern`,
  tools/einsatz-dauern.sql: nur Median je Markt, keine Personen); ohne Erfahrung `ARBEIT_H`.
- **Gelerntes geteilt** (`gelerntTeilen`, tools/gelernte-werte.sql): selbst Eingetipptes steht bei allen als Vorschlag; Zugangsdaten nie.
- **Folgeaufträge** (Büro 02.10.2026, nur Inhaber): Mängel und „Folgeauftrag erforderlich“ aus
  Protokollen stehen in Projekte als „Folgeaufträge – Angebot?“ (`folgeOffen`); erledigt durch ein Projekt
  mit `daten.ausProtokoll` oder „Kein Angebot“ mit Grund (Merker `folge:<Protokoll>`).
- **Datenpflege** (Verwaltung, Büro 02.10.2026): Märkte „zur Zeit nicht betreut“ mit Grund „Datenpflege“
  samt Fortschritt (`datenpflegePunkte`); „Wieder betreuen“ öffnet nur den Markt-Editor.
- **Vor Ort klären** (tools/vor-ort-fragen.sql, Büro 03.10.2026): Fragen je Markt (`vor_ort_fragen`); Büro (Inhaber, Admins) stellt
  und hakt ab, alle die schreiben dürfen antworten (Trigger: Nicht-Büro ändert nur die Antwort, Zeit setzt der Server).
  Im Protokoll nur sichtbar, wenn am Markt eine Frage offen ist (Fokus: Techniker nicht mit Neuem belasten).
- **Alte Liste prüfen** (`altlisteFunde`, Verwaltung › Datenpflege): Nebenfeld-Hinweise auf weitere Anlagen, Zellen ohne Datum,
  Inbetriebnahme nach erster Wartung, zwei Märkte an einer Adresse (nur ohne bzw. gleiche Filialnummer), Lidl ohne Filialnummer;
  „passt so“ bzw. „als Frage weitergegeben“ als Merker `altliste:<Schlüssel>`.
- **Auslastung** (`auslastungRechnen`, Kalender, nur Büro): Wartungen der nächsten 12 Monate (gelernte Arbeitszeit, Fahrt als
  Rundfahrt je FM-Region, Störungen im Schnitt) gegen Sollzeit ohne Urlaub/Krank/Feiertag der gewählten Personen; Schätzung.
- **Sicherung** (tools/sicherung.sql, nur Inhaber): wöchentlich beim Öffnen der App Datenbestand gepackt in den privaten
  Bereich `sicherungen` (datenbank/JJJJ-MM-TT.json.gz), am PC auch neue Dateien (dateien/<Bereich>/…); Erinnerung in Fällig zum
  Herunterladen (Kopie außerhalb von Supabase). Stand im Merker `sicherung`. Später holt die Synology ab.
- **Angebot aus dem Folgeauftrag** (`angebotAusFolge`, nur Inhaber): Befund als Textzeile, je Mangel Katalog-Vorschlag
  (`katalogVorschlag`) oder Position ohne Preis, Fahrtpauschale der Zone; gespeichert → Merker `folge:<Protokoll>`.
- **Bezahl-Code auf Rechnungen** (`epcQrText`, `epcQrBild`, Büro 03.10.2026): EPC-QR („Zahlen mit Code“) neben den Summen jeder
  Rechnung – Empfänger, IBAN, BIC, Betrag, „Rechnung <Nummer>“; nur mit gültiger IBAN (Prüfziffer, `ibanGueltig`) und Betrag ≥ 0,01 €; Umlaute umschrieben.
- **Werkzeug und Material** (tools/werkzeug.sql, Reiter „Werkzeug“, Büro 04.10.2026: „dass man nichts vergisst“): `werkzeug`
  mit Standort (Lager, Fahrzeug, bei Person, Baustelle/Markt, Reparatur, sonst – `wzOrtText`), Zustand, Prüfung fällig, zurück am;
  Standort-Verlauf schreibt nur der Trigger (`werkzeug_verlauf`). `bedarf` = was ein Einsatz braucht (mitnehmen / abholen bei … /
  bestellen bei …; offen → bestellt → abholbereit → erledigt), Bezug Projekt, Störung, Kalendertermin oder Markt (`bedarfZu`,
  `bedarfFuerEinsatz`; Datum/Person vom Termin bzw. Einsatz: `bedarfWann`, `bedarfWer`); `packlisten` (übernehmen ohne Doppel).
  Erinnert in „Heute für dich“ (heute/morgen), „🔍 Planung prüfen“ (je Tag „Vorher besorgen“), Kalenderzeile 🧰, Büro-To-do
  (`wzToDo`). Kästen in Termin (gespeichert, nicht Abwesenheit/Privat), Störung, Projekt, Markt; Fahrzeug zeigt, was drin liegt.
  Alle, die mitarbeiten, lesen und schreiben; Werkzeug/Packliste löschen nur Büro, Bedarf wer ihn angelegt hat oder Büro.
  Keine Preise, kein Lagerbestand. Kunde sieht nichts davon.
  Lernt mit (Büro 04.10.2026, Grundsatz: vorschlagen, mit einem Tippen bestätigen – nie still anlegen): je Projekttyp ab 2
  Projekten (`bedarfGelerntProjekt`, auch Baustellenbuch), je Markt (`bedarfGelerntMarkt`, auch „Planung prüfen“ 💡), aus dem
  Angebot nur Inhaber ohne Preise (`bedarfAusAngebot`), unbekanntes Werkzeug → `wzAufnehmenFragen`, nach dem Einsatz
  `wzNachfragen` („Wo ist das Werkzeug jetzt?“, Spalte `bedarf.nachgefragt`), Werkzeug auf abgeschlossener Baustelle im To-do.
  Werkzeugstandort NIE automatisch aus Stempeluhr/GPS ändern.
- **Reisekosten und Kilometergeld** (tools/reisekosten.sql, Reiter Stunden, Büro 04.10.2026; wie die Excel-Blätter „UKT Reisekosten:
  Barbelege“ und „Kilometer mit Privatauto“): Tabelle `auslagen` – art „beleg“ (Foto Pflicht, sonst „Kein Beleg“ mit Grund; Speicher
  „auslagen“ unter `<user_id>/`) oder „km“ (Strecke, km; Betrag = km × Satz rechnet der Trigger `auslagen_pruefen`, Satz aus
  `einstellungen.kilometergeld`, Standard 0,50 €). offen → eingereicht („Monat abgeben“, Nachricht nur an Inhaber) → ausbezahlt (nur Inhaber);
  Abgegebenes ändert nur der Inhaber. Jede Person sieht nur ihre eigenen, der Inhaber alle – KEINE Admins. Konto in `auslagen_konto`.
  Kilometergeld nur fürs Privatauto (`fahrzeuge.privat_von`). PDF `akPdf` mit Belegfotos; Inhaber: „Reisekosten aller“, To-do
  (`akAbgegebenText`), Projekt zeigt die Summe (nur Inhaber); Bedarf „abholen/bestellen“ → „Selbst bezahlt – Beleg erfassen“. Nie lockern.
- **Diktieren** (`diktatKnopf`): Spracherkennung des Browsers, keine KI, Text wird angehängt.
- **Rapport-Text** (`rapTextRein`): ausgeführte Arbeiten aus dem Lidl-Rapport zusätzlich in
  „Durchgeführte Maßnahmen“ bzw. „Bemerkungen“ – nie ersetzen, kein Feld fällt weg.
- **Fahrtpauschale** (`fahrtZone`, Büro 02.10.2026): Zone 2 = Kärnten, Steiermark, Vorarlberg, Tirol westlich von
  Innsbruck (Innsbruck selbst Zone 1), Osttirol; sonst Zone 1. `einsatzPositionen` nimmt die Katalog-Position der Zone. Nur auf Anweisung ändern.
- **Fahrzeuge** (tools/fahrzeuge.sql, Büro 02.10.2026): km, Pickerl, Service, Reparatur, Schaden; Techniker nur
  ihr Fahrzeug (km-Stand, Schaden), Beträge nur Inhaber (`fahrzeug_kosten`). GPS-Import (X-GPS, CSV/Excel):
  NUR Kilometer je Tag – nie Orte, Uhrzeiten oder Fahrten speichern (Fahrtenbuch mit Orten erst nach
  Zustimmung/Betriebsvereinbarung). Diese Grenze nie lockern.
- **Spielwiese** (`spielwieseOeffnen`, `spielwieseDarf`: Inhaber, Admins und Techniker – je mit dem eigenen Konto und
  dessen Rechten, Büro 03.10.2026; nie Kunde/Präsentation): eigene App im geschützten Vollbild; darin
  `spielwiese()` statt `demo()` – alles läuft echt gegen die Schattendatenbank (`schattenClient`: Tabellen
  beim ersten Zugriff in den Speicher, Schreiben nur dort, keine KI/RPC außer Teamliste). `vorschauSchutz`
  sperrt zusätzlich jedes Schreiben im Netz. Schließen verwirft alles.
- **Störungen nie doppelt** (Büro 01.10.2026): eine Lidl-Auftragsnummer gibt es
  nur einmal als Störung (Datenbank-Index `stoerung_auftrag_einmal`,
  tools/stoerung-eindeutig.sql; im Dialog „Vorhandene öffnen“ statt neu).
  Nennt ein Störungsprotokoll die Auftragsnummer einer ANDEREN offenen Störung
  am Markt, fragt die App, welche erledigt ist; offene Störungen mit passendem
  Protokoll (gleicher Markt, gleiche Nummer) werden beim Laden verknüpft
  (`stoerungenOhneVerknuepfungAbgleichen`).

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
