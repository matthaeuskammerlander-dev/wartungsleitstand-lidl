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
  sonst **HJI** – ab 30 kg (je Kältekreis – maßgeblich der größte Kreis; Inhaber 06.10.2026):
  Feld „Füllmenge je Kältekreis“ (`kgKreise`), zentrale Hilfe `hjwKg` (größter Kreis, ohne Kreise
  die Gesamtfüllmenge `kaeltemittelKg`, die für Kältemittel-Bilanz/CO₂e bleibt), `hjwNoetig` je Termin.
  Beispiel: 3 Kreise 20,5 / 19 / 18 kg (zusammen 57,5 kg) → HJI. Ein eingetragener Soll-Monat bleibt, wenn er höchstens
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
  andere Anlage (Feld `hjiMarkt`). Bewusst „nur Jahreswartung“ (`nurJW`) geht vor
  (Inhaber 05.10.2026): kein automatischer Halbjahrestermin, `nurJW` bleibt, bis es
  jemand in der Verwaltung zurücknimmt. Vor Ort bestätigt der Termine-Schritt den
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
  Die gelesenen Fotos (Inhaber 06.10.2026) wählt man gleich in der KI-Prüfansicht („📷 Fotos an der Anlage
  speichern“, `kiFotoAuswahl`, `fotoVorschlag`; bei mehreren Büchern hängen sie an jedem Buch, `_fotoQuelle` mit `nr`/`andereTage`;
  vorgewählt nur Seiten SICHER dieses Buchs – Buchnummer je Bild von der KI `bilder[].buch` (ki-lesen, über Teile umgerechnet in `kiTeileZusammen`),
  sonst ein Prüfungsdatum, das nur in diesem Buch steht; gleiche Tage in mehreren Büchern = „Buch unklar“, nicht vorgewählt – Inhaber 08.10.2026;
  🔍 je Foto groß ansehen, blättern, wählen: `fotoWahlGross`) –
  `kiFotosAblegen`: bekannte Anlage sofort (Tabelle `anlagenfotos`, Speicher `anlagen/…`), neue Anlage hochladen
  und an `_fotosOffen` vormerken, eingetragen nach dem Speichern von Anlage bzw. Protokoll (`anlagenFotosEintragen`,
  Warteschlange auf dem Gerät, `anlagenFotosNachtragen`). Scheitert das Hochladen: nachfragen, nie still verwerfen.
  Zu sehen unter „📷 Fotos der Anlage“ (Markt, Historie, Verwaltung) und im Anlagenbuch (`anlagenbuchFotosEinsetzen`).
- Anlagen-Karten im Markt (`anlagenBloecke`, Inhaber 06.10.2026): einklappbar, am Handy zu (Kopf: Name, dringlichster
  Status, Störung, „Fehlt“), am PC offen. Auf-/Zugeklapptes bleibt je Anlage gemerkt (`ukt_anlagen_karten`, mit Zeit) und
  gilt nach `ANLAGEN_KARTE_FRIST_MS` (2 h) ohne Hineinschauen nicht mehr. Sprünge (`aufklappen`) und Rundgänge klappen auf.
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
- Mangel je Anlage (Inhaber 06.10.2026): Auswahl `.m-a` je Mängelzeile (angehakte + neu erfasste Anlagen, leer = alle /
  allgemein; `mangelAnlagen`, `mangelAnlageFuellen`, im geführten Dialog „Für welche Anlage?“ über `form._mangelAnlageFuellen`);
  gespeichert `maengel[].anlage` (erste Zeile) + `anlageName`; PDF-Spalte „Anlage“, Anlagenbuch nur passende (`mangelBetrifft`).
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
  Zeilen nach Abstand, nicht gerundet) und rechnet gegen die PDF-Summe nach (Summe nicht erkannt → Hinweis, nie
  „stimmt“). Gutschriften (art „gutschrift“) nie als Beleg – nur als Büro-Datei (`KPLUS_GUTSCHRIFT`; als Dateiart
  aus Mail und Posteingang wie eine Rechnung: `kplusDateiArt`).
  Positionsprüfung (Büro 05.10.2026: „in der Klammer steht 3 h, als Anzahl nur 1 h – da stimmt was nicht“,
  `positionPruefen`, `textMenge`): nennt der Text einer Arbeits-/Stundenposition eine Menge („(3 h)“, „4 Mann a 10 Std“),
  muss sie zur Menge passen; Stunden mit Einheit ≠ Std und PDF-Betrag ≠ Menge × Preis werden gemeldet (KPlus-Vorschau,
  Beleg, Katalog „⚠ zu prüfen“) – nur Hinweise. Katalogtexte ohne Auftrags-Mengen (`katalogTextOhneMenge`; auffällige
  Positionen lernt der Katalog nicht). KPlus-Rechnung zum Einsatz (`einsatzBelegeZeile` → `kplusVorschau(kontext)`):
  Vergleich mit dem App-Vorschlag (`einsatzVergleich`, gespeichert in `kopf.lernen`), Original-PDF beim Beleg, Einsatz
  abgerechnet – zu einem anderen Einsatz umgehängt (Inhaber 05.10.2026): der vorige verliert den Vermerk „abgerechnet (KPlus …)“
  (nur ohne andere Rechnung und wenn der Vermerk diese Nummer nennt) und steht wieder unter „noch nicht abgerechnet“; `einsatzGelernt` ergänzt künftige Vorschläge um das, was der Chef ≥2× (am Markt ≥1×) dazuschrieb.
  Lernen je Einsatzart (`einsatzArt`, `einsatzLernBelege`; Inhaber 05.10.2026 „ersetzen nach 3×“): eine App-Position, die der Chef in
  ≥3 verschiedenen KPlus-Rechnungen gestrichen (und seltener selbst geschrieben) hat, schlägt die App dort nicht mehr vor
  (`einsatzGestrichen`, `LERN_STREICHEN`, Schlüssel `vorschlagSchluessel`; `lernen.passend`/`zuviel[].schluessel`); Vorschlag und
  Vergleich rechnen gleich (`einsatzVorschlag`); Grund im Editor („gelernt aus N KPlus-Rechnungen“, Hinweis über den Positionen).
  Wartungspreis je Art (Inhaber 05.10.2026, `katalogWartung`, `wartungArten`): je Anlage die Katalogposition, deren Text
  genau ihre Termin-Art nennt (Jahreswartung/JW, Halbjahreswartung/HJW, Halbjahresinspektion/HJI; je Stück/pauschal) – sonst
  ohne Preis mit `hinweis` „Preis für JW fehlt – alte KPlus-Rechnung mit dieser Position hochladen“ (im Editor und in der
  Positionsprüfung, solange die Zeile keinen Betrag hat); nie der Preis einer anderen Art. Dazu je Anlagentyp (Inhaber
  05.10.2026, `anlageTyp`, `wartungTypen`: Split, Multi-Split, VRV/VRF, Kaltwassersatz, Kühlung, Lüftung, Wärmepumpe – aus
  Bauart, sonst Bezeichnung): erst Art+Typ, eine Position nur mit der Art nur, wenn es für diese Art keine typ-eigenen gibt,
  sonst ohne Preis („Preis für JW Split fehlt …“); nie der Preis eines anderen Typs. Je Anlage verrechnet wird nur
  die planmäßige Wartung (`einsatzArt`, Inhaber 05.10.2026): Reparatur, Prüfung, Sonstiges wie eine Störung nach Aufwand –
  Textzeile, Regiestunden (Ankunft–Fertig, sonst verrechenbare Stunden des Lidl-Rapports, sonst Zeile „Stunden eintragen“),
  Material, Kältemittel, Fahrtpauschale. Kältemittel nachgefüllt ohne Sorte im Protokoll: „Kältemittel – Sorte fehlt“ ohne
  Preis mit Hinweis (nie irgendeine Sorte samt Preis; Inhaber 05.10.2026), mit Sorte die Katalogposition dieser Sorte.
  App-Belege sind TEST (T-A-/T-R-Nummern), solange KPlus führt. Rechnung aus
  Angebot: Mengenvorschläge aus dem Baustellenbuch (`baubuchVorschlaege`).
  Neu eingelesene KPlus-Belege (`kplusVorschau`, Mailverlauf) stehen auf „versendet“ – Rechnung UND Angebot (Inhaber 05.10.2026);
  ein schon vorhandener Beleg (Art + Nummer) behält seinen Stand.
  Echte Preise und Belege nie ins Repository – nur in Supabase.
