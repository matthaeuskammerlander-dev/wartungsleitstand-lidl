// ki-frage – allgemeine Fragen an Claude direkt aus dem Wartungsleitstand
// („Claude fragen“). Läuft als Supabase Edge Function (Deno), der Schlüssel
// ANTHROPIC_API_KEY bleibt als Secret in Supabase (derselbe wie bei ki-lesen).
//
// Die App schickt das bisherige Gespräch (nur Text) und auf Wunsch eine kurze
// Beschreibung dessen, was gerade offen ist (Markt, Anlagen, Termine).
// Nur angemeldete Konten, die mitarbeiten (nicht Kunde/Präsentation). Jede
// Frage steht mit Tokens in ki_nutzung (art = „frage“), Tageslimit je Person.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELL = "claude-opus-5";
const LIMIT_JE_TAG = Number(Deno.env.get("KI_FRAGEN_JE_TAG") ?? "100");
const MAX_NACHRICHTEN = 20;
const MAX_ZEICHEN = 8000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Du bist der Assistent im „Wartungsleitstand Lidl“ von Kammerlander Umwelt- und Klimatechnik (UKT), St. Johann in Tirol. UKT wartet Kälte- und Klimaanlagen (Split, Multi-Split, VRV, Kaltwassersätze) in Lidl-Filialen in Österreich. Die Fragen kommen von Technikern und dem Büro, oft vom Handy im Einsatz.

Antworte auf Deutsch (österreichisch üblich, „Jänner“), kurz, klar und praxisnah – ohne Fachchinesisch, wo es nicht nötig ist. Keine langen Einleitungen. Nutze kurze Absätze oder Aufzählungen, keine Tabellen.

Fachlich: Kältetechnik, Fehlersuche, Kältemittel (F-Gase-Verordnung, GWP, CO₂-Äquivalent), österreichische Kälteanlagenverordnung (KAV), Dichtheitskontrollen, Prüfbücher, ÖNORM EN 378, Arbeitsschutz. Sei ehrlich, wenn du dir bei Grenzwerten, Fristen oder Paragraphen nicht sicher bist oder sich Vorschriften geändert haben können – dann sag das und nenne, wo man es nachprüft. Bei Sicherheitsfragen (Strom, Druck, Kältemittel) immer auf sichere Arbeitsweise hinweisen.

Über die App (falls danach gefragt): Reiter Fällig, Karte, Anlagen, Protokoll, Verlauf, Verwaltung, Datenbasis. Terminregeln des Büros: Jahreswartung (JW) im Monat der Inbetriebnahme, sechs Monate versetzt Halbjahreswartung (HJW, ab 30 kg Kältemittel) bzw. Halbjahresinspektion (HJI); Einträge ≤ 14 Tage auseinander sind derselbe Besuch; eine spätere Wartung erfüllt einen versäumten Termin als verspätet, wenn sie mehr als 3 Monate vor dem nächsten Termin liegt, sonst gilt der versäumte als ausgelassen. Wünsche für Änderungen an der App: unten „💡 Änderung vorschlagen“.

Wenn unten Angaben „Aus der App“ stehen, beziehen sie sich auf das, was die Person gerade offen hat. Nutze sie, erfinde aber keine Daten, die dort nicht stehen.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);

  // Anfrage zuerst ganz lesen (sonst hängt der Upload am Handy)
  let e: { nachrichten?: { role: string; text: string }[]; kontext?: string } = {};
  try { e = await req.json(); } catch { return antwort({ fehler: "Anfrage nicht lesbar." }, 400); }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return antwort({ fehler: "Bitte anmelden." }, 401);
  const { data: darf, error: rollenFehler } = await supabase.rpc("darf_schreiben");
  if (!rollenFehler && darf === false) return antwort({ fehler: "Mit diesem Konto ist „Claude fragen“ nicht freigegeben." }, 403);

  const l = (Array.isArray(e.nachrichten) ? e.nachrichten : []).slice(-MAX_NACHRICHTEN)
    .filter((n) => (n.role === "user" || n.role === "assistant") && typeof n.text === "string" && n.text.trim())
    .map((n) => ({ role: n.role as "user" | "assistant", content: n.text.slice(0, MAX_ZEICHEN) }));
  // muss mit einer Frage beginnen und enden
  while (l.length && l[0].role !== "user") l.shift();
  if (!l.length || l[l.length - 1].role !== "user") return antwort({ fehler: "Keine Frage." }, 400);

  const heute = new Date().toISOString().slice(0, 10);
  const { count } = await supabase.from("ki_nutzung").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("art", "frage").gte("zeit", heute);
  if ((count ?? 0) >= LIMIT_JE_TAG) return antwort({ fehler: "Tageslimit für Fragen erreicht." }, 429);

  const kontext = String(e.kontext ?? "").slice(0, 6000);
  const client = new Anthropic();
  let r;
  try {
    r = await client.messages.create({
      model: MODELL,
      max_tokens: 4000,
      system: SYSTEM + (kontext ? "\n\nAus der App (gerade offen):\n" + kontext : ""),
      messages: l,
    });
  } catch (x) {
    if (x instanceof Anthropic.RateLimitError) return antwort({ fehler: "Claude ist gerade ausgelastet – bitte gleich noch einmal." }, 429);
    if (x instanceof Anthropic.AuthenticationError) return antwort({ fehler: "KI-Zugang nicht eingerichtet (Schlüssel fehlt oder ungültig)." }, 500);
    if (x instanceof Anthropic.APIError) return antwort({ fehler: `KI-Fehler ${x.status}` }, 502);
    return antwort({ fehler: "Claude nicht erreichbar." }, 502);
  }
  if (r.stop_reason === "refusal") return antwort({ fehler: "Darauf antwortet Claude nicht." }, 422);
  const text = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();

  const { error: nf } = await supabase.from("ki_nutzung").insert({
    user_id: user.id, email: user.email, art: "frage", bilder: 0, modell: r.model,
    tokens_ein: r.usage.input_tokens, tokens_aus: r.usage.output_tokens,
  });
  if (nf) console.error("ki_nutzung nicht eingetragen:", nf.message);

  return antwort({ text: text + (r.stop_reason === "max_tokens" ? "\n\n(Antwort abgeschnitten – bitte nachfragen.)" : ""), modell: r.model });
});
