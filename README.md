# Wartungsleitstand Lidl

Anlagendatenbank, Standortkarte und Fälligkeitsübersicht für die Klimaanlagen
der Lidl-Märkte in Österreich, betreut von der Kammerlander Umwelt- und
Klimatechnik GmbH. Dazu das Wartungsprotokoll als Formular fürs Handy, das den
bisherigen Papier-Einseiter ersetzt.

Statische Seite ohne Build-Schritt: HTML, CSS und etwas JavaScript.

## Inhalt

| Datei | Zweck |
|---|---|
| `index.html` | die komplette App |
| `daten.enc.js` | Anlagenstamm, verschlüsselt: 140 Standorte, 262 Wartungspositionen |
| `config.js` | Zugangsdaten zur Protokoll-Datenbank |
| `supabase-setup.sql` | Tabelle und Zugriffsregeln für Supabase |

## Zugangsschutz

Der Anlagenstamm wird **verschlüsselt** ausgeliefert: AES-256-CBC, Schlüssel
über PBKDF2-SHA256 mit 300.000 Runden aus dem Passwort abgeleitet. Ohne
Passwort steht in `daten.enc.js` nichts Lesbares — auch nicht, wenn jemand die
Datei direkt abruft. Entschlüsselt wird erst im Browser, das Passwort verlässt
das Gerät nie.

Passwort ändern:

```powershell
cd tools
.\encrypt-data.ps1 -Passwort "neuesPasswort" -Quelle "..\daten.js"
```

Dafür wird die unverschlüsselte `daten.js` gebraucht — die gehört **nicht** ins
Repository, sie entsteht bei Bedarf neu aus der Excel-Liste über die Skripte in
`tools/`.

Grenzen: Ein kurzes Passwort lässt sich mit genug Rechenzeit durchprobieren,
weil das Chiffrat öffentlich abrufbar ist. Die 300.000 PBKDF2-Runden machen das
teuer, aber nicht unmöglich. Für dauerhaften Schutz gehört die Seite hinter
einen echten Zugriffsschutz auf dem Server.

## Tourenplanung


Auf der Karte lassen sich Wartungen nach Fälligkeit zu einer Route bündeln.
Welche Termine in die Tour kommen, bestimmen vier Knöpfe:

- **überfällig** und **fällig in 30 Tagen**: der Normalfall.
- **bis Ende nächsten Monats**: nimmt zusätzlich mit, was bald ansteht —
  praktisch, um eine Fahrt in eine Region gleich mitzuerledigen.
- **Bundesländer**: Ohne Auswahl zählt ganz Österreich; sonst nur die
  angetippten. Das Bundesland ergibt sich aus der PLZ.
- **später fällige – alle**: nimmt jeden noch nicht fälligen Termin dazu,
  auch einen in elf Monaten. Damit ist der Monatsknopf eingeschlossen.
Startpunkt ist standardmäßig die aktuelle Position des Technikers (der Browser
fragt einmal nach der Freigabe); ohne Freigabe wird vom Betrieb in St. Johann
aus gerechnet. Gerechnet wird mit **1,25 h je Wartungsposition** — ein Markt
mit drei offenen Positionen bindet also 3,75 h.

Fahrzeiten und Kilometer kommen aus **echtem Straßenrouting für den PKW** über
OSRM auf OpenStreetMap-Daten — Autobahnen, Tempolimits und Umwege sind
berücksichtigt. Genutzt wird die Matrix-Schnittstelle (`/table`) für die
Reihenfolge und `/route` für den gezeichneten Verlauf auf der Karte. Beides
ohne Schlüssel und ohne Kosten, primär über die FOSSGIS-Instanz
(`routing.openstreetmap.de`, betreibt auch osm.org), ersatzweise über den
öffentlichen OSRM-Demoserver.

Optimiert wird auf **Fahrzeit, nicht auf Entfernung** — über die Autobahn ist
der längere Weg oft der schnellere. Die Reihenfolge entsteht über nächste
Nachbarn mit anschließender 2-opt-Verbesserung.

Was der Dienst nicht kennt: Verkehrslage und Baustellen. Ist er nicht
erreichbar — etwa innerhalb von Claude, wo externe Abfragen gesperrt sind —
fällt die Planung auf eine Schätzung zurück (Luftlinie mal 1,3 bei 70 km/h) und
sagt das im Ergebnis deutlich dazu.

Mehrtägige Touren fahren am Folgetag vom letzten Stopp weiter, rechnen also mit
Übernachtung unterwegs.

## Karte und Navigation

