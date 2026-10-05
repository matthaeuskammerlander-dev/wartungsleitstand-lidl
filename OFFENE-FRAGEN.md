# Offene Fragen an das Büro

Nur Fachregeln, Löschen und Rechte – alles andere wird ohne Rückfrage erledigt (siehe ENTSCHEIDUNGEN.md).

| # | Frage | Warum es wichtig ist | Bis zur Antwort gilt |
|---|---|---|---|
| F1 | **Fahrtpauschale Zone 1**: Preis und Positionsnummer (FB 035)? – *Inhaber 03.10.: kommt später aus einer alten KPlus-Rechnung* (Einlesen füllt den Katalog von selbst) | Rechnungen schlagen sie ohne Preis vor | Zeile „Preis fehlt im Katalog“ |
| F2 | **22 Märkte ohne Postleitzahl** – Adressen nachtragen? – *Inhaber: ja* → **erledigt 03.10.**: 14 Adressen eingetragen (mit Kartenlage), ACP nur Ort, 2 Leerzeilen der alten Liste stillgelegt, Rest siehe F3–F5 | Ohne PLZ keine Fahrtzone, keine genaue Karte | Rechnung fragt nach der Zone |
| F3 | **„ACP Gebäude“, „ACP Schauküche“, „ACP Split Foto“**: welche Straße? – **Inhaber 03.10.: ACP ist in Salzburg, nicht Innsbruck** (Ort und Kartenpunkt korrigiert, Fahrtzone 1 eingetragen); Straße als Frage „Vor Ort klären“ an den drei Standorten | Für Karte und Tour (Fahrtzone ist klar: Salzburg = Zone 1) | nur PLZ/Ort eingetragen |
| F4 | **„Traun Sozialraum“ und „Vorchdorf Sozialraum“** – sind das die Lidl-Filialen dort (Kremstalstraße 92 bzw. Neue Landstraße 61)? – **03.10.: als Frage „Vor Ort klären“ eingetragen** | So eingetragen, weil es dort sonst keinen Markt gibt | Adresse der Lidl-Filiale | 
| F5 | **„Kufstein Salurnerstrasse“ (ohne Filialnummer)** liegt genau dort, wo Fil. 422 ist – dieselbe Filiale, zusammenführen? – *Inhaber: ja* → **erledigt 03.10.**: Anlage dorthin verschoben, leerer Eintrag stillgelegt (umkehrbar) | Sonst steht der Markt doppelt da | beide bleiben, gleiche Adresse |

## Aus dem Tiefentest (05.10.2026)