- Quellen (Büro 01.10.2026: „man soll immer alles von beiden Seiten finden“):
  Schritte (`daten.quellen[schritt]`), Listeneinträge und Baustellenbuch führen
  `quellen` – Pfad einer Projektdatei oder {name, hinweis}, solange nicht
  hochgeladen (`quelleDatei` verknüpft am Namen). Dateien zeigen „gehört zu“
  (`dateiGehoertZu`), die Synology-Mappe verlinkt relativ in den Projektordner.
  Projekttyp in `daten.typ` (`PROJEKT_TYPEN` + eigene).
  Doppelte Dateien (Inhaber 07.10.2026): `projektDateienHochladen` prüft nach der Preis-Prüfung am INHALT (`dateiPruefsumme` SHA-256 → `hash` am Eintrag;
  ältere ohne hash: Name ohne „ (1)“/„ - Kopie“ + gleiche Größe, `dateienDoppeltPruefen`) – nicht nochmals hochgeladen, Meldung `doppeltText`;
  zurück kommt der vorhandene Eintrag (buero/ nur für den Inhaber). „Ganzen Ordner hochladen“ nennt die Doppel schon in der Rückfrage.
- **Pläne finden** (Inhaber 07.10.2026: „einen Plan fürs Dachgeschoss, Erdgeschoss oder Elektroplan schnell finden“): `projektDateienKarte`
  mit Suchfeld (`dateiSuchText`), Filtern Art/Geschoss/Gewerk (`dateiMerkmale` aus Name, herkunft, titel, pdfTitel – Kürzel wie GRDD/EG/UG1/OG1,
  HT/HKLS, EP/AP; Handwerte `geschoss`/`gewerk` an der Datei gehen vor), Ständen je Grundname (`basis`, neuester oben, ältere aufklappbar),
  📌 `wichtig` oben, lesbarem Namen `titel` (`dateiBeschreiben`, `dateiAendern` über `projektAendern` mit Tagebuch); PDF-Titel beim Hochladen
  (`pdfTitelLesen`, ≤ 8 s) bzw. nachträglich „🔎 Pläne genauer erkennen“ (`pdfTitelNachlesen`). Sprungleiste oben im Projekt (`projektSprungleiste`, sticky).
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
  Am Handy darf die Erklärung die gezeigte Stelle nie verdecken – auch quer (Höhe unter 500 px gilt wie Handy; `rundgangPlatzieren`: unten, oben oder niedriger; `rundgangPlatzUnten`
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
  vor dem Speichern, Zeile kopieren/verschieben, Textzeilen. Nummer erst beim Speichern (Inhaber 05.10.2026: keine Lücken
  im Nummernkreis): `belegNeu` zieht keine, der Editor zeigt „Nummer wird beim Speichern vergeben“, `belegNummer` (Funktion
  `beleg_nummer`, atomar) erst im Speichern – gescheitert bleibt sie für den nächsten Versuch, schon vergeben (unique art+nummer)
  → nächste; ein Doppeltipp öffnet nur einen Editor (`belegNeuLaeuft`).
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
  der nächste vorgewählt. Wird das Datum geändert (Nachtrag), wählt die App für
  das neue Datum neu vor – von Hand Gewähltes und eine Korrektur bleiben.
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
- **Arbeitsnachweise** (Inhaber 06.10.2026, Tabelle `arbeitsnachweise`, SQL-Abschnitt „Arbeitsnachweise“ in tools/rechte-2026-10-05.sql):
  wie das Papierformular (Auftraggeber, Objekt, Zeilen Datum/Monteure/von/bis/Pause/Stunden = Personen × (bis − von − Pause),
  Montage/Wartung/Reparatur/Garantie, Arbeiten beendet, Ausgeführte Arbeiten, Material, Prüfungen, Vorkommnisse). Material als Liste
  (Inhaber 06.10.2026: `daten.materialListe` [{menge, eh, text}], `anMaterial`, dazu freier Text `daten.material`; keine Preise). Schritt
  „Rapporte und Fotos“ (Inhaber 06.10.2026): PDF/Foto wählen, aus den Projektdateien oder einfügen (Strg+V / „Einsetzen“, `paste` nur
  solange der Schritt offen ist) – sofort als Projektdatei Art „protokoll“ hochgeladen, am Nachweis nur der Verweis `daten.anhaenge`
  [{pfad, name, typ, notiz}]; Fotos vor dem Hochladen `verkleinere` (wie Protokoll), Vorschau/Ansehen in der App (`anBildUrl`,
  `bildAnsicht`), Beschriftung `notiz`; im Blatt `anFotosHtml` (drei je Zeile, eingebettet in `anPdfErzeugen`); PDFs hängt
  `anhaengeAnPdf` hinten an. Entfernen nimmt nur den Verweis. Im Projekt
  `anKarte` → `anEditor` (geführt, Eingaben auf dem Gerät gemerkt). Der MONTEUR erstellt und unterschreibt – immer das angemeldete
  Konto (Trigger setzt `erstellt_von`/`monteur`, unterschreiben nur der Ersteller; gleiche Regel wie „Protokolle nur unter eigenem
  Namen“); Auftraggebervertreter bleibt im PDF zum händischen Unterschreiben. Unterschrieben = fest: nur Korrektur mit Grund
  (`korrekturen`), Ersteller oder Inhaber; löschen nur Inhaber; Präsentation speichert nie. Vorschläge (`anVorschlaege`) aus den
  Projektstunden ALLER Personen über `projekt_stunden()` (security definer, nur dieses Projekt, nur Datum/Name/Zeiten/Bereich – die
  Leseregel von `arbeitszeiten` bleibt; ohne Funktion nur die eigenen), Kalenderterminen und Bauzeitplan; schon verwendete nicht
  nochmals. Keine Preise; PDF (`anPdfAblegen`) als Projektdatei Art „protokoll“. Rechnung (nur Inhaber, `belegEditor`):
  „⏱ Stunden aus Arbeitsnachweisen“ (`anRechnungPositionen`) – Regiestunden für alle Stunden + Zuschlag Samstag 50 % /
  Sonntag-Feiertag 100 % aus dem Katalog, Menge passend zum Text (`positionPruefen`); Nacht/Überstunden nur als Hinweis;
  PDF der Nachweise hinten an (`kopf.anhaenge`, `pdfDateienAnhaengen`), verrechnete in `kopf.arbeitsnachweise`.
- **Arbeitszeiten** (Tabelle `arbeitszeiten`): jede Person sieht nur ihre
  eigenen, der Inhaber alle; ein bestätigter Monat ist gesperrt – auch für NEUE Einträge (von Hand, Stempeln,
  Abgleich): bestätigt = die Person hat dort einen Eintrag mit `bestaetigt`; nur der Inhaber trägt danach ein oder
  öffnet ihn wieder („Wieder öffnen“ in `zeitenInhaberKarte`; ist die Person noch eingestempelt, warnt „Bestätigen“ vorher). App: `monatGesperrt`, Meldung `MONAT_GESPERRT`;
  Datenbank: Trigger `arbeitszeiten_monat_gesperrt` (gilt auch für stempeln()/stempel_abgleich(), nicht für die
  Kalender-Übernahme – die hat ihre eigene Regel), tools/rechte-2026-10-05.sql (Inhaber 05.10.2026).
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
  Trigger `planung_pruefen` erzwingt es). KRANKENSTAND anderer: Kollegen sehen nur „Abwesend“ (grau, ohne Titel/Details;
  `planKrankVerborgen`, `planKatSicht`, `planTitel`) – die Art nur der Inhaber und die Person selbst (Gesundheitsdaten,
  Inhaber 05.10.2026; nur in der App, die Datenbank-Zeile bleibt lesbar). Urlaub genehmigt nur der Inhaber
  (Trigger); schon genehmigten löscht nur er – die Person „Urlaub zurückziehen“ (Rückfrage, Nachricht an den Inhaber,
  `chatAnInhaber`; Sperrregel „genehmigter urlaub loeschen nur inhaber“; Inhaber 05.10.2026); ändert sie ihn (→ wieder
  beantragt), bekommt der Inhaber von selbst „Urlaub geändert – bitte neu genehmigen“ (`urlaubGeaendertMelden`). Der Kalender zeigt dazu Störungen (Einsatztag bleibt in der
  Störung), Projekttermine, erledigte Protokolle und fällige Wartungen zum
  Einplanen (`wartungenImMonat`; eingeplant werden die Wartungstermine der
  Anlagen: `planung.position_ids`, `wartungEinplanen`, `planFuerPosition`, in
  Fällig „📅 eingeplant“; erledigt, sobald seit dem Tag − `BESUCH_TAGE` gewartet).
  Stunden: geplante Termine am Tag, „erfassen“
  → `arbeitszeiten.planung_id`. Abwesenheit (`PLAN_ABWESEND`: Urlaub erst GENEHMIGT, Krankenstand, Schule,
  Zeitausgleich) legt die Datenbank selbst in die Stunden (tools/stunden-kalender.sql, Trigger `planung_stunden`,
  Quelle „kalender“): je Arbeitstag das Tagessoll (`soll_minuten`, `feiertag_at` wie `sollMinutenTag`/`feiertageAT`),
  angepasst/entfernt mit dem Kalendereintrag, nie im bestätigten Monat; anlegen für eine Person nur sie selbst oder
  der Inhaber; selbst geändert → „hand“. Zeitausgleich zählt nicht als Ist (baut Überstunden ab). Stempeluhr: „📅 Heute
  geplant“ (`stempelPlanChips`), nach dem Ausstempeln Verknüpfung mit dem Termin (`zeitenMitPlanungVerknuepfen`).
  Soll je Tag/Woche in „Meine Arbeitszeit“ (`sollIstTag`) nur zur Info – Überstunden bleiben MONATSBILANZ.
  Vor dem Bestätigen: `monatLuecken` (Tage ohne Eintrag, Abwesenheit ohne Stunden, Geplantes nicht erfasst) mit
  „Nachricht an …“. Büro 03.10.2026.
  Stempeluhr hat VORRANG (Büro 04.10.2026): Abgleich mit dem Kalender (`abgleichDialog`, `abgleichTeile`, Funktion `stempel_abgleich`,
  tools/stempel-abgleich.sql) teilt nur die gestempelte Zeit auf – Blöcke lückenlos und genau, Summe/Pause unverändert, Quelle
  „stempel_abgeglichen“; Lücken zwischen Terminen behalten, was dort gestempelt war (Bereich, Markt, Projekt – sonst Fahrt),
  ein Termin mitten in einem anderen unterbricht ihn, Minuten wie die Datenbank (`abgleichMinuten`: Pause zum längsten Teil); nach dem Ausstempeln angeboten, beim Tag „⇆ Tag prüfen“, beim Termin „⏱ abgleichen“ statt
  „erfassen“ (nie doppelt). Tagesrückblick (Inhaber 06.10.2026, derselbe Dialog `abgleichDialog`): nach JEDEM Ausstempeln
  (auch ohne Termin, auch Präsentation) „Was hast du heute wann und wo gemacht?“ – Abschnitte aus Gestempeltem (inkl. Umstempeln)
  bzw. Kalender-Vorschlag, je Abschnitt Grenze ±15 min/Uhrzeit, Bereich, Markt, Projekt, Was, teilen, entfernen (Zeit an den
  Nachbarn); Blockanfang/-ende fest; nur geänderte Blöcke gehen an `stempel_abgleich`. „✓ Passt so“ ohne Änderung schreibt nichts,
  merkt den Tag als geprüft (`tagGeprueft`/`tagAlsGeprueft`, Wert = Stand der gestempelten Einträge): Tabelle `tag_geprueft`
  (user_id, datum, stand, geprueft_am; lesen eigene + Inhaber, schreiben nur eigene, nicht Kunde/Präsentation, löschen niemand;
  `tagGeprueftLaden` in `zeitenLaden`) – gilt auf allen Geräten; dazu localStorage `ukt_tag_geprueft` je Konto|Tag als Rückfall
  (Tabelle fehlt → nur Gerät; Netz weg → beim nächsten `zeitenLaden` nachgetragen, `tagGeprueftSenden`). Ganz „stempel_abgeglichen“ gilt
  ohnehin als geprüft; Präsentation/Spielwiese nur im Speicher. „Später“ speichert nichts –
  beim Tag „⇆ Tag prüfen“ (`tagPruefenOffen`), bis geprüft oder Monat bestätigt. Umstempeln mit Vorgabe aus dem Termin (`geplantFuerMich`, „⇄ Dorthin umstempeln“).
  Abwesenheit und Arbeit am selben Tag (`abwesenheitPruefen`, tools/abwesenheit-arbeit.sql, `planung.ausnahmen`): beim Einstempeln und
  Erfassen fragen (ein halber Tag mit Uhrzeit – EIN Tag mit von–bis – nur, wenn die Arbeit bzw. das Einstempeln hineinfällt:
  `abwesenheitZeitTrifft`; ganztägig, mehrtägig oder Arbeit ohne Uhrzeit immer; Inhaber 05.10.2026) – „eingesprungen“ (beides zählt), Urlaub „zurückgeben“ (Inhaber nimmt den Tag heraus: `planTagHerausnehmen`, To-do),
  Krankenstand/Schule/ZA „für diesen Tag beenden“; ungeklärt ⚠ beim Tag und in `monatLuecken`. Die Antwort gilt je Tag UND Person
  (`ausnahmen[Tag][user_id]`, ältere ohne Person gelten für alle); stehen mehrere im Eintrag, verliert nur diese Person den Tag
  (`planPersonHerausloesen`: aus dem Eintrag genommen, eigene Einträge für ihre übrigen Tage); nur Tage im Zeitraum. Urlaub ändert nur der Inhaber. Neu Eingetragene bekommen eine Chat-Nachricht
  (nicht bei Privatem). Abwesenheiten ANDERER – auch gemeinsame (Betriebsurlaub, Kurs) – legt an, ändert, kürzt, nimmt
  Tage heraus und löscht nur der Inhaber; die eigene (SELBST angelegt UND nur sie bzw. niemand eingetragen – was der Inhaber für
  jemanden einträgt, ändert nur er; die Person bittet per Chat um Herausnehmen) die Person selbst,
  aus gemeinsamen nimmt sie nur sich selbst heraus; Admins wie Techniker (Inhaber 05.10.2026: `planAbwesenheitDarf`, Personenwahl
  nur „ich“, sonst schreibgeschützt „ändert nur der Inhaber“; Datenbank: Sperrregeln „abwesenheit … nur selbst oder inhaber“ und
  Trigger `planung_rechte_abwesenheit`, tools/rechte-2026-10-05.sql). Diese Grenzen nie lockern.
