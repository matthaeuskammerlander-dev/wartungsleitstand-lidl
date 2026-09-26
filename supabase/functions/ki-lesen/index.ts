// ki-lesen – Bilder mit Claude auslesen: Prüfbuch-Seiten, Typenschilder,
// eingescannte Lidl-Aufträge. Läuft als Supabase Edge Function (Deno).
//
// Warum hier und nicht in der App: Der Schlüssel für die Claude-Schnittstelle
// (ANTHROPIC_API_KEY) darf nie in die öffentliche Seite. Er liegt als Secret
// in Supabase; die App schickt nur die Bilder und bekommt geprüftes JSON.
//
// Nur angemeldete Techniker dürfen aufrufen. Jeder Aufruf steht mit Art,
// Bildzahl und verbrauchten Tokens in der Tabelle ki_nutzung – so sind die
// Kosten nachvollziehbar, und ein Tageslimit je Person bremst Versehen.
//
// Einrichtung: siehe KI-EINRICHTUNG.md im Ordner der App.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELL = "claude-opus-5";
const MAX_BILDER = 12;                       // eine Prüfbuch-Serie passt, ein Versehen nicht
const MAX_BYTES_JE_BILD = 3_500_000;         // Base64 – die App verkleinert vorher auf ~1600 px
const LIMIT_JE_TAG = Number(Deno.env.get("KI_LIMIT_JE_TAG") ?? "60");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ------------------------------------------------------------ Schemas
// Alles als Text, "" wenn nicht lesbar – die App wandelt Zahlen selbst um.
// "unsicher" nennt die Felder, bei denen die Handschrift nicht eindeutig war;
// die App markiert sie beim Übernehmen.
const text = { type: "string" };
const liste = (props: Record<string, unknown>) => ({
  type: "array",
  items: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
});
const objekt = (props: Record<string, unknown>) => ({
  type: "object", properties: props, required: Object.keys(props), additionalProperties: false,
});

const ANLAGE = {
  bezeichnung: text,        // „Splitanlage – Archiv“, „Verkauf 2“
  hersteller: text, modell: text, seriennummer: text,
  bauart: text,             // Split, Multi-Split, VRV luftgekühlt, VRV wassergekühlt, Kaltwassersatz
  kreislaeufe: text,
  kaeltemittelArt: text,    // R410A, R32 …
  kaeltemittelKg: text,     // „1,85“
  gwp: text, co2t: text,
  leistungKw: text,
  psBar: text, toC: text, tkC: text,
  hermetisch: text,         // ja | nein | ""
  baujahr: text,
  fluidgruppe: text, psv: text, gefahr: text, erstePruefung: text,
  leckageerkennung: text, dichtheitMonate: text, astv: text,
  inbetriebnahme: text,     // TT.MM.JJJJ aus der Bescheinigung nach § 17 KAV
  konformitaet: text,       // Datum der Konformitätserklärung
  aufsteller: text,
  filiale: text, adresse: text,
  wartungsintervallMonate: text, // „12“ oder „6“ – wie im Prüfbuch vorgegeben
};

// ein Typenschild – Außen- oder Innengerät
const GERAET = {
  art: text,                // aussen | innen | "" (wenn nicht erkennbar)
  hersteller: text, modell: text, seriennummer: text, baujahr: text,
  kaeltemittelArt: text,
  werksfuellungKg: text,    // Füllmenge ab Werk laut Schild – nicht die Gesamtfüllmenge der Anlage
  leistungKw: text,         // Kälteleistung
  psBar: text,
};

const SCHEMAS: Record<string, unknown> = {
  pruefbuch: objekt({
    anlage: objekt(ANLAGE),
    pruefungen: liste({ datum: text, firma: text, techniker: text, maengel: text }),
    unsicher: { type: "array", items: text },
    hinweise: text,
  }),
  // je unterschiedlichem Typenschild ein Eintrag – mehrere Innengeräte auf einmal gehen
  typenschild: objekt({
    geraete: liste(GERAET),
    unsicher: { type: "array", items: text },
    hinweise: text,
  }),
  auftrag: objekt({
    auftragsnummer: text, stoerungsnr: text, filialCode: text, problemtyp: text, beschreibung: text,
    auftragsdatum: text, zieltermin: text, prioritaet: text,
    lidlTyp: text, lidlModell: text, hersteller: text, lin: text, seriennummer: text,
    lidlKontakt: text, lidlTelefon: text, lidlMail: text,
    unsicher: { type: "array", items: text },
    hinweise: text,
  }),
};

