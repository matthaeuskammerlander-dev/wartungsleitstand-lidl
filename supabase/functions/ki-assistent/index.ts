// ki-assistent – der Claude-Assistent im Leitstand (Knopf ✦, Inhaber 29.10.2026: „so nutzen wie ich es mit dir nutze –
// Protokolle, Vorbereitung für Inbetriebnahme, Wartung, Störung, Arbeitsnachweis, Angebot, Rechnung, Anlagenschema,
// technische Beschreibung, Mail-Vorschlag“). Läuft als Supabase Edge Function (Deno), der Schlüssel ANTHROPIC_API_KEY
// bleibt als Secret in Supabase (derselbe wie bei ki-lesen und ki-frage).
//
// Arbeitsweise: Die App führt das Gespräch. Sie schickt bei jedem Schritt das ganze bisherige Gespräch (Text, Bilder,
// Werkzeug-Ergebnisse) – diese Funktion fragt Claude EINMAL und gibt die Antwort zurück. Will Claude etwas wissen
// (Markt, Projekt, Katalog …) oder einen Entwurf zeigen, ruft es ein Werkzeug; das führt die App selbst aus – mit genau
// den Daten, die das angemeldete Konto ohnehin sehen darf – und schickt das Ergebnis im nächsten Schritt mit.
// Entwürfe öffnen sich in den gewohnten Formularen; speichern, unterschreiben und versenden macht immer die Person.
//
// Wer darf: nur Inhaber (KI_ASSISTENT_ALLE=1 schaltet ihn auch für Admins und Techniker frei – ohne Preis-Werkzeuge).
// Preise (Katalog, Angebot, Rechnung) und die Lidl-Unterlagen bekommt Claude nur bei Inhabern als Werkzeug – das prüft
// diese Funktion selbst (ist_inhaber), nicht nur die App. Jeder Schritt steht in ki_nutzung (art = „assistent“).

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELL = "claude-opus-5-5";
const LIMIT_JE_TAG = Number(Deno.env.get("KI_ASSISTENT_JE_TAG") ?? "300");   // Schritte je Person und Tag (eine Aufgabe ≈ 3–6)
const ALLE = Deno.env.get("KI_ASSISTENT_ALLE") === "1";
const MAX_NACHRICHTEN = 120;
const MAX_BILDER = 12;                         // im ganzen Gespräch – die App verkleinert auf 1568 px
const MAX_BYTES_JE_BILD = 3_500_000;
const MAX_ZEICHEN = 60_000;                    // je Textblock bzw. Werkzeug-Ergebnis

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Mitternacht des heutigen Tages in Österreich (Europe/Vienna) als Zeitpunkt (ISO, UTC) – wie in ki-frage
function tagesbeginnWien(jetzt: Date): string {
  const teil = (f: Intl.DateTimeFormat, d: Date, typ: string) => f.formatToParts(d).find((t) => t.type === typ)?.value ?? "";
  const datum = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" });
  const tag = `${teil(datum, jetzt, "year")}-${teil(datum, jetzt, "month")}-${teil(datum, jetzt, "day")}`;
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", timeZoneName: "longOffset" });
  const versatz = teil(zone, new Date(tag + "T00:00:00Z"), "timeZoneName").replace("GMT", "") || "Z";
  return new Date(tag + "T00:00:00" + versatz).toISOString();
}

