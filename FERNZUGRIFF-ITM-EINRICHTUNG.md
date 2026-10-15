# Daikin intelligent Touch Manager (ITM) – Einrichtung eines Markts von A bis Z

Einleitung für Techniker von UKT: was der ITM ist, in welcher Reihenfolge man einen Markt einrichtet und wo welche
Einstellung sitzt. Zusammengefasst aus den Daikin-Handbüchern (Quellen ganz unten), ergänzt um das, was bei uns
(Lidl, Router Teltonika, Fernzugriff über RMS) dazukommt. Zugangsdaten stehen nie hier, sondern nur in der App unter
Verwaltung › Fernzugriff › Standard-Zugänge bzw. am Markt.

## 0. Was der ITM ist

- Zentrale Steuerung für Daikin-Klimageräte über den Daikin-Bus **DIII-NET**: bis zu 64 Fernbediengruppen bzw. 128
  Innengeräte je ITM (eine Fernbediengruppe = bis zu 16 Innengeräte an einer Fernbedienung). Mit Leistungsverteilung
  (PPD) höchstens 64 Innengeräte.
- Touchpanel am Gerät (Standardansicht mit Symbolen oder Liste, Menüliste mit Registerkarten Automatik-Regelung,
  Systemeinstellung, Betriebsdaten) und derselbe Bildschirm im Browser über LAN („Web Remote“).
- Modelle: DCM601A51 (älter) und DCM601B51 (Nachfolger). Bedienung und Menüs sind gleich; bei Verdrahtung und
  Netzteil gilt das Installationshandbuch des jeweiligen Modells.
- Bei UKT hängt der ITM im Markt an einem **Teltonika-Router**; der Fernzugriff läuft über die Teltonika-Plattform RMS
  (Link je Markt in der App). Die App prüft jeden Morgen, ob der ITM über diesen Link antwortet.

## 1. Vorbereitung im Büro

- Geräteliste des Markts: Außengeräte (VRV 1, 2, 3 …), Innengeräte je Kältekreis, Lüftung, Zubehör (E-Heizung, Fühler).
- **Gruppenadressen planen** (DIII-NET-Adresse): je Innengerät bzw. Fernbediengruppe eine eindeutige Adresse
  1-00 … 4-15 (64 je DIII-Port). Am besten gleich mit Raumnamen (Verkauf, Backshop, Büro, Lager …) aufschreiben –
  die Liste braucht man später für die Verwaltungspunkte und für den Bestandsplan in der App.
- Falls bestellt: Herstelleroptionen (Leistungsverteilung PPD, Energienavigator) brauchen einen **Aktivierungsschlüssel**
  von der Daikin-Distributor-Seite; dafür MAC-Adresse des ITM (Aufkleber) und Software-ID vom Lizenzblatt mitnehmen.
  Händleroptionen (Web Remote, E-Mail, Sperrsteuerung …) brauchen keinen Schlüssel, nur das Einschalten (Schritt 5).
- Mitnehmen: USB-Stick für die Sicherung, Netzwerkdaten (IP-Adresse des ITM, Subnetz, Gateway = Router), Zettel
  „Fernzugriff Zugänge“ bzw. die Standard-Zugänge aus der App.

## 2. Montage und Verdrahtung (immer stromlos)

- **DIII-NET**: Klemmen F1/F2 am ITM („DIII“), keine Polarität. 2-adrig 0,75–1,25 mm², nie 3- oder mehradrig, kein
  Abzweig nach einem Abzweig (durchschleifen OUT–OUT / IN–OUT). Geschirmt: Schirm nur an einem Ende erden. Höchstens
  1000 m zum weitesten Gerät, 2000 m gesamt (geschirmt 1500 m). Parallel zu Starkstrom höchstens 20 m gemeinsam führen.
  Nie Netzspannung auf F1/F2 – das zerstört ITM und Geräte.
