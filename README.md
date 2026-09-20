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
