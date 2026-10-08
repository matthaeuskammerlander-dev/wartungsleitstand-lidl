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

// einfache Fragen zur Datenbank: das kleine, günstige Modell (ca. 0,1–0,3 Cent je Frage)
const MODELL = "claude-haiku-4-5-20251001";
const REPO = Deno.env.get("GITHUB_REPO") ?? "matthaeuskammerlander-dev/wartungsleitstand-lidl";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN_WUENSCHE") ?? "";
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

// Mitternacht des heutigen Tages in Österreich (Europe/Vienna) als Zeitpunkt
// (ISO, UTC) – wie in ki-lesen, damit das Tageslimit um Mitternacht hier
// zurückspringt und nicht erst um 1 bzw. 2 Uhr früh (UTC-Tag).
function tagesbeginnWien(jetzt: Date): string {
  const teil = (f: Intl.DateTimeFormat, d: Date, typ: string) => f.formatToParts(d).find((t) => t.type === typ)?.value ?? "";
  const datum = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" });
  const tag = `${teil(datum, jetzt, "year")}-${teil(datum, jetzt, "month")}-${teil(datum, jetzt, "day")}`;
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", timeZoneName: "longOffset" });
  const versatz = teil(zone, new Date(tag + "T00:00:00Z"), "timeZoneName").replace("GMT", "") || "Z";   // „GMT+02:00“ → „+02:00“
  return new Date(tag + "T00:00:00" + versatz).toISOString();
}

