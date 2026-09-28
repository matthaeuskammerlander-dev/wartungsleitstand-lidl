// Push-Benachrichtigungen verschicken („Es hat sich etwas getan“).
//
// Aktionen (POST, JSON {aktion}):
//   schluessel  öffentlicher Schlüssel für das Einschalten in der App
//               (legt das Schlüsselpaar beim allerersten Aufruf selbst an)
//   senden      stößt die Datenbank nach jeder Änderung an (tools/push.sql):
//               kurz warten, alles Neue bündeln, an die Geräte schicken
//   test        Probe-Nachricht an die eigenen Geräte (mit Anmeldung)
//
// Einstellung in Supabase: Edge Functions → push → „Verify JWT“ AUS – die
// Datenbank ruft ohne Anmeldung an. Das ist unbedenklich: „senden“ verschickt
// nur, was ohnehin ansteht, „schluessel“ liefert nur den öffentlichen Teil.
// Keine Secrets nötig (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt
// Supabase selbst bereit).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Kontakt für die Betreiber der Push-Dienste (Apple/Google) – die Adresse der App
const KONTAKT = "https://matthaeuskammerlander-dev.github.io/wartungsleitstand-lidl/";
const BUENDEL_MS = 15000;          // so lange sammeln, bevor geschickt wird
const MAX_ALTER_MS = 24 * 3600e3;  // Liegengebliebenes, das älter ist, nicht mehr schicken

const kurz = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/* Schlüsselpaar holen – beim ersten Mal anlegen. Zwei gleichzeitige erste
   Aufrufe: nur einer kommt in die Tabelle, beide lesen danach denselben. */
let absender: Promise<{ app: webpush.ApplicationServer; oeffentlich: string }> | null = null;
function absenderHolen() {
  if (absender) return absender;
  absender = (async () => {
    let { data } = await admin.from("push_schluessel").select("*").eq("id", 1).maybeSingle();
    if (!data) {
      const paar = await webpush.generateVapidKeys({ extractable: true });
      await admin.from("push_schluessel").upsert({
        id: 1,
        oeffentlich: await webpush.exportApplicationServerKey(paar),
        schluessel: await webpush.exportVapidKeys(paar),
      }, { onConflict: "id", ignoreDuplicates: true });
      ({ data } = await admin.from("push_schluessel").select("*").eq("id", 1).single());
    }
    const keys = await webpush.importVapidKeys(data!.schluessel, { extractable: false });
    const app = await webpush.ApplicationServer.new({ contactInformation: KONTAKT, vapidKeys: keys });
    return { app, oeffentlich: data!.oeffentlich as string };
  })();
  absender.catch(() => { absender = null; });
  return absender;
}

type Abo = { endpoint: string; user_id: string; p256dh: string; auth: string; arten: string[]; fehler: number };
type Ereignis = { id: number; erstellt: string; art: string; titel: string; text: string | null; ziel: string | null;
  von_user: string | null; nur_rolle: string | null; daten: any; lang?: string; kurz?: string };

/* eine Nachricht an ein Gerät; abgemeldete Geräte (410/404) fliegen raus */
async function schicken(app: webpush.ApplicationServer, abo: Abo, inhalt: unknown) {
  try {
    const sub = app.subscribe({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } });
    await sub.pushTextMessage(JSON.stringify(inhalt), { urgency: webpush.Urgency.High, ttl: 86400 });
    await admin.from("push_abos").update({ zuletzt: new Date().toISOString(), fehler: 0 }).eq("endpoint", abo.endpoint);
    return true;
  } catch (e) {
    const weg = e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404);
    if (weg || abo.fehler >= 20) await admin.from("push_abos").delete().eq("endpoint", abo.endpoint);
    else await admin.from("push_abos").update({ fehler: abo.fehler + 1 }).eq("endpoint", abo.endpoint);
    console.error("push", abo.endpoint.slice(0, 40), String(e));
    return false;
  }
}

/* ---- Einzelheiten: Protokoll bzw. Störung nachlesen (erst jetzt, nach dem
   Sammeln – dann ist das Protokoll meist schon ganz übertragen) ---- */
const datum = (d: unknown) => {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + "." + m[2] + "." + m[1] : "";
};
const wert = (v: unknown) => kurz(String(v ?? "").replace(/\s+/g, " ").trim(), 60) || "–";
// Zugangsdaten der Regelung nie in eine Nachricht (stehen ohnehin nie mit Wert im Verlauf)
const geheim = (feld: string) => /^zugang|passw|kennwort|pin$/i.test(feld);
const PROTOKOLL_FELDER = "client_id,wartungsart,datum,techniker,name_techniker,anlagen,maengel,betriebsbereit,sofortmassnahme,bemerkungen";

