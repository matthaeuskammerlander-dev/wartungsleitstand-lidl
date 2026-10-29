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
  änderbar. KI-Fotos: Prüfbuch bis 50 (`KI_MAX_PRUEFBUCH`, Inhaber 08.10.2026; Höchstzahl steht vor dem Wählen, `kiMaxText`), Typenschilder bis 30 Bilder, gelesen in
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
  Korrigieren (Inhaber 09.10.2026: „falsche Prüfbuchfotos – nirgends löschen oder korrigieren“): in „📷 Fotos der Anlage“ „✎ Fotos korrigieren“ (`anlagenFotosAnsicht`):
  antippen wählt (🔍 groß), dann „🗑 Löschen“ (Rückfrage, auch die Bilddatei unter anlagen/), „↪ Andere Anlage“ (am selben Markt), „Art ändern“ (Prüfbuch/Typenschild/Anlage
  mit Beschriftung). Büro alle Fotos, sonst nur die selbst gespeicherten (`anlagenFotoDarf`), nie Kunde/Präsentation – Datenbank: tools/anlagenfotos-korrigieren.sql.
- Anlagen-Karten im Markt (`anlagenBloecke`, Inhaber 06.10.2026): einklappbar, am Handy zu (Kopf: Name, dringlichster
  Status, Störung, „Fehlt“), am PC offen. Auf-/Zugeklapptes bleibt je Anlage gemerkt (`ukt_anlagen_karten`, mit Zeit) und
  gilt nach `ANLAGEN_KARTE_FRIST_MS` (2 h) ohne Hineinschauen nicht mehr. Sprünge (`aufklappen`) und Rundgänge klappen auf.
  Am Handy (Inhaber 10.10.2026: „oft ausgeklappt – die Seite wird so lang“): immer nur EINE Anlage je Markt offen (die anderen klappen zu), Öffnen des Markts
  verlängert das Gemerkte nicht (nach 2 h wieder zu); im Reiter Anlagen nur EIN Markt offen; in der Verwaltung „Anlagendaten“ zugeklappt, Lücken als „n fehlen“ im Kopf (`[data-luecken]`).
  Wartungspunkt „Kondensatwanne“ (früher „Kondensatwanne/-ablauf“, alte
  Protokolle über `arbeitenAktuell`).