- **DIII MASTER-Schalter** (unter der Frontklappe): ITM bleibt MASTER. Auf SLAVE nur, wenn ein übergeordnetes
  System (BACnet-/LON-Schnittstelle) oder ein zweiter Master-ITM am selben DIII-NET hängt. Zwei Master → Meldung
  „Duplicated parent centralized control“.
- **LAN**: RJ45 auf der Rückseite zum Router (Teltonika, Port 80 freigegeben). Für Service vor Ort gibt es die Buchse
  SERVICE LAN vorn; Schalter LAN SW auf FRONT schaltet sie frei – danach wieder auf **BACK**, sonst bleibt der
  Fernzugriff tot und die Klappe geht nicht zu.
- **Stromversorgung** (laut Installationshandbuch B51): L/N/PE 100–240 V, eigener FI-Schutzschalter nur für den ITM,
  Leitung 1,0–2,0 mm², 19 W. Beim A51 das Installationshandbuch 3P291714-1 beachten.
- **Zubehör**: E-Heizung, Fühler, Zähler über WAGO-Knoten an RS-485 (siehe Abschnitt „Anschluss externe Fühler und
  Geräte“ in der App). Not-Aus-Eingang und Stromzähler-Impulse (Pi) laut Installationshandbuch 2.5.

## 3. Gruppenadressen an den Innengeräten setzen

Die DIII-NET-Adresse wird **nicht am ITM**, sondern an jeder Fernbedienung vergeben (ITM vorher einschalten und
kurz warten, sonst nimmt die Fernbedienung die Einstellung nicht an):

- Kabel-Fernbedienung (klassisch): Taste Prüfen/Testlauf 4 s halten → mit den Temperaturtasten Parameter wählen →
  Timer-EIN/AUS-Taste, bis „GROUP“ blinkt → mit den Programmzeit-Tasten die Adresse wählen → Timer-EIN/AUS-Taste
  (GROUP leuchtet) → Prüfen/Testlauf-Taste zum Verlassen.
- Navigations-Fernbedienung (BRC1E/H): Abbrechen 4 s halten → „Gruppen-Nr.-Einstellung“ → Menü/Eingabe → mit
  Auf/Ab die Adresse wählen → Menü/Eingabe → 3× Abbrechen.
- Lüftungsgeräte und Adapter: laut deren Handbuch.

## 4. Einschalten und Grundeinrichtung (Assistent)

1. **BACKUP-Schalter** (Batterie, unter der Frontklappe) auf ON – sonst sind die Einstellungen nach Stromausfall weg
   und der Assistent meldet „Turn ON Battery Backup switch“. Bei Stilllegung über 6 Monate wieder OFF.
2. **Erst die Klimageräte einschalten, dann den ITM.** Titelbild, dann „Ready to set up A/C centralized address“ –
   jetzt die Adressen setzen (Schritt 3), dann OK.
3. Sprache → **Lokal** (Datum, 24 h, °C, Dezimalzeichen/CSV-Trenner, Symbolfarbe) → **Zeitzone** → **Uhrzeit und
   Sommerzeit**.
4. **A/C Auto Register**: Liste der gefundenen Geräte prüfen – alle mit Adresse müssen da sein („Show Updates“ lädt
   neu, sonst Adressen prüfen) → Ja → der ITM startet neu und zeigt den Hauptbildschirm. Grundeinrichtung fertig.

## 4b. Layout und Einstellungen am PC vorbereiten, per USB-Stick einspielen

Das ist für uns der wichtigste Vorbereitungsschritt und hat in der Vergangenheit öfter Probleme gemacht. Was das
Handbuch dazu sagt – eigene Erfahrungen bitte über „Bearbeiten“ dazuschreiben.

