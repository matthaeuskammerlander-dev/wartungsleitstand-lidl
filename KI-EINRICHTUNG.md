# KI-Erkennung einrichten

Die App kann Prüfbuch-Seiten, Typenschilder und eingescannte Lidl-Aufträge von
Claude (Anthropic) auslesen lassen. Alles ist vorbereitet und **ausgeschaltet**,
bis diese Schritte erledigt sind.

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

Aus dem Prüfbuch kommen die Anlagendaten (Seite 2–4), die Inbetriebnahme
(§ 17 KAV) und die Überprüfungen nach § 22 KAV als „Wartungen laut Prüfbuch“.
Besuche, die die Anlage schon hat, werden nicht doppelt angeboten.

## Kosten

Rechnung nach verbrauchten Tokens (Stand 2026: 5 USD je Million Eingabe-,
25 USD je Million Ausgabe-Tokens). Ein Bild in 1800 px sind grob 2.000–3.000
Eingabe-Tokens. Eine Prüfbuch-Serie mit 6 Seiten liegt damit bei wenigen
Cent. Inhaber sehen unter *Verwaltung → Inhaber* die Summe des Monats.

## Einrichten (einmalig)

1. **Geschäftskonto bei Anthropic** anlegen (console.anthropic.com), Zahlungsart
   hinterlegen, unter *API Keys* einen Schlüssel erzeugen. Am besten ein eigener
   Workspace „Wartungsleitstand“ mit Ausgabenlimit (z. B. 20 USD im Monat).
2. **SQL:** `tools/ki-und-posteingang.sql` im Supabase SQL Editor ausführen
   (legt `ki_nutzung` an).
3. **Funktion hochladen** – mit der Supabase-Kommandozeile auf einem PC:
   ```
   npx supabase login
   npx supabase link --project-ref crvqnsmepwmqdplrenqm
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy ki-lesen
   ```
   Optional ein anderes Tageslimit je Person: `npx supabase secrets set KI_LIMIT_JE_TAG=40`
   (Standard 60).
4. **Einschalten:** in `config.js` `kiAktiv: true` setzen und hochladen.

In der Präsentation ist die KI immer aus – sie kostet echtes Geld.

## Datenschutz

Die Bilder gehen an Anthropic (USA/EU je nach Konto) und werden dort nach den
Bedingungen des API-Kontos verarbeitet. Auf den Bildern stehen Lidl-Adressen,
Seriennummern und Namen von Technikern. Bitte vor dem Einschalten mit Lidl bzw.
im eigenen Datenschutzkonzept festhalten.