- Techniker/in = angemeldetes Konto (Büro 01.10.2026: „er ist verantwortlich für
  die Arbeit und das Protokoll“): `kontoTechName()` setzt Techniker/in fest
  (nicht änderbar), der Name im Abschluss ist immer derselbe (`verantwortlich`
  beim Speichern, Trigger tools/protokoll-techniker.sql). Korrektur: es bleibt,
  wer es gemacht hat. Wer noch dabei war: Weitere Techniker/innen (Inhaber 08.10.2026: beliebig viele mit „+ Techniker/in“, je Zeile Auswahl aus
  nur Techniker – Team-Konten + `EIGENE_TECHNIKER`, keine Firmen/Altnamen, schon gewählte nicht doppelt, eigenes Konto „(ich)“ – Inhaber 09.10.2026 (`techAuswahlNamen`) – oder „anderer Name …“, leer lassen geht;
  dazu „Weitere Arbeitskräfte ohne Namen“ − n + (`#f_mitzahl`, Spalte `protokolle.mitarbeiter_anzahl`, tools/protokoll-mitarbeiter-anzahl.sql; im PDF „+ n weitere Arbeitskräfte“, `mitAnzahlText`) – `mitTechnikerListe`, verstecktes Feld `#f_mit` als JSON, `mitarbeiter`; alte Entwürfe mit f_tech2/f_tech3 werden übernommen). Ausnahme (Büro
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
  (nur ohne andere Rechnung und wenn der Vermerk diese Nummer nennt) und steht wieder unter „noch nicht abgerechnet“; `einsatzGelernt` ergänzt künftige Vorschläge um das, was der Chef schon in EINER KPlus-Rechnung dazuschrieb – am selben Markt oder beim selben Kunden (Inhaber 11.10.2026: „auch ab der ersten Rechnung“; vorher ≥2×, am Markt ≥1×).
  Lernen je Einsatzart (`einsatzArt`, `einsatzLernBelege`; Inhaber 05.10.2026 „ersetzen nach 3×“): eine App-Position, die der Chef in
  ≥3 verschiedenen KPlus-Rechnungen gestrichen (und seltener selbst geschrieben) hat, schlägt die App dort nicht mehr vor
  (`einsatzGestrichen`, `LERN_STREICHEN`, Schlüssel `vorschlagSchluessel`; `lernen.passend`/`zuviel[].schluessel`); Vorschlag und
  Vergleich rechnen gleich (`einsatzVorschlag`); Grund im Editor („gelernt aus N KPlus-Rechnungen“, Hinweis über den Positionen).
  Gelerntes nie doppelt (Probe 11.10.2026): `positionenAehnlich` (eine Funktion für Vergleich UND `einsatzGelernt`) – gleiche erste Zeile ohne Mengen, zwei gemeinsame
  Wörter ≥ 5 Buchstaben, oder bei gleicher Einheit Wartung ↔ Jahreswartung, Regiestunde ↔ Regiestundensatz ↔ Regiestunden, Fahrtpauschale ↔ Fahrtpauschale; eine gelernte
  Position kommt nur dazu, wenn der Vorschlag keine ähnliche hat; einsatzspezifische Zweitzeilen (Datum, „lt. Arbeitsnachweis Nr.“, „Einsatz …, 2 Mann“) fallen weg (`gelerntText`).
  Test „KPlus-Rechnung als echte PDF …“: pdf-lib-PDF im KPlus-Spaltenbild durch `kplusLesen`, Wartung/Störung/Arbeitsnachweis über die echten Hochlade-Knöpfe.
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
  KPlus-Schluss-/Teilrechnungen (Inhaber 12.10.2026, Saalfelden 419890): Titel „Schlussrechnung“/„Teilrechnung“ gelten als Rechnung (`kopf.rechnungsart`); eine abgezogene
  Teilrechnung („Stk 1.Teilrechnung 419801-1 vom … 87.033,05“) wird keine Position, sondern `kopf.teilrechnungen` [{nr, nummer, datum, netto}]; `kopf.auftragssumme`,
  `summenPdf.brutto` auch aus „Bruttosumme“, `summenPdf.zahlbetrag`. Steht Menge+Einheit im selben Textlauf wie der Bezeichnungsanfang („4,00 Psch Kältemittel-…“), bleibt
  der Anfang erhalten; Einheiten vereinheitlicht `einheitNorm` (psh/Psch/ßsh → psh, STk → Stk, KG → kg).
  Katalog-Hinweis je Position (Spalte `katalog.hinweis`, tools/katalog-hinweis.sql; Inhaber 12.10.2026 zum Rahmenvertrag FB035 = KPlus Angebot 413797, Nummern „FB035/Pos.N“ in
  `nummer`): was eine Pauschale enthält (z. B. KM-Leitung bis 15 m, Mehrlänge nach Pos. 29–37 je lfm, stärkeres Gerät als Mehrpreis) – beim Wählen (`katalogWahl`), unter der
  Editor-Zeile (`katalogHinweis`, `[data-kathinweis]`) und zum Pflegen (`katalogAnsicht` `[data-hinweis]`); nie auf der Rechnung. Kabeltasse/Installationskanal: Pauschale je
  lfm für 100 mm mit 1 Leitung – 200 mm/2 Leitungen zählt doppelt, 300 mm dreifach (`kabeltasseFaktor` im Baustellenbuch-Vorschlag; „Kabeltasse“ ≈ „Installationskanal“).
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
  (`pdfTitelLesen`, ≤ 8 s) bzw. nachträglich „🔎 Pläne genauer erkennen“ (`pdfTitelNachlesen`). Sprungleiste oben im Projekt (`projektSprungleiste`, sticky; Fenster mit Klasse `mit-sprung` → `grid-auto-rows:max-content`, sonst drückt das Raster die Leiste bei langem Inhalt auf ~1 px).
  Übersichtlicher (Inhaber 08.10.2026: „sehr unübersichtlich“, gewählt a+b+c): „Auf einen Blick“ ganz oben (`projektBlickKarte`: Stand, nächster Termin,
  offene Aufgaben, von uns dran, Ansprechpartner); leere Listen-Karten als „+ …“-Knopf darin (`projektLeereKarten`, Karte versteckt, Knopf löst ihr „+“ aus);
  langer Text in den Angaben zugeklappt mit „▾ ganzen Text zeigen“ (`projektLangerText`, Klasse `lang-zu`).
  Kleiner Monatskalender im Projekt (Inhaber 08.10.2026, `projektMonatKarte`): Bauzeitplan-Termine, Kalendertermine und Aufgaben mit diesem Projekt, ◀ ▶ blättern, Tag antippen → Einträge, Eintrag → `kalEintragOeffnen`.
  Reiter im Projekt (Inhaber 09.10.2026: „immer noch etwas unübersichtlich – probieren wir es mit Reitern“, `projektReiter`, `PROJEKT_REITER`): Übersicht (Auf einen Blick,
  Stand, Aufgaben, Kalender) · Angaben (Angaben, Beteiligte, Anlagen) · Termine & Material · Baustelle (Baustellenbuch, Arbeitsnachweise, Stunden) · 📁 Dateien (Dateien,
  Mails dazu) · Belege · Verlauf; gezeigt nur die Karten des Reiters (eine leere Spalte fällt weg), angetippt aufgeklappt; ein Reiter ohne Karte zeigt die „+ …“ seiner leeren
  Listen (`[data-reiterleer]`); gewählter Reiter je Projekt gemerkt (`PROJEKT_REITER_WAHL`, auch nach „+ …“ in „Auf einen Blick“ → Reiter des neuen Eintrags). Ersetzt die
  Sprungleiste (bleibt nur bei weniger als 4 Karten); die Seitenleiste rechts fällt im Projekt weg. Der Kalender steht in Übersicht UND Termine & Material (Inhaber 10.10.2026, `projektReiterHat`).
  Auf der Baustelle schnell (Inhaber 10.10.2026: „von hier einen Arbeitsbericht erstellen – das muss man auf der Baustelle schnell finden“): oben in „Auf einen Blick“
  „📝 Arbeitsbericht erstellen“ (= neuer Arbeitsnachweis, `anEditor`), „📷 Baustellenbuch-Eintrag“, „📁 Pläne und Dateien“ (`projektBaustelleKnoepfe`, lösen die Knöpfe der Karten aus);
  die Karte Arbeitsnachweise steht in Übersicht UND Baustelle.
- PDF-Seitenumbruch (`blattZuPdf`, Inhaber 10.10.2026: „Überschrift der Anlage ganz unten, Daten auf der nächsten Seite“): eine Tabelle, die auf eine
  Seite passt, wird nie geteilt (`ganzeTabellen`); eine längere bricht nur zwischen Datenzeilen, nie gleich nach der Kopfzeile. Gilt für alle Blätter (Protokoll,
  Anlagenbuch, Monatsbericht, Arbeitsnachweis …).
  Anlagen-Tabellen im Protokollblatt (`blattInhalt`) mit `<colgroup>` 34 % wie die übrigen Tabellen (erste Zeile ist ein colspan – bei table-layout:fixed sonst 50/50;
  Inhaber 11.10.2026); Zeile „Rückkühler / Pumpenstation von UKT gewartet“ (Rückkühler: ja/nein · Pumpen: ja/nein).
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
- Synology-Ablage (`synology/ukt_archiv.py`) in der GEWOHNTEN Ordnerstruktur (Inhaber 29.10.2026, abgeglichen mit dem Synology-Download):
  Protokolle `{jahr}/Lidl/Wartungen|Störungen/<Markt>,<JJJJ-MM-TT>,<JW|HJI|HJW>.pdf` (`dateiname`, `termin_kuerzel`), weitere Kunden
  `{jahr}/Wartungen|Störungen/<Kunde>,<Markt>,…`; Lidl-Rapport mit Originalnamen daneben, Lidl-Auftrag nach `…/Störungen/Beauftragungen`
  (`anhaenge_ablegen`, Speicher protokollfotos). Vom Büro verschobene Dateien („n.Quartal abgerechnet“, „ABGERECHNET“) findet `wiederfinden` – nie doppelt.
  Projekte (`projekte_abgleich`): `{jahr}/Lidl/Baustellen/<Markt>` bzw. `{jahr}/Baustellen/<Kunde Ort>`; aus dem Archiv `daten.archiv.ordner`
  (`archiv_ordner`); Dateien mit herkunft „Synology …“ nie zurückschreiben (`schon_auf_synology`); Unterordner = herkunft beim Ordner-Hochladen
  (`datei_unterordner`), sonst nach Art; gleicher Name + Größe = schon da; umbenannt wird nur ein selbst angelegter Ordner (`eigen`).
  Projektmappe (HTML + JSON) je Projektnummer. Angebote und
  Rechnungen (Belege, Büro-Dateien `buero/…`, Beträge) kommen NICHT auf die
  Synology – den Projektordner sehen auch Techniker (Büro 01.10.2026;
  sie gehen NUR in den Büro-Ordner, den nur der Chef sieht: `buero_basis`, `buero_an`,
  `buero_ordner`, gleiche Gliederung; ohne `buero_basis` gar nicht). Das Archivkonto hat
  die Rolle „archiv“ (tools/archiv-rolle.sql): liest wie ein Techniker plus
  Belege und Büro-Dateien, schreibt nirgends (restriktive Regeln). Test:
  `tools/archiv_test.py` läuft in der automatischen Prüfung.
- **App auf der Synology** (Inhaber 29.10.2026 mit Georg: „die App läuft über die Synology, Änderungen trotzdem mit Claude“):
  GitHub bleibt die Quelle, `synology/ukt_app_holen.py` holt alle 5 min die Dateien der App aus dem Hauptordner (`gehoert_zur_app`:
  .html/.js/.json/Bilder, nie daten.js, .md, .sql) in den Web-Ordner – nur Stände mit bestandener Prüfung „App prüfen“, nur Geänderte,
  index.html zuletzt und nie abgeschnitten (`index_ok`). Test tools/app_holen_test.py. Neue Dateien, die die App braucht, gehören
  deshalb in den Hauptordner. tools/pruefen.mjs --browser: seit der Anzeigesperre gilt auch der Anmeldeschirm als gelungener Start
  (scheiterte deshalb seit Mitte Oktober).
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
- **Störungen aus dem Archiv** (Inhaber 27.10.2026: vergangene Störungen von der Synology nachtragen, vor der App; nie als Protokoll in fremdem
  Namen): Marktfeld `stoerungenArchiv` [{datum, problem, techniker, auftrag, rapport, stunden, positionId?, datei?:{pfad,name,typ} im Speicher
  „dokumente“ unter archiv/…, quelle = Synology-Pfad}] (STAMM_FELDER_ST). `historieEintraege` zeigt sie mit Quelle „Archiv“ (antippen → Rapport,
  `dokumentOeffnen`), `wiederkehrBerechnen` zählt sie, wenn `positionId` gesetzt ist. Nur intern – nie Kunde/Fernzugriff (`nurLesen`).
  Vergangene Wartungen kommen dagegen als `nachweise` an die Termin-Zeile (wie „Wartungen laut Prüfbuch“). Test „Störungen aus dem Archiv …“.
  Nachgetragen am 27.10.2026 (von = „Claude (Synology-Archiv)“, je Eintrag `quelle` = Synology-Pfad): 2025 + 2026 bis 24.09. – ab 25.09. gelten die Protokolle der App.
- **Überall suchen** (Inhaber 27.10.2026: „Suchleiste intelligenter … z. B. Plan von dort mit dieser Info im DG oder gewisse vergangene Einsätze“):
  das Suchfeld der Übersichten (`#q`, Fällig/Karte/Anlagen) filtert weiter die Märkte (`filtered`) und zeigt darunter „🔎 Überall gefunden“
  (`suchUeberallHtml` → `suchUeberallTreffer`/`suchUeberallRechnen`, Zwischenspeicher 1,5 s): Kunden, Projekte (Nummer, Titel, Beschreibung, Beteiligte),
  Pläne & Dateien (`dateiMerkmale`/`dateiSuchText` + Geschoss-Wörter `SUCH_GESCHOSS`, auch Bestandspläne der Märkte), Einsätze (`historieEintraege` samt
  Archiv; Datum auch als „03.2025“, „2025“, Monatsname), Anlagen (Typ, Modell, SN, Hersteller), Kontakte, Anleitungen/Unterlagen der Einrichtung.
  Regel: jedes Wort muss im Treffer oder seinem Umfeld (Markt, Projekt) stehen, mindestens eines im Treffer selbst; Wörter ≤ 3 Zeichen nur am Wortanfang;
  Füllwörter (`SUCH_FUELL`) zählen nicht; „Plan/Foto/Störung/Wartung/Kontakt/Anleitung“ (`SUCH_ART`) grenzen die Art ein. buero/-Dateien nur Inhaber,
  Kunden-Konten (`nurLesen`) nur Märkte. Kontakte/Einrichtung werden beim Tippen still nachgeladen (kein Neuzeichnen – Fokus bleibt). Test „Überall suchen …“.
  Seit 29.10.2026 (Inhaber: „deutschlandsberg finde ich nicht mehr – also den Markt“): ganz oben die Gruppe „Märkte“ (= `filtered()`, dieselben wie „n / … Standorte“),
  und bei Projekten zählt der Markt (`suchMarktText`) zum Projekt selbst – P-2026-001 kam vorher mit „Deutschlandsberg“ nicht.
- **Synology-Archiv hochladen** (Inhaber 27.10.2026, Verwaltung → Inhaber, `synologyArchivKarte`): Synology-Ordner wählen (webkitdirectory) → `archivIndex`
  (Weg ab dem Jahresordner, „download at …“ nur wenn die neue Fassung fehlt) → `archivPlan` → `archivHochladen`. Projekte mit `daten.archiv`
  {ordner[], einzeln[], ohne[], nurInhaber[], dateien (Anzahl), preise} – per SQL beim Nachtragen gesetzt. Inhaber: erst „nur das Notwendige“, dann
  „1,5 GB klingt nicht dramatisch – ruhig großzügiger“ → alle Unterlagen der Projekte (`archivPasst`: ohne `ARCHIV_NIE` CAD/HEIC/Video; `ARCHIV_AUSLASSEN`
  Systemdateien/ZIP), nurInhaber-Dateien unter buero/; Rapporte der Archiv-Störungen per Häkchen (vorgewählt, → `stoerungenArchiv[].datei`). Vorher Anzahl + MB.
  Hochladen über `projektDateienHochladen` (Doppel-Prüfung) – nochmals starten schadet nicht. Test „Synology-Archiv hochladen …“.
  Seit 29.10.2026 (Inhaber: „warum kann ich den Bericht in PDF nicht öffnen“) auch die Wartungs-Rapporte: Prüfbuch-Nachweise mit `quelle` „Synology 20xx: …“
  (Hinweis in Klammern dahinter wird abgeschnitten) → `plan.wartungen`, eine Datei je Rapport, an alle Nachweise gehängt (`nachweise[].datei`, `positionenSchreiben`).
  Anlage: Knopf „📄 Rapport ansehen“; Markt-Historie: Quelle „Archiv“, antippen öffnet den Rapport. Test „Synology-Archiv: Wartungs-Rapporte …“.
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
  Dateiart „Preise / Kalkulation“ (`preise`, Inhaber 16.10.2026: Präsentation mit Preisvergleich „unter Projekte ablegen – Preise
  natürlich nur für Inhaber“): wie Angebot/Rechnung unter `buero/`, wählbar nur für den Inhaber, Synology nur Büro-Ordner „Preise“.
  Nachträglich (Inhaber 16.10.2026: „kann die Datei weder ändern, dass sie nur für Inhaber ist, noch löschen – Preise wurden nicht automatisch
  erkannt“): ✎ an der Datei (`dateiBeschreiben`) mit Art, „🔒 Nur für den Inhaber“ (`dateiUmlegen`: kopieren nach buero/ bzw. zurück mit Rückfrage,
  Verweise im Projekt umschreiben `dateiVerweiseErsetzen`, alte Kopie entfernen und prüfen) und „🗑 Datei löschen“ (`dateiLoeschen`, Rückfrage;
  `dateiLoeschenDarf`: buero/ nur Inhaber, sonst Inhaber, Admin oder wer hochgeladen hat). Preise erkennt `projektDateienHochladen` jetzt auch
  in PDFs (`pdfPreisDatei`: Text der ersten 25 Seiten, Zeilen über `pdfZeilen`, Regel wie Mails `mailTextMitPreis`) und am Namen
  („Preis“, „Kalkulation“; `dateiMitPreis`) – seit 16.10.2026 NUR ein Hinweis (Inhaber: „sehr streng … blöd, wenn der Techniker etwas hochladen
  oder ansehen will, das ihn doch auch betrifft – eine Preisangabe ist dort nur eine Randnotiz“): für alle abgelegt und sichtbar, `preisPruefen`
  („💶 enthält Preisangaben“ nur beim Inhaber in der Liste und in seiner Meldung), keine Nachricht, 🔒 nie vorbelegt. Gilt auch für Mails mit Preisen im
  Text (Posteingang, Mail-Programm, Mailverlauf) – vorher lagen sie nur beim Inhaber. Nur für den Inhaber bleibt, was bewusst gewählt ist: Art
  Angebot/Rechnung/Preise, KPlus-Belege und Mails mit Beleg (`mailMitBeleg`), 🔒.
- **Stand als Reiter** (Inhaber 16.10.2026: „die ganzen Infos und Dateien zu Konzept in dem Reiter sehen – auch für die anderen Reiter bei
  Stand“): die Schritt-Chips der Karte „Stand“ sind Reiter (`PROJEKT_STAND_WAHL`, Vorgabe der aktuelle Stand, unterstrichen `.st-aktuell`).
  `projektSchrittInfo` zeigt die ausgefüllten Angaben des Schritts, seine Dateien (Quellen des Schritts + was in diesem Schritt hochgeladen
  wurde), Aufgaben/Termine/Baustellenbuch (`projektSchrittAufgaben`) und „✎ Angaben und Quellen bearbeiten“ (springt in den Reiter Angaben).
  Ein Tipp stellt NICHT mehr um (vorher sofort, ohne Rückfrage) – umgestellt wird mit „Weiter: …“ bzw. „Stand auf … setzen“, mit Tagebuch.
  Schritt einer Datei: neue merken ihn beim Hochladen (`schritt`), ältere über `projektDateiSchritt` (Stand laut Tagebuch „Stand: …“ zur
  Hochladezeit; ohne späteren Wechsel der heutige Stand; vor dem ersten Eintrag keiner). buero/-Dateien nur für Inhaber.
- **Arbeitsnachweise** (Inhaber 06.10.2026, Tabelle `arbeitsnachweise`, SQL-Abschnitt „Arbeitsnachweise“ in tools/rechte-2026-10-05.sql):
  wie das Papierformular (Auftraggeber, Objekt, Zeilen Datum/Monteure/von/bis/Pause/Stunden = Personen × (bis − von − Pause);
  Monteure mit Auswahlliste `#an_namen` aus `bekannteNamen()` + eigenes Konto, Inhaber 14.10.2026 – freier Text wie „4 Mann“ bleibt),
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
  Abrechnen wie ein Einsatz (Inhaber 10.10.2026, nur Inhaber – `anAbrechnungAn`): beim unterschriebenen Nachweis „Rechnung zu diesem Arbeitsnachweis“ (`anAbrechnungZeile`):
  KPlus-Rechnung hochladen (`kplusVorschau` mit `kontextArbeitsnachweis` – Vergleich mit `anRechnungPositionen`, Beleg am Projekt, `kopf.arbeitsnachweise`), Rechnung schreiben
  (Regiestunden + Zuschläge dieses Nachweises, PDF hinten an) oder von Hand vermerken (Tabelle `abrechnung`, Schlüssel „an:<id>“). Abgerechnet (`anAbgerechnet`) = KPlus- oder echte
  Rechnung (nicht TEST, nicht storniert) nennt ihn, oder Vermerk. Offene: Hinweis in der Karte (`[data-an-offen]`) und To-do des Inhabers je Projekt (`anOffenLaden`, `anOffenJe`).
  Lernt wie beim Einsatz (Inhaber 10.10.2026): `anVorschlag` = `anRechnungPositionen` + `vorschlagMitGelerntem` mit pk = {_an:{ids, projekt_id}} – Lernbelege
  (`einsatzLernBelege`) sind KPlus-Rechnungen mit `kopf.lernen.art` „arbeitsnachweis“ zu ANDEREN Nachweisen, im selben Projekt (`lernOrtGleich`, zählt wie „am Markt“) oder beim
  selben Kunden; gilt für „Rechnung schreiben“, den Vergleich beim Hochladen und „⏱ Stunden aus Arbeitsnachweisen“ (`anVorschlagListe`, mehrere Nachweise).
  **Projektrechnung wie Mattighofen 419895** (Inhaber 14.10.2026, „Arbeitsweise verfeinern, System lernt automatisch“): Arbeitsnachweise werden nicht einzeln,
  sondern gesammelt in Teil-/Schlussrechnungen abgerechnet, die Nachweise hängen hinten an der Rechnungs-PDF. Vorschlag (`anRechnungPositionen(liste, kid, {modi, standort})`)
  je Nachweis ein Block wie in KPlus: Textzeile „Leistungszeitraum: … · Arbeitsnachweis Nr. n: <erste Zeile der Arbeiten>“, dann je **Abrechnungsart** (`AN_MODI`, Auswahl je
  Nachweis im Dialog, Vorgabe `anModusVorgabe`: nur Sa/So/Feiertag-Zeilen → „zuschlag“, sonst „regie“ – ANNAHME aus 419895, Nachweise 3/4 „Zuschläge für Samstags-/Sonntagsarbeit“):
  regie = Regiestunden + Zuschläge + Material des Nachweises (`materialListe`/`material`, Katalogpreis sonst Hinweis) + Fahrtpauschale der Zone je Nachweis; zuschlag = nur Zuschläge
  (Arbeit in der Pauschale); pauschale = nichts. Gewählte Arten beim Beleg in `kopf.anModi`. KPlus-PDF am Projekt einlesen (`belegeKarte` → `kplusVorschau` → `kplusVorschauBauen`
  mit den Nachweisen des Projekts): Karte „Arbeitsnachweise zu dieser Rechnung“ – erkannt an den angehängten Nachweisen (`erg.anNummern` aus „Arbeitsnachweis Nr. n“,
  „lt. Arbeitsnachweis Nr.“) und den Leistungszeiträumen je Block (`erg.anDaten` aus „Leistungszeitraum:DD.MM.YYYY“, nicht der Kopfzeile), Abrechnungsart je Nachweis, Vergleich
  „So hätte die App gerechnet (Regie-Teil)“ nur mit dem Regie-Teil (`kplusAnTeil`: ab einer Text-/Gruppenzeile „Leistungszeitraum/Arbeitsnachweis/Rapport/Regiearbeiten“, davor nur
  Regie-/Zuschlag-/Fahrt-Positionen; Angebotspositionen, Menge 0 und Alternativ nie) – sonst lernte die App aus einer Schlussrechnung drei Außengeräte je Nachweis. Ablegen vermerkt die
  angehakten als abgerechnet (`kopf.arbeitsnachweise`). **Text und Preis lernen** (`einsatzErsetzt`, aus `lernen.anders` mit `appSchluessel/kpText/kpEh/kpPreis`): eine App-Position
  bekommt künftig Text/Einheit/Preis der jüngsten KPlus-Rechnung, die sie anders schrieb (Projekt/Markt zuerst, sonst Kunde; Wartungszeilen `einsatz` nicht) – „Regiestunden Facharbeiter
  78,81“ → „Regiestundensatz für Techniker … 106,50“; Vermerk „Text und Preis wie KPlus-Rechnung N“. **Beleg aus Vorlage** (`belegVorlageWaehlen`, Karte „+ aus Vorlage“): Angebot/Rechnung
  eines anderen Projekts (auch KPlus) mit Suche; Positionen und Preise kopiert, Bezüge (Nachweise, Anhänge, Leistungszeitraum, Bestellung, Gelerntes) nicht; `kopf.vorlage` nennt die Quelle.
  `kopf.bestellung` aus dem Betreff ohne „, IAN …“. Test „Projektrechnung aus KPlus wie Mattighofen …“.
- **Mappen zum Versenden** (Inhaber 19.10.2026: „alles in einen Unterordner im Projekt, was wir für die Einreichung der Unterlagen brauchen –
  als ZIP downloaden und an Lidl senden“): `daten.mappen` [{id, name, dateien:[Pfad], angelegt, von}] – nur Verweise auf Projektdateien, nie
  buero/ (`mappeDateien` filtert; die Mappe sehen alle). Kasten „📦 Mappen zum Versenden“ oben in der Dateien-Karte (`mappenKasten`: Anzahl,
  „Inhalt zeigen“, „⬇ Als ZIP“, ✎), „+ Mappe“ → `mappeEditor` (Name, Vorgabe nach Kunde `mappeVorgabeName`: „Unterlagen für Lidl“ bzw. „Unterlagen für <Kunde>“, Inhaber 27.10.2026; Dateien anhaken, ältere Stände gekennzeichnet,
  „alle neuesten anhaken“; entfernen mit Rückfrage – Dateien bleiben). ZIP ohne Bibliothek (`zipErstellen`: ungepackt, CRC-32 `zipCrc`, UTF-8-Namen,
  gleiche Namen „ (2)“), Name `mappeZipName` „<Mappe> – <Ort>.zip“, `mappeHerunterladen` holt die Dateien aus dem Speicher (nicht abrufbare werden
  genannt). Gelöschte Dateien fallen heraus (`dateiVerweiseErsetzen`), umgelegte behalten ihren Platz. Test „Mappe zum Versenden …“.
  **Inhaber-Mappe** (Inhaber 27.10.2026: „wichtig, dass man auch Angebote oder Rechnungen anhängen kann“): nur der Inhaber sieht im Editor zusätzlich 🔒-Dateien
  (buero/, `data-mappebuero`, „alle neuesten“ hakt sie nie an) und „💶 Angebote / Rechnungen (nur Inhaber)“ (`belegeLaden`, `[data-mappebeleg]`). Mit Beleg oder 🔒-Datei
  trägt die Mappe `nurInhaber:true` und `belege:[Beleg-ID]` – nur IDs, nie Beträge; ohne beides wieder Mappe für alle. `mappenSichtbar` blendet sie für alle anderen aus,
  `mappeDateien` lässt buero/ nur dann zu, `mappeBelegIds` nur für den Inhaber. ZIP (`mappeHerunterladen`): Belege hinten über `mappeBelegPdf` – App-Beleg frisch
  (`belegPdfErzeugen`, `belegDateiname`), KPlus-Beleg Original (`belegKplusPfad`: `pdf_pfad` bzw. „<6-stellige Nummer>.pdf“ in den Projektdateien), fehlende werden genannt.
  Synology: `ukt_archiv.py` lässt Inhaber-Mappen aus der Projekt-JSON weg. Test „Inhaber-Mappe …“.
  **Ältere Stände löschen** (Inhaber 19.10.2026: „lösche die alten Fassungen“): aufgeklappte Gruppe → „🗑 ältere Stände löschen (n)“ (`dateiAeltereStaende`:
  je Dateiendung bleibt der neueste, PDF und Word desselben Namens stehen beisammen; nur wenn alle `dateiLoeschenDarf`) → `dateienLoeschen` mit EINER Rückfrage (Namen + Datum),
  Speicher in einem Aufruf, Einträge und Verweise wie `dateiLoeschen`. Test „Ältere Stände löschen …“.
- **Benutzerfreundlichkeit** (Inhaber 28.10.2026, Durchsicht am iPhone/PC): „📚 Unterlagen“ unten (`#unterlagenlink`) und im Störungsschritt
  (`[data-unterlagen]`) → `unterlagenFenster` = `einrichtungDateienKarte(E, true)` nur ansehen (kein Hochladen/✕), alle Mitarbeiter, nie Kunde; im Schritt
  „Arbeiten“ stehen „Alles erledigt, keine Mängel“/„alle auswählen“ oben; Fällig am Handy: „Fälligkeiten nach FM-Region“ zugeklappt, Rundgang-Hinweis als eine
  aufklappbare Zeile (`[data-rgklapp]`).
  Zweite Runde (Inhaber 28.10.2026: „alle vier umsetzen“): Techniker (`startseiteTechniker`) sehen in Fällig zuerst „Heute für dich“
  (`heuteFuerMichKarte(true)` auch leer, `data-techoben` → seite „oben“), Kacheln ohne „Märkte in der Auswahl“, die Wartungsliste gleich nach den
  Störungen; Kalender am Handy ohne gemerkte Wahl als Liste, gewählte Ansicht je Gerät (`ukt_kal_modus`); „👤 Mein Konto“ im ☰ (`[data-kontomenue]`)
  und unten (`#kontolink`) → `kontoFenster`; am Handy im Protokoll die Kontokarte nur bei Startpasswort (`startpasswortNoch`); im geführten Protokoll
  „✓ Kein Material / Keine Mängel / Nichts nachgefüllt / Keine Fotos – weiter“ (`nichtsWeiter`, `[data-nichts]`) nur solange leer – sonst Meldung.
- **Projekte aus dem Archiv** (Inhaber 28.10.2026: „sehr viele vergangene Projekte im Projektreiter – finde die aktuell wichtigen nicht mehr“): `daten.ausArchiv`
  (per SQL bei den aus dem Synology-Archiv nachgetragenen Projekten gesetzt). `projektNurArchiv`: ausArchiv, nicht `daten.aktuell` und kein Tagebuch-Eintrag einer Person
  (Einträge von „Claude …“ und „… Datei(en) hinzugefügt“ zählen nicht). Projektliste: Vorgabe-Chip „Aktuell“ (`projektAktuell` = offen und nicht nur Archiv), Chip
  „Aus dem Archiv“ mit „📌 Ist aktuell“ je Projekt (`[data-praktuell]` → `daten.aktuell`, Tagebuch); mit Suchwort sucht „Aktuell“ in allen Projekten. „Laufende Projekte“
  in Fällig ohne reine Archiv-Projekte. Test „Projekte aus dem Archiv …“.
- **Neuester Stand und Projektliste** (Inhaber 24.10.2026: Chef öffnete am iPad in der Übersicht die alte Fassung; „Projekte attraktiver“;
  „Folgeaufträge nehmen viel Platz weg“): `projektIndex` ordnet gleiche Namen dem NEUESTEN Stand zu (vorher dem zuerst hochgeladenen) – alle
  Verweise über `quelleDatei` (Quellen, „gehört zu“) öffnen so die aktuelle Fassung. Stand-Reiter (`projektSchrittInfo`): je Name nur der neueste
  Stand (auch aus anderem Schritt), mit Datum und „neuester Stand, n ältere im Reiter Dateien“. Projektliste `projektZeile`: Farbstreifen je Phase
  (`projektPhasenFarbe`: Planung --plan, Angebot --warn, Auftrag–Baustelle --good, IBN/Doku --accent, sonst --line), Balken „Schritt n von 11“,
  nächster Termin aus `daten.termine` (`projektNaechsterTermin`), Anzahl Dateien (buero/ nur Inhaber); Typ-Auswahl neben der Suche.
  „Auf einen Blick“: Stand-Kachel mit Fortschritt, leere Kacheln `.pb-leer` gestrichelt/blass. Folgeaufträge-Karte zugeklappt (`details[data-folgeauf]`,
  Kopf mit Anzahl und Märkten, Zustand je Gerät `ukt_folge_auf`), Sprung aus dem Kalender und der Rundgang klappen sie auf (`folgeKarteAuf`).
  Karte „📦 Lidl-Unterlagen“ im Reiter Baustelle. Test „Projekte (Inhaber 24.10.2026) …“.
- **Titelbild und Tafel** (Inhaber 24.10.2026: „ja“ zu beiden Vorschlägen): `projektTitelbild` = `daten.titelbild` (Pfad) – sonst angeheftetes (📌 `wichtig`)
  – sonst neuestes Foto; nie buero/ (`projektBilder`). Vorschaubild statt Original (Supabase-Kontingent): `projektVorschauUrl` holt
  `projektdateien/vorschau/<Pfad ohne Endung>.jpg` (`projektVorschauPfad`), fehlt es, erzeugt `vorschauErzeugen` es einmal (Original laden →
  `vorschauVerkleinern` 480 px JPEG → hochladen, upsert:false; nacheinander über `vorschauKette`, nur `betriebSchreiben()`); Adressen 50 min im Speicher.
  Nicht in `daten.dateien` → die Synology holt es nicht. `projektTitelbildEl` (Platzhalter, ohne Bild weg) in `projektZeile` (links), `projektTafelKarte`
  (oben) und „Auf einen Blick“ (`.pb-mitbild`, Tipp → `projektTitelbildZeigen`, „🖼 Titelbild wählen“ → `projektTitelbildWahl`, „automatisch“ löscht die Wahl;
  Tagebuch „Titelbild: …“). Tafel: Umschalter „☰ Liste / ▦ Tafel“ (`S.prAnsicht`, je Gerät `ukt_pr_ansicht`), `projektTafel` mit Spalten `PROJEKT_TAFEL`
  (Planung, Angebot, Auftrag+Vorbereitung, Baustelle, Abschluss; „Nicht beauftragt“ nur wenn vorhanden), Filter/Suche/Typ gelten; nur Ansicht, kein Ziehen.
  Test „Titelbild und Tafel …“.
- **Lidl-Unterlagen je Filiale** (Inhaber 20.10.2026: „als nächstes bauen wir die Automation ein“ – Umfang alle vier Teile, nur PDF, KAV-Datum IB + 1 Woche,
  nur Inhaber): Karte „📦 Lidl-Unterlagen“ im Projekt nach den Inbetriebnahmeprotokollen (`lidlUnterlagenKarte`; nur `nurInhaber()`, Kunde lidl, Projekt mit Markt) →
  `lidlUnterlagenAssistent`: 1 Prüfliste (`lidlPruefliste`: Markt/Filialnummer, je Anlage Modell/SN/Füllmenge/Kältemittel/IB/Bereiche, Gerätebibliothek, Schall,
  KAV-Vorlage, IBN unterschrieben) –
  **wassergekühlt** (Inhaber 27.10.2026, Auswertung „VRV wassergekühlt Umbau“: beim Lidl-Rollout bleibt die RWEYQ kälteseitig unverändert, neu sind Rückkühler,
  Pumpenstation, Glykolkreis): `lidlWasserProjekt(anl)` schaltet um – eigene Vorgaben in `lidlAngaben` (Bauvorhaben, Allgemein, Weiterverwendung, Schall
  „Rückkühler VRV-Anlage“, Nachtabsenkung über EC-Drehzahl) und Felder `rkTyp`, `medium`, `psOrt`, `psText`, `wrg` (Assistent `[data-lidlwasser]`; leer = entfällt,
  Prüfliste nennt es; Wärmeträger nie raten). TB: Abschnitt „Wasserkreis: Rückkühler und Pumpenstation“ (Daten aus der Gerätebibliothek über `lidlRkGeraet`, auch mit
  Herstellername davor), statt „erste Inbetriebnahme/§ 17“ nur „Wiederinbetriebnahme nach Anschluss an den neuen Wasserkreis“. Schema `lidlSchemaWasserSvg`
  (Außenbereich Rückkühler – Technikraum Pumpenstation + Sammelleitungen warm/gekühlt + RWEYQ – Filiale Innengeräte; hängt laminiert im Technikraum, Abnahme
  Robinigstraße). KAV: „Schallwerte des Rückkühlers“. Datenblatt des Rückkühlers in Beilagen/`lidlDatenblaetterHolen`. Test „Lidl-Unterlagen wassergekühlt …“
  (`VORSCHAU=<Ordner>` schreibt tb.html/schema.svg/kav.html zum Ansehen) –
  2 Angaben `daten.lidlUnterlagen` (`lidlAngaben` belegt vor: Datum = `ibDatum` bzw. früheste Anlagen-IB + 7, Betreiber/Planer aus `beteiligte` nach Rolle,
  Bereiche aus den Räumen der Innengeräte, Texte wie Graz/Oberwart; alles änderbar; beim Ablegen immer mitgespeichert) – 3 Unterlagen `lidlErzeugen`:
  TB `lidlTbHtml` (A4, `blattZuPdf` mit neuen Schaltern `ohneWasserzeichen`/`ohneSeitenzahl`; Spalten ohne einen einzigen Wert entfallen, nie „fehlt“;
  Beilagen `lidlBeilagen`; „Die Prüf- und Anlagenbücher (n Anlagen) liegen im Original in der Filiale auf.“), Schema `lidlSchemaSvg` → `lidlSchemaPdf`
  (SVG → Zeichenfläche → jsPDF A3 quer; Zentralsteuerung aus `fernSystem` des Markts), KAV `lidlKavHtml` (wie Deutschlandsberg; ohne Verantwortlichen/Verfasser
  wird keine erzeugt). Bescheid und Schallgutachten (Inhaber 28.10.2026, Amstetten: Lidl verlangt die Bescheidnummer; Vorbild KAV Mattighofen): Felder `bescheidZahl`,
  `bescheidBehoerde`, `gutachtenVon`/`gutachtenDatum`, `messberichtVon`/`messberichtDatum`/`messungDatum` (Kasten `[data-lidlbescheid]`) → unter dem Titel „Zahl: …, BH …“
  (ohne Zahl „wird nachgereicht“), Gutachten-/Messbericht-Zeile, „-Die Auflagen gemäß o.g. Bescheid der … werden erfüllt.“ (Magistrat: „des Magistrats …“), Schall-Einleitung
  „Die Einhaltung des höchstzulässigen Schallleistungspegels … gemäß Schallschutz-Gutachten … wird wie folgt eingehalten:“; alles leer = wie bisher. Fehlt die Zahl,
  meldet es die Prüfliste (nur Hinweis, die KAV entsteht trotzdem). Echte Bescheidnummern nur in Supabase. Art: TB dokument, Schema plan, KAV protokoll. „Datenblätter aus der Bibliothek“ (`lidlDatenblaetterHolen`, Doppelte erkennt das Hochladen),
  „Inbetriebnahmeprotokoll nach letzter Vorlage“ (`ibnLetzteVorlage` = zuletzt unterschriebenes, anderes Projekt zuerst; `ibnAusVorlage`: Checkliste, Übergabe,
  Unternehmenszertifikat, je Anlage Regelung der Anlage gleichen Modells, Werksfüllung nur bei gleichem Modell; SN/Füllmenge aus den Anlagen, Messwerte nie) →
  `ibnEditor(p, null, fertig, {vorlage, datum})`, gespeichert und unterschrieben erst dort. 4 „Mappe füllen …“: `lidlMappeVorschlag` (neuester Stand von TB,
  Schema, KAV, Bestandsplan; abgelegte unterschriebene IBN-PDFs; Datenblätter der Bibliothek) → `mappeEditor(p, m, fertig, vorschlag)` vorab angehakt.
  **Keine Personendaten im Code**: Verantwortlicher, Zertifikate, Verfasser, QR-Code, Fußzeilen-Logos und die Gerätebibliothek (Muster = Modellanfang, längstes
  gewinnt `lidlGeraet`; Werte „Bezeichnung: Wert“ `lidlWerte`; Datenblatt in `dokumente/datenblaetter/`) stehen in `einstellungen` „lidl_vorlage“ (`lidlVorlageLaden`,
  ändern nur Inhaber laut Regel), Editor `lidlVorlageEditor`. Test „Lidl-Unterlagen …“.
  Schema-Texte passen immer (Inhaber 28.10.2026, Amstetten: 5 Anlagen mit langen Namen – Titel liefen über den Kasten, der letzte Kasten verdeckte die Fußzeilen):
  `lidlTextBreite` misst wie gezeichnet (Arial), `lidlPassend` verkleinert bzw. kürzt mit „…“, `lidlTitelPassend` nimmt sonst den Teil vor „ – “ (die Bereiche stehen beim
  Innengerät), `lidlUmbrechen` bricht den Aufstellort um (höchstens 3 Zeilen); `schritt` = min(152, ⌊(812 − (Zeilen−1)·18 − 14 − 205)/n⌋) – die Kästen enden über den
  Fußzeilen, niedrige Kästen mit kleinerer Schrift; wassergekühlt ebenso (Zeilen rücken im niedrigen Kasten zusammen, Aufstellort links der Steuerleitung). Projekttyp
  „Neubau“/„Neuanlage“ (`daten.typ`): Vorgaben ohne Demontage und Weiterverwendung, kein ConveniPack-Text. Test „Lidl-Unterlagen: Schema mit 5 Anlagen …“ (prüft die Lage
  jedes Texts wie gezeichnet; `VORSCHAU=<Ordner>` → schema.svg, schema-wasser.svg, tb.html).
- **Protokoll-Namen und Downloads** (Inhaber 19.10.2026): Dateiname `Inbetriebnahmeprotokoll_<Ort>_<n>-Anlagen_<TT-MM-JJJJ>.pdf` bzw.
  `Arbeitsnachweis_<Ort>_<TT-MM-JJJJ>.pdf` (`projektOrtFuerDatei`: Ort des Standorts, sonst Projektnummer) – ohne Projektnummer, „Nr“, „Korrektur“;
  eine Korrektur heißt gleich und steht als neuerer Stand da. Im IBN-PDF keine Protokollnr./Projektnummer in der Kopfzeile und kein
  Kleingedrucktes (Korrekturvermerk) – nur „ENTWURF – nicht unterschrieben“ bleibt. „Nachtabsenkung / Flüsterbetrieb (Schall)“ heißt im PDF so
  wie im Formular. Herunterladen unter dem lesbaren Namen: `speicherDownloadUrl` hängt ?download=<Name> an signierte Speicher-Links.
  Fotos ebenso (Inhaber 29.10.2026: „warum kann ich die Fotos nicht herunterladen?“): `bildAnsicht` hat unten „Herunterladen“ (Daten-Bilder als Blob, ohne Endung im Titel → .jpg).
  Bildschirmfotos (Inhaber 29.10.2026: „Qualität der Screenshots zu gering, dass man die Texte lesen kann“): `fotoIstBildschirm` (Name „Screenshot/Bildschirmfoto…“ oder PNG)
  → `verkleinere` bis `FOTO_KANTE_BILDSCHIRM` 2000 px / `FOTO_BUDGET_BILDSCHIRM` 450 KB, Qualität ab 0,88; im PDF (`fotosEinsetzen`, `anFotosHtml`) `figure.breit` über die ganze Breite statt zu dritt.
  Test „Fotos: Bildansicht mit „Herunterladen“ …“.
- **Inbetriebnahmeprotokoll Kälteanlage** (Inhaber 12.10.2026, Tabelle `inbetriebnahmen`, tools/inbetriebnahmen.sql – gleiche Regeln und Trigger wie die
  Arbeitsnachweise; im SQL-Editor ohne Konto bleiben mitgegebene `erstellt_von`/`monteur` stehen, damit das Büro einem Monteur einen Entwurf anlegen kann):
  nach dem Muster „Inbetriebnahmeprotokoll Kälteanlage“ (KlimaCraft), mit den Anmerkungen des Inhabers auf der Vorlage. „Auftrag“ = Bestell-/Auftragsnummer des
  Kunden wie auf der Rechnung (`daten.auftragNr` des Projekts; Inhaber 12.10.2026: nie unsere Projektnummer). F-Gase-Zertifikate wie im Wartungsprotokoll
  (Inhaber 12.10.2026: „ist ja bereits in unserer App gespeichert“): `zertUnternehmen` ← `ibnZertUnternehmen` (Gerät `ukt_zertu`, sonst letztes Protokoll; beim
  Speichern wieder gemerkt), `zertPerson` ← `ibnZertPerson(monteur)` („Meine Angaben“ `zertp` beim eigenen Konto, sonst Protokolle der Person); leere Felder werden
  auch bei bestehenden Protokollen vorbelegt. EIN Protokoll für eine oder
  MEHRERE Anlagen (Inhaber 12.10.2026: „mehrere Anlagen auf einmal“): gemeinsam Betreiber/Standort/Auftrag/Datum/Zertifikat, Checkliste, Übergabe, Abnahme,
  Unterschrift; je Anlage `daten.anlagen[]` (`IBN_ANL_FELDER`: Typenschild, Kältemittel, Messwerte, Regelung; `anlage_id` = erste Anlage). Ältere Zeilen mit
  flachen Feldern liest `ibnAnlagen`/`ibnNormieren` gleich. Karte „Inbetriebnahmeprotokolle“
  im Projekt (Reiter Baustelle; Schnellknopf „🧾 Inbetriebnahmeprotokoll“ in „Auf einen Blick“, `projektBaustelleKnoepfe`) → `ibnKarte` → `ibnEditor`
  (geführt, Eingaben auf dem Gerät gemerkt): Anlagen anhaken (Anlagen des Markts, dem Projekt zugeordnete zuerst; `ibnAnlageVorbelegen` übernimmt aus `anlageDaten`
  Hersteller, Modell, Seriennummer, Innengeräte, Kältemittel, GWP, Gesamtfüllmenge – nichts wird geraten; „+ Anlage ohne Liste“; abhaken mit Rückfrage, wenn schon
  Messwerte da sind) → Anlage und Betreiber (`IBN_KOPF` gemeinsam, `IBN_ANL` je Anlage) → Kältemittel und Elektrik (`IBN_KM` je Anlage; Gesamtfüllmenge `ibnGesamtKg` =
  eingetragen, sonst werkseitig + Nachfüllung; CO₂e `ibnCo2` mit GWP aus `gwpVon`; Gesamtfüllmenge/CO₂e in PDF, Übersicht und „An der Anlage eintragen“ nur, wenn
  gesamt oder Nachfüllung eingetragen ist – `ibnGesamtKgFest`, Inhaber 19.10.2026 Linz: nur werkseitig bekannt → im PDF nur „Füllmenge werkseitig“; abschließen geht damit) → Messwerte (`IBN_MESS` je Anlage). In den Anlage-Schritten schaltet bei mehreren
  Anlagen eine Chip-Zeile um (`[data-ibn-anlwahl]`, ✓ = schon eingetragen, `anlageHat`; Hinweis „n Anlagen noch ohne Angaben“ `[data-ibn-fehlen]`; Felder der gewählten
  Anlage `data-ak`/`data-at`, gemeinsame `data-k`/`data-t`) → Checkliste (`IBN_CHECK`, gilt für alle Anlagen: Mechanik/Kältekreis und Elektrik/Regelung/Sicherheit mit
  i. O./Mangel/n. z. `IBN_BEFUND`, Dokumentation mit erl./offen/n. z. `IBN_STAND`; „Alle auf …“ je Gruppe; Bemerkung erst bei Abweichung sichtbar; bei „Regelung
  parametriert“ je Anlage die Felder `anlage.regelung` – Sollwert Kühlen/Heizen, Betriebsart, Nachtabsenkung ja/nein von–bis, seit 14.10.2026
  (Inhaber, Mattighofen) auch Automatikbetrieb: Temperaturbereich Heizen/Kühlen min–max und Umschaltpunkte „auf Kühlen bei“/„auf Heizen bei“
  (`heizMin/heizMax/kuehlMin/kuehlMax/aufKuehlenBei/aufHeizenBei`, `[data-rgauto]`), `ibnRegelungText` → „Automatik: Heizen 18–25 °C, …“) → Übergabe.
  PDF (`ibnBlattHtml`, Inhaber 14.10.2026): nicht ausgefüllte Zeilen entfallen (`zt` liefert "" statt „–“; Messwerte nur die erfassten,
  `messwerteHtml`, ohne Messwert kein Abschnitt); nur „Betreiber (Vertreter)“ bleibt leer stehen (`ztImmer`, zum Handschreiben)
  (`IBN_UEBERGABE`: Einweisung, Betreiberpflichten (EU) 2024/573, Prüfintervall, Prüfbuch; Mängel/Restarbeiten/Abnahme NICHT hier, sondern „siehe Abnahmeprotokoll
  des Auftraggebers“ – nur `abnahmeVerweis` + Datum) → Abschluss (Unterschrift des Monteurs unter dem eigenen Konto; Betreiber unterschreibt auf dem Ausdruck; je
  Anlage Haken „An der Anlage eintragen“: Inbetriebnahme-Datum und fehlende Füllmenge über EIN `positionenSchreiben` nach dem Unterschreiben –
  `daten.anlageNachtragen[anlageId]` wird nicht gespeichert). `ibnFehlt`: Datum, je Anlage Anlagentyp oder Modell, Kältemittel, Füllmenge; Unterschrift.
  PDF `ibnBlattHtml` (Betreiber – je Anlage Block Typenschild/Kältemittel/Messwerte/Regelung, bei mehreren „Anlage n von m“ – Checkliste – Übergabe –
  Abnahme/Unterschriften)/`ibnPdfAblegen` als Projektdatei Art „protokoll“ (`Inbetriebnahmeprotokoll_<Nr>_<Anlage|n-Anlagen>_…pdf`).
  Unterschrieben mit PDF: „PDF neu erzeugen“ (Blatt frisch gezeichnet, Inhalt bleibt; alter Stand bleibt als Projektdatei; Inhaber 12.10.2026).
  Schritt „Fotos“ (Inhaber 12.10.2026) wie „Rapporte und Fotos“ im Arbeitsnachweis: wählen / aus den Projektdateien / einfügen → sofort Projektdatei (Foto bzw.
  Protokoll), am Protokoll `daten.anhaenge` [{pfad, name, typ, notiz}]; Fotos verkleinert, im Blatt `anFotosHtml` (eingebettet in `ibnPdfErzeugen`), PDFs hinten
  über `anhaengeAnPdf`; Entfernen nimmt nur den Verweis.
  Wasserkreis (Inhaber 28.10.2026): je Anlage `wasser` (`IBN_WASSER`: Wärmeträger, Glykolanteil, Frostschutz, Druck, Wassertemperaturen, Durchfluss, Strömungswächter,
  Pumpe) im Schritt Messwerte – gezeigt bei wassergekühlter Anlage (`ibnWasserZeigen` → `lidlWassergekuehlt`) oder wenn schon etwas eingetragen ist, sonst Knopf
  „+ Wasserkreis erfassen“; nichts vorbelegt. Im PDF Abschnitt „Wasserkreis“ nur mit Werten (`wasserHtml`). Pumpenstation im Lidl-Assistenten: UKT-Standard Einzelpumpe.
  Präsentation nur im Speicher (`IBN_DEMO`). Test „Inbetriebnahmeprotokoll: …“ (zwei Anlagen); Attrappe behandelt `inbetriebnahmen` wie `arbeitsnachweise`.
- **Arbeitszeiten** (Tabelle `arbeitszeiten`): jede Person sieht nur ihre
  eigenen, der Inhaber alle; ein bestätigter Monat ist gesperrt – auch für NEUE Einträge (von Hand, Stempeln,
  Abgleich): bestätigt = die Person hat dort einen Eintrag mit `bestaetigt`; nur der Inhaber trägt danach ein oder
  öffnet ihn wieder („Wieder öffnen“ in `zeitenInhaberKarte`; ist die Person noch eingestempelt, warnt „Bestätigen“ vorher). App: `monatGesperrt`, Meldung `MONAT_GESPERRT`;
  Datenbank: Trigger `arbeitszeiten_monat_gesperrt` (gilt auch für stempeln()/stempel_abgleich(), nicht für die
  Kalender-Übernahme – die hat ihre eigene Regel), tools/rechte-2026-10-05.sql (Inhaber 05.10.2026).
- **Stempeluhr** (Tabelle `stempel`, Funktion `stempeln()`, tools/stempeluhr.sql):
  Zeit vom Server, Eintrag beim Ausstempeln vom Server berechnet (Quelle
  „stempel“); nachträglich geändert = „stempel_geaendert“. Standort nur, wenn
  der Inhaber ihn eingeschaltet hat (`einstellungen.stempel_standort.an`), als Entfernung.
  **Position „wie bei Crewmeister“** (Seniorchef, Inhaber 14.10.2026, tools/stempeluhr-5.sql): Koordinaten des Stempelmoments
  NUR wenn der Inhaber zusätzlich `position` eingeschaltet hat UND die Person in der App zugestimmt hat (Tabelle
  `stempel_zustimmung`, Dialog `stempelZustimmungFragen` vor dem ersten Stempeln, Widerruf in der Stempeluhr bzw. beim Inhaber);
  der Server (`stempeln()`) prüft das selbst und entfernt lat/lon sonst still. Position nur im Stempel (Person + Inhaber:
  🗺 Karte `ortKarteZeigen`, Inhaber „Stempelungen heute“ `stempelHeuteKarte`), NIE in den Arbeitszeiten/Lohn/Listen
  (`ort_ohne_position`), nach `tage` (Vorgabe 90) vom Server gelöscht (`stempel_position_bereinigen`). Keine Verfolgung
  zwischen den Stempelungen. Diese Grenzen nie lockern; ohne Zustimmung bleibt es bei der Entfernung.
  Umstempeln (art „wechsel“, tools/stempeluhr-2.sql): je Abschnitt ein Eintrag
  mit Bereich; überschneidende Einträge von Hand ersetzt nur die Funktion
  `stempeln()` (p_ersetzen), sonst bleiben beide und sind mit ⚠ markiert.
  Stempeln geht nie verloren, ohne dass man es merkt (Inhaber 08.10.2026: „eingestempelt, kam nicht an – vielleicht zu schnell die App geschlossen“):
  Standort wartet höchstens `STEMPEL_ORT_MS` (8 s), sonst ohne Position; Knopf „⏳ wird gestempelt …“ + Hinweis „App offen lassen“; der Druck wird
  vor dem Senden auf dem Gerät gemerkt (`ukt_stempel_offen`, erst nach der Server-Antwort gelöscht) – fehlt er danach im Stempelverlauf
  (`stempelNichtAngekommen`), zeigt die Stempeluhr „⚠ … ist nicht angekommen“ (`[data-stempelnichtan]`), der Reiter Stunden ⚠, einmal ein Hinweis.
  Nie still nachstempeln – die Zeit kommt vom Server.
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
  Vor dem Bestätigen: `monatLuecken` (Tage ohne Eintrag, Abwesenheit ohne Stunden) mit „Nachricht an …“. Büro 03.10.2026.
  Geplante Termine ohne Eintrag werden dort NICHT mehr gemeldet (Inhaber 13.10.2026: Planung ist nicht streng, meist kommt
  Dringenderes dazwischen; der Vergleich gehört nicht in die Stundenabrechnung).
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
  beim Tag „⇆ Tag prüfen“ (`tagPruefenOffen`), bis geprüft oder Monat bestätigt.
  Aus dem Erledigten (Inhaber 09.10.2026: „anhand der geschriebenen Protokolle … Zeit aus dem Rapportzettel, dazwischen Fahrzeit“): `einsaetzeFuerMich` – eigene
  Protokolle des Tages (selbst geschrieben oder als Techniker/Weitere/r Techniker/in eingetragen), je Markt ein Einsatz, Zeit aus dem Rapport, sonst Ankunft–Fertig,
  sonst geschätzt (Uhrzeit = fertig, Dauer `arbeitStunden`); `anEinsaetzeFuerMich` – eigene Arbeitsnachweis-Zeilen (nachgeladen). Sie stehen oben als „✓ erledigt“,
  ersetzen einen Kalendertermin (Wartung/Störung) am selben Markt; neben einem Einsatz ist die Lücke Fahrt ohne 150-min-Grenze (`abgleichTeile`, `einsatzNah`).
  **Fahrt nur so lang wie die Fahrt** (Inhaber 14.10.2026: „Büro, dann Saalfelden – der ganze Tag wurde Fahrzeit; Fahrzeit anhand der Navigationsdaten wie in der
  Tourenplanung“): `rueckblickFahrt(tag)` – von wo (Markt des Termins, sonst Position beim Stempeln `STEMPEL[].ort.lat`, sonst gestempelter Markt, sonst BETRIEB) nach wo,
  Minuten aus `FAHR_CACHE` (OSRM, `fahrtenGenau` nachgeladen → neu vorschlagen, solange nichts von Hand geändert) sonst `fahrtSchaetzMin`; eingetragen auf 5 min
  aufgerundet + 5. Vor einem Termin liegt die Fahrt am Ende der Lücke, nach dem letzten am Anfang, der Rest wie gestempelt; Lücke kaum länger als die Fahrt → ganz Fahrt.
  Tests blocken die Routendienste (`oeffnen`: `ROUTENDIENSTE` abgebrochen) – Erwartungen aus der Luftlinie. Die genaue Kosten-Nutzen-Rechnung kommt später (Meetings mit dem Chef).
  **Betriebsstandorte** (Inhaber 15.10.2026: „Büro Salzburg“ – die App kannte nur den Betrieb St. Johann): `einstellungen` „betriebsstandorte“ {liste:[{id „bs:…“, name,
  adresse, lat, lon}]}, nie im Code; Inhaber-Karte in Stunden `betriebsstandorteKarte` (Name + Adresse → „Kartenpunkt suchen“ über Nominatim → Speichern, entfernen mit Rückfrage),
  geladen in `stempelNachladen` → `BETRIEBE_WEITERE`, `alleBetriebe`, `betriebVonId`, `ortAnzeige`. Wirkt beim Stempeln „Wo?“ (`ortOptionenHtml` Gruppe „Betriebsstandorte“, standort_id „bs:…“,
  `stempelOrt` → status „im_betrieb“ + `ort.betrieb` Name, `ortKurz` „im Betrieb – Büro Salzburg“), im Tagesrückblick (`rueckblickFahrt.ortVonId`, Anzeige `abschnittText`/`ortAnzeige`)
  und in der Tourenplanung (Start/Ziel-Auswahl, `tourZielPunkt`, Start in `tourRechnen`). Test „Betriebsstandorte: Inhaber legt ein Büro an …“ (Nominatim im Test gestellt). Umstempeln mit Vorgabe aus dem Termin (`geplantFuerMich`, „⇄ Dorthin umstempeln“).
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
- **Fotos in der Lidl-Auftragsmail** (Lidl 14.10.2026, Auftrag 624744474 Fil. AT0334 – WhatsApp-Bilder kamen nicht in die
  Störung): Bilder derselben Mail (`nachricht_id`) wie ein Auftrag bekommen im Skript die Art „auftrag“ (`eintraege`) und in
  der App keine eigene Karte – sie stehen beim Auftrag (`fotosZu`) und kommen mit „Als Störungsauftrag erfassen“ als Fotos in
  die Störung (`#st_foto`, `fotoNehmen` nimmt mehrere; `posteingangOffen.weitere` → alle Einträge erledigt). Ist die PDF schon
  erfasst, zeigt `posteingangFotoBox` „Fotos zu einem Lidl-Auftrag“ mit „Fotos zur Störung hinzufügen“
  (`posteingangFotosZurStoerung`: erst `stoerungSchwerLaden`, das merkt den vollen Stand auch in `stammStand` – sonst Konflikt
  „seiten“). Eine danach eingelesene PDF ersetzt vorhandene Fotos nicht mehr (`o.fotoSeiten`).
- **Posteingang → Projekt** (Büro 02.10.2026): weitergeleitete Mails (nicht Lidl-Auftrag/Rapport)
  kommen mit `.eml` (art „mail“, `eintraege` in synology/ukt_posteingang.py, Test
  tools/posteingang_test.py); in der App eine Karte je Mail (`posteingangMailBox`), „Zu Projekt
  legen“ (`posteingangZuProjekt`, Vorschlag `posteingangProjektPunkte`) – erledigt erst, wenn alle
  Dateien hochgeladen sind. Angebot/Rechnung als Art nur für den Inhaber. KPlus-PDFs (6-stellig, `kplusDateiname`; Tiefentest
  05.10.2026): beim Inhaber als Angebot/Rechnung erkannt (buero/), andere legen sie und die Mail dazu nicht ab (bleiben im
  Posteingang). Eine Mail mit Angebot/Rechnung (`mailMitBeleg`) liegt auch als .eml nur unter buero/ – ebenso aus dem Mail-Programm.
  Eine Mail mit Preisen im TEXT (Betrag mit €/EUR, `mailTextMitPreis`, `emlText` liest die .eml): seit 16.10.2026 für alle abgelegt, nur mit
  Hinweis „💶 enthält Preisangaben“ (Inhaber: „nur eine Randnotiz“; vorher 05.10.2026 nur beim Inhaber unter buero/) – geprüft in
  `projektDateienHochladen`, gilt so für Posteingang, Mail-Programm, Mailverlauf und Dateien-Karte.
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
  **Tour speichern und Kalender nachziehen** (Inhaber 27.10.2026: „kann ich mir eine Tour abspeichern? … werden spätere Änderungen auch im
  Kalender übernommen? … die Montags-Aufgaben gleich am Samstag – Lidl hat nur bis 18 Uhr offen“): Tabelle `touren` mit an = von = ich und
  `daten.gespeichert` (Insert-Regel für Nicht-Büro: tools/touren-speichern.sql), `daten.kal` = {ab, start, samstag, titel, wer, werNamen, tage,
  termine:[{s, id, neu}], touren:[Zeilen der anderen]} – jede Tour, die in den Kalender geht, wird gespeichert (`tourSpeichernDb`); ohne Kalender
  „💾 Tour speichern“ (`tourSpeichern`). Liste „💾 Gespeicherte Touren“ (`tourenGespeichertKarte`, auf jedem Gerät), Öffnen = `tourOeffnen(t, true)`
  (Fälligkeit/Fahrzeit neu gerechnet). Steht sie im Kalender: statt erneut eintragen „📅 Kalender anpassen“ (`tourKalenderDialog`,
  `tourAbgleichPlan`, `tourAbgleichAusfuehren`): Datum je Tour-Tag (Vorgabe = Tag, an dem seine Märkte stehen), Vorschau verschoben/neu/
  nicht mehr in der Tour; entfernt werden NUR von der Tour angelegte Termine (Häkchen + Rückfrage, Störung verliert „Einsatz geplant am“),
  erledigte und vorhandene Einträge bleiben; Tour der anderen nachgezogen + Nachricht. Gemeinsamer Zeitplan `tourZeitplan` (auch `tourInKalender`).
  Samstag nur mit „Samstag mitnehmen“ (`werktagAb(t, samstag)`); Lidl-Märkte müssen samstags bis `LIDL_SAMSTAG_BIS` (18:00) fertig sein –
  sonst gesperrt mit Meldung. Test „Tour speichern (Inhaber 27.10.2026) …“.
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
  Arbeitszeit je Tag Standard 10 h, „Tage im Einsatz“ (Inhaber 08.10.2026; `S.tour.maxTage`, 0 = so viele wie nötig; beides auf dem Gerät gemerkt, `ukt_tour_einst`):
  `planeTour({maxTage})` lässt so lange den am wenigsten dringenden Markt weg (keine Störung/Lidl-Rückfrage, nicht überfällig, spätester Termin), bis die
  Arbeitstage passen, und rechnet die Route neu; genannt in `[data-weggelassen]`. Eine geschickte Tour (`S.tour.fest`) wird nie gekürzt.
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
  Inbetriebnahme nach erster Wartung, zwei Märkte an einer Adresse (nur ohne bzw. gleiche Filialnummer), Lidl ohne Filialnummer,
  Kartenpunkt nur grob (Inhaber 12.10.2026: Genauigkeit ort/strasse/keine; „manuell“ gilt wie „adresse“ – auch in `datenpflegePunkte`),
  Prüfhinweis am Markt (`pruefHinweis` in `STAMM_FELDER_ST`, Markt-Editor `#a_pruefHinweis`; erscheint als Fund-Art „Kartenpunkt“, bis das Büro ihn leert);
  „passt so“ bzw. „als Frage weitergegeben“ als Merker `altliste:<Schlüssel>`. Kartenpunkte am 12.10.2026 gegen OpenStreetMap (Lidl-Markt-Punkte)
  abgeglichen und als Markt-Überschreibung (lat/lon → „manuell“) in Supabase gesetzt – nie ins Repository.
  **Verlässliche Adressquelle für Lidl-Märkte** (Inhaber 12.10.2026, „für alle Märkte“): die lidl.at-Filialsuche. Sitemap
  `https://www.lidl.at/s/de-AT/filialsuche/sitemap.xml` listet alle Filialseiten; jede Seite trägt schema.org-Daten
  (`GroceryStore` mit `address` und `geo`). Damit wurden alle Lidl-Märkte abgeglichen: 113 stimmten, 21 Adressen (Hausnummer/
  Schreibweise/PLZ) und 27 Kartenpunkte als Überschreibung korrigiert, offene Fälle als `pruefHinweis` (Fil. 272 Triester Str.,
  Fil. 515 Stiftgasse nicht mehr gelistet, Fil. 349 PLZ 5020/5026). Fil. 272 = Triester Straße 256 (Inhaber 13.10.2026).
- **Rollenprüfung und Zugangsdaten** (Inhaber 14.10.2026: Fernzugriff verschwand nach dem Neuladen aus dem Markt-Editor –
  die Daten waren in der Datenbank unversehrt): scheitert oder hängt `adminPruefen` (10 s), galt die Rolle nur als „gemerkt“ und
  die App lud die Sicht ohne Zugangsdaten (`stammdaten_lesen`), ohne Hinweis. Jetzt: `Rolle.bestaetigt` (in dieser Sitzung vom
  Server bestätigt, je Konto) – eine spätere Störung stuft nicht mehr zurück (die Datenbank erzwingt die Rechte ohnehin); beim
  Start mit nur gemerkter Rolle bleibt es beim Ausblenden, aber mit Toast („… bis zur nächsten Prüfung ausgeblendet, in 15 s
  erneut“) und Toast, wenn die Prüfung danach gelingt. Attrappe: `window.__rollenFehler` lässt die Rollenabfrage scheitern.
  OpenStreetMap-PLZ waren zweimal falsch (9710 statt 9711, 4030 statt 4020) – bei Widerspruch gilt lidl.at.
  Lehre Fil. 238 (Inhaber 13.10.2026): Tippfehler in der Liste („Jacksch“ statt „Jaksch“) ließen den Abgleich den nächsten
  fremden Lidl nehmen – bei „nahe, andere Straße“ nie automatisch den Nachbarmarkt übernehmen, sondern die Adresse mit Tippfehler-
  Toleranz suchen oder nachfragen.
- **Auslastung** (`auslastungRechnen`, Kalender, nur Büro): Wartungen der nächsten 12 Monate (gelernte Arbeitszeit, Fahrt als
  Rundfahrt je FM-Region, Störungen im Schnitt) gegen Sollzeit ohne Urlaub/Krank/Feiertag der gewählten Personen; Schätzung.
- **Sicherung** (tools/sicherung.sql, nur Inhaber): wöchentlich beim Öffnen der App Datenbestand gepackt in den privaten
  Bereich `sicherungen` (datenbank/JJJJ-MM-TT.json.gz), am PC auch neue Dateien (dateien/<Bereich>/…); Erinnerung in Fällig zum
  Herunterladen (Kopie außerhalb von Supabase). Stand im Merker `sicherung`. Die Synology holt den Bereich einmal am Tag in den
  Büro-Ordner (`sicherungen_abgleich` in synology/ukt_archiv.py, `<buero_basis>/Sicherung`, Archivkonto liest per tools/sicherung.sql; Inhaber
  29.10.2026). Neue Tabellen/Speicherbereiche in `SICHER_TABELLEN`/`SICHER_BEREICHE` nachtragen (fehlten bis 29.10.: Arbeitsnachweise, IBN, Reisekosten,
  Werkzeug, Bedarf, interne Hinweise, Dokumente …); Push-Abos/-Schlüssel bewusst nicht.
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
  Händler suchen (Inhaber 08.10.2026: „bei Wo den Händler eingeben, z. B. Reiss Kältetechnik Traun – Adresse im Internet suchen, gleich in die Kontakte“):
  „🔎 Händler suchen“ unter „Wo abholen / bei wem bestellen?“ (`haendlerSuchen`): erst Adressbuch, dann OpenStreetMap (Nominatim, nur auf Knopfdruck),
  sonst „✦ Mit KI im Internet suchen“ (ki-frage `weg:"haendler"`, Websuche, Antwort als JSON, zählt als Frage in ki_nutzung) – Auswahl → Feld „Name, Ort“ +
  Kontakt „Lieferant / Großhandel“ (`kontaktErfassen`, nur Leeres ergänzt); Händler aus den Kontakten stehen in der Vorschlagsliste (`haendlerAusKontakten`). Nie ohne Auswahl anlegen.
  Selbst gefunden (Inhaber 08.10.2026: „am besten ohne KI“): „✍ selbst gefunden – Adresse eintragen“ → `kontaktEditor(…, {einfuegen:true})` mit „📋 Aus dem Internet einfügen“:
  `kontaktAusText` verteilt eingefügten Text (Google Maps, Impressum) nach Mustern auf Firma/Adresse/Telefon/Mail, Webadresse in die Notiz – nur leere Felder.
  Google-Maps-Link (Inhaber 08.10.2026: „nicht so praktisch“): in Google Maps „Teilen“, Link ins Feld „Wo abholen“ (oder ins Einfügefeld) → `mapsLinkAufloesen`:
  Kurzlink löst ki-frage `weg:"link"` auf (nur Google-Adressen, keine KI, kein Limit), `mapsLinkLesen` liest Name + Anschrift aus „q=…“ bzw. „/maps/place/…“.
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
  **Erkennen, Einteilung, MwSt** (Inhaber 27.10.2026, tools/reisekosten-2.sql – am 27.10. ausgeführt): Beleg wählen → `akBelegErkennen`: PDF mit Text liest
  die App selbst (`akBelegAusText`: Datum, Summe nur aus „Summe/Gesamt/zu zahlen …“-Zeilen – nie der größte Betrag, MwSt je Satz passend zum Betrag,
  Händler, Einteilung über `AK_KAT_WORTE`); Foto, Scan-PDF oder ohne Datum/Summe → KI (ki-lesen Art „beleg“, Funktion Version 12). Gefüllt werden nur
  Felder, die die Person nicht selbst getippt hat; markiert + „✓ … erkannt: … – bitte prüfen“. Einteilung `AK_GRUPPEN` Bewirtung/Unterkunft/
  Material-Werkzeug/Sonstiges (gespeichert bleibt kategorie: bewirtung, naechtigung, material|werkzeug – „genauer“ wählbar, Werkzeug fragt nach der
  Werkzeugliste –, Parken/Maut/… zählen als Sonstiges). Spalten `mwst` (€, ≤ Betrag) und `mwst_satz`. `akSummen` liefert mwstBelege/nettoBelege/ohneMwst/
  gruppen; PDF: Barbelege mit „ohne MwSt / MwSt / Betrag“, Tabelle „nach Einteilung“, Zusammenfassung mit/ohne MwSt; PDF-Belege werden Seite für Seite als
  Bild eingebettet (`akFotosFuerPdf`, bis 6 Seiten). Test „Reisekosten: Beleg wird erkannt …“.
  **km berechnen** (Inhaber 18.10.2026: „automatisch berechnen … am besten anhand der Stempeluhr“): im km-Dialog `akKmRouteAnzeigen` →
  `akKmBerechnen(tag)` holt die eigenen Stempel des Tages, `akTagesOrte` ordnet die Orte: Stempel (Ein/Umstempeln/Aus) – Koordinaten NUR mit
  Zustimmung ab Fassung `AK_KM_FASSUNG` (2026-10-18, Zustimmungstext nennt seither den Zweck Kilometergeld; ältere Zustimmungen nur Markt/
  Betrieb), sonst Markt/Betrieb bei status am_markt/im_betrieb; dann eigene Stunden (Markt bzw. Projekt-Standort); nur wenn beides leer:
  eigene Kalendertermine. Start = `startpunktIst(tag, stempel)` (seit 29.10.2026, Inhaber: „nie in der Tivoligasse, schlägt es immer vor“ –
  vorher `startpunktFuer` = Kalender bis 4 Tage zurück): für den Tag festgelegt → letzter Ort des VORTAGS laut Stempel/Stunden (ohne Kalender,
  `akTagesOrte(…, true)`), > 90 min von zu Hause/Betrieb = Übernachtung → fester Startpunkt; nur ein Tag zurück. Hin-/Rückfahrt abwählbar
  (Vorgabe: dabei, wenn > 1 km). Stempel „entfernt“ mit gewähltem Ort ≤ 5 km zählen als dieser Ort (Hotel neben der Baustelle). km laut
  `strassenMatrix`, sonst Luftlinie × UMWEG („geschätzt“). „Übernehmen“ füllt nur km + Strecke (Ortsnamen, keine Koordinaten) – gespeichert wird
  mit „Speichern“. Nicht beim Eintrag einer anderen Person. **Strecke selbst festlegen** (`akKmEigeneStrecke`, „✎ Start, Ziel und
  Zwischenpunkte selbst festlegen“, auch an Tagen ohne Daten): Punkte ↑/↓/✕, neu als Start/Zwischenpunkt/Ziel aus Markt, Betrieb oder Ort/Adresse
  (Nominatim, Koordinaten nur zum Rechnen), `akKmFolgeRechnen`. Zustimmung zu einer älteren Fassung: Hinweis im km-Fenster (`[data-kmzust]`) und in
  der Stempeluhr („Neue Fassung … Ansehen und zustimmen“); neu zustimmen löscht die eigene alte Zeile und trägt die neue ein (Tabelle ohne update).
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
  Bildern: trotzdem Straßenkarte (`kachelnPruefen`). Anzahl + „Leeren“ (Rückfrage) unter der Karte. Überfällig auf der Karte in `--karte-rot`, fällig in 30 Tagen in `--karte-gelb` (`KARTE_VAR`; Inhaber 07./08.10.2026). Fällig in 31–60 Tagen gelbgrün `--karte-bald` (Inhaber 11.10.2026: von „im Zeitplan“ kaum zu unterscheiden; verwandt bleibt es, weil noch nicht dringend).
  Punkte nach Fälligkeit übereinander (Inhaber 09.10.2026): `_uktRang` je Punkt (überfällig 5, fällig 4, bald 3, ohne Termin 2, im Zeitplan 1, nicht betreut 0), `punkteOrdnen` nach jedem Ein-/Ausblenden.
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
  Auf der Karte (Inhaber 15.10.2026: „intern eine kleine Störung aufgefallen – auf der Karte nicht angezeigt“): eigene Ebene in `karteOsm` – 🔒 links oben am
  Marktpunkt (`.ihpin`, `[data-ihpin]`, 🧰 sitzt rechts oben), Anzahl bei mehreren; im Markt-Fenster der Karte (`popupInhalt`, `[data-ihpopup]`); nach `ihLaden`
  neu gezeichnet (`ihKarteNeu` aus `ihAuffrischen`). Nur mit `ihAn()` – nie Kunde, Fernzugriff-Konto, Präsentation.
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
- **Lidl-Auftrag mit großen Fotos** (Inhaber 08.10.2026: „6,5 MB – Fotos übernehmen, aber die Dateigröße reduzieren“): gelesen bis
  `AUFTRAG_PDF_LESEN_MAX` (40 MB, `auftragPdfZuGross`); über `AUFTRAG_PDF_ORIGINAL` (1 MB) bleibt eine verkleinerte PDF aus den Seitenbildern
  (`pdfVerkleinern`, „… (verkleinert).pdf“), eingebettete Fotos (ab 300 px, höchstens `AUFTRAG_FOTO_MAX`, je `AUFTRAG_FOTO_PX` als JPEG, `pdfFotosHolen`)
  kommen zu den Auftragsbildern (`o.seiten`) bzw. in die Ansicht im Protokoll.
- **Lidl-Leistungsstandort** (Lidl FM Filiale, Mail 08.10.2026 – neues FM-System; Inhaber 12.10.2026 „damit Lidl zufrieden ist“): „AT6631“ = AT + Gesellschaft
  (6 Wundschuh, 9 Großebersdorf, 2 Laakirchen; `LIDL_GESELLSCHAFT`) + Filiale 631; alt „AT0405“. `lidlFilialeAus` (Filiale aus beiden Formen, auch „0405“/„405“) in
  `standortZuAuftrag`, der Suche (`filtered`) und beim Rapport; `lidlGesellschaftAus`. Je Markt Feld `leistungsstandort` (STAMM_FELDER_ST; Verwaltung „Leistungsstandort (Lidl)“,
  Form AT+4 Ziffern, muss zur Filialnummer passen; Marktinfo), aus dem Lidl-Auftrag beim Speichern der Störung gemerkt (`marktLeistungsstandortMerken`, nur neues Format,
  nie geraten). Rechnung an Lidl: `kopf.leistungsstandort` vom Markt (`leistungsstandortVon`), Feld im Editor, Warnung `[data-lstandort-fehlt]`, Zeile „Leistungsstandort: AT6631 –
  Filiale 631, Adresse (NL Wundschuh)“ im PDF und in der Ansicht (`leistungsstandortZeile`). KI liest das neue Lidl-Formular „Beauftragung“ (Bestellung → Auftragsnummer, „Auftrag Nr“ → Störungsnummer, Leistungsdatum → Zieltermin; ki-lesen).
- **Kundenkonto ohne „überfällig“** (Inhaber 12.10.2026, Präsentation bei Lidl; das Konto wird vorerst nicht ausgegeben): für die Rolle kunde stuft
  `berechneFaelligkeiten` versäumte Termine auf `faellig` + `p.inPlanung` um (kein Rot, keine Zählung), `kundeSichtLabels` setzt je Rolle
  `STATUS_LABEL.faellig` („in Planung“ / „fällig in 30 Tagen“), `STATUS_VAR`/`KARTE_VAR` (grün bzw. gelbgrün) und `KARTE_KAT`; `wannText` zeigt
  „in Planung“ ohne „seit n Tagen“, Kachel „Termine überfällig“ und Karten-Chip „überfällig“ fehlen beim Kunden. Nach der Rollenprüfung
  (`adminPruefen`) wird neu gestuft. Offene Störungen sieht der Kunde gar nicht (`offeneStoerungen` liefert für kunde [] – Kachel, Karte, Markt;
  erledigte stehen als Protokolle im Verlauf). Kein Reiter Fällig für den Kunden (`reiterErlaubt`: Karte, Anlagen, Verlauf) – Start auf der Karte,
  dort die Konto-Karte mit Abmelden (`viewKarte`). Karte im Kundenkonto: alle Märkte als **Lidl-Kachel** statt farbiger Punkte, keine Status-Auswahl
  (`kundeKacheln`, `kundeLogo` – das Logo liegt NICHT im Repository, sondern als Merker `merker:kundenlogo` in den Stammdaten, `felder.datenUrl` 96-px-PNG;
  Merker gibt `stammdaten_lesen` auch dem Kunden; fehlt er, bleiben die Punkte; CSS `.lidlkachel`). Intern bleibt alles wie bisher – die Fachregeln ändern sich nicht.
  Zugangsdaten kompakt (Inhaber 12.10.2026: „benötigt unnötig viel Platz“): `zugangBox` ist nur noch eine Zeile `[data-zugang-kurz]` mit Knopf „🔐 Zugang zur Regelung“
  und Adresse; die vollen Zugangsdaten (`zugangBoxVoll`, Passwort verdeckt, kopieren) öffnen sich als eigenes Fenster.
- **Fernzugriff gehört zum Markt** (Inhaber 12.10.2026: „der Link ist für alle Anlagen am Markt“): Marktfelder `fernLink` (sichtbar für alle,
  auch Kunde – Markt-Info `[data-fernlink]`), `fernBenutzer`, `fernPasswort`, `fernWeitere` ([{bez, benutzer, passwort}]) in `STAMM_FELDER_ST`; die drei
  Zugangsdaten sind geheim (`GEHEIM_MARKT` in `GEHEIME_FELDER`: nie Verlauf/PDF/Kunde; Sicht `stammdaten_lesen` lässt sie weg – tools/fernzugriff-markt.sql,
  hebt außerdem gleiche Anlagen-Zugänge eines Markts auf den Markt). Verwaltung › Markt bearbeiten: Fieldset „Fernzugriff auf die Regelung“
  (`#a_fernLink`, `#a_fernBenutzer`, `#a_fernPasswort` mit anzeigen, `#a_fernWeitere` je Zeile „Bezeichnung; Benutzer; Passwort“ – `fernWeitereText`/`fernWeitereLesen`).
  `fernVonMarkt(s)` liefert den Markt-Zugang in der Form der Anlagen-Zugangsdaten; `zugangBox` nimmt ihn für Anlagen mit Fernzugriff ja ohne eigenen Zugang
  („gilt für den ganzen Markt“) und in der Markt-Info (`[data-fernzugang]`, nur intern). Je Anlage bleiben Regelung, betreut von, Fernzugriff ja/nein;
  die Gruppe „Zugang zur Regelung“ fragt der Anlagendialog nur noch, wenn der Markt keinen Fernzugriff hat oder die Anlage einen eigenen (`anlageHatEigenenZugang`).
- **Einrichtung, Fernzugriff vor Ort, Bestandsplan** (Inhaber 15.10.2026, Zettel „Fernzugriff Zugänge“, tools/einrichtung.sql): Verwaltung › Reiter
  **Einrichtung** (`einrichtungAnsicht`, Admins und Inhaber; Einstellung `einrichtung` {standard, abschnitte, dateien} – lesen alle Mitarbeiter, schreiben
  Admins/Inhaber, nie Kunden): Standard-Zugänge zur Regelung (`EINRICHTUNG_STD`: System, UKT online, Standard-Admin, Kunde, vor Ort Displaysperre/
  Administrator/Passwort für Wartung Stufe 1+2/Freischalten, Hinweis), „In alle Märkte mit Fernzugriff übernehmen“ (`einrichtungInMaerkte` →
  `marktFelderSetzen` je Markt mit fernLink: UKT-Benutzer, Standard-Admin und Kunde ersetzt, andere weitere Benutzer wie Router bleiben, System/Hinweis nur
  wo leer); Anleitungen als Abschnitte (Titel + Text); Dokumente (PDF/Fotos) im Speicher `dokumente` unter einrichtung/ (`dokumentHochladen`,
  `dokumentOeffnen`; der Speicherpfad wird ohne Umlaute geschrieben – „Invalid key“ –, angezeigt bleibt der echte Name). Dokumente nach `gruppe`
  zugeklappt, ab 7 mit Suchfeld (`einrichtungDateienKarte`, `[data-dokgruppe]`, `[data-doksuche]`; Inhaber 28.10.2026: Service-Unterlagen – Fehlercodelisten,
  Settinglisten, RTD, iTM, Service Checker – aus dem Synology-Archiv, Gruppe/Titel per SQL in `einstellungen.einrichtung.dateien`). Markt: neue Felder `fernSystem`, `fernHinweis`, geheim `fernVorOrt` {displayPw, adminPw, wartungPw1, wartungPw2, entsperren}
  (`GEHEIM_MARKT`, Sicht stammdaten_lesen ohne), `bestandsplaene` [{pfad, name, titel, typ}] unter markt/<Kennung>/. Markt-Editor: Fieldset Fernzugriff
  mit Online-Zugang UKT, weiteren Benutzern als Zeilen (`fernWeitereZeilen`/`fernWeitereAusZeilen`), Vor Ort (`FERN_VORORT`, `fernVorOrtLesen`),
  „alle anzeigen“, „Standard-Zugänge übernehmen“ (`einrichtungStandardInFormular`), Bestandsplan hochladen (sofort im Speicher, am Markt erst mit
  „Speichern“). Anzeige: `zugangBoxVoll` zeigt System, Hinweis und den Vor-Ort-Block verdeckt (`fernVorOrtHtml`, anzeigen/kopieren); Bestandsplan in der
  Markt-Info (`[data-bestandsplan]`) und oben im Protokoll (`[data-planoben]`, `bestandsplanKnoepfe`) – nur intern. „Serviceebene“ auf dem Zettel =
  Passwort für Wartung (Inhaber). Zugangsdaten nie ins Repository – nur in Supabase.
  Übersicht `fernzugriffUebersichtKarte` oben im Reiter Einrichtung (Inhaber 15.10.2026: „eine Übersicht mit allen Fernzugriffanlagen“): alle Märkte mit
  Adresse oder Anlagen mit Fernzugriff durch UKT – Regelung, Anlagen mit/ohne Fernzugriff, vor Ort ✓, Bestandsplan ✓, „bearbeiten“ öffnet den Markt-Editor.
  Schalter „● online / ✗ offline“ je Markt (Inhaber 15.10.2026: „grundsätzlich sollten alle an sein; wenn ich auf offline stelle, müssen wir das beim nächsten Termin
  lösen und wieder online bringen“): Marktfeld `fernOffline` (null = online, sonst {seit, von, notiz}; `fernStatusUmstellen`, Notiz über `textAbfrage`), sichtbar als
  `fernOfflineText` in der Übersicht, der Markt-Info (`[data-fernoffline]`) und oben im Protokoll (`[data-fernoben]`) – nur intern; wieder online = Feld leer.
  **Fernsteuerung durch eine andere Firma** (Inhaber 15.10.2026: „z. B. Licht Loidl oder R+S – UKT KANN dann nichts einstellen, die Anlage aber beobachten“):
  Marktfelder `fernFremd` (Firma, Vorschläge `fernFremdFirmen`) und `fernFremdHinweis`, nicht geheim; Markt-Editor Abschnitt „Fernsteuerung durch eine andere Firma“
  (`#a_fernFremd`, `#a_fernFremdHinweis`); `fernFremdText` „👁 Nur beobachten – Fernsteuerung durch …“ im Zugangsfenster (`zugangBoxVoll`, `_fernFremd`), Markt-Info, Übersicht
  (Schild) und oben im Protokoll (`[data-fernfremd]`) – nur intern.
  **Automatische Prüfung täglich** (Inhaber 15.10.2026: „täglich laufen lassen, die überprüft, ob die Fernzugriffe funktionieren und ob sie online sind“, tools/fern-pruefung.sql):
  die Datenbank selbst (pg_cron 04:30 UTC + pg_net) ruft jede `fernLink`-Adresse ohne Anmeldung auf; erreichbar = die Seite der Regelung kommt (Daikin ITM, „ITMFont“),
  Router offline = Zeitüberschreitung, Plattform erreicht die Regelung nicht = 502 „Connection unsuccessful“. Tabelle `fern_pruefung`, Sicht `fern_pruefung_stand`
  (letzter Stand, `zuletzt_ok`, `gestoert_seit`), RPC `fern_pruefung_jetzt` (Admins/Inhaber, „🔄 Jetzt prüfen“ in der Übersicht, Ergebnis nach ~30 s – `fernPruefungJetzt`)
  und `fern_pruefung_nachsehen` (offene Antworten auswerten, vor jedem Lesen). App: `FERN_PRUEFUNG`, `fernPruefungLaden` (beim Start, höchstens alle 30 min), `fernPruefungText`,
  `fernPruefungGestoert`; Übersicht (Kopfzeile `[data-fern-pruefung]`, je Markt `[data-fernpruefung]`, gestörte zuerst; bei Hand-offline und wieder erreichbar „→ wieder auf online stellen?“),
  Markt-Info und Protokoll-Kopf (nur wenn nicht ohnehin offline), Büro-To-do im Kalender (`[data-fern-todo]`: alle auf offline + laut Prüfung gestörte).
  **Die Prüfung legt den Schalter selbst um** (Inhaber 15.10.2026: „die automatische Prüfung soll diesen Schalter ändern können, dafür ist er da“): in
  `fern_pruefung_auswerten()` nicht erreichbar → `fernOffline` {seit, von „Automatische Prüfung“, notiz = Hinweis}; wieder erreichbar → online NUR, wenn die
  Prüfung ihn gesetzt hat (von = „Automatische Prüfung“) – von Hand Gesetztes bleibt, die Übersicht zeigt dann „→ wieder auf online stellen?“.
  Attrappe: `window.__fernAntwort` je Markt, `window.__fernPruefungWartezeit`. Ohne das SQL (Sicht fehlt) blendet die App die Prüfung aus (`FERN_PRUEFUNG_AN`).
  **Anleitungen als Menü** (Inhaber 15.10.2026: „nur Text, etwas unübersichtlich – als Menü ausbauen, mit Screenshots aus dem Daikin-Handbuch“): `einrichtungAbschnitteKarte`
  zeigt die Abschnitte als Schritte (links Menü `[data-anl-punkt]`, am Handy Leiste; rechts `[data-anl-text]`, Bilder `[data-anl-bilder]`, ◀ ▶; gewählter Schritt `S.anlSchritt`);
  je Abschnitt `bilder` [{pfad, name, titel}] im Speicher dokumente unter einrichtung/anleitung/ (signierte Adressen `anleitungBildUrl`, groß über `dokumentOeffnen`).
  „✎ Bearbeiten“: Felder wie bisher, ▲▼ Reihenfolge, „📷 Bild hinzufügen“ (`dokumentHochladen("einrichtung/anleitung", f)`), Bildunterschrift, Speichern/Abbrechen.
  Inhalt: die Einleitung aus FERNZUGRIFF-ITM-EINRICHTUNG.md je Schritt ein Abschnitt, Bilder aus den Daikin-Handbüchern (Rendering mit PyMuPDF, nie im Repository – nur im Speicher).
- **Störungen nie doppelt** (Büro 01.10.2026): eine Lidl-Auftragsnummer gibt es
  nur einmal als Störung (Datenbank-Index `stoerung_auftrag_einmal`,
  tools/stoerung-eindeutig.sql; im Dialog „Vorhandene öffnen“ statt neu – auch beim Ändern der Nummer).
  Nennt ein Störungsprotokoll die Auftragsnummer einer ANDEREN offenen Störung
  am Markt, fragt die App, welche erledigt ist; offene Störungen mit passendem
  Protokoll (gleicher Markt, gleiche Nummer) werden beim Laden verknüpft
  (`stoerungenOhneVerknuepfungAbgleichen`).

## Rollen

inhaber, admin, techniker, kunde, praesentation, archiv, **fernzugriff** (Inhaber 15.10.2026, tools/fernzugriff-konto.sql: Konto
fernzugriff@ukt.at – wie Kunde nur ansehen (`nurLesen()`), aber `istFernKonto()`: ein einziger Reiter „Fernzugriff“ (`viewFernKonto`: Karte mit
Lidl-Kacheln + Liste der Märkte mit `fernLink`, Stand „online“/„in Wartung“ aus `fernOffline` ohne Grund; Markt-Fenster `fernKontoMarkt` nur Link,
Benutzer und Passwort des Kunden-Zugangs aus der Sicht `fernzugriff_zugang` – Eintrag mit der Bezeichnung `standard.kundeBez`). Datenbank: `darf_schreiben()`
falsch, `stammdaten_lesen` liefert nur Märkte mit Fernzugriff mit gekürzten Feldern + Logo-Merker, restriktive Regeln auf protokolle/fassungen/berichte/
storage. Testkonto fern@test.at. Nie mehr zeigen als Link und Kunden-Zugang; Markt-Fenster `fernKontoMarkt` mit Blöcken „Fernzugriff“
(öffnen, Link kopieren) und „Anmeldung an der Regelung“ (`.fk-block`, `.fk-zeile`); Stand-Zeile ohne Zahlen).
**Anzeigesperre** (Inhaber 15.10.2026: „vor dem Anmelden oder bis zum vollständigen Laden werden alte Daten angezeigt – es dürfen keine Daten
angezeigt werden, die diesen Benutzer nichts angehen“): `anzeigeGesperrt()` – Modus „lade“ oder angemeldet ohne geprüfte Rolle bzw. ohne für dieses Konto
geladene Stammdaten (`datenFuerKonto`, gesetzt am Ende von `ladeStammdaten` nur bei `Rolle.da`) → Karte „Anmeldung wird geprüft …“, abgemeldet → nur
`viewAnmeldung()`; Reiterleiste dabei ganz versteckt. Die Grundliste wird abgemeldet NICHT mehr gezeigt. `speicherLeeren()` beim Sitzungsstart
(`rolleVorlaeufig`) und beim Abmelden leert stammUeber/stammStand/OFFENE/aenderungen/FERN_KONTO/FERN_PRUEFUNG/EINRICHTUNG. Testhilfe `oeffnen()` wartet
auf `!anzeigeGesperrt()`. **Nur das zuletzt gestartete Laden zählt** (`stammGen` in `ladeStammdaten`, Inhaber 15.10.2026: „hier fehlen die restlichen
Zugangsdaten“ – ein beim Start mit ungeprüfter Rolle über stammdaten_lesen begonnenes Laden kam nach dem vollständigen an und überschrieb es); ein Ergebnis
für ein anderes Konto wird verworfen; `datenFuerKonto` nur, wenn die Rolle beim START geprüft war. Attrappe: `window.__verzoegerung={tabelle:ms}`. Testkonten ausblenden (Inhaber 05.10.2026): Haken „in
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