- **Werkzeuge**: Daikin „Pre-engineering Tool“ (Vorkonfigurations-Werkzeugsatz, Windows-PC, Download auf der
  Daikin-Distributor-Seite) mit einer PC-Version des ITM, in der man Bereiche, Verwaltungspunkte (Namen), Zeitpläne und
  Systemeinstellungen im Büro vorbereitet. Darin das **Layout-Werkzeug** (Layout Screen Creation Tool, braucht die
  Händleroption „Layout“): Grundriss-Ansicht je Markt – je Bildschirm ein Hintergrundbild, darauf die Geräte.
- **Regeln fürs Layout**: Hintergrundbild nur JPEG, höchstens 500 KB, 600×500 bis 1500×1000 Pixel. Symbole fest
  76×38 px, höchstens 100 je Bildschirm, höchstens 60 Bildschirme je Markt, Name bis 20 Zeichen. Je Bildschirm die
  **Wechselliste** (List Settings) setzen: nur dorthin kann man am ITM umschalten – ohne Eintrag ist ein Bildschirm nicht
  erreichbar. „Display Information“: ab Werk ist alles angehakt (Raumtemperatur, Sollwert, Betriebsart …), Unnötiges abhaken.
- **Reihenfolge am PC**: Werkzeug starten → anmelden → „New“ (Ordner für den Markt; Achtung: OK löscht alles im
  gewählten Ordner) → „Edit Data“ (PC-Version des ITM: Bereiche, Verwaltungspunkte, Zeitpläne; Aktivierungsschlüssel
  gehen dort nicht) → Layout: die vier Ecken des Hauptfensters anklicken, „Exit“, Passwort für Wartung → „Edit Layout
  Screen“ → Bildschirme anlegen (Add), Geräte hinzufügen (Add, höchstens 20 auf einmal), ausrichten, Wechselliste →
  **Save** → Exit. Save und das Löschen eines Bildschirms lassen sich nicht rückgängig machen.
- **Auf den Stick**: „Export to USB“ → Laufwerk → „Restore Data“ (alles: System, Einstellungen, Layout) oder „Layout
  Setting Data Only“ → OK. **Der Stick wird dabei geleert.** Vorher prüfen: beschreibbar, nicht schreibgeschützt, genug
  Platz – am besten ein eigener einfacher Stick nur für den ITM.
- **Am ITM einspielen**, zwei Wege:
  1. Nur Layout: Service-Modus → Service-Einstellungen → **Layout Setup** → Stick einstecken → „Layout Screen Data
     Input“ → Ja → der ITM startet neu. Die Taste gibt es nur, wenn die Händleroption Layout aktiv ist und schon
     Layout-Daten am ITM liegen – sonst Weg 2.
  2. Alles (Vorkonfiguration, Wiederherstellung, Upgrade): Stick einstecken, ITM mit gedrückter **MONITOR-Taste**
     einschalten (oder RESET drücken), MONITOR gedrückt halten, bis der Kalibrierbildschirm kommt → 5 Kreuze antippen
     (Stift) → das Install-Tool vergleicht Version und MAC-Adresse → OK → Installation, Neustart.
- **Zurück auf den PC**: Layout: Service-Einstellungen → Layout Setup → „Layout Screen Data Output“ (Ordner wird
  angezeigt). Alles: Systemeinstellung → Sicherung (Ordner Backup_MAC-Adresse_Datum_Zeit) → am PC im Werkzeug mit
  „Open“ öffnen (fragt bei älterem Stand nach einem Upgrade der Daten).
- **Stolpersteine laut Handbuch**: Stick nicht erkannt, schreibgeschützt oder voll → Export schlägt fehl. „OK“ im
  Install-Tool ist grau → die Daten auf dem Stick sind älter als der Stand am ITM: zuerst den Updater (Distributor-Seite)
  installieren bzw. das Werkzeug auf den gleichen Stand bringen (Systemeinstellung › Version Information vergleichen).
  „Error in the installer program“ → falscher oder unvollständiger Installer-Ordner auf dem Stick. MAC-Adresse passt
  nicht (Daten eines anderen ITM) → Marktordner im Werkzeug mit „Open“ laden und neu exportieren. Hintergrundbild wird
  nicht angenommen → Größe und Format. Bildschirm nicht erreichbar → Wechselliste. „Layout Setup“ fehlt → Händleroption
  Layout. Während Export, Installation und Neustart den Stick nie abziehen.