- **Posteingang → Projekt** (Büro 02.10.2026): weitergeleitete Mails (nicht Lidl-Auftrag/Rapport)
  kommen mit `.eml` (art „mail“, `eintraege` in synology/ukt_posteingang.py, Test
  tools/posteingang_test.py); in der App eine Karte je Mail (`posteingangMailBox`), „Zu Projekt
  legen“ (`posteingangZuProjekt`, Vorschlag `posteingangProjektPunkte`) – erledigt erst, wenn alle
  Dateien hochgeladen sind. Angebot/Rechnung als Art nur für den Inhaber. KPlus-PDFs (6-stellig, `kplusDateiname`; Tiefentest
  05.10.2026): beim Inhaber als Angebot/Rechnung erkannt (buero/), andere legen sie und die Mail dazu nicht ab (bleiben im
  Posteingang). Eine Mail mit Angebot/Rechnung (`mailMitBeleg`) liegt auch als .eml nur unter buero/ – ebenso aus dem Mail-Programm.
  Ebenso eine Mail mit Preisen im TEXT (Inhaber 05.10.2026: Betrag mit €/EUR, `mailTextMitPreis`, `emlText` liest die .eml): beim
  Inhaber nur unter buero/ mit Hinweis „enthält Preise – nur für den Inhaber abgelegt“ (`preise` an der Datei, `preisHinweis`), alle
  anderen legen sie nicht ab – geprüft in `projektDateienHochladen`, gilt so für Posteingang, Mail-Programm, Mailverlauf und Dateien-Karte.
  Signatur/Impressum zählen nicht (`MAIL_IMPRESSUM`: Stammkapital, Firmenbuch, FN, UID …; nach dem Trenner „-- “ bis zu einer zitierten Mail).
  Anhänge ohne .eml (Rohmail zu groß, art „unbekannt“): „Zu Projekt legen“ an der Einzelkarte, für alle Anhänge derselben Mail.
  Zu Großes (über 20 MB, Anhang oder Mail) meldet das Skript als Eintrag OHNE Datei (art „unbekannt“, `pfad` leer, Hinweis in `notiz`;
  Inhaber 05.10.2026) – Karte „⚠ … nicht abgeholt“ (`posteingangOhneDatei`, `posteingangHinweisBox`), nie in „Zu Projekt legen“.
  Lidl-Auftrag/Rapport erkennt das Skript an Betreff, Dateiname („rapport“, „auftrag“, „störung“) und Absender (allgemein `lidl.<Endung>`
  und `lidl_domains` in ukt_posteingang.json): eine PDF von Lidl, die kein Rapport ist, ist ein Auftrag.
  Je Mail ein Dialog (`posteingangDialoge`); schon Hochgeladenes merkt `posteingangAbgelegt` – nochmals lädt nur den Rest bzw. vermerkt nur.
  Wer was sieht (Inhaber 05.10.2026, `posteingangRolle`, `posteingangSieht`): Projektmails (alles außer art „auftrag“/„rapport“)
  NUR der Inhaber, Lidl-Aufträge und Rapporte Inhaber und Admins, Techniker gar nicht (Karte, Benachrichtigung, Datenbank:
  Sperrregeln für Tabelle und Speicher, Push `nur_rolle` – tools/rechte-2026-10-05.sql). Das Synology-Konto legt ab, ohne lesen
  zu können (`ablage_pfad` fest je Mail und Datei, `on_conflict` + `ignore-duplicates`, return=minimal). Nie lockern.