const ANWEISUNG: Record<string, string> = {
  pruefbuch:
    "Die Bilder sind Seiten eines österreichischen Prüf- und Anlagenbuchs (WKO/ÖKKV-Vordruck) " +
    "für eine Kälte- oder Klimaanlage, teils handschriftlich ausgefüllt. Lies die Stammdaten " +
    "(Seite 2), die technischen Angaben nach DGÜW-V, F-Gase-Verordnung und AStV (Seite 3), die " +
    "Konformitätserklärung (Seite 4/5), die Bescheinigung nach § 17 KAV mit dem Übergabe-/" +
    "Inbetriebnahmedatum (Seite 5/6) und alle eingetragenen Überprüfungen nach § 22 KAV (Seite 8 ff.) " +
    "mit Datum, prüfender Firma (Stempel), Techniker falls lesbar und ob Mängel eingetragen sind " +
    "(\"keine\" wenn in der rechten Spalte „erfolgreich überprüft“ gestempelt ist). " +
    "Lies auch das vorgeschriebene Wartungs- bzw. Überprüfungsintervall in Monaten " +
    "(wartungsintervallMonate, meist 12 oder 6). Als kaeltemittelKg gilt die Gesamtfüllmenge der Anlage. " +
    "Daten immer als TT.MM.JJJJ; steht nur Monat und Jahr, schreibe MM.JJJJ. " +
    "Lass Felder leer, die nicht auf den Bildern stehen – nichts ergänzen, nichts schätzen, " +
    "keine Standardwerte einsetzen. Nimm jedes Feld, bei dem die Handschrift mehrdeutig ist, " +
    "mit seinem Feldnamen in \"unsicher\" auf und erkläre in \"hinweise\" kurz, warum. " +
    "Wenn Bilder zu verschiedenen Anlagen zu gehören scheinen, sag das in \"hinweise\".",
  typenschild:
    "Die Bilder zeigen Typenschilder von Klimageräten – Außengeräte (outdoor unit, Verflüssiger) " +
    "und/oder Innengeräte (indoor unit, Kassette, Wandgerät, Kanalgerät). Lege je unterschiedlichem " +
    "Typenschild einen Eintrag in \"geraete\" an; zeigen mehrere Bilder dasselbe Schild, nur einmal. " +
    "Setze \"art\" auf aussen oder innen, wie es das Schild oder die Modellbezeichnung erkennen lässt, " +
    "sonst leer. Lies Hersteller, Modell/Typ, Seriennummer, Baujahr bzw. Herstelldatum, Kältemittel, " +
    "die Füllmenge ab Werk (werksfuellungKg), die Kälteleistung in kW und den zulässigen Betriebsdruck " +
    "(PS/HP) in bar. Lass leer, was nicht lesbar ist; nichts schätzen. Mehrdeutige Felder als " +
    "\"geraet N: feld\" in \"unsicher\".",
  auftrag:
    "Die Bilder zeigen einen Störungsauftrag von Lidl Österreich an einen Handwerksbetrieb (Ausdruck " +
    "oder PDF-Seite). Lies Auftragsnummer, Störungsnummer, Kostenstelle/Filial-Nr. (z. B. AT0405), " +
    "Problemtyp, Beschreibung, Auftragsdatum, „Ausführen bis“ (als zieltermin), Priorität, Gerätedaten " +
    "(Typ, Modell, Hersteller, LIN/IA-Nummer, Seriennummer) und den Lidl-Ansprechpartner mit Telefon und " +
    "E-Mail. Daten als TT.MM.JJJJ. Lass leer, was nicht dasteht; nichts schätzen.",
};