const SYSTEM = `Du bist der Assistent im „Wartungsleitstand“ von Kammerlander Umwelt- und Klimatechnik GmbH (UKT), St. Johann in Tirol. UKT wartet, repariert und baut Kälte- und Klimaanlagen (Split, Multi-Split, VRV, Kaltwassersätze, Wärmepumpen) – vor allem in Lidl-Filialen in Österreich, dazu Projekte für andere Kunden. Mit dir arbeiten die Inhaber; oft vom Handy, im Auto oder auf der Baustelle.

Deine Aufgabe: Arbeit vorbereiten, so wie ein erfahrener Kollege im Büro – Störungs- und Wartungsprotokolle, Arbeitsnachweise, Inbetriebnahmeprotokolle, Vorbereitung auf Wartung oder Inbetriebnahme, Angebote, Rechnungen, Lidl-Unterlagen (technische Beschreibung, Anlagenschema, KAV-Bestätigung) und Mail-Vorschläge. Dazu Fachfragen (Kältetechnik, F-Gase, KAV, ÖNORM EN 378, Fehlersuche).

So arbeitest du:
- Hol dir zuerst die Daten aus der App: „suchen“ für Kennungen, dann „markt_lesen“, „projekt_lesen“, „protokoll_lesen“, „katalog_suchen“. Rate nie eine Kennung (id) – nimm nur Kennungen aus Werkzeug-Ergebnissen.
- Entwürfe zeigst du mit den entwurf_…-Werkzeugen. Sie öffnen das gewohnte Formular in der App, vorausgefüllt. Speichern, Unterschreiben und Versenden macht immer die Person selbst – sag nie, etwas sei gespeichert oder verschickt.
- Protokolle, Arbeitsnachweise und Inbetriebnahmeprotokolle entstehen immer im Namen der angemeldeten Person – nie für jemand anderen.
- Erfinde nichts: Messwerte, Drücke, Temperaturen, Seriennummern, Füllmengen, Uhrzeiten, Auftragsnummern und Preise nur, wenn sie aus den App-Daten, den Fotos oder dem Gesagten kommen. Fehlt etwas Wichtiges, lass das Feld leer und nenne es kurz in „hinweise“ bzw. frag nach.
- Fotos und Screenshots: lies genau (Typenschilder, Fehlercodes, Displays, Lidl-Aufträge, Mails, Pläne); Unsicheres als unsicher kennzeichnen.
- Ist der Auftrag klar, mach den Entwurf gleich, ohne viele Rückfragen. Ist er unklar (welcher Markt, welche Anlage, welcher Kunde), frag kurz nach.

Fachliche Regeln von UKT:
- Aus einer Störung entstehen nie Wartungstermine.
- Ist eine bauseitige Kondensatleitung die Ursache, ist UKT nicht zuständig: nur als Empfehlung an den Kunden in die Bemerkungen, kein Folgeauftrag, kein Angebot.
- Per Fernzugriff behoben (ohne Besuch) = kein Lidl-Rapport; die Erledigung schriftlich an Lidl melden (Mail-Vorschlag).
- Wartung: Jahreswartung (JW) im Monat der Inbetriebnahme; ab 30 kg Kältemittel Halbjahreswartung (HJW), sonst Halbjahresinspektion (HJI), sechs Monate versetzt.
- Preise nur aus dem Katalog (katalog_suchen) – Positionen mit katalog_id; ohne Katalog-Treffer die Position ohne Preis anlegen (die App markiert sie). Fahrtpauschale: Zone 2 = Kärnten, Steiermark, Vorarlberg und Tirol ab Innsbruck westlich sowie Osttirol, sonst Zone 1.
- Lidl-Rechnungen: Bestellnummer (Lidl-Auftrag) in den Betreff bzw. Kopf; Leistungsstandort setzt die App.

Schreiben: Deutsch (österreichisch üblich, „Jänner“), kurz, klar, ohne Fachchinesisch, wo es nicht nötig ist. Protokolltexte sachlich und knapp, wie ein Techniker sie schreibt. Mails freundlich und professionell, mit der Unterschrift aus „Angaben zur Person“. In Antworten keine Tabellen, nur kurze Absätze oder Aufzählungen. Keine Passwörter oder Zugangsdaten wiedergeben.`;