## 5. Service-Modus und Service-Einstellungen

- **Service-Modus öffnen**: Menüliste anzeigen, die vier Ecken des Bildschirms in der Reihenfolge aus „Wartungslogin
  am ITM“ antippen, Passwort für Wartung eingeben (Standard-Zugänge). Dann erscheint die sonst versteckte
  Registerkarte **Service-Einstellungen**. Ist der Bildschirm gesperrt, dieselbe Eckenfolge mit dem Passwort für
  Wartung statt dem Administrator-Passwort: entsperrt und loggt ein. Im Browser geht das ebenso (vier Ecken des
  Browserfensters, als Administrator angemeldet).
- Darin der Reihe nach:
  - **A/C Auto Regist** – nachträglich angeschlossene Geräte automatisch aufnehmen (nur Innengeräte und Lüftung).
  - **Datenpunkt-Registrierung** (Mgmt. Point Data Regist) – Verwaltungspunkte benennen (Raumname statt 1-00),
    Symbole, Zubehör (Di/Dio/Ai/Pi) von Hand anlegen; auch per CSV vom PC.
  - **Bereich** (Systemeinstellung) – Räume/Zonen anlegen und Geräte zuordnen (bis 10 Ebenen).
  - **Andere Einstellung** – „Warnung als Fehler“ (zeigt Warnungen als Fehler mit Symbol und Verlauf) und
    Trockenbetrieb freigeben.
  - **DIII-NET Engineering** – Main/Sub und Sollwertbegrenzung bei übergeordnetem System; Neustart nötig.
  - **Zeitzone**, **Umschaltoption** (welches Innengerät Kühlen/Heizen vorgibt), **Außengerät einstellen** (Innengeräte
    je Kältekreis zuordnen; Grundlage für die Leckage-Prüfung), **Kontakt-Info** (hier UKT mit Telefonnummer
    eintragen – das sieht der Markt bei Störungen), **Verlauf löschen** (nur bei Übergabe).
  - **Aktivierung** – Schlüssel für Herstelleroptionen eingeben (MAC-Adresse wird angezeigt), Neustart.
  - **Händleroptionen** (Dealer Option Setup; bei uns „Normale Option“ genannt) – Web Remote, E-Mail-Fehlerbericht,
    Sperrsteuerung, Zubehör usw. auf „Aktiv“ schieben, Neustart. **Ohne Web Remote gibt es keinen Fernzugriff.**
  - **Sicherung / Upgrade / Installation** – Systemdatei und Einstellungen auf USB sichern bzw. einspielen.
- Lidl-spezifisch: die Einstellungen am Außengerät VRV RXYQ_U (2-01, 2-12, 2-13 je VRV) stehen im eigenen Abschnitt
  in der App.

## 6. Netzwerk einstellen

Menüliste › Systemeinstellung › **Netzwerk**: Controller-Name (Marktname), Host-Name, **IP-Adresse** (bei Lidl
192.168.1.10), Subnetz 255.255.255.0, Standard-Gateway = Adresse des Routers, DNS vom Router. **Webserver-Konfiguration**:
Port 80 (Standard; 8082, 17821 und 20000–20010 sind nicht erlaubt). OK → Neustart. Ohne diese Einstellung weder
Web Remote noch E-Mail.

## 7. Webzugriff und Benutzer

Menüliste › Systemeinstellung › **Webzugriff Benutzer** (erst sichtbar, wenn die Händleroption Web Remote aktiv ist):

- Zwei Benutzertypen: **Administrator** (höchstens 4, darf alles) und **Benutzer** (höchstens 60; je Benutzer die
  erlaubten Bereiche und Bildschirme wählen). Gleichzeitig höchstens 4 Administratoren und 16 Benutzer.