// ------------------------------------------------------------ Aufruf

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);

  // 1. Wer ruft? Nur angemeldete Konten der App.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return antwort({ fehler: "Bitte anmelden." }, 401);
  // Kunde und Präsentation dürfen nicht (kostet echtes Geld; Rolle aus tools/rollen.sql)
  const { data: darf, error: rollenFehler } = await supabase.rpc("darf_schreiben");
  if (rollenFehler || darf !== true) return antwort({ fehler: "Mit diesem Konto ist die KI-Erkennung nicht freigegeben." }, 403);

  // 2. Was soll gelesen werden?
  let eingabe: { art?: string; bilder?: { media_type: string; data: string }[]; kontext?: string };
  try { eingabe = await req.json(); } catch { return antwort({ fehler: "Anfrage nicht lesbar." }, 400); }
  const art = String(eingabe.art ?? "");
  // Einordnung aus der App (Markt, Anlage, bekannte Techniker) – hilft bei Handschrift
  const kontext = String(eingabe.kontext ?? "").slice(0, 800);
  const bilder = Array.isArray(eingabe.bilder) ? eingabe.bilder : [];
  if (!SCHEMAS[art]) return antwort({ fehler: "Unbekannte Art: " + art }, 400);
  if (!bilder.length) return antwort({ fehler: "Keine Bilder." }, 400);
  if (bilder.length > MAX_BILDER) return antwort({ fehler: `Höchstens ${MAX_BILDER} Bilder auf einmal.` }, 400);
  for (const b of bilder) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(b.media_type) || typeof b.data !== "string")
      return antwort({ fehler: "Nur JPEG-, PNG- oder WebP-Bilder." }, 400);
    if (b.data.length > MAX_BYTES_JE_BILD) return antwort({ fehler: "Ein Bild ist zu groß." }, 400);
  }

  // 3. Tageslimit je Person – schützt vor versehentlichen Serien
  const heute = new Date().toISOString().slice(0, 10);
  const { count } = await supabase.from("ki_nutzung").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("zeit", heute);
  if ((count ?? 0) >= LIMIT_JE_TAG) return antwort({ fehler: "Tageslimit für die KI-Erkennung erreicht." }, 429);

  // 4. Claude fragen
  const client = new Anthropic();          // ANTHROPIC_API_KEY aus den Secrets
  let r;
  try {
    r = await client.beta.messages.create({
      model: MODELL,
      max_tokens: 16000,
      // lehnt das Modell ab, springt serverseitig das empfohlene Ersatzmodell ein
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: { type: "json_schema", schema: SCHEMAS[art] } },
      messages: [{
        role: "user",
        content: [
          ...bilder.map((b) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: b.media_type as "image/jpeg", data: b.data },
          })),
          { type: "text" as const, text: ANWEISUNG[art] + (kontext
              ? "\n\nZur Einordnung (nur als Hilfe beim Entziffern, nichts davon ungelesen übernehmen): " + kontext
              : "") },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return antwort({ fehler: "Die KI ist gerade ausgelastet – bitte gleich noch einmal." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return antwort({ fehler: "KI-Zugang nicht eingerichtet (Schlüssel fehlt oder ungültig)." }, 500);
    if (e instanceof Anthropic.BadRequestError) return antwort({ fehler: "Die Bilder wurden abgelehnt: " + e.message }, 400);
    if (e instanceof Anthropic.APIError) return antwort({ fehler: `KI-Fehler ${e.status}` }, 502);
    return antwort({ fehler: "KI nicht erreichbar." }, 502);
  }

  if (r.stop_reason === "refusal") return antwort({ fehler: "Die KI hat diese Bilder nicht verarbeitet." }, 422);
  if (r.stop_reason === "max_tokens") return antwort({ fehler: "Antwort zu lang – bitte weniger Bilder auf einmal." }, 422);
  const block = r.content.find((b) => b.type === "text");
  let daten: unknown = null;
  try { daten = JSON.parse(block && block.type === "text" ? block.text : ""); }
  catch { return antwort({ fehler: "Die Antwort der KI war nicht lesbar." }, 502); }

  // 5. festhalten, was es gekostet hat
  const { error: nachweisFehler } = await supabase.from("ki_nutzung").insert({
    user_id: user.id, email: user.email, art, bilder: bilder.length, modell: r.model,
    tokens_ein: r.usage.input_tokens, tokens_aus: r.usage.output_tokens,
  });
  // ohne Kostennachweis greift auch das Tageslimit nicht – das muss auffallen
  if (nachweisFehler) console.error("ki_nutzung nicht eingetragen:", nachweisFehler.message);

  return antwort({ art, daten, modell: r.model });
});