// ---- Werkzeuge: die App führt sie aus. Reihenfolge fest (Zwischenspeicher der Anfrage) ----
const s = (beschreibung: string) => ({ type: "string", description: beschreibung });
const WERKZEUGE_LESEN = [
  { name: "suchen", description: "Märkte (Lidl-Filialen und andere Standorte), Projekte und Kunden in der App suchen – nach Name, Filialnummer, Ort, Straße, Projektnummer oder Projekttitel. Liefert die Kennungen (markt_id, projekt_id, kunde_id) für die anderen Werkzeuge.",
    input_schema: { type: "object", properties: { text: s("Suchbegriff, z. B. „Mattighofen“, „464“, „P-2026-011“, „Michael Kors“") }, required: ["text"] } },
  { name: "markt_lesen", description: "Alles zu einem Markt: Adresse, Region, Anlagen (anlage_id, Typ, Hersteller, Modell, Seriennummer, Kältemittel, Füllmenge, Inbetriebnahme, Aufstellort, Innengeräte), Wartungstermine, offene Störungen (stoerung_id, Lidl-Auftragsnummer, Beschreibung), die letzten Protokolle (protokoll_id), Fragen vor Ort, was dort abzuholen ist.",
    input_schema: { type: "object", properties: { markt_id: s("Kennung aus „suchen“") }, required: ["markt_id"] } },
  { name: "protokoll_lesen", description: "Ein gespeichertes Wartungs- oder Störungsprotokoll mit allen Angaben (Arbeiten, Mängel, Störung, Material, Kältemittel, Bemerkungen).",
    input_schema: { type: "object", properties: { protokoll_id: s("Kennung aus „markt_lesen“") }, required: ["protokoll_id"] } },
  { name: "projekt_lesen", description: "Ein Projekt: Kunde, Markt, Projektart, Stand, Angaben, Beteiligte, Anlagen, Termine, Tagebuch, Arbeitsnachweise und Inbetriebnahmeprotokolle; bei Inhabern auch Angebote und Rechnungen.",
    input_schema: { type: "object", properties: { projekt_id: s("Kennung aus „suchen“") }, required: ["projekt_id"] } },
];
const WERKZEUG_KATALOG = { name: "katalog_suchen", description: "Positionen aus dem Preiskatalog (u. a. Lidl-Rahmenvertrag FB035, Wartungen, Regiestunden, Fahrtpauschalen, Material) mit katalog_id, Text, Einheit, Preis und Hinweis. Mehrere Begriffe = alle müssen vorkommen.",
  input_schema: { type: "object", properties: { text: s("Suchbegriff, z. B. „Fahrtpauschale Zone 1“, „Regiestunde“, „FB035“, „Kondensatpumpe“") }, required: ["text"] } };

const PROTO_ARBEITEN = ["Sicht-/Sicherheitsprüfung", "Betriebszustand/Fehlerspeicher", "Filter geprüft/gereinigt/getauscht", "Wärmetauscher geprüft/gereinigt",
  "Kondensatwanne", "Ventilatoren/Motoren/Luftführung", "Elektrische Anschlüsse/Schutzorgane/Erdung", "Kältemittelleitungen/Isolierung/Absperrorgane",
  "Drücke/Temperaturen/Überhitzung/Unterkühlung", "Regelung/Sensoren/Sollwerte", "Abtauung/Heizbetrieb", "Korrosion/Befestigungen/Schwingungen"];