Die Karte ist OpenStreetMap über Leaflet — ohne Schlüssel und ohne Kosten.
Ein Klick auf eine Filiale öffnet ein Fenster mit Status, Anzahl der
Positionen und drei Schaltflächen: **Mit Google Maps navigieren**, Anlagen und
Historie, Protokoll ausfüllen.

Jeder Tag der geplanten Tour lässt sich als fertige Route an Google Maps
übergeben. Google nimmt über eine URL höchstens neun Zwischenziele entgegen;
bei längeren Tagen weist die App darauf hin, dass die weiteren Stopps in der
Navigation fehlen.

Wo die Kachelserver nicht erreichbar sind — etwa innerhalb von Claude, wo
externe Bilder gesperrt sind — fällt die Karte automatisch auf eine
gezeichnete Österreich-Übersicht zurück. Dafür prüft die App beim Start
einmal, ob eine Kachel lädt.

## Datenherkunft

Aufgebaut aus `Wartungen_Lidl.xlsx` (Blätter *2026*, *Aktuell*, *Bis 2022*).
Die Blätter wurden über Filialnummer beziehungsweise Adresse zusammengeführt,
nicht über die Zeilennummer — die läuft zwischen den Blättern ab Zeile 17
auseinander. Das Jahr einer Wartung stammt aus dem jeweiligen Datum, nicht aus
der Spaltenüberschrift, weil die Überschriften in der Liste teilweise
verrutscht sind.