| # | Frage | Warum es wichtig ist | Bis zur Antwort gilt |
|---|---|---|---|
| F6 | **Urlaub löschen**: Darf ein Techniker seinen schon **genehmigten** Urlaub selbst löschen – auch einen Betriebsurlaub mit mehreren Personen? | Mit dem Löschen verschwinden die Urlaubsstunden (bei allen Personen des Eintrags); Ändern setzt genehmigten Urlaub dagegen auf „beantragt“ zurück | Löschen möglich, mit Rückfrage |
| F7 | **Fremde Abwesenheit ändern**: Darf ein Techniker Krankenstand/Urlaub eines **Kollegen** ändern oder kürzen? | Die Stunden des Kollegen ändern sich mit | Datenbank erlaubt es; die App bietet Technikern beim Herausnehmen nur „nur ich“ an |
| F8 | **Bestätigter Monat**: Soll er auch **neue** Einträge sperren (von Hand und Stempeln)? | Rundgang und Regeln sagen „gesperrt“, neue Einträge gehen aber noch | neue Einträge möglich, sie sind unbestätigt |
| F9 | **Halber Tag** Zeitausgleich/Schule mit Uhrzeit: nur nachfragen, wenn die Arbeit **in** diese Zeit fällt? | Jetzt fragt die App bei jeder Arbeit an diesem Tag (der Text stimmt inzwischen) | die App fragt |
| F10 | **Urlaub/Krankenstand am Samstag, Sonntag, Feiertag**: zählt das als Ist? | Monatsbilanz zählt es, Tag/Woche nicht – ergibt Überstunden | wie bisher |
| F11 | **Freitag-Vorgabe** beim Planen 07:00–13:30 ergibt mit Pflichtpause nur 6:00 h (Soll 6:30 h) – auf 07:00–14:00 ändern? | Sonst jeder Freitag −0:30 h | 07:00–13:30 |
| F12 | **„Nur Jahreswartung“ gegen Markt-Halbjahrestermin**: Soll eine bewusste Entscheidung „nur Jahreswartung“ die Automatik „Halbjahrestermin wie am Markt üblich“ sperren? | Jetzt hebt die Automatik die Entscheidung beim nächsten Start still auf | Automatik hebt sie auf |
| F13 | **Werkzeug ausscheiden**: Dürfen Techniker ein Werkzeug aus dem Bestand nehmen, oder nur das Büro (wie Löschen)? | Seit dem Tiefentest mit Rückfrage und über den Filter „Ausgeschieden“ zurückholbar | alle mit Schreibrecht |
| F14 | **Werkzeug in fremdem Auto**: Dürfen Techniker als Ort ein Fahrzeug eines Kollegen wählen (nur Kennzeichen)? | Techniker sehen nur ihre eigenen Fahrzeuge; ohne eigenes Fahrzeug steht ein Hinweis | nur eigenes Fahrzeug, sonst „bei Person“ |
| F15 | **Belegfoto nach Abgabe**: Darf die Person das Foto eines abgegebenen/ausbezahlten Belegs noch austauschen? | Abgegebenes ändert sonst nur der Inhaber | Austausch möglich |
| F16 | **Kilometergeld nur mit Privatauto** – Pflicht (App und Datenbank prüfen) oder nur Hinweis? | Regel sagt „nur fürs Privatauto“, die App lässt es ohne zu | nur Hinweis |
| F17 | **Posteingang**: Sollen Techniker und Admins weitergeleitete Projektmails sehen – auch Einträge mit KPlus-Rechnung (Link an der Karte)? Kunde und Präsentation sehen den Posteingang nicht mehr (tools/posteingang-lesen.sql). Der Posteingang ist noch nicht in Betrieb. | Darin stehen manchmal Angebote, Rechnungen, Preise | Techniker/Admin sehen ihn |
| F18 | **Mails mit Preisen im Text** (ohne Rechnung im Anhang): wer darf sie im Projekt sehen? | Mails mit KPlus-Rechnung/Angebot liegen seit dem Tiefentest nur beim Inhaber | alle mit Projektzugriff |
| F19 | **Neu eingelesener KPlus-Beleg**: welcher Status (Rechnung „versendet“, Angebot „angenommen“)? | Vorhandene Belege behalten seit dem Tiefentest Status und Projekt | wie bisher |
| F20 | **Rechnungsnummer**: sind Lücken im Nummernkreis erlaubt? Die Nummer wird beim Öffnen vergeben – Abbrechen lässt eine Lücke | Im Modus „echt“ wichtig (Buchhaltung) | Nummer beim Öffnen |
| F21 | **Wartungspreis je Art**: welche Katalogposition gehört zu JW, HJW, HJI? Kältemittel ohne Sorte: ohne Preis vorschlagen? | Jetzt nimmt die App die erste Katalogzeile mit „Wartung“ (JW kann den HJW-Preis bekommen) | erste passende Zeile |
| F22 | **Rechnung zu Reparatur/Prüfung**: was soll die App vorschlagen? | Jetzt schlägt sie je Anlage eine Wartung zum Wartungspreis vor | Wartung je Anlage |
| F23 | **KPlus-Gutschriften**: als eigene Belegart führen (Bezug zur Rechnung, negative Summe)? | Werden erkannt und nur als Büro-Datei abgelegt, nicht als Beleg | nur Büro-Datei |
| F24 | **KPlus-Rechnung umgehängt** (von Einsatz A zu B): Vermerk „abgerechnet“ bei A entfernen? | A gilt sonst weiter als abgerechnet | Vermerk bleibt |
| F25 | **Lernen aus KPlus**: Soll eine regelmäßig dazugeschriebene Position die App-Position ersetzen, die dort als „zu viel“ galt? | Jetzt wird sie nur ergänzt | ergänzen |
| F26 | **Abgleich – Lücke als Fahrt**: Soll eine kurze Lücke (≤ 150 min) vor einem Termin an anderem Ort weiter als „Fahrt“ gelten, auch wenn dort z. B. „Baustelle“ gestempelt war? | Fahrt und Baustelle zählen im Lohn verschieden | Fahrt |
| F27 | **Abgleich – verschieben**: Ein Termin mit mehreren Personen wird für alle verschoben, auch wenn nur einer ihn nicht gemacht hat. Nur die eigene Person verschieben? | Kollegen verlieren sonst ihren Termin | für alle |
| F28 | **Über Mitternacht gestempelt** (Nachtstörung): wird der Abgleich mit dem Kalender dafür gebraucht? | Geht derzeit nicht (nur innerhalb eines Tages) | kein Abgleich |
| F29 | **Startpunkt anderer**: Dürfen Techniker den Startpunkt (Tour) einer anderen Person setzen? | Datenbank erlaubt es jedem mit Schreibrecht | erlaubt |
| F30 | **Private Termine**: Soll die Datenbank Material/Werkzeug an privaten Terminen selbst verbergen (nicht nur die App)? Und auch an Urlaub/Krankenstand? | Jetzt verbirgt es nur die App, nur bei „Privat“ | nur die App |
| F31 | **Route**: Der Straßendienst wartet jetzt höchstens 15 s insgesamt (vorher bis 30–45 s). Kürzer, z. B. 8 s? | Kürzer = schneller Luftlinie, aber öfter ungenau | 15 s |
| F32 | **Synology-Posteingang**: zu große Anhänge (> 20 MB) melden? Lidl-Aufträge nicht nur am Betreff erkennen? | Ändern erst mit einem Testlauf von tools/posteingang_test.py (braucht Python) | wie bisher |
| F33 | **„Zählt als“ beim Protokoll**: Soll ein aus „Fällig“ angetippter Termin fest gewählt bleiben, wenn danach das Datum geändert wird? | Jetzt folgt die Vorwahl dem Datum (nur von Hand Gewähltes bleibt) | folgt dem Datum |