async function anreichern(liste: Ereignis[]) {
  const pIds = [...new Set(liste.map((e) => e.daten?.protokoll).filter(Boolean))] as string[];
  const sIds = [...new Set(liste.filter((e) => e.art === "stoerung").flatMap((e) => e.daten?.bezug ?? []))] as string[];
  const sOrte = [...new Set(liste.filter((e) => e.art === "stoerung" && !(e.daten?.bezug ?? []).length)
    .map((e) => e.daten?.standort).filter(Boolean))] as string[];
  const [pr, st, so]: any[] = await Promise.all([
    pIds.length ? admin.from("protokolle").select(PROTOKOLL_FELDER).in("client_id", pIds) : { data: [] },
    sIds.length ? admin.from("stammdaten").select("id,ziel,felder").eq("typ", "stoerung").in("id", sIds) : { data: [] },
    sOrte.length ? admin.from("stammdaten").select("id,ziel,felder,geaendert").eq("typ", "stoerung").in("ziel", sOrte)
      .order("geaendert", { ascending: false }) : { data: [] },
  ]);
  const prot = new Map((pr.data ?? []).map((p: any) => [p.client_id, p]));
  const stoer = new Map((st.data ?? []).map((s: any) => [s.id, s]));
  const stoerAmOrt = new Map<string, any>();
  (so.data ?? []).forEach((s: any) => { if (!stoerAmOrt.has(s.ziel)) stoerAmOrt.set(s.ziel, s); });

  for (const e of liste) {
    const d = e.daten ?? {};
    const von = d.wer ? "von " + d.wer : "";
    if ((e.art === "protokoll" || e.art === "korrektur") && prot.has(d.protokoll)) {
      const p: any = prot.get(d.protokoll);
      const anl = (Array.isArray(p.anlagen) ? p.anlagen : []).map((a: any) =>
        (a.name || "Anlage") + (a.termin ? " (" + a.termin + ")" : ""));
      const mg = (Array.isArray(p.maengel) ? p.maengel : []).filter((m: any) => m && m.text);
      const kopf = [p.wartungsart, datum(p.datum), p.techniker || p.name_techniker].filter(Boolean).join(" · ");
      const z = [
        e.art === "korrektur" && d.grund ? "Grund: " + kurz(d.grund, 100) : "",
        kopf,
        anl.length ? "Anlagen: " + anl.slice(0, 3).join(", ") + (anl.length > 3 ? " +" + (anl.length - 3) : "") : "",
        [p.betriebsbereit ? "Betriebsbereit: " + p.betriebsbereit : "",
         mg.length ? mg.length + (mg.length === 1 ? " Mangel" : " Mängel") : "keine Mängel"].filter(Boolean).join(" · "),
        mg.length ? "⚠ " + kurz(mg[0].text + (mg[0].prio ? " (" + mg[0].prio + ")" : ""), 110) : "",
        p.sofortmassnahme ? "Sofortmaßnahme: " + kurz(p.sofortmassnahme, 100) : "",
        p.bemerkungen ? "Bemerkung: " + kurz(p.bemerkungen, 110) : "",
        e.art === "korrektur" ? von : "",
      ].filter(Boolean);
      e.lang = z.join("\n");
      e.kurz = [p.wartungsart, anl.length ? anl.length + (anl.length === 1 ? " Anlage" : " Anlagen") : "",
        mg.length ? mg.length + (mg.length === 1 ? " Mangel" : " Mängel") : ""].filter(Boolean).join(", ");
    } else if (e.art === "stoerung") {
      const s: any = (d.bezug ?? []).map((id: string) => stoer.get(id)).find(Boolean) ?? stoerAmOrt.get(d.standort);
      const f = s?.felder ?? {};
      const kopf = [f.problemtyp, f.prioritaet ? "Priorität " + f.prioritaet : "", f.zieltermin ? "bis " + datum(f.zieltermin) : ""]
        .filter(Boolean).join(" · ");
      const geraet = [f.hersteller, f.lidlTyp || f.lidlModell].filter(Boolean).join(" ");
      e.lang = [kopf, f.beschreibung ? kurz(String(f.beschreibung), 160) : "", geraet ? "Gerät: " + kurz(geraet, 60) : "",
        f.auftragsnummer ? "Auftrag " + f.auftragsnummer : "", von].filter(Boolean).join("\n") || (e.text ?? "");
      e.kurz = [f.problemtyp, f.zieltermin ? "bis " + datum(f.zieltermin) : ""].filter(Boolean).join(", ");
    } else if (e.art === "stammdaten") {
      const felder = (Array.isArray(d.felder) ? d.felder : []).filter((f: any) => f && (f.name || f.feld));
      const zeilen = felder.slice(0, 4).map((f: any) => geheim(String(f.feld ?? ""))
        ? (f.name || f.feld) + ": geändert"
        : (f.name || f.feld) + ": " + wert(f.alt) + " → " + wert(f.neu));
      if (felder.length > 4) zeilen.push("… und " + (felder.length - 4) + " weitere Angaben");
      e.lang = [d.grund ? kurz(d.grund, 100) : "", ...zeilen, von].filter(Boolean).join("\n") || (e.text ?? "");
      e.kurz = felder.length ? felder.slice(0, 2).map((f: any) => f.name || f.feld).join(", ") : (d.grund ? kurz(d.grund, 40) : "");
    }
  }
}