const hinweise = s("Kurz an die Person: was fehlt oder zu prüfen ist (erscheint über dem Formular)");
const WERKZEUGE_ENTWURF = [
  { name: "entwurf_protokoll", description: "Störungs- oder Wartungsprotokoll vorausgefüllt im Reiter Protokoll öffnen (im Namen der angemeldeten Person). Leere Angaben weglassen. Bei einer offenen Störung deren stoerung_id mitgeben – dann kommen Lidl-Auftrag und Beschreibung aus der Störung.",
    input_schema: { type: "object", properties: {
      art: { type: "string", enum: ["stoerung", "wartung"] },
      markt_id: s("Kennung des Markts"),
      anlage_ids: { type: "array", items: { type: "string" }, description: "anlage_id der betroffenen bzw. gewarteten Anlagen aus „markt_lesen“" },
      stoerung_id: s("offene Störung aus „markt_lesen“, die dieses Protokoll erledigt"),
      datum: s("Einsatzdatum JJJJ-MM-TT"),
      auftragsnummer: s("Lidl-Auftragsnummer, nur wenn ohne stoerung_id bekannt"),
      beschreibung: s("Störung: Beschreibung laut Auftrag (nur ohne stoerung_id)"),
      fehlerbild: s("Störung: Fehlerbild vor Ort"), ursache: s("Störung: Ursache"), massnahmen: s("Störung: durchgeführte Maßnahmen"),
      arbeiten: { type: "array", items: { type: "string", enum: PROTO_ARBEITEN }, description: "Wartung: durchgeführte Arbeiten" },
      arbeiten_sonst: s("Wartung: sonstige Arbeiten"),
      maengel: { type: "array", items: { type: "object", properties: { text: s("Mangel / Feststellung"), prioritaet: { type: "string", enum: ["niedrig", "mittel", "hoch", "sofort"] }, massnahme: s("empfohlene Maßnahme / Frist") }, required: ["text"] } },
      material: { type: "array", items: { type: "object", properties: { text: s("Material / Ersatzteil"), menge: s("Menge mit Einheit") }, required: ["text"] } },
      kaeltemittel: { type: "object", properties: { art: s("z. B. R410A"), nachgefuellt_kg: s("kg"), zurueckgewonnen_kg: s("kg") } },
      betriebsbereit: { type: "string", enum: ["ja", "eingeschränkt", "nein"] },
      sofortmassnahme: s("Sofortmaßnahme"), bemerkungen: s("Bemerkungen (auch Empfehlungen an den Kunden)"),
      folgeauftrag: { type: "boolean", description: "Störung: Folgeauftrag / Angebot erforderlich (nicht bei bauseitigen Ursachen)" },
      folgeauftrag_text: s("Störung: was ist noch zu tun"),
      hinweise,
    }, required: ["art", "markt_id"] } },
  { name: "entwurf_arbeitsnachweis", description: "Arbeitsnachweis (Arbeitsbericht) zu einem Projekt vorausgefüllt öffnen – im Namen der angemeldeten Person.",
    input_schema: { type: "object", properties: {
      projekt_id: s("Kennung des Projekts"), datum: s("JJJJ-MM-TT"),
      zeilen: { type: "array", items: { type: "object", properties: { datum: s("JJJJ-MM-TT"), von: s("HH:MM"), bis: s("HH:MM"), pause_h: { type: "number" }, personen: { type: "number" } }, required: ["datum"] }, description: "Arbeitszeiten je Tag" },
      arbeiten: s("ausgeführte Arbeiten"), material: s("verbautes Material, je Zeile eines"), pruefungen: s("durchgeführte Prüfungen"), vorkommnisse: s("besondere Vorkommnisse"),
      hinweise,
    }, required: ["projekt_id"] } },
  { name: "entwurf_inbetriebnahme", description: "Inbetriebnahmeprotokoll Kälteanlage zu einem Projekt vorausgefüllt öffnen. Die Anlagendaten (Typenschild, Kältemittel) setzt die App aus der Anlage; du ergänzt nur, was gemessen bzw. gesagt wurde.",
    input_schema: { type: "object", properties: {
      projekt_id: s("Kennung des Projekts"), datum: s("JJJJ-MM-TT"),
      anlagen: { type: "array", items: { type: "object", properties: {
        anlage_id: s("anlage_id aus „projekt_lesen“ bzw. „markt_lesen“"),
        fuellWerk: s("Füllmenge werkseitig (kg)"), nachfuellung: s("Nachfüllung (kg)"), rohrlaenge: s("Rohrleitungslänge (m)"), elektrisch: s("elektrischer Anschluss / Absicherung"),
        messwerte: { type: "object", description: "nur gemessene Werte: pVerd, tVerd, pVerfl, tVerfl, ueberhitzung, unterkuehlung, tAussen, tInnenEin, tInnenAus, strom, spannung, hoehe", additionalProperties: { type: "string" } },
        regelung: { type: "object", description: "sollKuehlen, sollHeizen, betriebsart, zeitprogramm, nacht (ja/nein), nachtVon, nachtBis, notiz", additionalProperties: { type: "string" } },
        wasser: { type: "object", description: "wassergekühlt: medium, konz, frost, druck, tEin, tAus, durchfluss, stroemung, pumpe", additionalProperties: { type: "string" } },
      }, required: ["anlage_id"] } },
      bemerkungen: s("Bemerkungen"), hinweise,
    }, required: ["projekt_id"] } },
  { name: "entwurf_mail", description: "Mail-Vorschlag zeigen (zum Kopieren bzw. Öffnen im Mail-Programm). Verschickt wird nichts.",
    input_schema: { type: "object", properties: { an: s("Empfänger-Adresse(n), falls bekannt"), betreff: s("Betreff"), text: s("Mailtext samt Anrede und Unterschrift"), hinweise }, required: ["betreff", "text"] } },
];
const WERKZEUGE_INHABER = [
  { name: "entwurf_beleg", description: "Angebot oder Rechnung im Beleg-Editor vorausgefüllt öffnen (Nummer vergibt erst das Speichern). Positionen mit katalog_id übernehmen Text, Einheit und Preis aus dem Katalog; ohne katalog_id ohne Preis, außer der Preis wurde genannt.",
    input_schema: { type: "object", properties: {
      art: { type: "string", enum: ["angebot", "rechnung"] },
      projekt_id: s("Projekt, zu dem der Beleg gehört"), protokoll_id: s("oder: Wartungs-/Störungsprotokoll"), markt_id: s("oder: nur der Markt"), kunde_id: s("Kunde, wenn weder Projekt noch Protokoll"),
      betreff: s("Betreff"),
      positionen: { type: "array", items: { type: "object", properties: {
        typ: { type: "string", enum: ["pos", "text"], description: "pos = Position, text = Textzeile/Zwischenüberschrift" },
        katalog_id: s("aus „katalog_suchen“"), text: s("Positionstext (ohne katalog_id nötig)"), menge: { type: "number" }, einheit: s("Stk, Std, m, psch …"),
        preis: { type: "number", description: "nur ohne katalog_id und nur wenn genannt" } } } },
      hinweise,
    }, required: ["art", "positionen"] } },
  { name: "entwurf_lidl_unterlagen", description: "Lidl-Unterlagen eines Lidl-Projekts öffnen (technische Beschreibung, Anlagenschema A3, KAV-Bestätigung, Inbetriebnahme) – mit vorgeschlagenen Angaben. Das Anlagenschema zeichnet die App aus den Anlagen des Projekts; du lieferst die Texte.",
    input_schema: { type: "object", properties: {
      projekt_id: s("Kennung des Lidl-Projekts"),
      angaben: { type: "object", description: "nur geänderte Felder: bauvorhaben, allgemein, demontage (je Zeile ein Punkt), weiter (Weiterverwendung, je Zeile), aufstellort, betreiber, planungBau, planungTga, kavUnter, betriebszeit, regelung, wrg, puffer, schallText, schallQuelle, nachtVon, nachtBis, datum (JJJJ-MM-TT)", additionalProperties: { type: "string" } },
      hinweise,
    }, required: ["projekt_id"] } },
];

