# KI-Erkennung einrichten

Die App kann Prüfbuch-Seiten, Typenschilder und eingescannte Lidl-Aufträge von
Claude (Anthropic) auslesen lassen. Es gibt zwei Wege:

- **Kopier-Weg (sofort nutzbar, ohne Zusatzkosten):** Solange kein API-Zugang
  eingerichtet ist, zeigt „Aus Fotos lesen (KI)“ einen fertigen Auftrag zum
  Kopieren. Den mit den Fotos in der eigenen Claude-App (z. B. Max-Abo) abschicken,
  die Antwort kopieren und in der App einfügen – danach dieselbe Prüfansicht wie
  unten. Kein Schlüssel, kein Konto nötig.
- **Automatisch (API-Zugang):** Die App schickt die Fotos selbst an Claude. Dafür
  braucht es einen API-Zugang auf console.anthropic.com – **kein Team-Tarif,
  keine Arbeitsplätze**: Guthaben aufladen, bezahlt wird nur, was gelesen wird.
  Die Einrichtung steht unten; bis dahin ist dieser Weg **ausgeschaltet**.

## Wie es arbeitet

1. Der Techniker fotografiert (Anlagendialog → „Aus Fotos lesen (KI)“, oder bei
   einer offenen Störung → „Mit KI auslesen“).
2. Die App verkleinert die Bilder (längste Kante 1800 px) und schickt sie an die
   Supabase-Funktion `ki-lesen`. Der Schlüssel für Claude liegt nur dort.
3. Die Funktion prüft die Anmeldung und ein Tageslimit je Person, fragt Claude
   (Modell `claude-opus-5`) mit festem Antwortschema und trägt den Aufruf in
   `ki_nutzung` ein.
4. Die App zeigt das Gelesene zum Prüfen an: je Feld ein Haken, unsichere Felder
   markiert und nie vorbelegt. Übernommen wird nur, was angehakt bleibt;
   gespeichert wie jede andere Änderung, mit Änderungsverlauf.

Im Anlagendialog unter „Aus Fotos lesen (KI)“ gibt es drei Wege:

- **Prüfbuch** (bis 12 Seiten auf einmal): Anlagendaten (Seite 2–4), Gesamtfüllmenge,
  Inbetriebnahme (§ 17 KAV), die Überprüfungen nach § 22 KAV als „Wartungen laut
  Prüfbuch“ und das Wartungsintervall. Besuche, die die Anlage schon hat, werden
  nicht doppelt angeboten (≤ 14 Tage = derselbe Besuch). Steht im Prüfbuch
  „12 Monate“ und ist der Termin keine Jahreswartung, schlägt die App „JW“ vor –
  der **Soll-Monat bleibt immer**. Bei „6 Monaten“ mit nur einem Termin kommt ein
  Hinweis (zweiten Termin in der Verwaltung anlegen).
- **Typenschild Außengerät:** Hersteller, Modell, Seriennummer, Kältemittel,
  Leistung, Betriebsdruck. Die Werksfüllung vom Schild ist **nicht** die
  Füllmenge der Anlage – die kommt nur aus dem Prüfbuch.
- **Typenschilder Innengeräte** (eins oder mehrere Fotos): je Schild ein
  Innengerät; schon erfasste Seriennummern werden nicht doppelt angeboten, den
  Raum trägt man danach ein.

Die App schickt zur Einordnung Filiale, Anlage und die Namen der UKT-Techniker
mit – das hilft beim Entziffern von Handschrift und Stempeln.

## Kosten

Rechnung nach verbrauchten Tokens (Modell `claude-opus-5`, Stand 2026: 5 USD je
Million Eingabe-, 25 USD je Million Ausgabe-Tokens). Ein Foto in 1800 px sind
grob 2.000–3.000 Eingabe-Tokens. Eine Prüfbuch-Serie mit 6 Seiten kostet damit
etwa **10–15 US-Cent**, ein Typenschild 2–4 Cent. Inhaber sehen unter
*Verwaltung → Inhaber* die Summe des Monats. Ein Ausgabenlimit in der Console
schützt vor Überraschungen.

## Einrichten (einmalig, alles im Browser – ca. 15 Minuten)

1. **API-Konto bei Anthropic:** console.anthropic.com – unabhängig vom
   Claude-Abo, ohne Arbeitsplätze. Unter *Billing* Guthaben aufladen (z. B.
   10 USD) und ein **monatliches Ausgabenlimit** setzen (z. B. 20 USD). Unter
   *API Keys* → *Create Key* einen Schlüssel „Wartungsleitstand“ erzeugen und
   kopieren (er wird nur einmal angezeigt; nicht per Mail verschicken).
2. **Supabase – SQL:** Im SQL Editor `tools/ki-und-posteingang.sql` ausführen
   (legt `ki_nutzung` für Kosten und Tageslimit an; setzt `tools/rollen.sql` voraus).
3. **Supabase – Schlüssel hinterlegen:** *Edge Functions* → *Secrets* (bzw.
   *Project Settings → Edge Functions*) → *Add new secret*:
   Name `ANTHROPIC_API_KEY`, Wert = der kopierte Schlüssel. Optional
   `KI_LIMIT_JE_TAG` (Standard 60 Aufrufe je Person und Tag).
4. **Supabase – Funktion anlegen:** *Edge Functions* → *Deploy a new function*
   → *Via Editor*. Name genau **`ki-lesen`**. Den ganzen Inhalt von
   `supabase/functions/ki-lesen/index.ts` in den Editor kopieren (den
   Beispielcode ersetzen) → *Deploy function*. „Verify JWT“ eingeschaltet lassen.
5. **Einschalten:** in `config.js` `kiAktiv: true` setzen und hochladen (das
   übernimmt Claude, sobald Schritt 1–4 erledigt sind).

Klappt der direkte Weg einmal nicht (Netz, Limit, Einrichtung), bietet die App
automatisch den Kopier-Weg über die Claude-App an.

In der Präsentation ist die KI immer aus – sie kostet echtes Geld.

## Datenschutz

Die Bilder gehen an Anthropic (USA/EU je nach Konto) und werden dort nach den
Bedingungen des API-Kontos verarbeitet. Auf den Bildern stehen Lidl-Adressen,
Seriennummern und Namen von Technikern. Bitte vor dem Einschalten mit Lidl bzw.
im eigenen Datenschutzkonzept festhalten.