/* Ereignisse eines Empfängers zu einer Nachricht zusammenfassen */
function nachricht(liste: Ereignis[]) {
  if (liste.length === 1) {
    const e = liste[0];
    return { titel: e.titel, text: e.lang || e.text || "", ziel: e.ziel ?? "", tag: "ukt-" + e.id };
  }
  /* ein Protokoll (oder eine Störung) samt den Stammdaten, die beim selben
     Speichern mitgehen (Termine geprüft, Anlagendaten ergänzt): das Protokoll
     ausführlich zeigen, den Rest nur als Hinweis */
  const haupt = liste.filter((e) => e.art !== "stammdaten");
  if (haupt.length === 1) {
    const e = haupt[0], rest = liste.length - 1;
    return { titel: e.titel, ziel: e.ziel ?? "", tag: "ukt-" + e.id,
      text: (e.lang || e.text || "") + "\n+ " + rest + (rest === 1 ? " weitere Änderung" : " weitere Änderungen") + " (Markt-/Anlagendaten)" };
  }
  const zeilen = liste.slice(0, 5).map((e) => "• " + kurz(e.titel + (e.kurz ? ": " + e.kurz : ""), 110));
  if (liste.length > 5) zeilen.push("… und " + (liste.length - 5) + " weitere");
  // alle zum selben Ziel (etwa alles Störungen) → dorthin, sonst in den Verlauf
  const ziele = new Set(liste.map((e) => (e.ziel ?? "").split(":")[0]));
  const ziel = ziele.size === 1 ? [...ziele][0] : "verlauf";
  return { titel: liste.length + " neue Änderungen", text: zeilen.join("\n"), ziel, tag: "ukt-" + liste[0].id };
}

async function senden() {
  await new Promise((r) => setTimeout(r, BUENDEL_MS));
  const { data: ev, error } = await admin.rpc("push_ereignisse_holen");
  if (error) { console.error("push holen", error.message); return; }
  const frisch = (ev as Ereignis[] ?? []).filter((e) => Date.now() - new Date(e.erstellt).getTime() < MAX_ALTER_MS)
    .sort((a, b) => a.id - b.id);
  if (!frisch.length) return;
  const [{ data: abos }, { data: rollen }] = await Promise.all([
    admin.from("push_abos").select("*"),
    admin.from("rollen").select("user_id, rolle"),
  ]);
  if (!abos?.length) return;
  const rolle = new Map((rollen ?? []).map((r: any) => [r.user_id, r.rolle as string]));
  // Einzelheiten dazulesen – klappt das nicht, geht die Nachricht mit dem Grundtext raus
  try { await anreichern(frisch); } catch (x) { console.error("push anreichern", String(x)); }
  const { app } = await absenderHolen();
  await Promise.all((abos as Abo[]).map((abo) => {
    const r = rolle.get(abo.user_id) ?? "techniker";
    if (r === "kunde" || r === "praesentation") return null;
    const arten = Array.isArray(abo.arten) ? abo.arten : [];
    const fuerMich = frisch.filter((e) =>
      arten.includes(e.art) && e.von_user !== abo.user_id && (!e.nur_rolle || e.nur_rolle === r));
    return fuerMich.length ? schicken(app, abo, nachricht(fuerMich)) : null;
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);
  let e: { aktion?: string } = {};
  try { e = await req.json(); } catch { return antwort({ fehler: "Anfrage nicht lesbar." }, 400); }

  try {
    if (e.aktion === "schluessel") {
      const { oeffentlich } = await absenderHolen();
      return antwort({ schluessel: oeffentlich });
    }

    if (e.aktion === "senden") {
      // gleich antworten – die Datenbank wartet nicht; das Sammeln läuft weiter
      const arbeit = senden().catch((x) => console.error("push senden", String(x)));
      // @ts-ignore EdgeRuntime gibt es nur in Supabase
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(arbeit); else await arbeit;
      return antwort({ ok: true }, 202);
    }

    if (e.aktion === "test") {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return antwort({ fehler: "Bitte anmelden." }, 401);
      const { data: abos } = await admin.from("push_abos").select("*").eq("user_id", user.id);
      if (!abos?.length) return antwort({ fehler: "Auf keinem deiner Geräte sind Benachrichtigungen eingeschaltet." }, 400);
      const { app } = await absenderHolen();
      const ok = await Promise.all((abos as Abo[]).map((abo) => schicken(app, abo, {
        titel: "Probe-Nachricht", text: "Benachrichtigungen funktionieren auf diesem Gerät.", ziel: "", tag: "ukt-test",
      })));
      return antwort({ geschickt: ok.filter(Boolean).length, geraete: abos.length });
    }

    return antwort({ fehler: "Unbekannte Aktion." }, 400);
  } catch (x) {
    return antwort({ fehler: "Benachrichtigung fehlgeschlagen: " + String(x).slice(0, 200) }, 500);
  }
});