type Block = Record<string, unknown>;
type Nachricht = { role: string; content: Block[] | string };

// Gespräch aus der App prüfen: Rollen im Wechsel, beginnt und endet mit der Person, nur bekannte Bausteine, Grenzen
function gespraechPruefen(roh: unknown): { l: Nachricht[]; bilder: number; letzteBilder: number } | string {
  if (!Array.isArray(roh) || !roh.length) return "Kein Gespräch.";
  if (roh.length > MAX_NACHRICHTEN) return "Das Gespräch ist zu lang – bitte „Neues Gespräch“.";
  let bilder = 0, letzteBilder = 0;
  const l: Nachricht[] = [];
  for (let i = 0; i < roh.length; i++) {
    const n = roh[i] as Nachricht;
    const rolle = n && n.role;
    if (rolle !== (i % 2 ? "assistant" : "user")) return "Gespräch durcheinander.";
    const inhalt = typeof n.content === "string" ? [{ type: "text", text: n.content }] : n.content;
    if (!Array.isArray(inhalt) || !inhalt.length) return "Leere Nachricht.";
    let bildHier = 0;
    for (const b of inhalt) {
      const t = b && b.type;
      if (rolle === "user") {
        if (t === "text") { if (typeof b.text !== "string" || b.text.length > MAX_ZEICHEN) return "Text zu lang."; }
        else if (t === "image") {
          const q = b.source as Record<string, unknown> | undefined;
          if (!q || q.type !== "base64" || !/^image\/(jpeg|png|webp|gif)$/.test(String(q.media_type)) || typeof q.data !== "string" || q.data.length > MAX_BYTES_JE_BILD) return "Bild nicht lesbar oder zu groß.";
          bilder++; bildHier++;
        } else if (t === "tool_result") {
          if (typeof b.tool_use_id !== "string") return "Werkzeug-Ergebnis ohne Bezug.";
          if (typeof b.content === "string" && b.content.length > MAX_ZEICHEN) b.content = b.content.slice(0, MAX_ZEICHEN) + "\n… (gekürzt)";
        } else return "Unbekannter Baustein.";
      } else if (!["text", "thinking", "redacted_thinking", "tool_use", "fallback"].includes(String(t))) return "Unbekannter Baustein (Antwort).";
    }
    if (rolle === "user") letzteBilder = bildHier;
    l.push({ role: rolle, content: inhalt });
  }
  if (l[l.length - 1].role !== "user") return "Das Gespräch muss mit der Person enden.";
  if (bilder > MAX_BILDER) return `Höchstens ${MAX_BILDER} Bilder je Gespräch – bitte „Neues Gespräch“.`;
  return { l, bilder, letzteBilder };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);

  // Anfrage zuerst ganz lesen (sonst hängt der Upload am Handy)
  let e: { nachrichten?: unknown } = {};
  try { e = await req.json(); } catch { return antwort({ fehler: "Anfrage nicht lesbar." }, 400); }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return antwort({ fehler: "Bitte anmelden." }, 401);
  const { data: darf, error: rollenFehler } = await supabase.rpc("darf_schreiben");
  if (rollenFehler || darf === false) return antwort({ fehler: "Mit diesem Konto ist der Claude-Assistent nicht freigegeben." }, 403);
  const { data: inhaber, error: inhaberFehler } = await supabase.rpc("ist_inhaber");
  const istInhaber = !inhaberFehler && inhaber === true;
  if (!istInhaber && !ALLE) return antwort({ fehler: "Der Claude-Assistent ist vorerst nur für den Inhaber freigegeben." }, 403);

  const g = gespraechPruefen(e.nachrichten);
  if (typeof g === "string") return antwort({ fehler: g }, 400);

  const { count } = await supabase.from("ki_nutzung").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("art", "assistent").gte("zeit", tagesbeginnWien(new Date()));
  if ((count ?? 0) >= LIMIT_JE_TAG) return antwort({ fehler: "Tageslimit für den Claude-Assistenten erreicht – morgen geht es weiter." }, 429);

  const werkzeuge = [...WERKZEUGE_LESEN, ...(istInhaber ? [WERKZEUG_KATALOG] : []), ...WERKZEUGE_ENTWURF, ...(istInhaber ? WERKZEUGE_INHABER : [])];
  const client = new Anthropic();
  let r;
  try {
    // Zwischenspeicher (cache_control): das gleichbleibende Gespräch wird je Schritt nur einmal voll bezahlt.
    // fallbacks: lehnt das Modell eine Anfrage ab, übernimmt das von Anthropic empfohlene Ersatzmodell.
    r = await client.beta.messages.create({
      model: MODELL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools: werkzeuge,
      messages: g.l,
    } as any);
  } catch (x) {
    if (x instanceof Anthropic.RateLimitError) return antwort({ fehler: "Claude ist gerade ausgelastet – bitte gleich noch einmal." }, 429);
    if (x instanceof Anthropic.AuthenticationError) return antwort({ fehler: "KI-Zugang nicht eingerichtet (Schlüssel fehlt oder ungültig)." }, 500);
    if (x instanceof Anthropic.BadRequestError) { console.error("Anfrage abgelehnt:", x.message); return antwort({ fehler: "Claude hat die Anfrage nicht angenommen – bitte „Neues Gespräch“." }, 400); }
    if (x instanceof Anthropic.APIError) return antwort({ fehler: `KI-Fehler ${x.status}` }, 502);
    return antwort({ fehler: "Claude nicht erreichbar." }, 502);
  }

  // Kostennachweis gleich nach der Antwort – auch eine Ablehnung ist bezahlt. Zwischengespeicherte Tokens kosten
  // beim Schreiben das 1,25-fache, beim Lesen ein Zehntel: tokens_ein ist der Gegenwert in vollen Eingabe-Tokens,
  // damit die Kostenübersicht der App (Tokens × Preis) ohne neue Spalten stimmt.
  const u = r.usage as unknown as Record<string, number>;
  const ein = Math.round((u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0));
  const { error: nf } = await supabase.from("ki_nutzung").insert({
    user_id: user.id, email: user.email, art: "assistent", bilder: g.letzteBilder, modell: r.model,
    tokens_ein: ein, tokens_aus: u.output_tokens || 0,
  });
  if (nf) console.error("ki_nutzung nicht eingetragen:", nf.message);

  if (r.stop_reason === "refusal") return antwort({ fehler: "Darauf antwortet Claude nicht – bitte anders formulieren oder „Neues Gespräch“." }, 422);
  return antwort({ inhalt: r.content, stop: r.stop_reason, modell: r.model, tokens: { ein, aus: u.output_tokens || 0 } });
});