Koordinaten über [Nominatim](https://nominatim.openstreetmap.org/) geocodiert,
136 von 140 Standorten, die meisten adressgenau. Der Österreich-Umriss stammt
ebenfalls aus OpenStreetMap (ODbL).

## Wie Fälligkeiten berechnet werden

| Kürzel | Bedeutung | in der Liste oft |
|---|---|---|
| JW | Jahreswartung | JW |
| HJW | Halbjahreswartung – vorgeschrieben ab 30 kg Kältemittel | HW |
| HJI | Halbjahresinspektion | HI |

Jede Zeile der Liste ist ein Termin, der **jedes Jahr am selben Tag**
wiederkehrt. Der Tag hängt an der Inbetriebnahme: die Jahreswartung am
Jahrestag der Inbetriebnahme, die Halbjahrestermine sechs Monate versetzt.
Den Halbjahresrhythmus eines Marktes ergeben also zwei Zeilen – typisch JW
und HJI, bei über 30 kg JW und HJW.

Eine Wartung zählt für den Termin, in dessen Halbjahresfenster sie fällt.
Wer früher oder später kommt, verschiebt den Folgetermin nicht. Ist der
kommende Termin bereits erledigt, gilt ein davor versäumter nicht mehr als
überfällig, sondern wird als „ausgelassen" vermerkt.

Ein Markt gilt als fällig, sobald einer seiner Termine fällig ist. Eine
zusätzliche Regel auf Marktebene gibt es nicht – maßgeblich ist allein die
Inbetriebnahme.

Ein gespeichertes Protokoll erledigt die angehakten Anlagen sofort – wenn die
Wartungsart „planmäßig" oder „Prüfung" ist. Eine Störung oder Reparatur
ersetzt keine Wartung.

## Korrekturen und Änderungsverlauf

Jedes gespeicherte Protokoll lässt sich korrigieren. Dafür ist ein Grund
Pflicht. Festgehalten wird, wann, von wem, warum und welches Feld von welchem
auf welchen Wert geändert wurde; das Protokoll trägt danach eine
Fassungsnummer. Fotos kommen bei einer Korrektur nur dazu, keines
verschwindet. Die Unterschrift bleibt, solange niemand neu unterschreibt.

**Löschen** dürfen nur Admins, mit Pflicht-Begründung. Gelöscht wird durch
Markieren: das Protokoll verschwindet aus allen Listen, aus der
Fälligkeitsrechnung (es zählt also nicht mehr als Wartungsnachweis), aus der
Filialhistorie und dem Export – bleibt aber in der Datenbank. Admins blenden
gelöschte Protokolle in der Protokollliste über „gelöschte anzeigen" ein und
können sie wiederherstellen. Ob jemand Admin ist, prüft auf Supabase ein
Trigger in der Datenbank bei jeder Änderung selbst.

Protokolle, die noch nicht übertragen wurden und nur auf einem Gerät liegen,
lassen sich dort direkt löschen – ebenfalls mit Grund.

Der Verlauf lässt sich nur ergänzen, nicht ändern oder löschen. Auf Supabase
sichert die Datenbank zusätzlich bei jeder Korrektur die vollständige
vorherige Fassung in `protokoll_fassungen` – das geschieht in der Datenbank
selbst und lässt sich aus der App heraus nicht umgehen.

Wer eine Änderung gemacht hat: auf Supabase die angemeldete E-Mail-Adresse.
Ohne Anmeldung ist es der Name, der auf dem Gerät zuletzt als Techniker
eingetragen wurde – das ist kein Identitätsnachweis.

## Verwaltung (Admin)

Der Reiter **Verwaltung** zeigt alle Märkte in einer sortierbaren Tabelle mit
Status, letztem Besuch, nächstem Termin und den Auffälligkeiten der Liste –
getrennt nach **Fehlern** (Soll-Monat passt nicht zur Inbetriebnahme, über
30 kg ohne HJW, unklares Kürzel, doppelte Filialnummer, keine Kartenposition)
und **Lücken** (fehlende Kältemittelmenge, Inbetriebnahme, PLZ). Ein Markt
lässt sich dort öffnen und bearbeiten: Filialnummer, Adresse, Region und
Koordinaten (auch aus der Adresse ermittelbar).

**Anlagen und Termine:** Darunter steht **je Anlage eine Karte** – mit
Bezeichnung, Status und den Anlagendaten. In der Karte liegen die
**Termine** dieser Anlage, je Termin Kürzel, Inbetriebnahme und Soll-Monat.
So ist auf einen Blick klar, was zusammengehört.

- **+ Termin** ergänzt einen Termin in der Anlage, etwa den fehlenden
  Halbjahrestermin.
- Die Auswahl neben einem Termin **verschiebt ihn in eine andere Anlage**
  oder macht **eine eigene Anlage** daraus – so lassen sich falsch
  zusammengefasste Zeilen der Excel-Liste trennen.
- **Termin entfällt** nimmt einen einzelnen Termin aus dem Plan, der Status
  der Anlage gilt für alle ihre Termine.
- Beim Speichern prüft die App: ohne Kürzel kein Termin, und zwei Termine im
  selben Monat fragen nach. Gespeichert wird nur, was sich wirklich geändert
  hat; alles steht mit altem und neuem Wert im Änderungsverlauf.

Neue Märkte und Anlagen lassen sich anlegen; statt zu löschen werden sie
**stillgelegt** – sie verschwinden aus Plan, Karte und Touren, ihre Historie
bleibt. Sammelzeilen der Excel-Liste, die gar keine Märkte sind, lassen sich
über **Aus der Liste entfernen** ganz ausblenden.

Technisch ist das eine **Ebene über der Excel-Liste**: je Markt bzw. Anlage
werden nur die Felder gespeichert, die abweichen. Der Excel-Wert bleibt darunter
erhalten; neben jedem geänderten Feld steht er zum Vergleich, und „Auf
Excel-Stand zurücksetzen" stellt ihn wieder her. Jede Änderung verlangt einen
Grund und landet feldgenau im Änderungsverlauf.

**Wer darf?** Mit gemeinsamer Datenbank nur, wer in der Tabelle `admins`
steht – das prüft die Datenbank bei jedem Schreibzugriff selbst:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'ihre@adresse.at';
```

Ohne gemeinsame Datenbank gelten Änderungen nur auf dem Gerät, auf dem sie
gemacht werden, und gehen später in die gemeinsame Ablage. Dort schützt eine
PIN vor versehentlichen Eingriffen; ein Zugriffsschutz gegen Dritte ist sie
nicht.

**Beim nächsten Excel-Import beachten:** Die Änderungen hängen an den internen
Kennungen der Märkte und Anlagen, und die leiten sich aus der Zeilenfolge der
Liste ab. Wird die Liste neu eingelesen, müssen die Änderungen über
Filialnummer und Anlagendaten neu zugeordnet werden – oder sie werden vorher in
die Excel-Liste übernommen.

## Wartungshistorie je Filiale

Unter **Verlauf** lässt sich jede Filiale aufrufen: wer hat wann welche Anlage
gewartet, nach Jahren geordnet, aus Excel-Liste und App-Protokollen
zusammengeführt. In der Excel-Liste stehen Technikernamen nur für einen Teil
der Einträge; diese Lücken zeigt die Historie offen als „ohne Namen".

## Protokolle ohne gemeinsame Ablage

Die App funktioniert auch ohne eingerichtete Datenbank vollständig. Ein
Protokoll wird **immer zuerst auf dem Gerät** gespeichert – in IndexedDB, nicht
in localStorage, weil localStorage bei rund 5 MB still überläuft und mit
Fotos und Unterschrift nach wenigen Protokollen voll wäre.

Gerätegespeicherte Protokolle stehen in der Liste unter dem Formular (Spalte
„Ablage: Gerät"), lassen sich öffnen, **drucken oder als PDF sichern** und per
CSV exportieren. Die Druckansicht folgt dem Aufbau des bisherigen
Papier-Einseiters, mit Briefkopf, Ankreuzfeldern, Fotos und Unterschrift.

Sobald eine gemeinsame Ablage erreichbar ist, überträgt die App die
Geräteprotokolle von selbst und entfernt sie erst nach bestätigter Übertragung
vom Gerät. Scheitert schon das Speichern auf dem Gerät – etwa in einem privaten
Browserfenster –, sagt die App das deutlich und lässt das Formular mit allen
Eingaben stehen.

## Wer war vor Ort

Neben der Technikerin oder dem Techniker haben zwei weitere Felder Platz für
Kolleginnen und Kollegen, die mitgearbeitet haben. Sie stehen im Protokoll,
auf dem Druckblatt und im Export. Die Zertifikatsnummer wird weiter für die
Hauptperson gemerkt. Dafür einmal `supabase-setup.sql` erneut ausführen, es
legt die Spalte `mitarbeiter` an.

## Protokoll Schritt für Schritt

Über dem Formular steht **„Schritt für Schritt ausfüllen“**. Der Dialog führt
wie bei den Anlagendaten durch ein Thema nach dem anderen – am Handy meist
schneller als das lange Formular:

1. Markt (mit Suche)
2. gewartete bzw. betroffene Anlagen, bei mehreren Terminen auch, als welcher
   der Besuch zählt
3. Anlagendaten prüfen und ergänzen
4. bei Störungen: Lidl-Auftrag (PDF, QR) und die Behebung
5. durchgeführte Arbeiten, auf Wunsch alle auf einmal
6. Mängel
7. Ergebnis, betriebsbereit, Bemerkungen
8. Fotos
9. Name, Uhrzeit und Unterschrift
10. Übersicht, dann speichern

Der Dialog füllt dabei das normale Formular aus. Gespeichert wird also genau
wie sonst – mit Fotos, übernommenen Anlagendaten, Änderungsverlauf und PDF.
Wer lieber tippt, füllt das Formular weiter direkt aus; beides lässt sich
mischen, auch mittendrin.

## Fotos im Wartungsprotokoll

Bis zu acht Bilder je Protokoll, je mit Bildunterschrift. Am Handy öffnet die
Schaltfläche direkt die Kamera.

Die Bilder werden **im Browser verkleinert, bevor sie das Gerät verlassen**:
längste Kante 1600 Pixel, Qualität wird so weit gesenkt, bis das Bild unter
160 KB liegt. Ein typisches Handyfoto schrumpft damit von rund 1,3 MB auf
etwa 140 KB — für Typenschilder und Mängel gut lesbar, im Mobilfunk sparsam.

Gespeichert wird getrennt vom Protokoll: auf Supabase im nicht öffentlichen
Bucket `protokollfotos`, ausgeliefert über zeitlich begrenzte Links. Im
Protokoll steht nur der Verweis. Innerhalb von Claude liegt je Foto ein
eigenes Dokument in der dortigen Datenbank.

Ohne Verbindung wandern Protokoll **und** Bilder zusammen in den
Zwischenspeicher des Geräts und gehen später gemeinsam raus. Ein Protokoll
wird nie gespeichert, bevor seine Fotos übertragen sind — sonst verwiese es
auf Bilder, die es nicht gibt.

## Erscheinungsbild und App-Symbol

Farben, Logo und Symbol stammen aus dem Firmenlogo: **Türkis #019891** und
**Magenta #C4004E**. Im hellen Modus ist das Türkis auf #00726E abgedunkelt,
damit weiße Schrift darauf gut lesbar bleibt; im dunklen Modus wird es
aufgehellt (#4FC2BC) und die Schrift auf farbigen Flächen dunkel
(`--on-accent`). Alle Knöpfe, Reiter und Etiketten liegen damit über 4,5:1
Kontrast, auch im Dunkelmodus.

`logo.png` (600 × 153) kommt aus der Vektorvorlage und steht in der
Kopfzeile und im Briefkopf der Protokolle.

**Zum Homebildschirm hinzufügen:** `manifest.json` und
`apple-touch-icon` verweisen auf `icon-180.png` bzw. `icon-512.png` – das
große K aus dem Logo. Am iPhone: Seite in Safari öffnen, Teilen-Symbol,
„Zum Home-Bildschirm“. Am Android: Menü, „App installieren“.

## Liste herunterladen

Im Reiter **Verlauf** steht oben „Liste herunterladen“: Rückblick (30 Tage
bis 1 Jahr), Vorschau (30 Tage bis 6 Monate) und Region wählen, dann

- **Als CSV für Excel:** eine Datei mit beiden Blöcken – „Erledigt“ und
  „Anstehend“.
- **Drucken / als PDF:** eine Übersicht im Briefkopf mit beiden Tabellen.

„Erledigt“ führt die Protokolle der App und die Termine aus der
Wartungsliste zusammen, „Anstehend“ die nächsten Termine je Anlage.

## Anlagen und Termine

Die Excel-Liste hat eine Zeile je **Wartungstermin**. Eine Anlage mit
Jahres- und Halbjahreswartung steht dort also zweimal. Die App fasst diese
Zeilen wieder zu **einer Anlage mit ihren Terminen** zusammen:

- Zeilen desselben Markts, deren Termine rund ein halbes Jahr auseinander
  liegen, gehören zusammen. Zuerst werden Zeilen mit gleichem Namen
  gepaart, danach die beiden übrigen, falls genau zwei übrig bleiben.
- Die erste Zeile einer Anlage, bevorzugt die Jahreswartung, trägt Name,
  Anlagendaten und Status. Die anderen Zeilen sind nur Termine.
- Zeilen mit **demselben Termin**, z. B. zweimal JW im Mai, werden nicht
  zusammengelegt. Meist ist eine davon die Halbjahreswartung mit falschem
  Kürzel. Die Verwaltung markiert das als Fehler.

Ergebnis beim aktuellen Stand: 261 Termine, 163 Anlagen. 98 davon haben zwei
Termine, 65 einen.

**Im Protokoll** steht je Anlage eine Zeile. Hat sie mehrere Termine, wählt
die App aus, als welcher Termin der Besuch zählt: den fälligen, sonst den
nächstgelegenen. Über „zählt als“ lässt sich das ändern. Nur dieser Termin
rückt ein Jahr weiter. Auf dem Druckblatt steht „Gewartet als:
Halbjahreswartung“.

**In der Verwaltung** sind die Zeilen nach Anlagen geordnet. Weitere Termine
sind eingerückt und haben nur „Termin gilt / entfällt“. Über **„Gehört zu
Anlage“** wird eine Zeile einer anderen Anlage zugeordnet oder mit „eigene
Anlage“ getrennt. So lassen sich falsche automatische Zuordnungen beheben.

## Anlagendaten vor Ort ergänzen

Die Excel-Liste weiß über die Anlagen oft zu wenig. Je Anlage erfasst die
App deshalb zusätzlich:

- Bauart (Split, Multi-Split, VRV luft- oder wassergekühlt, Kaltwassersatz)
- Anzahl der Kältekreisläufe und ob es ein Prüfbuch gibt
- Kältemittel und Füllmenge. Ab 30 kg weist die App auf die
  Halbjahreswartung hin.
- bei wassergekühlten Anlagen: ob Rückkühler und Pumpenstation von UKT
  zu warten sind
- Regelung: welche, betreut von UKT oder einer anderen Firma (mit Namen),
  Fernzugriff ja/nein
- Wo steht was: Außengeräte, elektrische Absicherung und Regelung – aus einer
  Liste der üblichen Orte (Technikraum hinten/vorne, von innen oder außen,
  Dachboden, Dach Filiale, Dach Backshop, Büro, Sozialraum, Pfandraum,
  Backshop, Lager, IT-Raum) oder frei eingetippt
- Typenschild: Hersteller, Modell, Seriennummer (freiwillig)

**Beim Protokoll** steht unter „Anlagendaten“ je angehakter Anlage eine
Karte. Sie zeigt, was bekannt ist und was fehlt. **Ergänzen** öffnet einen
geführten Dialog: ein Thema pro Schritt, große Knöpfe, und gefragt wird nur,
was fehlt. Wer „wassergekühlt“ wählt, bekommt die Frage nach Rückkühler und
Pumpen; ohne eigene Regelung entfallen die Fragen dazu. Am Ende steht eine
Übersicht, in der sich alles ändern lässt. Ist schon alles bekannt, heißt
der Knopf **Prüfen** und führt direkt zur Übersicht.

Die Angaben gehen **mit dem Speichern des Protokolls** in die
Anlagendaten, für alle sichtbar. Im Änderungsverlauf steht jedes Feld mit
altem und neuem Wert, Techniker und Datum. Das Protokoll selbst hält den
Stand der Anlagen zum Zeitpunkt der Wartung fest; so steht es auch auf dem
Druckblatt.

**Anlage fehlt in der Liste:** Über „+ Anlage fehlt in der Liste“ legt der
Techniker sie vor Ort an. Sie ist als „vor Ort neu erfasst“ markiert, und in
der Verwaltung erscheint der Hinweis, Kürzel, Soll-Monat und
Inbetriebnahme festzulegen.

**Rechte:** Anlagendaten dürfen alle angemeldeten Techniker ergänzen, Märkte
nur Admins. Dafür einmal `tools/anlagendaten-techniker.sql` im Supabase SQL
Editor ausführen (steht auch in `supabase-setup.sql`). Bis dahin bleiben die
Ergänzungen von Technikern auf deren Gerät und gehen nach dem Ausführen
automatisch raus.

### Status einer Anlage

In der **Verwaltung** hat jede Anlage einen von drei Zuständen:

- **in Betrieb:** wird gewartet, normale Fälligkeit.
- **zur Zeit nicht gewartet** (mit Grund, z. B. „von Lidl ausgesetzt“): Die
  Anlage bleibt mit allen Daten sichtbar, erscheint aber in keiner
  Fälligkeit. Hat ein Markt nur noch solche Anlagen, steht er nirgends mehr
  als fällig. Zurück auf „in Betrieb“, und die Termine laufen
  weiter.
- **stillgelegt / abgebaut:** Die Anlage ist weg, nur die Historie bleibt.

### Zertifikatsnummern

Die F-Gase-Personenzertifikatsnummer und die Kontaktdaten übernimmt das
Formular automatisch, sobald der Name des Technikers eingetragen ist. Sie
stammen aus seinem letzten Protokoll und stehen damit auf jedem Gerät
bereit; zusätzlich merkt sich das Handy den letzten Stand. Die
Unternehmenszertifikatsnummer wird ebenso übernommen. Ändert jemand die
Nummer, gilt ab dem nächsten Protokoll die neue.

## Störungseinsätze

Unter **Protokoll** wird zwischen **Wartung** und **Störung** umgeschaltet.
Ein Störungsprotokoll gehört zu einem Lidl-Störungsauftrag.

**Den Auftrag übernehmen:** Tippen Sie auf **Auftrag-PDF öffnen** und wählen
Sie die PDF aus der Lidl-Mail. Speichern Sie die PDF dafür vorher aus dem
Mailprogramm in „Dateien“ bzw. „Downloads“. Die App liest dann aus:

- Auftragsnummer und Auftragsdatum
- Störungsnummer und „Ausführen bis“
- Kostenstelle
- Problemtyp und Beschreibung
- Typ, Modell, LIN, IA-Nummer
- Lidl-Ansprechpartner mit Telefon und E-Mail

Der **Markt wird über die Kostenstelle erkannt**: AT0234 ist Filiale 234.
Klappt das nicht, sucht die App über die Adresse.

**QR-Code scannen:** Der QR-Code auf dem Lidl-Auftrag enthält *nur* die
Auftragsnummer. Der Scan ist deshalb gedacht

- für reine Papieraufträge: Die Nummer steht dann im Protokoll, der Rest wird
  abgetippt;
- zur Kontrolle, ob Ausdruck und geöffnete PDF zusammenpassen. Wenn nicht,
  warnt die App.

Gibt es zur Auftragsnummer schon ein Protokoll, weist die App darauf hin.

**Im Formular** stehen statt der Wartungscheckliste diese Felder:

- Ankunft und Fertig
- Fehlerbild vor Ort
- Ursache
- durchgeführte Maßnahmen (Pflichtfeld)
- Material und Ersatzteile
- Kältemittel: nachgefüllt und zurückgewonnen
- Folgeauftrag oder Angebot erforderlich

Mängel, „betriebsbereit“, Fotos und Unterschrift funktionieren wie bei der
Wartung. Drucken und PDF erzeugen ein eigenes Blatt **STÖRUNGSPROTOKOLL**.

**Auswirkung auf die Termine:** keine. Ein Störungsprotokoll hat die
Wartungsart „Störung“. Deshalb verschiebt es weder einen Wartungstermin noch
den „letzten Besuch“ des Marktes. In der **Wartungshistorie** der Filiale
erscheint der Einsatz mit rotem „Störung“-Etikett und dem Problemtyp. Dort
stehen Wartungen und Störungen getrennt gezählt.

In der Datenbank liegen die Angaben in der Spalte `stoerung` der Tabelle
`protokolle`. Dafür `supabase-setup.sql` einmal erneut ausführen.

## Archiv auf der Synology

> Vorbereitet, aber noch nicht eingerichtet: Auf der Synology fehlen noch die
> Berechtigungen. Die App legt die PDFs trotzdem schon ab, sobald der Abschnitt
> „Archiv“ im SQL-Skript ausgeführt ist. Bis dahin passiert in diesem Teil
> nichts, und alles andere funktioniert unverändert.

Jedes Protokoll landet automatisch als PDF auf der Synology, im Ordner
`Ukt/<Jahr>/Lidl/Wartungen`, zum Beispiel
`2026-09-21_Seekirchen_Darko.pdf`. Das PDF sieht aus wie der Ausdruck aus der
App, samt Fotos und Unterschrift. In der Fußzeile stehen die Protokollkennung
und die Fassung.

**So läuft es ab:**

1. Nach dem Speichern erzeugt die App im Hintergrund das PDF und legt es in
   Supabase ab (Bucket `berichte`, Tabelle `berichte`). Das dauert am Handy ein
   paar Sekunden. Der Techniker muss nicht warten.
2. Nach einer **Korrektur** entsteht das PDF neu und ersetzt das alte.
3. Scheitert das Hochladen, etwa im Funkloch, merkt sich das Gerät das
   Protokoll. Es holt das PDF beim nächsten Öffnen der App nach.
4. Das Skript `synology/ukt_archiv.py` läuft auf der Synology alle 15 Minuten.
   Es holt neue und geänderte PDFs ab.
5. Wird ein Protokoll gelöscht, wandert sein PDF nach `_geloescht/`. Wird es
   wiederhergestellt, kommt das PDF zurück.

Das Skript meldet sich mit einem eigenen Konto an (`kammer.m@icloud.com`). Die
Synology muss dafür nicht aus dem Internet erreichbar sein, denn sie holt die
Dateien selbst ab. Das Skript schreibt nur Dateien, die es selbst angelegt
hat. Andere Dateien im Ordner fasst es nicht an.

**Ältere Protokolle** von vor dieser Funktion: **Verwaltung → Archiv
(Synology) → Prüfen**, dann **Fehlende PDFs erzeugen**.

### Einrichtung

1. **Supabase:** `supabase-setup.sql` im SQL Editor noch einmal ausführen. Das
   legt den Abschnitt „Archiv“ an. Bestehende Daten bleiben unverändert.
2. **Konto:** In Supabase unter Authentication → Users muss
   `kammer.m@icloud.com` stehen, mit „Auto Confirm User“.
3. **Skriptordner auf der Synology:** Legen Sie einen Ordner an, den nur
   Administratoren sehen, zum Beispiel `/volume1/homes/<admin>/ukt-archiv`.
   Nehmen Sie **nicht** den Ukt-Ordner, denn in die Einstellungen kommt das
   Passwort. Kopieren Sie `ukt_archiv.py` und `ukt_archiv.beispiel.json` dort
   hinein.
4. Benennen Sie `ukt_archiv.beispiel.json` in `ukt_archiv.json` um und öffnen
   Sie die Datei mit dem Texteditor-Paket. Tragen Sie bei `passwort` das
   Passwort des Archivkontos ein.
5. **Zielpfad prüfen:** File Station → Rechtsklick auf den Ordner `Ukt` →
   Eigenschaften → „Speicherort“. Steht dort etwas anderes als
   `/volume1/Ukt`, tragen Sie es bei `basis` ein.
6. **Aufgabenplaner:** Systemsteuerung → Aufgabenplaner → Erstellen →
   Geplante Aufgabe → Benutzerdefiniertes Skript.
   - Allgemein: Name `UKT Wartungsprotokolle`, Benutzer `root`.
   - Zeitplan: täglich, alle 15 Minuten, von 00:00 bis 23:45.
   - Aufgabeneinstellungen → Befehl:
     `python3 /volume1/homes/<admin>/ukt-archiv/ukt_archiv.py`
7. **Testen:** Erstellen Sie eine zweite Aufgabe mit
   `python3 …/ukt_archiv.py --pruefen`. Führen Sie sie einmal aus
   (Rechtsklick → Ausführen). Unter „Aktion → Ergebnis anzeigen“ steht dann,
   was das Skript tun würde. Es schreibt dabei nichts. Löschen Sie die
   Testaufgabe danach wieder.

Jeder Lauf schreibt ins Protokoll `ukt_archiv.log` im Skriptordner. Ein
Beispiel:

```
angemeldet als kammer.m@icloud.com
37 Protokolle, 37 PDFs in der Datenbank
neu: 2026/Lidl/Wartungen/2026-09-21_Seekirchen_Darko.pdf
fertig: 1 neu, 0 erneuert, 0 nach _geloescht, 0 noch ohne PDF
```

`noch ohne PDF` heißt: Das Handy hat das PDF noch nicht hochgeladen. Es kommt
beim nächsten Lauf nach dem Hochladen.

## Einrichtung der Protokoll-Datenbank

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen (Region Frankfurt).
2. Im **SQL Editor** den Inhalt von `supabase-setup.sql` ausführen.
3. **Authentication → Sign In / Providers**: *Allow new users to sign up*
   ausschalten. Ohne diesen Schritt kann sich jeder aus dem Internet selbst
   einen Zugang anlegen, denn die Seite ist öffentlich erreichbar.
4. **Authentication → Users → Add user**: je ein Konto pro Techniker.
5. **Settings → API**: Project URL und `anon public` Key in `config.js` eintragen.

Der anon-Key ist zur Veröffentlichung bestimmt. Er erlaubt für sich genommen
nichts — was damit möglich ist, regeln die Policies aus dem SQL-Skript. Der
`service_role` Key gehört dagegen niemals in dieses Repository.

## Konten für Techniker

In Supabase unter **Authentication → Users → Add user → Create new user**:
E-Mail, ein Startpasswort, **„Auto Confirm User" anhaken**. Das Startpasswort
persönlich weitergeben. Nach der ersten Anmeldung weist die App darauf hin,
über „Passwort ändern" ein eigenes zu vergeben.

Admin-Rechte (Stammdaten ändern, Protokolle löschen) nur bei Bedarf:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'name@ukt.at';
```

**Passwort vergessen:** Supabase verschickt ohne eigenen Mailserver nur an
Mitglieder des Supabase-Teams – eine Zurücksetzen-Mail an Techniker kommt also
nicht an. Bis ein Mailserver hinterlegt ist (Project Settings → Authentication
→ SMTP), setzt ein Admin im SQL Editor ein neues Startpasswort:

```sql
update auth.users
set encrypted_password = crypt('NeuesStartpasswort', gen_salt('bf')),
    raw_user_meta_data = raw_user_meta_data - 'eigenesPasswort'
where email = 'name@ukt.at';
```

Die zweite Zeile sorgt dafür, dass die App wieder zum Ändern auffordert.

## Hosting

Die Seite ist statisch und braucht keinen Build-Schritt — es reicht, die
Dateien auf einen Webserver zu legen.

**GitHub Pages** (zum Ausprobieren): Repository → Settings → Pages → Source
*Deploy from a branch*, Branch `main`, Ordner `/ (root)`. Das Skript
`deploy-github.ps1` erledigt das mit.

**Eigenes Hosting** (für den Echtbetrieb): den Inhalt dieses Repositories in
das Web-Verzeichnis kopieren, fertig. Sinnvoll sind dort zwei Dinge, die auf
GitHub Pages nicht möglich sind: HTTPS mit eigener Domain und ein
Zugriffsschutz vor der Seite (Basic Auth oder VPN), damit die Anlagendaten
nicht öffentlich einsehbar sind. Die Anmeldung in der App schützt nur die
Protokolle, nicht den Anlagenstamm — der steckt in `daten.js` und ist für
jeden lesbar, der die Seite aufrufen kann.

## Betrieb

Die App erkennt selbst, wo sie läuft: innerhalb von Claude nutzt sie die dortige
Datenbank, auf GitHub Pages Supabase. Ohne beides speichert sie Protokolle nur
lokal im Browser.

Ohne Empfang — Technikraum, Tiefgarage — landet ein abgeschicktes Protokoll im
Zwischenspeicher des Geräts und geht automatisch raus, sobald die Verbindung
wieder steht. Der Techniker muss nichts nachholen.

## Offene Punkte

- **Intervall-Kürzel** in der Spalte *HJ/HI/JW*: JW (148×), HI (64×), HW (23×),
  HJI (8×), HJW (7×), HJ (1×). Die Bedeutung ist nirgends hinterlegt. Bis sie
  feststeht, rechnet die App die Fälligkeit nur über den eingetragenen
  Soll-Monat statt über einen echten Rhythmus.
- **Filiale 592** steht auf zwei Adressen (1200 Wien, Klosterneuburgerstraße 79
  und Vösendorf Nordring 16-18), **Filiale 446** ebenso (7000 Eisenstadt,
  Rusterstraße 145 und Linz Kaisergasse). Je eine davon ist ein Tippfehler.
- 23 Einträge ohne PLZ in der Adresse, 4 Sammelzeilen ohne echten Standort.
  Beides ist in der App unter *Datenbasis* aufgelistet.

## Lizenz und Daten

Der Code steht unter der MIT-Lizenz. Die Anlagen- und Standortdaten sind
Betriebsdaten und ausdrücklich **nicht** Teil der Lizenz.
