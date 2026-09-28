# Push-Benachrichtigungen, Team-Chat und „Abgerechnet“ einrichten

Alles läuft über Supabase; die App braucht keine weiteren Schlüssel.

## 1. Datenbank (SQL Editor, einmal ausführen)

1. `tools/push.sql` – Geräte-Abos, Ereignisse, Schlüsselpaar, Auslöser
   (Änderungsverlauf, Änderungswünsche, Posteingang), Anstoß der Funktion.
2. `tools/chat.sql` – Team-Chat samt Push-Auslöser.
3. `tools/abrechnung.sql` – „Abgerechnet“-Haken (nur Inhaber).

Voraussetzung: `tools/rollen.sql` ist schon gelaufen (`darf_schreiben`,
`ist_inhaber`, `ist_admin`).

## 2. Funktion „push“ (Edge Functions)

- Neue Funktion `push` mit dem Inhalt von `supabase/functions/push/index.ts`
  anlegen und deployen.
- In den Einstellungen der Funktion **„Verify JWT“ ausschalten**: die
  Datenbank ruft sie ohne Anmeldung an (`push_anstossen`). Das ist
  unbedenklich – ohne Anmeldung verschickt sie nur, was ohnehin ansteht, oder
  gibt den öffentlichen Schlüssel heraus; die Probe-Nachricht prüft die
  Anmeldung selbst.
- Keine Secrets nötig. Das VAPID-Schlüsselpaar legt die Funktion beim ersten
  Aufruf selbst in `push_schluessel` an (der private Teil ist aus der App
  nicht lesbar).
- Die Adresse in `push_anstossen` (tools/push.sql) muss zum Projekt passen.

## 3. In der App

- `sw.js` liegt neben `index.html` (Hintergrund-Helfer, nur für Push – kein
  Zwischenspeicher, die App lädt weiter immer frisch).
- Unter „Angemeldet als“ → „Benachrichtigungen“ schaltet jede Person ihr
  Gerät ein und wählt, worüber sie benachrichtigt werden will.
- iPhone: nur als installierte App (Safari → Teilen → „Zum Home-Bildschirm“),
  ab iOS 16.4.

## Was wann verschickt wird

Jede Änderung landet als Ereignis in `push_ereignisse`. Die Funktion wartet
15 Sekunden, bündelt alles Neue und schickt je Gerät eine Nachricht – nie an
die Person, die die Änderung selbst gemacht hat, nie an Kunde oder
Präsentation, und nur die gewählten Arten. Ein einzelnes Ereignis kommt
ausführlich (Protokoll: Art, Datum, Anlagen, Mängel, Bemerkung; Störung:
Problem, Priorität, Zieltermin, Gerät; Stammdaten: geänderte Felder alt → neu).
Zugangsdaten der Regelung stehen nie in einer Nachricht.

Geräte, die der Push-Dienst nicht mehr kennt (410/404), werden entfernt.
Liegengebliebenes, das älter als 24 Stunden ist, wird nicht mehr verschickt.

## Persönliche Nachrichten im Chat

`tools/chat-direkt.sql` ausführen (nach chat.sql) und die Funktion `push`
neu deployen: Nachrichten mit „An: Person“ sehen nur Absender und
Empfänger, die Push-Nachricht geht nur an den Empfänger (`nur_user`).