const SYSTEM = `Du bist der Assistent im „Wartungsleitstand Lidl“ von Kammerlander Umwelt- und Klimatechnik (UKT), St. Johann in Tirol. UKT wartet Kälte- und Klimaanlagen (Split, Multi-Split, VRV, Kaltwassersätze) in Lidl-Filialen in Österreich. Die Fragen kommen von Technikern und dem Büro, oft vom Handy im Einsatz.

Antworte auf Deutsch (österreichisch üblich, „Jänner“), kurz, klar und praxisnah – ohne Fachchinesisch, wo es nicht nötig ist. Keine langen Einleitungen. Nutze kurze Absätze oder Aufzählungen, keine Tabellen.

Fachlich: Kältetechnik, Fehlersuche, Kältemittel (F-Gase-Verordnung, GWP, CO₂-Äquivalent), österreichische Kälteanlagenverordnung (KAV), Dichtheitskontrollen, Prüfbücher, ÖNORM EN 378, Arbeitsschutz. Sei ehrlich, wenn du dir bei Grenzwerten, Fristen oder Paragraphen nicht sicher bist oder sich Vorschriften geändert haben können – dann sag das und nenne, wo man es nachprüft. Bei Sicherheitsfragen (Strom, Druck, Kältemittel) immer auf sichere Arbeitsweise hinweisen.

Über die App (falls danach gefragt): Reiter Fällig, Karte, Anlagen, Protokoll, Verlauf, Verwaltung, Datenbasis. Terminregeln des Büros: Jahreswartung (JW) im Monat der Inbetriebnahme, sechs Monate versetzt Halbjahreswartung (HJW, ab 30 kg Kältemittel) bzw. Halbjahresinspektion (HJI); Einträge ≤ 14 Tage auseinander sind derselbe Besuch; eine spätere Wartung erfüllt einen versäumten Termin als verspätet, wenn sie mehr als 3 Monate vor dem nächsten Termin liegt, sonst gilt der versäumte als ausgelassen. Wünsche für Änderungen an der App: unten „💡 Änderung vorschlagen“.

Wenn unten Angaben „Aus der App“ stehen, beziehen sie sich auf das, was die Person gerade offen hat. Nutze sie, erfinde aber keine Daten, die dort nicht stehen.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);

  // Anfrage zuerst ganz lesen (sonst hängt der Upload am Handy)
  let e: { nachrichten?: { role: string; text: string }[]; kontext?: string; weg?: string; nr?: number; suche?: string } = {};
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
  if (e.weg !== "github_stand" && e.weg !== "haendler" && (!l.length || l[l.length - 1].role !== "user")) return antwort({ fehler: "Keine Frage." }, 400);

  // ---- Weg über GitHub: Claude Code beantwortet die Frage im Abo (kostet nichts
  // extra, dauert 1–2 Minuten). Das Repository ist öffentlich – die App schickt
  // auf diesem Weg deshalb nur Fragen und Antworten, die selbst über GitHub
  // liefen, den Markt nur als „Markt A“ (ohne Namen, Adresse, Störungstexte)
  // und statt der Marktübersicht erfundene Testdaten.
  if (e.weg === "github") {
    if (!GH_TOKEN) return antwort({ fehler: "GitHub-Zugang fehlt (Secret GITHUB_TOKEN_WUENSCHE)." }, 500);
    const verlauf = l.slice(0, -1).map((n) => (n.role === "user" ? "Frage: " : "Antwort: ") + n.content).join("\n\n");
    const frage = l[l.length - 1].content;
    const kontext = String(e.kontext ?? "").slice(0, 12000);   // „Markt A“ bzw. Testdaten
    const body = [
      "@claude Bitte diese Frage aus dem Wartungsleitstand beantworten. **Nur antworten – nichts ändern, keinen Zweig, keinen Pull Request.**",
      "Antworte auf Deutsch, kurz und praxisnah, so wie in CLAUDE.md beschrieben (Kältetechnik, Vorschriften, Terminregeln, die App in index.html).",
      "",
      verlauf ? "Bisheriges Gespräch:\n" + verlauf.split("\n").map((z) => "> " + z).join("\n") + "\n" : "",
      "**Frage:**",
      frage.split("\n").map((z) => "> " + z).join("\n"),
      kontext ? "\nAus der App (gerade offen):\n```\n" + kontext + "\n```" : "",
    ].join("\n");
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: "POST",
      headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "wartungsleitstand-frage", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Frage: " + frage.replace(/\s+/g, " ").slice(0, 80), body, labels: ["frage"] }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) return antwort({ fehler: "GitHub: " + ((d && d.message) || r.status) }, 502);
    return antwort({ nr: d.number });
  }
  if (e.weg === "github_stand") {
    const nr = Number(e.nr);
    if (!nr || !GH_TOKEN) return antwort({ fehler: "Keine Frage-Nummer." }, 400);
    const h = { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "wartungsleitstand-frage" };
    const issue = await (await fetch(`https://api.github.com/repos/${REPO}/issues/${nr}`, { headers: h })).json();
    if (!issue || !String(issue.title || "").startsWith("Frage:")) return antwort({ fehler: "Das ist keine Frage aus der App." }, 400);
    const l2 = await (await fetch(`https://api.github.com/repos/${REPO}/issues/${nr}/comments?per_page=50`, { headers: h })).json();
    const c = (Array.isArray(l2) ? l2 : []).filter((x: any) => /claude/i.test(String(x.user?.login || ""))).pop();
    const text = c ? String(c.body || "") : "";
    const fertig = /Claude finished|Claude encountered an error/i.test(text);
    if (fertig && issue.state === "open") {
      await fetch(`https://api.github.com/repos/${REPO}/issues/${nr}`, { method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed" }) });
    }
    return antwort({ fertig, text: fertig ? text : "", fehler: /encountered an error/i.test(text) ? "Claude hat einen Fehler gemeldet." : undefined });
  }

  const { count } = await supabase.from("ki_nutzung").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("art", "frage").gte("zeit", tagesbeginnWien(new Date()));
  if ((count ?? 0) >= LIMIT_JE_TAG) return antwort({ fehler: "Tageslimit für Fragen erreicht." }, 429);

  // ---- Händler / Lieferant im Internet suchen (Inhaber 08.10.2026: „Reiss Kältetechnik Traun – die App soll die
  // richtige Adresse im Internet suchen“). Websuche von Claude, Antwort nur als JSON; die App zeigt die Treffer zur Auswahl.
  if (e.weg === "haendler") {
    const suche = String(e.suche ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (suche.length < 3) return antwort({ fehler: "Bitte Händler und Ort angeben." }, 400);
    const client = new Anthropic();
    let r;
    try {
      r = await client.messages.create({
        model: MODELL,
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "AT" } }],
        system: "Du suchst für eine Kältetechnik-Firma in Österreich die Geschäftsadresse eines Händlers oder Lieferanten (Großhandel, Kältetechnik, Elektro, Baumarkt …). " +
          "Suche im Internet (Impressum, Firmenwebseite, Firmenverzeichnis). Antworte am Ende NUR mit JSON, ohne Text davor oder danach: " +
          "{\"treffer\":[{\"firma\":\"\",\"strasse\":\"\",\"plz\":\"\",\"ort\":\"\",\"telefon\":\"\",\"mail\":\"\",\"web\":\"\"}]} – höchstens 3 Treffer, " +
          "der passendste zuerst (Standort im genannten Ort bevorzugt). Nur Angaben, die du gefunden hast; Unbekanntes leer lassen, nichts erfinden. Nichts gefunden: {\"treffer\":[]}.",
        messages: [{ role: "user", content: "Händler: " + suche }],
      });
    } catch (x) {
      if (x instanceof Anthropic.RateLimitError) return antwort({ fehler: "Claude ist gerade ausgelastet – bitte gleich noch einmal." }, 429);
      if (x instanceof Anthropic.APIError) return antwort({ fehler: `KI-Fehler ${x.status}` }, 502);
      return antwort({ fehler: "Claude nicht erreichbar." }, 502);
    }
    const { error: nf2 } = await supabase.from("ki_nutzung").insert({
      user_id: user.id, email: user.email, art: "frage", bilder: 0, modell: r.model,
      tokens_ein: r.usage.input_tokens, tokens_aus: r.usage.output_tokens,
    });
    if (nf2) console.error("ki_nutzung nicht eingetragen:", nf2.message);
    const roh = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const m = roh.match(/\{[\s\S]*\}/);
    let treffer: Record<string, string>[] = [];
    try { const j = m ? JSON.parse(m[0]) : null; if (j && Array.isArray(j.treffer)) treffer = j.treffer; } catch { /* unlesbar = nichts */ }
    const t = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    treffer = treffer.slice(0, 3).map((x) => ({ firma: t(x.firma), strasse: t(x.strasse), plz: t(x.plz), ort: t(x.ort), telefon: t(x.telefon), mail: t(x.mail), web: t(x.web) }))
      .filter((x) => x.firma);
    return antwort({ treffer });
  }

  const kontext = String(e.kontext ?? "").slice(0, 40000);   // Übersicht aller Märkte samt Anlagenliste ≈ 20000 Zeichen
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
  // Kostennachweis gleich nach der Antwort – auch eine Ablehnung ist bezahlt
  const { error: nf } = await supabase.from("ki_nutzung").insert({
    user_id: user.id, email: user.email, art: "frage", bilder: 0, modell: r.model,
    tokens_ein: r.usage.input_tokens, tokens_aus: r.usage.output_tokens,
  });
  if (nf) console.error("ki_nutzung nicht eingetragen:", nf.message);

  if (r.stop_reason === "refusal") return antwort({ fehler: "Darauf antwortet Claude nicht." }, 422);
  const text = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();

  return antwort({ text: text + (r.stop_reason === "max_tokens" ? "\n\n(Antwort abgeschnitten – bitte nachfragen.)" : ""), modell: r.model });
});