- **Mail-Programm am PC** (Büro 04.10.2026, `mailBruecke`, `mailUebernehmen`, `mailProjektNeu`, `mailZuProjekt`,
  `mailStoerung`, `mailsDazuKarte`): das Programm „Mail mit Claude“ läuft NUR auf dem PC des Inhabers
  (http://localhost:4317, nicht in diesem Repository). Verbunden per 6-stelligem Code aus dem Mail-Programm unter
  Verwaltung › Inhaber › „Mail-Programm am PC“ (`mailKoppelnKasten`; Links öffnen nie die installierte App) oder
  `#mailkopplung=<Schlüssel>` – localStorage `ukt_mailbruecke` mit Konto, gilt nur für das Inhaber-Konto, das ihn
  angenommen hat (`nurInhaber()`), nie in Präsentation/Spielwiese. „↗ Leitstand“ im Mail-Programm legt einen Auftrag
  bereit, den der offene Leitstand alle 3 s abholt (`mailAbholenStarten`, `/api/leitstand/abholen`; ohne Antwort 30 s
  Pause). Am Handy erreicht der Leitstand das Mail-Programm über Tailscale: Adresse je Gerät in `ukt_mailbruecke.url`
  (`mailUrl`, `mailAdresse`; am PC localhost:4317); Aufträge vom Handy holt nur der Leitstand am Handy ab.
  „Projekt aus Mail“ (Büro 04.10.2026: „der Chef steht als Auftraggeber drin“): Claude liest beim Öffnen von selbst;
  von UKT weitergeleitet (ukt.at/Kammerlander) = nie Anfragender; unbekannter Kunde → nichts vorgewählt (Pflicht),
  „+ Neuer Kunde“ (`kundeEditor(null, {vorlage, fertig})`) mit Claudes Angaben; Ansprechpartner → Beteiligte
  „Kunde / Bauherr“ (Quelle .eml) und Adressbuch. Projekt aus Mailverlauf (Büro 05.10.2026, `mailVerlaufDialog`,
  `mailVerlaufVorschlag`; Projekte „✦ Aus Mails nachtragen“, „Mails dazu“ → „Verlauf übernehmen“, Mail-Programm
  „↗ Leitstand → Projekt aus Mailverlauf“): Mails suchen/wählen → Claude (`/api/verlauf`) schlägt Stand, Angaben je
  Schritt, Beteiligte, Termine, Tagebuch (mit Mail-Datum) und Dateiarten vor, je mit Mail als Quelle → prüfen → alle
  Mails + Anhänge in die Dateien, KPlus-PDFs (kplusLesen) als Belege am Projekt (schon vorhandene Belege – Art+Nummer – bleiben unverändert, höchstens die PDF kommt dazu); bestehendes Projekt nur ergänzen (Stand bleibt, außer bewusst umgestellt → „Stand: …“ im
  Tagebuch; schon übernommene Mails sind markiert und nicht vorgehakt, Beteiligte/Termine/Tagebuch nicht doppelt); nach einem Abbruch
  „Weiter ablegen“ (kein zweites Projekt); `#mail=…` geht ebenso. Geöffnet wird „Projekt aus Mail“ (Titel/Datum/Absender vorbelegt, „✦ Mit Claude
  ausfüllen“ über das Mail-Programm), „Mail zu Projekt legen“ oder die Störungserfassung. Mail (.eml) + gewählte
  Anhänge → Projektdateien (Herkunft), Verweis in `daten.mails`, bei neuer Anfrage `.eml` als Quelle
  (`daten.quellen.anfrage`), Absender ins Adressbuch. „Mails dazu“ bei Projekt, Kunde (nicht Lidl) und Markt – ohne
  Verbindung gar keine Karte. Der Leitstand darf dort nur lesen/suchen (das Mail-Programm sperrt Senden,
  Verschieben, Löschen). Mailinhalte nie ins Repository. Test: „Mail-Programm am PC …“.
- **Katalog lernt mit** (`katalogLernen`, Büro 02.10.2026, nur Inhaber): neue Positionen aus KPlus-PDFs und
  aus gespeicherten App-Belegen kommen dazu (Herkunft in `quelle`, ohne Preis nichts; Wartung/Regiestunden eines Einsatzes
  mit Uhrzeit bzw. Protokolldatum nie – Merker `einsatz` aus `einsatzPositionen`); Preise bestehender
  Positionen ändert nur KPlus (alter Preis in der Herkunft). „+ Neue Position“ im Katalog; Auswahl nach Häufigkeit.
- **Tour → Kalender** (`tourSchicken`, `tourBuero`, Büro 03.10.2026): Inhaber und Admins planen für sich und alle
  (Admins auch für den Inhaber), Techniker nur für sich selbst; für sich selbst nur Kalendereinträge, für andere
  zusätzlich Tour + Nachricht, die Person nimmt sie unter „Touren für dich“ an (`tourAnnehmen`). Störungen der Tour
  bekommen „Einsatz geplant am“ (ohne zweite Nachricht, `_ohneMeldung`), Wartungen stehen in Fällig als „📅 eingeplant“.
  Startpunkt (`einstellungen` „startpunkt:<Konto>“): jeder setzt nur seinen eigenen, Inhaber und Admins für alle
  (`startpunktDarf`; die Datenbank sperrt es mit einer Sperrregel – Inhaber 05.10.2026).
- **Mehrere Techniker je Einsatz** (Inhaber 07.10.2026: „nur einen Techniker wählen – für Stempeluhr/Zeiterfassung unpraktisch“):
  Störung „Wer fährt hin“ (`terminTechniker`, Komma-Liste, `stoerWer` überall statt des einen Namens – Kalender, Doppelbuchung,
  Nachricht an jeden mit „Mit dir: …“, Bedarf, Tourfilter; Knöpfe `data-mehr` schalten um); „Tour verteilen“ an mehrere (`tourSchicken`:
  je andere Person eine Tour + Nachricht, `tourInKalender(…, mit)` je Stopp EIN Termin mit allen). Ordner hochladen meldet sofort
  „wird geprüft …“ und den Fortschritt „n von m hochgeladen“.
- **Vergessen / abholen am Markt** (Inhaber 07.10.2026: „Tobias hat seine Leiter in der Tivoligasse vergessen“): offene `bedarf`-Einträge mit
  standort_id (`marktAbholen`, `abholText`) – Knopf „🧰 Vergessen / abholen“ im Markt-Fenster und Karten-Popup (`marktAbholenNeu`, vorbelegt abholen/Werkzeug),
  🧰-Zeichen auf der Karte (`.abholpin`), je Tour-Stopp, im Tourausdruck, in den Kalenderterminen der Tour und „Unterwegs abholen“ mit „+ dazunehmen“.
  Geht nicht unter (Inhaber 07.10.2026: „nur auf der Karte sichtbar“): geladen bei jedem render() (`wzNachladen`), 🧰 neben jedem Marktnamen (`marktLink` → `abholZeichen`),
  Fällig-Karte „An Märkten abholen / mitnehmen“ (`abholKarte`), Hinweis in der Marktinfo (`standortDetail`, `abholHinweisFuellen`) und oben im Protokoll beim gewählten Markt (`[data-abholoben]`).
  Tour: ✕ an einem Stopp hält die Ansicht beim Nachbar-Stopp (`tourAnpassen`, Inhaber 08.10.2026: „springt sonst ganz nach oben“).
  Tour-Endpunkt (Inhaber 08.10.2026: „Start in Wien, Ende zu Hause in Salzburg“): `S.tour.zielId` („“ = zurück zum Start, `__heim` = fester Startpunkt
  `tourHeim` der Person bzw. eigener, `__betrieb`, Markt) → `tourZielPunkt`, `planeTour({ziel})`, `reihenfolgeIdx(…, ende)` optimiert bis zum Ziel; T.ziel in Karte (🏁),
  Linie, Tag-Navigation, Ausdruck, geschickte Tour (`tourDaten.ziel`).
  Tagesrückblick: teilen mit Uhrzeit + Bereich (`a.teilen`), Scrollstand bleibt; „Wo?“ mit Baustellen/Projekten (`ortOptionenHtml`, `ortWert`, `ortLesen`).
- **Termin ↔ Baustellenbuch ↔ Projekt-Schritt** (Inhaber 07.10.2026: „nach dem Termin eintragen, was gemacht wurde, mit Fotos – daraus später ein
  Arbeitsbericht; Verbindungen überall, nicht überladen“): Baustellenbuch-Eintrag mit `planung_id` und `schritt` (`baubuchEditor(p, alt, fertig, vorgabe)`,
  Schritt-Auswahl); „📝 Was wurde gemacht?“ am Projekt-Termin ab seinem Tag (`planEditor`, `planBerichtOeffnen`) und im Tagesrückblick beim
  gemachten Termin; Termin „✓ dokumentiert“ (`planBaubuch`) oder „✓ Erledigt“ ohne Bericht (`planTerminAbhaken`: `planung.erledigt`, Stand bleibt
  „offen“ – Stempeluhr/Rückblick kennen ihn weiter; `planTerminErledigt`); Projekt-Schritt zeigt seine Termine (auch vergangene) und Berichte
  (`projektSchrittAufgaben`); Arbeitsnachweis schlägt Baustellenbuch-Texte der Tage vor und deren Fotos (`data-bbvorschlag`).
- **Arbeitszeit lernt** (`arbeitStunden`, `stoerDauerMin`, Büro 02.10.2026): Tour und Kalender rechnen mit der
  tatsächlichen Zeit vor Ort – Lidl-Rapport (von–bis), Störung Ankunft–Fertig, Stunden mit Markt (`einsatz_dauern`,
  tools/einsatz-dauern.sql: nur Median je Markt, keine Personen); ohne Erfahrung `ARBEIT_H`.
- **Gelerntes geteilt** (`gelerntTeilen`, tools/gelernte-werte.sql): selbst Eingetipptes steht bei allen als Vorschlag; Zugangsdaten nie.
- **Mehrere Zugänge je Regelung** (Inhaber 06.10.2026): erster Benutzer weiter in `zugangBenutzer`/`zugangPasswort`
  (ältere App-Stände verlieren nichts), weitere in `zugangWeitere` = [{bez, benutzer, passwort, link}] (`zugaengeLesen`,
  „+ weiterer Benutzer“, entfernen mit Rückfrage). Geheim wie die anderen (`GEHEIME_FELDER`): nie in Protokoll/PDF/Archiv/KI,
  im Verlauf nur „vertraulich“, Kunde/Präsentation nie (Sicht `stammdaten_lesen` nimmt das Feld heraus).
- **Folgeaufträge** (Büro 02.10.2026, nur Inhaber): Mängel und „Folgeauftrag erforderlich“ aus
  Protokollen stehen in Projekte als „Folgeaufträge – Angebot?“ (`folgeOffen`); erledigt durch ein Projekt
  mit `daten.ausProtokoll` oder „Kein Angebot“ mit Grund (Merker `folge:<Protokoll>`).
- **Datenpflege** (Verwaltung, Büro 02.10.2026): Märkte „zur Zeit nicht betreut“ mit Grund „Datenpflege“
  samt Fortschritt (`datenpflegePunkte`); „Wieder betreuen“ öffnet nur den Markt-Editor.
- **Vor Ort klären** (tools/vor-ort-fragen.sql, Büro 03.10.2026): Fragen je Markt (`vor_ort_fragen`); Büro (Inhaber, Admins) stellt
  und hakt ab, alle die schreiben dürfen antworten (Trigger: Nicht-Büro ändert nur die Antwort, Zeit setzt der Server).
  Im Protokoll nur sichtbar, wenn am Markt eine Frage offen ist (Fokus: Techniker nicht mit Neuem belasten) – im Formular
  unter dem Markt, im geführten Dialog im Schritt „Gewartete/Betroffene Anlagen“. Zusätzlich ganz oben im Kopf
  „❓ n Frage(n) vor Ort“ (`P.vorOrtHinweis`, nur solange eine ohne Antwort offen ist; antippen springt hin – Inhaber 05.10.2026).
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
  Standort-Verlauf schreibt nur der Trigger (`werkzeug_verlauf`). Als Ort ist jedes aktive Fahrzeug wählbar (Inhaber 05.10.2026
  „Ja, nur Kennzeichen“): Datenbank-Funktion `fahrzeuge_auswahl()` liefert NUR Kennung, Kennzeichen, Bezeichnung, Fahrernamen
  (`fzAuswahlLaden`, `wzFahrzeuge` – nur für die Werkzeug-Ortswahl); die Leseregel der Fahrzeuge bleibt (Techniker: nur das eigene). `bedarf` = was ein Einsatz braucht (mitnehmen / abholen bei … /
  bestellen bei …; offen → bestellt → abholbereit → erledigt), Bezug Projekt, Störung, Kalendertermin oder Markt (`bedarfZu`,
  `bedarfFuerEinsatz`; Datum/Person vom Termin bzw. Einsatz – mehrtägig bis zum letzten Tag –, sonst vom nächsten Projekt-/Markttermin:
  `bedarfWann`, `bedarfWer`, `bedarfEinsaetze`); `packlisten` (übernehmen ohne Doppel, je Bezug nacheinander).
  Erinnert in „Heute für dich“ (heute/morgen), „🔍 Planung prüfen“ (je Tag „Vorher besorgen“), Kalenderzeile 🧰, Büro-To-do
  (`wzToDo`). Kästen in Termin (gespeichert, nicht Abwesenheit/Privat), Störung, Projekt, Markt; Fahrzeug zeigt, was drin liegt.
  Bedarf an einem privaten Termin sehen andere nie, nur der Inhaber (`bedarfVerborgen` mit `nurInhaber()`, als gelernter Vorschlag nie; die Datenbank sperrt es selbst – Sperrregel
  „bedarf privat nur eigene“: nur wer den Termin angelegt hat oder dort eingetragen ist und der Inhaber, nicht Admins – Inhaber 05.10.2026); nachträglich privat → Frage „mitlöschen?“.
  Alle, die mitarbeiten, lesen und schreiben; Werkzeug/Packliste löschen nur Büro, Bedarf wer ihn angelegt hat oder Büro.
  Ausscheiden („im Bestand“ abwählen) fragt nach; Filter „Ausgeschieden“ (nur wenn es welches gibt) zum Wiederfinden/Zurückholen.
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
  Kilometergeld nur MIT eingetragenem Privatauto (Pflicht, Inhaber 05.10.2026: `fahrzeuge.privat_von` = Person des Eintrags; `akOhneAutoText`,
  Trigger `auslagen_pruefen_privatauto` in tools/rechte-2026-10-05.sql; reine Statusänderung alter Einträge ohne Fahrzeug geht weiter). PDF `akPdf` mit Belegfotos; Inhaber: „Reisekosten aller“, To-do
  (`akAbgegebenText`), Projekt zeigt die Summe (nur Inhaber); Bedarf „abholen/bestellen“ → „Selbst bezahlt – Beleg erfassen“.
  Belegfoto (Inhaber 05.10.2026, tools/rechte-2026-10-05.sql): nach der Abgabe ersetzt/entfernt es nur noch der Inhaber (Speicher-Regel; nach
  „zurückgeben“ wieder die Person); ersetzt er das Foto eines fremden Eintrags, liegt das neue im Ordner der Person (`akFotoHochladen(datei, fuer)`),
  das alte wird erst nach dem Speichern entfernt. Nie lockern.
- **Textfelder wachsen mit** (Inhaber 07.10.2026: „man muss innen drinnen scrollen“): jedes `<textarea>` passt seine Höhe dem Text an
  (`feldHoehe`, `textfelderAnpassen` bei Eingabe/Fokus/Klick/Größe/neuen Elementen), Zeilenzahl = Mindestmaß, keine Obergrenze;
  Ausnahme `data-fest`. Test „Textfelder wachsen mit dem Text …“.
- **Schriftgröße je Gerät** (Inhaber 07.10.2026: „der Chef will alles sehr groß, ich eher klein“): ☰ → „Aa Schriftgröße“ (`schriftDialog`,
  `SCHRIFT_STUFEN` Sehr klein 0,75 / Klein 0,85 / Normal / Groß 1,15 / Sehr groß 1,3; Feineinstellung − / + in 5-%-Schritten 60–150 %, gespeichert als Zahl), localStorage `ukt_schrift`; `schriftAnwenden` (Kopf-Skript) setzt am Handy/Tablet
  die Viewport-Breite = Gerätebreite ÷ Stufe und initial-scale = Stufe (Text bricht neu um, iPhone maximum-scale = Stufe); Normal bleibt wie bisher.
  Am PC nur Hinweis Strg +/− (Browser merkt es selbst). Am Handy/Tablet zusätzlich immer „Aa Schriftgröße“ ganz unten neben Handbuch/Rundgänge (`#schriftbtn`; nicht in der Kopfleiste – zu viel Platz) – klein gestellt
  wird die Seite breiter als 700 px und das ☰ verschwindet. Test „Schriftgröße je Gerät …“.
- **Kartenbilder auf dem Gerät** (Inhaber 07.10.2026): angesehene Kacheln in IndexedDB „ukt_kacheln“ (`kachelEbene`, `KachelMitSpeicher`, höchstens
  `KACHEL_MAX`, älter als `KACHEL_ALT_TAGE` im Hintergrund erneuert); nie ganze Gegenden vorab (OSM-Nutzungsregeln). Ohne Netz, aber mit gespeicherten
  Bildern: trotzdem Straßenkarte (`kachelnPruefen`). Anzahl + „Leeren“ (Rückfrage) unter der Karte. Überfällig auf der Karte in `--karte-rot`, fällig in 30 Tagen in `--karte-gelb` (`KARTE_VAR`; Inhaber 07./08.10.2026).
- **Einmal sagen, überall verwenden** (Inhaber 08.10.2026: „redundant – bitte aufräumen, einheitlicher“): „Was gemacht?“ fragt NUR der
  Tagesrückblick (`abgleichDialog`: Feld `[data-abwas]` je Abschnitt, Vorschlag `wasVorschlag` aus eigenem Protokoll/Termin, bei Baustellen `[data-abfoto]`);
  beim Speichern: Text in die Stunden, bei Baustellen neu Eingetragenes + Fotos ins Baustellenbuch (planung_id, Schritt; nicht doppelt), gemachte Termine
  `planTerminAbhaken(e, true, still)` (nicht Wartung/Störung – die erledigt das Protokoll; mehrtägige erst am letzten Tag). Ein-/Um-/Ausstempeln fragen kein
  „Was“ mehr (Termin-Chip gibt es still mit: `dataset.was`); `erledigtAbfrage`/`stempelErledigt` entfernt. Termin: EIN „✓ Erledigt“ (Projekt: „✓ Erledigt …“ →
  Baustellenbuch mit „✓ Ohne Text erledigt“, `vorgabe.ohneText`), „📅 In Handy-Kalender“. Arbeitsnachweis „Ausgeführte Arbeiten“ vorbefüllt
  (`[data-anvorbefuellt]`). Stunden von Hand: „Was gemacht?“, Notiz nur noch bei alten Einträgen sichtbar.
- **Interne Notiz** (Inhaber 08.10.2026: „interne Notiz beim Einsatz, nicht am Protokoll, in der Anlagenansicht klar ersichtlich – nur UKT intern“):
  Tabelle `interne_hinweise` (tools/interne-hinweise.sql; lesen/schreiben `darf_schreiben()` – nie Kunde/Präsentation; Text ändert nur, wer angelegt hat,
  oder das Büro; „behoben“ jeder; löschen nur Büro). App: `ihLaden`, `ihNeu` (Art Fehler/Alarm/Notiz, Anlage oder ganzer Markt), `ihBehoben`, `ihKasten`;
  🔒 im Kopf der Anlagen-Karte (`[data-ihpill]`, auch eingeklappt) + Text (`[data-ihanlage]`), Marktinfo (`[data-ihmarkt]`), Protokoll-Kopf (`[data-ihoben]`)
  und geführter Schritt „Abschluss“. NIE ins Protokoll, PDF, Monatsbericht oder Archiv übernehmen.
- **Anlage löschen** (Inhaber 08.10.2026: „die KI hatte eine Anlage zu viel erkannt … die fehlerhaft angelegte komplett löschen“): `anlageLoeschen`
  (`anlageLoeschenDarf`: Inhaber und Admins, nie Präsentation), Knopf „🗑 Anlage löschen“ in der Verwaltung (`anlageKarte`). Setzt `geloescht`/`geloeschtVon`/
  `geloeschtAm` + `aktiv:false` an allen Zeilen (STAMM_FELDER_POS) über `positionenSchreiben` mit Änderungsverlauf (rücknehmbar). NICHT aus der Datenbank
  entfernen: Zeilen der alten Liste kämen sonst aktiv zurück, und Wartungen zusammengeführter Zeilen zählten nicht mehr (`zeileWeiter`). Eigene Protokolle
  ohne Weiterleitung oder offene Störung → nicht löschen (erst zusammenführen). Verwaltung blendet gelöschte aus.
- **Datenverbrauch / Egress** (Inhaber 08.10.2026: Supabase „Egress Exceeded“, 7,6 GB bei 49 MB Datenbank): Störungen tragen Auftrags-PDF und
  Seitenbilder in `felder.pdfDaten`/`felder.seiten` (~11 MB). Geladen wird `stammdaten_leicht` (tools/stammdaten-leicht.sql: ohne diese Felder,
  `_schwer`; fehlt die Sicht → `stammdaten`), PDF/Seiten erst beim Öffnen (`stoerungSchwerLaden` in `stoerungDialog`/`protokollBeginnen`,
  gemerkt in `STOER_SCHWER` je Stand); Trigger `stammdaten_schwer_behalten` behält sie beim Speichern (bewusst entfernen nur mit `_pdfWeg`/`_seitenWeg`).
  Nachladen im Hintergrund nur, wenn `aenderungPruefen` (Anzahl + jüngste Änderung) etwas Neues meldet. Große Inhalte nie wieder in Stammdaten-Felder.
- **Daten kommen von selbst** (Inhaber 07.10.2026: „dauert lange, bis es die aktuellen Wartungen und Störungen aktualisiert“): `hintergrundNachladen`
  beim Zurückkommen (visibilitychange) und alle 2 min, solange sichtbar; `storeNachRender(true)` zeichnet nur neu, wenn sich `datenStand()` geändert hat;
  auch die Karte wird aufgefrischt (nicht bei offenem Popup). Markt-Fenster auf der Karte: `popupOpt()` (höchstens Kartenhöhe, innen scrollen), Knöpfe zweispaltig.
- **Karte bleibt erhalten** (Inhaber 07.10.2026: „die Karte dauert manchmal sehr lange zum Laden – nervig im Einsatz“): `render()` baut die
  Leaflet-Karte nicht ab, sondern hält sie an und merkt den Ausschnitt (`_uktAnsicht`); `karteOsm` setzt den Container mit den geladenen Kacheln
  wieder ein (`_uktKachel`), zeichnet nur die Zeichen neu und behält den Ausschnitt, solange Auswahl/Tour/Standort gleich sind (`_uktSchluessel`);
  ältere Rückrufe prüfen `aktuell()` (`_uktGen`). Kacheln: keepBuffer 4, updateWhenIdle aus. Test „Karte bleibt erhalten …“.
- **Diktieren** (`diktatKnopf`): Spracherkennung des Browsers, keine KI, Text wird angehängt.
- **Uhrzeit / Arbeitszeit im Protokoll** (Inhaber 08.10.2026: „die Uhrzeit soll am PDF nicht erscheinen; die Arbeitszeit von–bis kommt vom Rapport
  und steht dann am Protokoll; die gearbeitete Zeit brauchen wir im Kalender für Vor- und Nachplanung“): `blattInhalt` zeigt nur das Datum (nie `uhrzeit`);
  „Arbeitszeit vor Ort“ = `protokollArbeitszeit` (Rapport-Zeilen `rapportZeit`: früheste von – späteste bis; sonst Ankunft–Fertig), bei Wartung und Störung;
  `rapTextRein` füllt Ankunft/Fertig aus dem Rapport, wenn leer; Kalender zeigt beim erledigten Einsatz die gearbeitete Zeit.
- **Rapport-Text** (`rapTextRein`): ausgeführte Arbeiten aus dem Lidl-Rapport zusätzlich in
  „Durchgeführte Maßnahmen“ bzw. „Bemerkungen“ – nie ersetzen, kein Feld fällt weg.
- **Fahrtpauschale** (`fahrtZone`, Büro 02.10.2026): Zone 2 = Kärnten, Steiermark, Vorarlberg, Tirol westlich von
  Innsbruck (Innsbruck selbst Zone 1), Osttirol; sonst Zone 1. `einsatzPositionen` nimmt die Katalog-Position der Zone. Nur auf Anweisung ändern.
- **Fahrzeuge** (tools/fahrzeuge.sql, Büro 02.10.2026): km, Pickerl, Service, Reparatur, Schaden; Techniker nur
  ihr Fahrzeug (km-Stand, Schaden), Beträge nur Inhaber (`fahrzeug_kosten`). Eigene Privatautos (auch mehrere) trägt jede Person
  selbst ein (`privatautoEditor`, „+ Mein Privatauto“, Inhaber 05.10.2026): nur Kennzeichen, Bezeichnung, „in Verwendung“; Datenbank:
  Regeln + Trigger `fahrzeuge_privat_pruefen` (tools/rechte-2026-10-05.sql) – Nicht-Büro nie fremde/Firmenfahrzeuge, nie Fristen/GPS.
  GPS-Import (X-GPS, CSV/Excel): NUR Kilometer je Tag – nie Orte, Uhrzeiten oder Fahrten speichern (Fahrtenbuch mit Orten erst nach
  Zustimmung/Betriebsvereinbarung). Diese Grenze nie lockern. Keine direkte
  X-GPS-Anbindung (Inhaber 05.10.2026: „zu kompliziert und unnötig“) – stattdessen je Fahrzeug und Monat
  „gefahren laut km-Stand“ (`fzKmLautStand`) neben „geplante Einsatzfahrten ≈ X km“ (`fzEinsatzKm`: je Fahrer und Tag
  Startpunkt → Einsätze laut Kalender → zurück, Übernachtung wie beim Startpunkt; Straßen-km aus `FAHR_KM` von Kalender/Tour,
  sonst Luftlinie × `UMWEG`; keine eigene Netzabfrage, nichts gespeichert). Sichtbar wie die km im Reiter Fahrzeuge.
- **Spielwiese** (`spielwieseOeffnen`, `spielwieseDarf`: Inhaber, Admins und Techniker – je mit dem eigenen Konto und
  dessen Rechten, Büro 03.10.2026; nie Kunde/Präsentation): eigene App im geschützten Vollbild; darin
  `spielwiese()` statt `demo()` – alles läuft echt gegen die Schattendatenbank (`schattenClient`: Tabellen
  beim ersten Zugriff in den Speicher, Schreiben nur dort, keine KI/RPC außer Teamliste). `vorschauSchutz`
  sperrt zusätzlich jedes Schreiben im Netz. Schließen verwirft alles.
- **Störungen nie doppelt** (Büro 01.10.2026): eine Lidl-Auftragsnummer gibt es
  nur einmal als Störung (Datenbank-Index `stoerung_auftrag_einmal`,
  tools/stoerung-eindeutig.sql; im Dialog „Vorhandene öffnen“ statt neu – auch beim Ändern der Nummer).
  Nennt ein Störungsprotokoll die Auftragsnummer einer ANDEREN offenen Störung
  am Markt, fragt die App, welche erledigt ist; offene Störungen mit passendem
  Protokoll (gleicher Markt, gleiche Nummer) werden beim Laden verknüpft
  (`stoerungenOhneVerknuepfungAbgleichen`).

## Rollen

inhaber, admin, techniker, kunde, praesentation. Testkonten ausblenden (Inhaber 05.10.2026): Haken „in
Personenlisten ausblenden“ in der Kontenübersicht (Verwaltung › Inhaber) → `einstellungen.personen_ausblenden`
{ids}; `chatTeamLaden` lässt sie in jeder Personenauswahl weg (`PERSONEN_AUS`), das Konto bleibt bestehen,
schon Eingetragenes bleibt sichtbar. Keine Namen oder Kennungen in den Code. Der Kunde darf nur ansehen
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