- Name 1–15 Zeichen, Passwort 0–15 Zeichen, nur Buchstaben und Ziffern, keine Sonderzeichen.
- Bei uns anlegen: UKT (Administrator), Standard-Admin, Lidl (FM-Admin) – Benutzernamen und Passwörter aus
  Verwaltung › Fernzugriff › Standard-Zugänge, danach in der App am Markt „Standard-Zugänge übernehmen“.
- Anmelden im Browser: http://IP-Adresse (bei anderem Port „:Port“ anhängen), Benutzer und Passwort. Abmelden über die
  Schaltfläche **Sperre** im Web-Bildschirm (Beim Ausloggen sperren). Nach Netzunterbrechung kann die Anmeldung bis zu
  4 Minuten gesperrt sein. Daten (Verlauf, Setup-Export) kommen als Datei auf den PC; einspielen geht nur am Gerät.

## 8. Passwörter und Bildschirmsperre

Menüliste › Systemeinstellung › **Passwörter Verwaltung**: Administrator-Passwortschutz (Menüliste nur mit Passwort)
und Bildschirmsperre (Taste Sperre; Freigabe nur mit Passwort), jeweils 1–15 Zeichen, dort auch ändern. Sind beide
aktiv, öffnet das Administrator-Passwort nach dem Antippen der Menüliste-Taste beide. Werte wie bei allen Märkten:
Standard-Zugänge in der App (Displaysperre, Administrator, Passwort für Wartung Stufe 1 und 2).

## 9. Fernzugriff bei UKT

- Router Teltonika im Markt, LAN zum ITM; Router-Zugang (Benutzer admin) steht je Markt unter „weitere Benutzer“.
- Je Markt ein RMS-Link (https://…proxy1-connect.rms.teltonika-networks.com) – in der App am Markt und in der
  Übersicht Verwaltung › Fernzugriff. Der Link öffnet direkt die Anmeldeseite des ITM.
- Die App ruft jeden Morgen alle Links auf: antwortet der ITM, ist der Markt „online“; sonst stellt sie ihn auf
  **offline** (Vermerk „Automatische Prüfung“) – beim nächsten Termin lösen. Meldet die Plattform „Verbindung nicht
  möglich“, ist entweder der Link abgelaufen (siehe unten) oder der ITM hinter dem Router nicht erreichbar (LAN-Kabel,
  IP-Adresse, LAN SW auf BACK?, ITM aus?). Kommt gar keine Antwort, ist der Router offline (Strom, SIM/Empfang, RMS).
- **Die RMS-Links laufen ab.** RMS erzeugt zeitlich begrenzte Proxy-Links (Standard 45 Minuten; beim Erzeugen kann man
  eine längere Dauer wählen). Ein abgelaufener Link meldet „Verbindung nicht möglich“. Dann braucht der Markt einen
  neuen Link: RMS › RMS Connect › Remote access › Gerät › „Generate“ (Dauer wählen) → Link kopieren → in der App am
  Markt unter Fernzugriff eintragen.
- **Links selbst erzeugen** kann nur, wer in RMS Zugriff auf die Router hat – bisher unser Daikin-Partner mit seiner
  RMS-Firma. Zwei Wege: der Partner legt für UKT Benutzer in seiner RMS-Firma an (mit Rechten auf unsere Router), oder
  er übergibt die Router in eine eigene RMS-Firma von UKT (dann zahlt UKT die RMS-Credits je Router und Monat und das
  Datenvolumen für RMS Connect). Mit eigenem Zugang kann die App die Links künftig selbst erneuern (RMS-Schnittstelle).

## 10. E-Mail-Fehlerbericht (Händleroption)

Menüliste › Systemeinstellung › **E-Mail**: Aufstellungsort (= Betreff), Wiederholintervall 1–72 h, Absender;
Server-Einstellung SMTP-Server, Port, Authentifizierung (keine / POP vor SMTP / SMTP-AUTH), Benutzer, Passwort;
Empfänger eintragen und Test-Mail senden. Braucht Internet über den Router.

## 11. Automatik (nach Vorgabe des Kunden)

Registerkarte Automatik-Regelung: **Zeitplan** (Wochenprogramme je Bereich), **Automatik-Umschaltung** Kühlen/Heizen,
Timer-Erweiterung (automatisches Aus), optional Sperrsteuerung (Interlock, z. B. Türkontakt), Temperaturgrenze,
Rücksetzen (Setback), Notaus. Was Lidl vorgibt, steht beim Markt bzw. im Projekt.

## 12. Abschluss und Übergabe

- **Sicherung** (Systemeinstellung › Sicherung): USB-Stick bis 32 GB, wird dabei gelöscht, bis 30 min je GB. Stick
  beschriften und in der App beim Markt als Dokument/Bestandsplan ablegen oder im Projektordner.
- Versionsinformation notieren (Software, Optionen), Kontakt-Info geprüft, Bildschirm gesperrt.
- In der App: Markt bearbeiten → Fernzugriff (Link, Benutzer, vor Ort), Bestandsplan hochladen, Anlagen mit
  „Fernzugriff ja“, Inbetriebnahmeprotokoll (Regelung parametriert: Sollwerte, Betriebsart, Automatik).
- Einweisung des Markts: Standardansicht, Start/Stopp, Sollwert, Sperre; Zettel mit UKT-Kontakt.

## 13. Fehlersuche (Kurzfassung)

- Kein Zugriff vom PC: Kabel (direkt = Crossover, über Hub/Router = gerade), Hub/Router an, ITM an, IP-Bereich des PCs
  passend, Port angehängt, Firewall. Ping auf die ITM-Adresse.
- Alle Geräte „Kommunikationsfehler“: DIII-Leitung am ITM-Port oder zum Außengerät nicht angeschlossen.
- Einzelne Geräte: Gruppenadresse fehlt oder doppelt, mehr als 64 Gruppen/128 Geräte, Leitungslänge, falscher Port.
- Sporadische Fehler: 3-adriges Kabel, Abzweig vom Abzweig, lose Klemme, mehr als zwei Adern je Klemme, Störquelle.
- „Duplicated parent centralized control“: zweiter Master am DIII-NET → dort DIII MASTER auf SLAVE.

## Quellen

- Daikin Benutzerhandbuch intelligent Touch Manager DCM601A51/A52/A53 (EM11A015, Deutsch):
  https://www.daikin.eu/content/dam/document-library/operation-manuals/ctrl/dcm60a51/DCM601A51,DCM601A52,DCM601A53,DCM002A51,DCM008A51_Operation%20Manuals_EM11A015_German.pdf
- Daikin Installationshandbuch DCM601B51 (3P291714-7H, Englisch):
  https://www.daikin.it/content/dam/document-library/installation-manuals/ctrl/centralised-control-systems/dcm601b51/DCM601B51_Installation%20manuals_EM21A028A_English.pdf
  (Deutsch für den A51: Daikin-Produktseite DCM601A51, Dokument 3P291714-1)
- Daikin Commissioning Manual DCM601A51 (EM11A021, Englisch; Kopie bei einem Daikin-Partner):
  https://tinlavir.ro/parteneri/2_VRV/4_Control_Systems/04_intelligentTouchManager/Documents/03_Commissionin_Manuals/iTM%20Commissioning%20Manual.pdf
- Daikin-Produktseite DCM601A51 mit allen Handbüchern: https://www.daikin.eu/en_us/products/product.html/DCM601A51.html
- UKT: Zettel „Fernzugriff Zugänge“ und Daikin-Schulung „Lidl_ITM_Anleitung.pdf“ (Inhaber, 15.10.2026).
