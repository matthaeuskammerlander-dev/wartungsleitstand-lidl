// Automatische Tests der App im echten Browser – mit erfundenen Daten (tests/testdaten.js) und
// nachgebauter Datenbank (tests/attrappe.js, Startbestand tests/seed.json). Nichts geht ins Netz.
//
//   node tests/app-tests.mjs            alle Tests
//   node tests/app-tests.mjs kalender   nur Tests, deren Name „kalender“ enthält
//
// Braucht Playwright (npm install --no-save playwright@1). Lokal ohne heruntergeladenen Browser
// wird das installierte Chrome bzw. Edge genommen.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(TESTS, "..");

/* ---- Testfassung der App bauen: Testdaten statt verschlüsselter Daten, Attrappe statt Supabase,
   Testhaken (window.__t) ans Ende des Starts ---- */
function testfassung() {
  let h = readFileSync(join(WURZEL, "index.html"), "utf8").replace(/\r\n/g, "\n");   /* Windows-Zeilenenden (CRLF) nach dem Auschecken */
  const ersetzen = (alt, neu, was) => { if (!h.includes(alt)) throw new Error("Testfassung: " + was + " nicht gefunden"); h = h.replace(alt, neu); };
  ersetzen('<script src="daten.enc.js"></script>', '<script src="tests/testdaten.js"></script>', "daten.enc.js");
  ersetzen('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="tests/attrappe.js"></script>', "Supabase-Skript");
  const haken = readFileSync(join(TESTS, "hooks.js"), "utf8");
  const zeilen = h.split("\n"), i = zeilen.findIndex((z) => z === "kachelnPruefen();");
  if (i < 0) throw new Error("Testfassung: Einhängepunkt kachelnPruefen(); fehlt");
  zeilen.splice(i + 1, 0, haken);
  return zeilen.join("\n");
}

const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css" };
function server(seite) {
  return createServer((req, res) => {
    const pfad = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([\\/])+/, "");
    if (pfad === "" || pfad === "index.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(seite); return; }
    /* seed.json der Attrappe liegt in tests/ */
    const datei = pfad === "seed.json" ? join(TESTS, "seed.json") : join(WURZEL, pfad);
    if (!datei.startsWith(WURZEL) || !existsSync(datei)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream" });
    res.end(readFileSync(datei));
  });
}

async function browserStarten() {
  const { chromium } = await import("playwright");
  try { return await chromium.launch(); }
  catch (e) {
    for (const channel of ["chrome", "msedge"]) { try { return await chromium.launch({ channel }); } catch (x) {} }
    throw e;
  }
}

/* ---- kleine Testumgebung ---- */
const TESTS_LISTE = [];
const test = (name, fn) => TESTS_LISTE.push({ name, fn });
const pruefe = (bed, text) => { if (!bed) throw new Error(text); };

let BROWSER, PORT;
/* frische Seite (eigener Speicher), angemeldet als konto (oder abgemeldet) */
async function oeffnen(konto, opt = {}) {
  const kontext = await BROWSER.newContext({ viewport: opt.handy ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: !!opt.handy, hasTouch: !!opt.handy, ...(opt.ua ? { userAgent: opt.ua } : {}) });
  /* simulierte Uhrzeit (opt.uhr oder TEST_UHR="HH:MM"): heute zu dieser Zeit, die Uhr läuft von dort weiter (Timer bleiben echt) */
  const uhr = opt.uhr || process.env.TEST_UHR;
  if (uhr) await kontext.addInitScript((hm) => {
    const Echt = Date, z = new Echt(); z.setHours(+hm.split(":")[0], +hm.split(":")[1], 0, 0);
    const versatz = z.getTime() - Echt.now();
    class Uhr extends Echt { constructor(...a) { if (a.length) super(...a); else super(Echt.now() + versatz); } static now() { return Echt.now() + versatz; } }
    window.Date = Uhr;
  }, uhr);
  const seite = await kontext.newPage();
  const fehler = [];
  seite.on("pageerror", (e) => fehler.push(e.message));
  seite.on("dialog", (d) => (d.type() === "prompt" ? d.accept(opt.promptAntwort || "Test") : d.type() === "confirm" ? d.accept() : d.dismiss()));
  await seite.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await seite.waitForFunction(() => !!window.__t, null, { timeout: 30000 });
  const x = (ausdruck) => seite.evaluate((a) => window.__t.x(a), ausdruck);
  if (konto) {
    await seite.evaluate((m) => window.__t.x(`Store.sb.auth.signInWithPassword({email:'${m}',password:'test123'})`), konto);
    await seite.waitForFunction(() => window.__t.x("Rolle.da && Store.modus==='supabase'"), null, { timeout: 15000 });
    await seite.waitForTimeout(300);
  }
  return { seite, x, fehler, zu: () => kontext.close() };
}
/* Neuzeichnungen zählen: render umwickeln */
const RENDER_ZAEHLER = `(function(){ if(window.__rz) return 1; window.__rz={n:0}; var alt=render; render=function(){ window.__rz.n++; if(window.__rz.n>400) return; return alt.apply(this, arguments); }; return 1; })()`;

/* ================================================================ Tests ================================================================ */

const KONTEN = {
  inhaber: "inhaber@test.at", admin: "admin@test.at", techniker: "tech@test.at", kunde: "kunde@test.at", praesentation: "praes@test.at",
};

test("Start: App startet am PC und am Handy ohne Laufzeitfehler", async () => {
  for (const handy of [false, true]) {
    const a = await oeffnen(null, { handy });
    const gestartet = await a.seite.evaluate(() => !document.getElementById("tabs").hidden);
    pruefe(gestartet, (handy ? "Handy" : "PC") + ": Reiterleiste fehlt");
    const breiter = await a.seite.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    pruefe(breiter <= 4, (handy ? "Handy" : "PC") + `: Seite ${breiter}px breiter als der Bildschirm`);
    pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
    await a.zu();
  }
});

test("Rechte: jede Rolle sieht genau ihre Reiter", async () => {
  const erwartet = {
    kunde: { sieht: ["faellig", "karte", "anlagen", "verlauf"], nicht: ["protokoll", "belege", "verwaltung", "stunden", "fahrzeuge", "werkzeug"] },
    techniker: { sieht: ["faellig", "kalender", "protokoll", "stunden", "fahrzeuge", "werkzeug"], nicht: ["belege"] },
    admin: { sieht: ["faellig", "protokoll", "verwaltung"], nicht: ["belege"] },
    inhaber: { sieht: ["belege", "verwaltung", "fahrzeuge"], nicht: [] },
    praesentation: { sieht: ["faellig", "protokoll"], nicht: ["belege"] },
  };
  for (const [rolle, e] of Object.entries(erwartet)) {
    const a = await oeffnen(KONTEN[rolle]);
    const r = await a.x("Rolle.name");
    pruefe(r === rolle, `${rolle}: Rolle ist ${r}`);
    const sicht = JSON.parse(await a.x("JSON.stringify(VIEWS.map(function(v){ return v[0]; }).filter(reiterErlaubt))"));
    e.sieht.forEach((v) => pruefe(sicht.includes(v), `${rolle} sieht den Reiter ${v} nicht`));
    e.nicht.forEach((v) => pruefe(!sicht.includes(v), `${rolle} sieht den Reiter ${v}, darf aber nicht`));
    pruefe((await a.x("nurInhaber()")) === (rolle === "inhaber"), `${rolle}: nurInhaber() falsch`);
    pruefe(!a.fehler.length, `${rolle}: Laufzeitfehler: ` + a.fehler.join("; "));
    await a.zu();
  }
});

test("Endlosschleifen: kein Reiter zeichnet sich in irgendeiner Rolle endlos neu", async () => {
  for (const [rolle, konto] of Object.entries(KONTEN)) {
    const a = await oeffnen(konto);
    await a.x(RENDER_ZAEHLER);
    const reiter = JSON.parse(await a.x("JSON.stringify(VIEWS.map(function(v){ return v[0]; }).filter(reiterErlaubt))"));
    for (const r of reiter) {
      await a.x(`(function(){ formDirty=false; S.view='${r}'; render(); window.__rz.n=0; return 1; })()`);
      await a.seite.waitForTimeout(1500);
      const n = await a.x("window.__rz.n");
      pruefe(n < 15, `${rolle}: Reiter ${r} zeichnet sich ${n}× in 1,5 s neu (Endlosschleife?)`);
    }
    pruefe(!a.fehler.length, `${rolle}: Laufzeitfehler: ` + a.fehler.join("; "));
    await a.zu();
  }
});

test("Spielwiese: Schreiben landet nur in der Schattendatenbank", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = JSON.parse(await a.seite.evaluate(async () => {
    const vorher = window.__db.tabellen.planung.length;
    const sc = window.__t.x("schattenClient(Store.sb)");
    const ins = await sc.from("planung").insert({ art: "termin", kategorie: "buero", titel: "Spielwiese", datum: "2026-01-05", wer: [] }).select("*");
    const sel = await sc.from("planung").select("id,titel").eq("titel", "Spielwiese");
    await sc.from("planung").update({ titel: "geändert" }).eq("titel", "Spielwiese");
    const sel2 = await sc.from("planung").select("titel").eq("titel", "geändert");
    const rpc = await sc.rpc("stempeln", {});
    return JSON.stringify({ ins: !!(ins.data && ins.data[0] && ins.data[0].id), sel: sel.data.length, sel2: sel2.data.length, echtVorher: vorher, echtNachher: window.__db.tabellen.planung.length, rpc: !!rpc.error });
  }));
  pruefe(r.ins && r.sel === 1 && r.sel2 === 1, "Schattendatenbank: Anlegen/Lesen/Ändern geht nicht " + JSON.stringify(r));
  pruefe(r.echtVorher === r.echtNachher, "Spielwiese hat in die echte Datenbank geschrieben");
  pruefe(r.rpc, "Stempeln in der Spielwiese nicht gesperrt");
  await a.zu();
});

test("Fälligkeiten: gewartet = nicht fällig, drei Jahre nichts = überfällig, keine kaputten Daten", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = JSON.parse(await a.x(`JSON.stringify(POS.map(function(p){ return {id:p.id, status:p.status, naechster:p.naechster||p.faelligAm||null}; }))`));
  const st = Object.fromEntries(r.map((p) => [p.id, p]));
  pruefe(st.TP3 && !/ueberfaellig|faellig/.test(st.TP3.status || ""), "TP3 (vor 10 Tagen gewartet) gilt als fällig: " + JSON.stringify(st.TP3));
  pruefe(st.TP4 && /ueberfaellig/.test(st.TP4.status || ""), "TP4 (seit 3 Jahren nichts) ist nicht überfällig: " + JSON.stringify(st.TP4));
  const kaputt = await a.x(`POS.filter(function(p){ return JSON.stringify(p).indexOf("NaN")>=0 || /Invalid/.test(JSON.stringify(p)); }).length`);
  pruefe(kaputt === 0, `${kaputt} Termine mit NaN/ungültigem Datum`);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Eingabeprüfung: Buchstaben in Zahlfeldern werden nie still gespeichert", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = JSON.parse(await a.x(`JSON.stringify({ z1:zahlLesen("abc"), z2:zahlLesen("12,5"), z3:zahlLesen("1.234,5"), z4:zahlLesen(""),
    kg1:kgGueltig("abc"), kg2:kgGueltig("1,5"), kg3:kgGueltig("-1") })`));
  pruefe(r.z1 === null || Number.isNaN(r.z1) || r.z1 === undefined || r.z1 !== r.z1, "zahlLesen('abc') ergibt eine Zahl");
  pruefe(r.z2 === 12.5 && r.z3 === 1234.5 && r.z4 === null, "zahlLesen liest Kommazahlen falsch: " + JSON.stringify(r));
  pruefe(r.kg1 === false && r.kg2 === true && r.kg3 === false, "kgGueltig falsch: " + JSON.stringify(r));
  /* Markt-Editor: Postleitzahl mit Buchstaben wird abgelehnt */
  const plz = await a.seite.evaluate(async () => {
    window.__t.x("Admin.frei=true; S.view='verwaltung'; S.adm=S.adm||{suche:'',filter:'alle',sort:'filiale',auf:true,sel:null,entwurf:null}; S.adm.tab='maerkte'; S.adm.sel='TS1'; render(); 1");
    const e = document.getElementById("adm_editor"), f = (n) => [...e.querySelectorAll("input")].find((i) => (i.id || i.dataset.a || i.dataset.ig) === n);
    const p = f("a_plz"); p.value = "abcd"; p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true }));
    f("a_grund").value = "Test";
    [...e.querySelectorAll("button")].find((b) => /Änderungen speichern/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 800));
    return { meldung: [...e.querySelectorAll(".warnbox:not([hidden])")].map((x) => x.textContent).join(" "), gespeichert: window.__db.tabellen.stammdaten.some((r) => r.id === "standort:TS1" && (r.felder || {}).plz === "abcd") };
  });
  pruefe(!plz.gespeichert, "Postleitzahl „abcd“ wurde gespeichert");
  pruefe(/Postleitzahl/.test(plz.meldung), "keine Meldung zur Postleitzahl: " + plz.meldung);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Rechnung: Fahrtpauschale nach Zone und Katalog lernt neue Positionen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await a.x("katalogLaden()");
  await a.seite.waitForTimeout(300);
  const r = JSON.parse(await a.x(`JSON.stringify({
    z1:fahrtZone(byId.TS1), z2:fahrtZone(byId.TS2), ibk:fahrtZone(byId.TS3), west:fahrtZone(byId.TS4), ohne:fahrtZone(byId.TS6),
    pos2:(function(){ var p=einsatzPositionen({standortId:'TS2', datum:'2026-01-01', anlagen:[{name:'VRV'}]}, 'lidl'); var l=p[p.length-1]; return l.text+'|'+l.preis; })(),
    pos1:(function(){ var p=einsatzPositionen({standortId:'TS1', datum:'2026-01-01', anlagen:[{name:'VRV'}]}, 'lidl'); var l=p[p.length-1]; return l.text+'|'+l.preis; })() })`));
  pruefe(r.z1 === 1 && r.z2 === 2 && r.ibk === 1 && r.west === 2 && r.ohne === null, "Zonen falsch: " + JSON.stringify(r));
  pruefe(/Zone 2/.test(r.pos2) && /\|100$/.test(r.pos2), "Zone-2-Pauschale nicht aus dem Katalog: " + r.pos2);
  pruefe(/Zone 1/.test(r.pos1) && /\|50$/.test(r.pos1), "Zone-1-Pauschale nicht aus dem Katalog: " + r.pos1);
  const lern = JSON.parse(await a.seite.evaluate(async () => JSON.stringify(await window.__t.x(
    "katalogLernen([{typ:'pos', text:'Neue Testposition', eh:'Stk', preis:12}, {typ:'pos', text:'Ohne Preis', eh:'Stk', preis:0}], 'Test-Rechnung', {})")))) ;
  pruefe(lern.neu === 1, "Katalog hat nicht genau 1 neue Position gelernt: " + JSON.stringify(lern));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Kalender: Termin anlegen erscheint im Kalender; Präsentation speichert nichts", async () => {
  for (const [rolle, soll] of [["inhaber", true], ["praesentation", false]]) {
    const a = await oeffnen(KONTEN[rolle]);
    const r = await a.seite.evaluate(async () => {
      const vorher = window.__db.tabellen.planung.length;
      window.__t.x("S.view='kalender'; render(); planEditor(null, {art:'termin', datum:isoLokal(new Date()), wer:[meineKennung()]}); 1");
      await new Promise((r) => setTimeout(r, 300));
      const d = [...document.querySelectorAll(".assistent")].pop();
      const titel = d.querySelector('input[type="text"]'); titel.value = "Testtermin Kalender"; titel.dispatchEvent(new Event("input", { bubbles: true }));
      [...d.querySelectorAll(".as-fuss button")].find((b) => /Speichern|Anlegen/.test(b.textContent)).click();
      await new Promise((r) => setTimeout(r, 1200));
      return { vorher, nachher: window.__db.tabellen.planung.length, sichtbar: /Testtermin Kalender/.test(document.getElementById("app").innerText), offen: !!document.querySelector(".assistent") };
    });
    if (soll) {
      pruefe(r.nachher === r.vorher + 1, `${rolle}: Termin nicht gespeichert ` + JSON.stringify(r));
      pruefe(r.sichtbar, `${rolle}: Termin erscheint nicht im Kalender`);
    } else pruefe(r.nachher === r.vorher, `${rolle}: Präsentation hat gespeichert`);
    pruefe(!a.fehler.length, `${rolle}: Laufzeitfehler: ` + a.fehler.join("; "));
    await a.zu();
  }
});

test("Handy: Eingabefelder mit 16 px – das iPhone vergrößert beim Anmelden und Tippen nicht mehr (Zoomen bleibt erlaubt)", async () => {
  const a = await oeffnen(null, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const w = (ms) => new Promise((f) => setTimeout(f, ms));
    const host = document.createElement("div"); host.appendChild(window.__t.x("viewAnmeldung()")); document.body.appendChild(host);
    const gr = (q) => { const n = document.querySelector(q); return n ? parseFloat(getComputedStyle(n).fontSize) : -1; };
    return { grob: matchMedia("(pointer:coarse)").matches, mail: gr("#l_mail"), pw: gr("#l_pw"), vp: (document.querySelector('meta[name="viewport"]') || {}).content || "" };
  });
  pruefe(r.grob, "Test-Handy gilt nicht als Touch-Gerät");
  pruefe(r.mail >= 16 && r.pw >= 16, "Anmeldefelder kleiner als 16 px: " + JSON.stringify(r));
  pruefe(!/maximum-scale|user-scalable=no/.test(r.vp), "Zoomen gesperrt (kein iPhone): " + r.vp);
  /* iPhone: maximum-scale=1 gegen das automatische Hineinzoomen (Safari lässt Zoomen mit zwei Fingern trotzdem zu) */
  const ip = await oeffnen(null, { handy: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const vpIp = await ip.seite.evaluate(() => document.querySelector('meta[name="viewport"]').content);
  pruefe(/maximum-scale=1/.test(vpIp) && !/user-scalable=no/.test(vpIp), "iPhone: Viewport ohne Zoom-Grenze: " + vpIp);
  pruefe(!ip.fehler.length, "iPhone: Laufzeitfehler: " + ip.fehler.join("; "));
  await ip.zu();
  const b = await oeffnen(KONTEN.techniker, { handy: true });
  const r2 = await b.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), klein = [];
    for (const v of ["protokoll", "stunden", "kalender", "projekte"]) {
      x("S.view='" + v + "'; render(); 1"); await w(400);
      document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]),select,textarea").forEach((n) => {
        const b = n.getBoundingClientRect(); if (b.width && parseFloat(getComputedStyle(n).fontSize) < 16) klein.push(v + ":" + (n.id || n.className || n.type)); });
      if (document.documentElement.scrollWidth > window.innerWidth + 4) klein.push(v + ": breiter als der Bildschirm " + document.documentElement.scrollWidth);
    }
    return klein.slice(0, 8);
  });
  pruefe(!r2.length, "Felder unter 16 px bzw. zu breit: " + JSON.stringify(r2));
  pruefe(!a.fehler.length && !b.fehler.length, "Laufzeitfehler: " + a.fehler.concat(b.fehler).join("; "));
  await a.zu(); await b.zu();
});

test("Protokoll: Mangel je Anlage – auswählen, gespeichert mit Name, im PDF und im Anlagenbuch nur bei der Anlage", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, e = {};
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await w(400);
    const form = document.getElementById("proto");
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    const alles = document.getElementById("f_allesok"); if (alles) alles.click();
    const leader = x("anlageLeader(posById.TP1).id");
    /* die erste Mängelzeile entsteht vor dem Anhaken – nach einer Änderung an den Anlagen hat auch sie die Auswahl */
    const cb = form.querySelector('input[name="posw"]:checked') || form.querySelector('input[name="posw"]');
    cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true })); cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); await w(50);
    const erste = form.querySelector(".mangelrow .m-a");
    e.ersteZeile = !erste.closest("label").hidden && erste.options.length + "";
    document.getElementById("addMangel").click(); await w(50);
    const zeilen = [...form.querySelectorAll(".mangelrow")], z1 = zeilen[zeilen.length - 1];
    z1.querySelector(".m-t").value = "Kondensatablauf verstopft";
    const sel = z1.querySelector(".m-a"); sel.dispatchEvent(new Event("focus"));
    e.optionen = [...sel.options].map((o) => o.value ? "A" : "leer").join(",");
    sel.value = leader; sel.dispatchEvent(new Event("change"));
    document.getElementById("addMangel").click(); await w(50);
    [...form.querySelectorAll(".mangelrow")].pop().querySelector(".m-t").value = "Zugang zum Dach rutschig";
    const vorher = db.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && db.protokolle.length === vorher; i++) await w(250);
    await w(600);
    const p = db.protokolle[db.protokolle.length - 1] || {};
    e.maengel = (p.maengel || []).map((m) => m.text + "|" + (m.anlage === leader) + "|" + (m.anlageName ? "Name" : "-"));
    const pp = x("ausZeile")(p);
    const prot = pp || {};
    const blatt = x("blattInhalt")(prot) || "";
    e.pdf = /<th[^>]*>Anlage<\/th>/.test(blatt) && /alle \/ allgemein/.test(blatt);
    e.betrifft = [x("mangelBetrifft")({ text: "a", anlage: leader }, x("posById.TP1")), x("mangelBetrifft")({ text: "b" }, x("posById.TP1")),
      x("mangelBetrifft")({ text: "c", anlage: "TP3" }, x("posById.TP1"))].join(",");
    return e;
  });
  pruefe(r.optionen === "leer,A", "Auswahl der Anlagen: " + r.optionen);
  pruefe(r.ersteZeile === "2", "erste Mängelzeile ohne Anlagen-Auswahl: " + r.ersteZeile);
  pruefe(JSON.stringify(r.maengel) === JSON.stringify(["Kondensatablauf verstopft|true|Name", "Zugang zum Dach rutschig|false|-"]), "Gespeicherte Mängel: " + JSON.stringify(r.maengel));
  pruefe(r.pdf, "PDF ohne Spalte Anlage bzw. ohne „alle / allgemein“");
  pruefe(r.betrifft === "true,true,false", "Anlagenbuch-Zuordnung: " + r.betrifft);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Protokoll: Wartungsprotokoll speichern – landet in der Datenbank, Fälligkeit rückt weiter, Bestätigung sichtbar", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await new Promise((r) => setTimeout(r, 400));
    const form = document.getElementById("proto");
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    const alles = document.getElementById("f_allesok"); if (alles) alles.click();
    const fehlt = form._fehltNoch ? form._fehltNoch() : ["_fehltNoch fehlt"];
    const vorher = window.__db.tabellen.protokolle.length, statusVorher = x("(POS.filter(function(p){ return p.id==='TP1'; })[0]||{}).status");
    if (!fehlt.length) document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === vorher; i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 800));
    return { fehlt, vorher, nachher: window.__db.tabellen.protokolle.length, statusVorher,
      statusNachher: x("(POS.filter(function(p){ return p.id==='TP1'; })[0]||{}).status"), gespeichertKarte: !!x("S.gespeichert") };
  });
  pruefe(!r.fehlt.length, "Formular verlangt nach „Alles erledigt“ noch: " + r.fehlt.join(", "));
  pruefe(r.nachher === r.vorher + 1, "Protokoll nicht in der Datenbank: " + JSON.stringify(r));
  pruefe(/faellig/.test(r.statusVorher || "") && !/faellig/.test(r.statusNachher || ""), "Fälligkeit nach dem Protokoll nicht weitergeschoben: " + r.statusVorher + " → " + r.statusNachher);
  pruefe(r.gespeichertKarte, "keine sichtbare Bestätigung nach dem Speichern");
  /* was noch fehlt, ist dokumentiert – die Liste darf keine unlesbaren Einträge enthalten */
  pruefe(Array.isArray(r.fehlt), "Formular meldet nicht, was fehlt");
  pruefe(r.fehlt.every((t) => typeof t === "string" && t.length > 2 && !/undefined|NaN/.test(t)), "unklare Fehlt-Meldung: " + JSON.stringify(r.fehlt));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Keine Verbindung beim Speichern: sichtbare Meldung, kein hängender Knopf, nichts geht still verloren", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const faelle = [
    ["Termin", "S.view='kalender'; render(); planEditor(null, {art:'termin', datum:isoLokal(new Date()), wer:[meineKennung()]})", "d.querySelector('input[type=text]').value='Offline-Termin'"],
    ["Stunden", "S.view='stunden'; render(); zeitEditor(null, {datum:isoLokal(new Date()), beginn:'08:00', ende:'10:00'})", ""],
    ["Fahrzeug", "S.view='fahrzeuge'; render(); fzEditor(null)", "d.querySelector('#fz_k').value='T 1 OFF'"],
    ["Projekt", "S.view='projekte'; render(); projektNeu({})", "d.querySelector('#pn_titel').value='Offline-Projekt'"],
    ["Kontakt", "S.view='kunden'; render(); kontaktEditor(null)", "var i=d.querySelector('input[type=text]'); if(i) i.value='Offline Kontakt'"],
  ];
  const befunde = [];
  for (const [name, oeffne, fuellen] of faelle) {
    const r = await a.seite.evaluate(async ([oeffne, fuellenText]) => {
      window.__t.x("ansichtenSchliessen()"); document.body.style.overflow = "";
      window.__netzWeg = false;
      try { window.__t.x(oeffne); } catch (e) { return { fehler: "öffnen: " + e.message }; }
      await new Promise((r) => setTimeout(r, 400));
      const d = [...document.querySelectorAll(".assistent")].pop(); if (!d) return { fehler: "kein Dialog" };
      (new Function("d", fuellenText))(d);
      d.querySelectorAll("input,textarea").forEach((i) => i.dispatchEvent(new Event("input", { bubbles: true })));
      const t0 = (document.querySelector("#toast,.toast") || {}).textContent || "";
      window.__netzWeg = true;
      const knopf = [...d.querySelectorAll(".as-fuss button")].filter((b) => !/Abbrechen|Schließen/.test(b.textContent)).pop();
      if (!knopf) return { fehler: "kein Speichern-Knopf" };
      knopf.click();
      await new Promise((r) => setTimeout(r, 2500));
      window.__netzWeg = false;
      const haengt = [...document.querySelectorAll("button")].filter((b) => b.disabled && b.offsetParent && /wird|…|lädt/.test(b.textContent)).map((b) => b.textContent.trim());
      const meldung = ((document.querySelector("#toast,.toast") || {}).textContent || "") + " " + [...d.querySelectorAll(".warnbox:not([hidden]), [id$=_err]:not([hidden])")].map((x) => x.textContent).join(" ");
      return { haengt, meldung: meldung.trim(), dialogOffen: document.body.contains(d) };
    }, [oeffne, fuellen]);
    if (r.fehler) befunde.push(name + ": " + r.fehler);
    else {
      if (r.haengt.length) befunde.push(name + ": Knopf hängt („" + r.haengt.join(", ") + "“)");
      if (!/Verbindung|Netz|nicht gespeichert|Nicht gespeichert|nicht angelegt|Fehler|fetch/i.test(r.meldung)) befunde.push(name + ": keine Meldung (" + r.meldung.slice(0, 80) + ")");
      if (!r.dialogOffen) befunde.push(name + ": Dialog zu, obwohl nicht gespeichert – Eingaben weg");
      if (/Failed to fetch|NetworkError|Load failed/i.test(r.meldung)) befunde.push(name + ": technische Meldung statt Klartext (" + r.meldung.slice(0, 80) + ")");
    }
  }
  pruefe(!befunde.length, befunde.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Vernetzung: Markt zeigt Projekte und Kontakte, Projekt führt zum Protokoll zurück und umgekehrt", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    /* ein Protokoll an TS1, ein Projekt daraus, ein Kontakt aus dem Protokoll */
    db.protokolle.push({ id: "pv1", client_id: "pv1", standort_id: "TS1", datum: "2026-01-10", wartungsart: "Wartung", techniker: "Testtechniker",
      anlagen: [], maengel: [{ text: "Verdichter laut" }], auftraggebervertreter: "Erika Probe", version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    db.projekte.push({ id: "prv1", nummer: "P-TEST-1", titel: "Folgeauftrag Test", kunde_id: "lidl", standort_id: "TS1", status: "anfrage",
      daten: { ausProtokoll: "pv1" }, verlauf: [], erstellt: new Date().toISOString(), geaendert: new Date().toISOString() });
    db.kontakte.push({ id: "kv1", name: "Erika Probe", firma: "Lidl Testfiliale 901", kategorie: "Marktleitung", schluessel: "erika probe|", herkunft: [{ art: "protokoll", id: "pv1", titel: "Protokoll" }] });
    await x("Promise.all([ladeProtokolle(), projekteLaden(), kontakteLaden()])");
    await warte(500);
    x("marktAnsicht('TS1')"); await warte(500);
    const m = [...document.querySelectorAll(".assistent")].pop();
    const karte = m.querySelector("[data-verbunden]");
    const ergM = { karte: !!karte, projekt: !!(karte && karte.querySelector('[data-projekt="prv1"]')), kontakt: !!(karte && karte.querySelector('[data-kontakt="kv1"]')) };
    x("ansichtenSchliessen()");
    x("projektAnsicht('prv1')"); await warte(500);
    const pv = [...document.querySelectorAll(".assistent")].pop();
    const ergP = /aus dem Protokoll vom/.test(pv.querySelector(".as-schritt").textContent);
    x("ansichtenSchliessen()");
    x("protokollFenster(alleProtokolle().filter(function(p){ return p._id==='pv1'; })[0])"); await warte(500);
    const pf = [...document.querySelectorAll(".assistent")].pop();
    const ergF = !!pf.querySelector('[data-projekt="prv1"]') && !/Folgeauftrag als Projekt anlegen/.test(pf.innerText);
    return { ergM, ergP, ergF };
  });
  pruefe(r.ergM.karte && r.ergM.projekt && r.ergM.kontakt, "Markt zeigt Projekt/Kontakt nicht: " + JSON.stringify(r.ergM));
  pruefe(r.ergP, "Projekt führt nicht zum Protokoll zurück");
  pruefe(r.ergF, "Protokoll zeigt das Projekt nicht (oder bietet es nochmals zum Anlegen an)");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Mail-Programm am PC: nur das verbundene Inhaber-Konto, Projekt aus Mail mit Quelle, Mails dazu", async () => {
  /* ein Techniker kann das Mail-Programm nicht verbinden */
  const t = await oeffnen(KONTEN.techniker);
  const rt = await t.seite.evaluate(async () => {
    const warte = (ms) => new Promise((f) => setTimeout(f, ms));
    location.hash = "#mailkopplung=" + "ab".repeat(16); await warte(400);
    return { gespeichert: !!localStorage.getItem("ukt_mailbruecke"), bruecke: window.__t.x("!!mailBruecke()") };
  });
  pruefe(!rt.gespeichert && !rt.bruecke, "Techniker konnte das Mail-Programm verbinden");
  await t.zu();

  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    /* das Mail-Programm nachgebaut – nichts geht ins Netz */
    const MAIL = { konto: "gmx", ordner: "INBOX", uid: 7, messageId: "<m1@test>", betreff: "Fwd: Anfrage Lüftung Waschküche Hotel Test", datum: "2026-10-02T09:12:00.000Z",
      von: [{ name: "Max Planer", address: "max@planer-test.at" }], an: [], cc: [], text: "Bitte um Angebot für eine Lüftung.", html: null,
      anhaenge: [{ i: 0, name: "Plan.pdf", typ: "application/pdf", groesse: 2048 }], notiz: null, auftraege: [] };
    /* dieselbe Anfrage, vom Chef aus dem Büro weitergeleitet – der Absender ist NICHT der Kunde */
    const WEITER = Object.assign({}, MAIL, { uid: 8, messageId: "<m2@test>", betreff: "Fwd: Anfrage Lüftung Hotel Test", von: [{ name: "UKT - Office", address: "office@ukt.at" }],
      text: "Mit freundlichen Grüßen\nManfred\n\n> Von: Hotel Test <info@hotel-test.at>\n> Bitte um Angebot.", anhaenge: [] });
    const altFetch = window.fetch, aufrufe = [];
    window.fetch = (u, o) => {
      u = String(u); if (!u.startsWith("http://localhost:4317")) return altFetch(u, o);
      aufrufe.push(u.replace("http://localhost:4317", ""));
      const antw = (d) => Promise.resolve(new Response(d instanceof Blob ? d : JSON.stringify(d), { status: 200 }));
      if (u.includes("/api/status")) return antw({ ok: true, konten: [{ name: "gmx", adresse: "test@gmx.at" }], claude: !!window.__mitClaude });
      if (u.includes("/api/mail?")) return antw(u.includes("uid=8") ? WEITER : MAIL);
      if (u.includes("/api/extrahieren")) return antw({ titel: "Lüftung Waschküche Hotel Test", kunde: "Hotel Test", kundeTreffer: "", ansprechpartner: "Jonas Test",
        telefon: "+43 1 234", email: "info@hotel-test.at", adresse: "Gasse 1", plz: "6372", ort: "Testdorf", beschreibung: "Zu- und Abluft für die Waschküche." });
      if (u.includes("/api/roh?")) return antw(new Blob(["From: max@planer-test.at\r\nSubject: Test\r\n\r\nText"], { type: "message/rfc822" }));
      if (u.includes("/api/anhang?")) return antw(new Blob(["%PDF-1.4 test"], { type: "application/pdf" }));
      if (u.includes("/api/suche")) return antw({ mails: [Object.assign({ gesendet: false }, MAIL)] });
      if (u.includes("/api/koppeln")) return JSON.parse(o.body).code === "123456" ? antw({ schluessel: "cd".repeat(16) }) : Promise.resolve(new Response('{"fehler":"Code falsch."}', { status: 401 }));
      if (u.includes("/api/leitstand/abholen")) { const a = window.__mailAuftrag || null; window.__mailAuftrag = null; return antw({ auftrag: a }); }
      return Promise.resolve(new Response('{"fehler":"unbekannt"}', { status: 404 }));
    };
    const ohne = x("mailBruecke()===null");
    /* verbinden mit dem Code aus dem Mail-Programm (Verwaltung › Inhaber) – erst falsch, dann richtig */
    const kasten = x("(function(){ var k=mailKoppelnKasten(); k.id='mkTest'; document.body.appendChild(k); return 1; })()") && document.getElementById("mkTest");
    const ein = kasten.querySelector('input[inputmode="numeric"]'), knopfV = [...kasten.querySelectorAll("button")].filter((b) => /Verbinden/.test(b.textContent))[0];
    ein.value = "111111"; knopfV.click(); await warte(400);
    const falschAbgelehnt = x("mailBruecke()===null");
    const kasten2 = document.getElementById("mkTest");
    kasten2.querySelector('input[inputmode="numeric"]').value = "123 456"; [...kasten2.querySelectorAll("button")].filter((b) => /Verbinden/.test(b.textContent))[0].click(); await warte(400);
    const mit = x("!!mailBruecke()") && /Verbunden seit/.test(document.getElementById("mkTest").textContent);
    document.getElementById("mkTest").remove();
    /* ein anderes Konto auf demselben Gerät: nichts */
    const gemerkt = localStorage.getItem("ukt_mailbruecke");
    localStorage.setItem("ukt_mailbruecke", JSON.stringify(Object.assign(JSON.parse(gemerkt), { konto: "jemand@anders.at" })));
    const fremd = x("mailBruecke()===null");
    localStorage.setItem("ukt_mailbruecke", gemerkt);
    /* Mail als neues Projekt übernehmen */
    location.hash = "#mail=" + encodeURIComponent(JSON.stringify({ k: "gmx", o: "INBOX", u: 7, a: "projekt" })); await warte(900);
    const d = dlg();
    const titel = (d.querySelector('[data-f="titel"]') || {}).value || "", vonFeld = (d.querySelector('[data-f="anfrageVon"]') || {}).value || "";
    const knopf = [...d.querySelectorAll(".as-fuss button")].filter((b) => /Projekt anlegen/.test(b.textContent))[0];
    /* unbekannter Kunde: nichts vorgewählt (früher fälschlich „Lidl“) – ohne Kunde wird nicht angelegt */
    const kundeLeer = d.querySelector('[data-f="kunde"]').value === "";
    knopf.click(); await warte(400);
    const ohneKundeGesperrt = !d.querySelector("[data-err]").hidden && !db.projekte.some((q) => q.titel === "Anfrage Lüftung Waschküche Hotel Test");
    d.querySelector('[data-f="kunde"]').value = "lidl";
    knopf.click(); await warte(1800);
    const p = db.projekte.filter((q) => q.titel === "Anfrage Lüftung Waschküche Hotel Test")[0] || null, pd = (p && p.daten) || {};
    await warte(500);
    const pv = dlg();
    const mailsKarte = [...pv.querySelectorAll(".card h2")].some((h) => /^Mails dazu/.test(h.textContent)), imProjekt = /✓ im Projekt/.test(pv.innerText);
    /* „↗ Leitstand“ im Mail-Programm: der offene Leitstand holt den Auftrag selbst ab */
    x("ansichtenSchliessen()");
    window.__mailAuftrag = { k: "gmx", o: "INBOX", u: 7, a: "zuprojekt" }; await warte(4500);
    const abgeholt = !!dlg() && /Mail zu Projekt legen/.test(dlg().innerText);
    x("ansichtenSchliessen()");
    /* vom Chef weitergeleitet, Claude liest automatisch: Hotel statt Chef, Ansprechpartner zu den Beteiligten */
    window.__mitClaude = true; x("mailBrueckeStatus=null");
    location.hash = "#mail=" + encodeURIComponent(JSON.stringify({ k: "gmx", o: "INBOX", u: 8, a: "projekt" })); await warte(1200);
    const d2 = dlg(), w = (n) => (d2.querySelector('[data-f="' + n + '"]') || {}).value || "";
    const weiter = { von: w("anfrageVon"), ap: w("ansprechpartner"), tel: w("telefon"), neuKundeHinweis: !d2.querySelector("[data-neuk]").hidden && !!d2.querySelector("[data-alsneu]") };
    d2.querySelector('[data-f="kunde"]').value = "lidl";
    [...d2.querySelectorAll(".as-fuss button")].filter((b) => /Projekt anlegen/.test(b.textContent))[0].click(); await warte(1800);
    const p2 = db.projekte.filter((q) => q.titel === "Lüftung Waschküche Hotel Test")[0] || null, b2 = ((p2 && p2.daten.beteiligte) || [])[0] || {};
    weiter.beteiligt = b2.name === "Jonas Test" && b2.mail === "info@hotel-test.at" && b2.rolle === "Kunde / Bauherr" && (b2.quellen || []).length === 1;
    weiter.anfrageVon = p2 && p2.daten.anfrageVon;
    x("ansichtenSchliessen()");
    window.fetch = altFetch;
    const meldungen = [...document.querySelectorAll(".toast, #toast")].map((t) => t.textContent).join(" | ");
    return { meldungen, ohne, mit, falschAbgelehnt, abgeholt, kundeLeer, ohneKundeGesperrt, weiter, fremd, titel, vonFeld, angelegt: !!p, mails: (pd.mails || []).map((m) => m.id), quelle: ((pd.quellen || {}).anfrage || []).length, quellen: pd.quellen,
      dateien: (pd.dateien || []).map((f) => f.art + ":" + f.name), datum: pd.anfrageDatum, mailsKarte, imProjekt, aufrufe };
  });
  pruefe(r.ohne && r.mit, "Verbinden: ohne=" + r.ohne + " mit=" + r.mit);
  pruefe(r.falschAbgelehnt, "Falscher Code hat verbunden");
  pruefe(r.abgeholt, "Bereitgelegter Auftrag aus dem Mail-Programm wurde nicht abgeholt");
  pruefe(r.kundeLeer && r.ohneKundeGesperrt, "Unbekannter Kunde: vorgewählt oder ohne Kunde angelegt");
  pruefe(r.weiter.von === "Hotel Test" && r.weiter.ap === "Jonas Test" && r.weiter.tel === "+43 1 234", "Weitergeleitete Mail: Claude-Angaben fehlen / Chef als Anfragender: " + JSON.stringify(r.weiter));
  pruefe(r.weiter.neuKundeHinweis, "Kein Angebot „Als neuen Kunden anlegen“ für den unbekannten Kunden");
  pruefe(r.weiter.beteiligt && r.weiter.anfrageVon === "Hotel Test", "Ansprechpartner nicht bei den Beteiligten bzw. Anfrage von falsch: " + JSON.stringify(r.weiter));
  pruefe(r.fremd, "Ein anderes Konto auf demselben Gerät sieht das Mail-Programm");
  pruefe(r.titel === "Anfrage Lüftung Waschküche Hotel Test", "Titel nicht aus dem Betreff (ohne Fwd): " + r.titel);
  pruefe(r.vonFeld === "Max Planer", "„Wer hat angefragt?“ nicht vorbelegt: " + r.vonFeld);
  pruefe(r.angelegt, "Projekt nicht angelegt");
  pruefe(r.mails[0] === "<m1@test>", "Mail-Verweis fehlt im Projekt: " + JSON.stringify(r.mails));
  pruefe(r.quelle === 1, "Mail ist nicht Quelle der Anfrage: " + JSON.stringify(r.quellen) + " Dateien: " + JSON.stringify(r.dateien) + " Meldungen: " + r.meldungen);
  pruefe(r.dateien.some((f) => /^mail:.*\.eml$/.test(f)) && r.dateien.some((f) => /Plan\.pdf$/.test(f)), "Dateien: " + JSON.stringify(r.dateien));
  pruefe(r.datum === "2026-10-02", "Anfrage-Datum nicht aus der Mail: " + r.datum);
  pruefe(r.mailsKarte && r.imProjekt, "Karte „Mails dazu“ fehlt oder zeigt die übernommene Mail nicht als „im Projekt“");
  pruefe(!r.aufrufe.some((u) => /senden|aktion|papierkorb/.test(u)), "Leitstand hat versucht zu senden/verschieben: " + r.aufrufe.join(", "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Bedienung: Eingabe-Dialog statt Browser-Abfrage – leer geht nicht, Abbrechen speichert nichts, mit Grund wird gespeichert", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    db.protokolle.push({ id: "pa1", client_id: "pa1", standort_id: "TS2", datum: "2026-01-12", wartungsart: "Wartung", techniker: "Testtechniker",
      anlagen: [], maengel: [{ text: "Isolierung schadhaft" }], version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    await x("ladeProtokolle()"); await warte(300);
    const kein = () => { x("S.view='projekte'; render(); 1"); return [...document.querySelectorAll('#folge_karte [data-f="kein"]')][0]; };
    let k = kein(); if (!k) return { fehler: "Folgeauftrag-Karte fehlt" };
    k.click(); await warte(300);
    let d = [...document.querySelectorAll(".assistent")].pop();
    const dialog = !!(d && d.querySelector("textarea"));
    [...d.querySelectorAll(".as-fuss button")].find((b) => /Ablegen/.test(b.textContent)).click(); await warte(200);
    const leerMeldung = !d.querySelector(".warnbox").hidden && document.body.contains(d);
    [...d.querySelectorAll(".as-fuss button")].find((b) => /Abbrechen/.test(b.textContent)).click(); await warte(400);
    const nachAbbrechen = db.stammdaten.filter((z) => z.id === "merker:folge:pa1").length;
    k = kein(); k.click(); await warte(300);
    d = [...document.querySelectorAll(".assistent")].pop();
    d.querySelector("textarea").value = "schon erledigt";
    [...d.querySelectorAll(".as-fuss button")].find((b) => /Ablegen/.test(b.textContent)).click(); await warte(800);
    const gespeichert = db.stammdaten.filter((z) => z.id === "merker:folge:pa1").map((z) => (z.felder || {}).grund)[0];
    return { dialog, leerMeldung, nachAbbrechen, gespeichert, offen: !!document.querySelector(".assistent") };
  });
  pruefe(!r.fehler, r.fehler);
  pruefe(r.dialog, "kein Eingabe-Dialog der App");
  pruefe(r.leerMeldung, "leere Eingabe wurde nicht abgefangen");
  pruefe(r.nachAbbrechen === 0, "Abbrechen hat gespeichert");
  pruefe(r.gespeichert === "schon erledigt", "Grund nicht gespeichert: " + JSON.stringify(r));
  pruefe(!r.offen, "Dialog bleibt nach dem Speichern offen");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Mehrere Techniker: Tour an zwei Personen (gemeinsame Termine, je Tour + Nachricht) und Störung „Wer fährt hin“ mit mehreren", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, e = {};
    await x("stoerungSpeichern({_id:'stm1', standortId:'TS2', auftragsnummer:'T-M1', erfasstAm:new Date().toISOString(), status:'offen'}, 'Test')"); await warte(300);
    window.__T = { tage: [{ nr: 1, stopps: [
      { standort: x("byId.TS1"), positionen: [x("posById.TP1")], fahrtH: 0.5, arbeitH: 1 },
      { standort: x("byId.TS2"), positionen: [{ id: "stoer:stm1", anlagentyp: "Störung" }], fahrtH: 0.5, arbeitH: 1 } ] }], anzahlStopps: 2, kmGesamt: 40, stundenProTag: 8 };
    x("ansichtenSchliessen()"); x("tourSchicken(window.__T)"); await warte(500);
    const d = [...document.querySelectorAll(".assistent")].pop(), chips = [...d.querySelectorAll("[data-an] .chip")];
    const tech = chips.find((b) => /Testtechniker/.test(b.textContent)), adm = chips.find((b) => /Testadmin/.test(b.textContent));
    if (!tech || !adm) return { fehler: "Auswahl: " + chips.map((b) => b.textContent).join(",") };
    tech.click(); adm.click(); await warte(100);
    e.gedrueckt = chips.filter((b) => b.getAttribute("aria-pressed") === "true").length;
    const knopf = [...d.querySelectorAll(".as-fuss button")].pop(); e.knopf = knopf.textContent;
    const vorPlan = db.planung.length, vorChat = (db.chat || []).length, vorTouren = db.touren.length;
    knopf.click(); await warte(1800);
    const neu = db.planung.slice(vorPlan);
    e.termine = neu.length; e.werAlle = neu.every((p) => (p.wer || []).length === 2 && p.wer.indexOf("u_tech_test_at") >= 0);
    e.touren = db.touren.slice(vorTouren).map((t) => t.an).sort().join();
    e.chats = (db.chat || []).slice(vorChat).filter((c) => /Neue Tour/.test(c.text) && /Mit dir:/.test(c.text)).length;
    e.stoer = (x("OFFENE").filter((o) => o._id === "stm1")[0] || {}).terminTechniker || "";
    /* Störung: „Wer fährt hin“ – Knöpfe wählen mehrere, nochmals antippen nimmt heraus */
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(null, null, {standortId:'TS1'})"); await warte(400);
    const sd = [...document.querySelectorAll(".assistent")].pop(), feld = sd.querySelector('[data-s="terminTechniker"]'), kn = [...feld.closest("label").querySelectorAll(".chip[data-mehr]")];
    kn[0].click(); kn[1].click(); await warte(50);
    e.zwei = feld.value + " | " + kn.slice(0, 2).map((c) => c.getAttribute("aria-pressed")).join();
    kn[0].click(); await warte(50);
    e.einer = feld.value + " | " + kn[0].getAttribute("aria-pressed");
    e.textfeldZu = feld.style.display === "none";
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); })");
    /* jede eingetragene Person bekommt die Nachricht, steht im Kalender und in der Doppelbuchungs-Prüfung */
    e.teilen = x("stoerWer({terminTechniker:'Testtechniker, Testadmin; Testtechniker'})").join("|") + " # " + x("stoerWer({terminTechniker:'Kälte Huber & Co, Testadmin'})").join("|");
    const T = x("plusTage(isoLokal(new Date()), 3)");
    const o = { _id: "stm2", standortId: "TS1", termin: T, terminZeit: "08:00", terminTechniker: "Testtechniker, Testadmin", erledigt: false };
    x("OFFENE").push(o);
    const vc = (db.chat || []).length; x("stoerungEinsatzMelden")(o, true); await warte(600);
    e.meldungen = (db.chat || []).slice(vc).map((c) => c.an).sort().join();
    e.verplant = x("verplantPruefen")([], ["Testadmin"], T, T, 7 * 60, 9 * 60, null, null).join(" | ");
    e.kalender = JSON.stringify(((x("kalenderEintraege")(T, T, "alle") || {})[T] || []).filter((z) => z.o && z.o._id === "stm2").map((z) => z.unter));
    return e;
  });
  pruefe(!r.fehler, r.fehler);
  pruefe(r.gedrueckt === 2 && /2 Personen/.test(r.knopf), "Tour: Mehrfachauswahl " + JSON.stringify(r));
  pruefe(r.termine === 2 && r.werAlle, "Tour: Termine nicht gemeinsam für beide: " + JSON.stringify(r));
  pruefe(r.touren === "u_admin_test_at,u_tech_test_at" && r.chats === 2, "Tour: je Person Tour + Nachricht: " + JSON.stringify(r));
  pruefe(/Testtechniker/.test(r.stoer) && /Testadmin/.test(r.stoer), "Störung der Tour ohne beide Namen: " + r.stoer);
  pruefe(/, .* \| true,true$/.test(r.zwei) && /^[^,]+ \| false$/.test(r.einer) && r.textfeldZu, "Wer fährt hin: " + JSON.stringify([r.zwei, r.einer, r.textfeldZu]));
  pruefe(r.teilen === "Testtechniker|Testadmin # Kälte Huber & Co|Testadmin", "Namen teilen (Firmennamen bleiben ganz): " + r.teilen);
  pruefe(r.meldungen === "u_admin_test_at,u_tech_test_at", "Nachricht nicht an beide: " + r.meldungen);
  pruefe(/Testadmin: Störung/.test(r.verplant), "Doppelbuchung erkennt die zweite Person nicht: " + r.verplant);
  pruefe(/Testtechniker, Testadmin/.test(r.kalender), "Kalender ohne beide Namen: " + r.kalender);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tour → Kalender: für sich selbst und andere; Störung bekommt „Einsatz geplant“; Techniker nur für sich und nimmt an", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    /* eine offene Störung an TS2 */
    await x("stoerungSpeichern({_id:'stt1', standortId:'TS2', auftragsnummer:'T-1', erfasstAm:new Date().toISOString(), status:'offen'}, 'Test')");
    await warte(300);
    window.__T = { tage: [{ nr: 1, stopps: [
      { standort: x("byId.TS1"), positionen: [x("posById.TP1")], fahrtH: 0.5, arbeitH: 1 },
      { standort: x("byId.TS2"), positionen: [{ id: "stoer:stt1", anlagentyp: "Störung" }], fahrtH: 0.5, arbeitH: 1 } ] }], anzahlStopps: 2, kmGesamt: 40, stundenProTag: 8 };
    const schicken = async (wahl) => {
      x("ansichtenSchliessen()"); x("tourSchicken(window.__T)"); await warte(500);
      const d = [...document.querySelectorAll(".assistent")].pop();
      const chips = [...d.querySelectorAll("[data-an] .chip")];
      const c = chips.find((b) => wahl.test(b.textContent)); if (!c) return { fehler: "keine Auswahl " + wahl + ": " + chips.map((b) => b.textContent).join(",") };
      c.click(); await warte(100);
      const knopf = [...d.querySelectorAll(".as-fuss button")].pop(), text = knopf.textContent;
      knopf.click(); await warte(1500);
      return { chips: chips.map((b) => b.textContent), knopf: text };
    };
    const vorPlan = db.planung.length;
    const selbst = await schicken(/^Ich/);
    const meine = db.planung.slice(vorPlan);
    const stoer = x("(OFFENE.filter(function(o){ return o._id==='stt1'; })[0]||{})");
    const eingeplant = !!x("planFuerPosition('TP1')");
    const vorTouren = db.touren.length;
    const fremd = await schicken(/Testtechniker|tech/i);
    return { selbst, fremd, meineAnzahl: meine.length, meineWer: meine.map((p) => (p.wer || []).join()), ich: x("meineKennung()"),
      stoerTermin: stoer.termin || null, stoerTechniker: stoer.terminTechniker || null, eingeplant, touren: db.touren.length - vorTouren,
      tourenFuerTech: db.touren.filter((t) => t.an === "u_tech_test_at").length };
  });
  pruefe(!r.selbst.fehler && !r.fremd.fehler, (r.selbst.fehler || "") + (r.fremd.fehler || ""));
  pruefe(/^Ich/.test(r.selbst.chips[0]) && r.selbst.chips.length >= 3, "Auswahl falsch: " + r.selbst.chips.join(", "));
  pruefe(r.selbst.knopf === "In meinen Kalender", "Für sich selbst steht „" + r.selbst.knopf + "“ am Knopf");
  pruefe(r.meineAnzahl === 2 && r.meineWer.every((w) => w === r.ich), "eigene Kalendereinträge falsch: " + JSON.stringify(r));
  pruefe(r.eingeplant, "Wartungstermin gilt nicht als eingeplant");
  pruefe(r.stoerTermin && /Testinhaber|Inhaber/i.test(r.stoerTechniker || ""), "Störung ohne „Einsatz geplant“: " + r.stoerTermin + " / " + r.stoerTechniker);
  pruefe(r.tourenFuerTech === 1, "Tour an den Techniker nicht gespeichert: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* Techniker: nur für sich, nimmt die Tour an */
  const t = await oeffnen(KONTEN.techniker);
  const rt = await t.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    window.__T = { tage: [{ nr: 1, stopps: [{ standort: x("byId.TS1"), positionen: [x("posById.TP1")], fahrtH: 0.5, arbeitH: 1 }] }], anzahlStopps: 1, kmGesamt: 10, stundenProTag: 8 };
    x("tourSchicken(window.__T)"); await warte(400);
    const d = [...document.querySelectorAll(".assistent")].pop();
    const chips = [...d.querySelectorAll("[data-an] .chip")].map((b) => b.textContent);
    x("ansichtenSchliessen()");
    /* jedes Testfenster hat seine eigene Datenbank – die Tour vom Büro hier anlegen */
    db.touren.push({ id: "tt1", an: "u_tech_test_at", an_name: "Testtechniker", von: "u_inhaber_test_at", von_name: "Testinhaber", titel: "Testtour",
      daten: { stopps: [], anzahl: 1, km: 10 }, erstellt: new Date().toISOString() });
    x("tourenVersuch=0; tourenLaden()"); await warte(600);
    x("S.view='karte'; render()"); await warte(400);
    const an = document.querySelector("[data-tourannehmen]");
    if (an) { an.click(); await warte(800); }
    return { chips, annehmenDa: !!an, angenommen: db.touren.filter((z) => z.an === "u_tech_test_at").some((z) => (z.daten || {}).angenommen) };
  });
  pruefe(rt.chips.length === 1 && /^Ich/.test(rt.chips[0]), "Techniker kann für andere planen: " + rt.chips.join(", "));
  pruefe(rt.annehmenDa && rt.angenommen, "Techniker kann die Tour nicht annehmen: " + JSON.stringify(rt));
  pruefe(!t.fehler.length, "Laufzeitfehler (Techniker): " + t.fehler.join("; "));
  await t.zu();
});

test("Vor Ort klären: Büro stellt die Frage, Techniker sieht sie nur am Markt im Protokoll und antwortet, Büro hakt ab", async () => {
  /* Büro stellt eine Frage über den Dialog */
  const a = await oeffnen(KONTEN.inhaber);
  const rb = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    x("vorOrtNeu('TS1')"); await warte(400);
    const d = [...document.querySelectorAll(".assistent")].pop(), ta = d.querySelector("textarea");
    ta.value = "Welche Hausnummer hat der Lieferanteneingang?"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(800);
    const gestellt = db.vor_ort_fragen.slice();
    /* die Antwort kam (in der Attrappe direkt gesetzt) – das Büro hakt sie in der Datenpflege ab */
    gestellt[0].antwort = "Nr. 3"; gestellt[0].beantwortet = new Date().toISOString(); gestellt[0].beantwortet_von = "Testtechniker";
    await x("vorOrtLaden(true)");
    x("S.view='verwaltung'; S.adm={tab:'datenpflege', suche:'', filter:'alle', sort:'filiale', auf:true, sel:null, entwurf:null}; render(); 1"); await warte(500);
    const karte = [...document.querySelectorAll(".card")].filter((c) => /^Vor Ort klären/.test((c.querySelector("h2") || {}).textContent || ""))[0];
    const reiter = [...document.querySelectorAll("[data-tab]")].map((b) => b.textContent).join(" | ");
    const erl = karte && [...karte.querySelectorAll("button")].filter((b) => b.textContent === "Erledigt")[0];
    if (erl) { erl.click(); await warte(800); }
    return { gestellt: gestellt.map((f) => [f.standort_id, f.frage, f.angelegt_von]), karte: !!karte, reiter, erledigt: !!(db.vor_ort_fragen[0] || {}).erledigt };
  });
  pruefe(rb.gestellt.length === 1 && rb.gestellt[0][0] === "TS1" && /Hausnummer/.test(rb.gestellt[0][1]), "Frage nicht gespeichert: " + JSON.stringify(rb));
  pruefe(/Datenpflege · \d/.test(rb.reiter), "Reiter Datenpflege fehlt: " + rb.reiter);
  pruefe(rb.karte && rb.erledigt, "Büro konnte die Antwort nicht abhaken: " + JSON.stringify(rb));
  pruefe(!a.fehler.length, "Laufzeitfehler (Büro): " + a.fehler.join("; "));
  await a.zu();
  /* Techniker: sieht die Frage nur am betroffenen Markt, antwortet, darf aber keine stellen und die Frage nicht ändern */
  const t = await oeffnen(KONTEN.techniker);
  const rt = await t.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    db.vor_ort_fragen.push({ id: "vf1", standort_id: "TS1", frage: "Ist die Split im Büro dieselbe Anlage wie im Lager?", angelegt: new Date().toISOString(), angelegt_von: "Büro" });
    await x("vorOrtLaden(true)");
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS2'; S.protoPos=null; S.view='protokoll'; render(); 1"); await warte(500);
    const andererMarkt = (document.querySelector("#f_vorort") || {}).textContent || "";
    x("formDirty=false; S.protoStandort='TS1'; S.protoPos='TP1'; render(); 1"); await warte(500);
    const box = document.querySelector("#f_vorort");
    const sichtbar = box ? box.textContent : "";
    const inp = box && box.querySelector('[data-v="antwort"]');
    if (inp) { inp.value = "Ja, dieselbe"; inp.dispatchEvent(new Event("input", { bubbles: true })); box.querySelector('[data-v="speichern"]').click(); }
    await warte(800);
    const dirty = x("formDirty");
    const vorher = window.__abgelehnt.length;
    await x("Store.sb.from('vor_ort_fragen').update({frage:'geändert'}).eq('id','vf1')");
    await x("Store.sb.from('vor_ort_fragen').insert({standort_id:'TS1', frage:'eigene Frage'})");
    return { andererMarkt, sichtbar, zeile: db.vor_ort_fragen[0], dirty, abgelehnt: window.__abgelehnt.slice(vorher) };
  });
  pruefe(!/Split im Büro/.test(rt.andererMarkt), "Frage erscheint am falschen Markt");
  pruefe(/Split im Büro/.test(rt.sichtbar), "Techniker sieht die Frage im Protokoll nicht: " + rt.sichtbar.slice(0, 100));
  pruefe(rt.zeile.antwort === "Ja, dieselbe" && rt.zeile.beantwortet_von, "Antwort nicht gespeichert: " + JSON.stringify(rt.zeile));
  pruefe(!rt.dirty, "Die Antwort macht das Protokoll „ungespeichert“");
  pruefe(rt.abgelehnt.length === 2 && rt.zeile.frage !== "geändert", "Techniker darf Fragen ändern oder stellen: " + JSON.stringify(rt.abgelehnt));
  pruefe(!t.fehler.length, "Laufzeitfehler (Techniker): " + t.fehler.join("; "));
  await t.zu();
});

test("Alte Liste prüfen: Funde aus der Liste, „passt so“ legt ab, Vor-Ort-Frage aus einem Fund", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    /* eine Zelle der alten Liste, die kein Datum ist, eine „-“ (nicht gewartet) und ein Hinweis auf eine Lüftung */
    x("posById.TP1.wartungenRaw={'2025':'Umbau in Arbeit','2026':'-'}; posById.TP1.rueckkuehler='dazu Lüftungsanlage Lager'; 1");
    const funde = x("altlisteFunde()").map((f) => f.art + ": " + f.text);
    const roh = funde.filter((t) => /Umbau in Arbeit/.test(t)).length, strich = funde.filter((t) => /„-“/.test(t)).length, lueftung = funde.filter((t) => /^Weitere Anlage\?/.test(t)).length;
    x("S.view='verwaltung'; S.adm={tab:'datenpflege', suche:'', filter:'alle', sort:'filiale', auf:true, sel:null, entwurf:null}; render(); 1"); await warte(500);
    const karte = [...document.querySelectorAll(".card")].filter((c) => /^Alte Liste prüfen/.test((c.querySelector("h2") || {}).textContent || ""))[0];
    const zeile = karte && [...karte.querySelectorAll(".stack .stack")].filter((z) => /Umbau in Arbeit/.test(z.textContent))[0];
    if (zeile) { zeile.querySelector('[data-a="ok"]').click(); await warte(800); }
    const danach = x("altlisteFunde()").filter((f) => /Umbau in Arbeit/.test(f.text)).length;
    const merker = db.stammdaten.filter((s) => /^merker:altliste:/.test(s.id)).map((s) => s.felder.ergebnis);
    /* aus dem Lüftungs-Fund eine Frage für vor Ort */
    const f = x("altlisteFunde()").filter((f) => f.art === "Weitere Anlage?")[0];
    window.__f = f;
    x("vorOrtNeu(window.__f.s.id, {vorgabe:window.__f.text, herkunft:'Prüfung der alten Liste', position_id:window.__f.pid, fertig:function(){ altlisteAblegen(window.__f, 'als Frage für vor Ort weitergegeben'); }})"); await warte(400);
    const d = [...document.querySelectorAll(".assistent")].pop(), vorgabe = d.querySelector("textarea").value;
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(1000);
    return { roh, strich, lueftung, karte: !!karte, danach, merker, vorgabe, frage: db.vor_ort_fragen.map((q) => [q.herkunft, q.position_id]),
      lueftungDanach: x("altlisteFunde()").filter((f) => f.art === "Weitere Anlage?").length };
  });
  pruefe(r.roh === 1 && r.strich === 0 && r.lueftung === 1, "Funde falsch (unklarer Eintrag / „-“ / Lüftung): " + JSON.stringify(r));
  pruefe(r.karte && r.danach === 0 && r.merker.indexOf("passt so") >= 0, "„Passt so“ legt den Fund nicht ab: " + JSON.stringify(r));
  pruefe(/Lüftung/.test(r.vorgabe) && r.frage.length === 1 && r.frage[0][0] === "Prüfung der alten Liste" && r.frage[0][1] === "TP1" && r.lueftungDanach === 0,
    "Frage aus dem Fund nicht richtig: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Auslastung: Büro sieht 12 Monate mit Zahlen, Techniker nicht", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    x("S.view='kalender'; render(); 1"); await warte(900);
    const karte = [...document.querySelectorAll(".card")].filter((c) => /^Auslastung/.test((c.querySelector("h2") || {}).textContent || ""))[0];
    const monate = karte ? karte.querySelectorAll("[data-monate] details").length : 0;
    const text = karte ? karte.textContent : "";
    const r12 = x("auslastungRechnen([{user_id:meineKennung(), name:'ich'}])");
    const wartungen = r12.reduce((s, m) => s + m.wartungen, 0);
    return { monate, kaputt: /NaN|undefined|Infinity/.test(text), wartungen, frei: r12[0].freiH, jedeMonat: r12.every((m) => m.freiH >= 0 && m.arbeitH >= 0) };
  });
  pruefe(r.monate === 12, "Nicht 12 Monate: " + JSON.stringify(r));
  pruefe(!r.kaputt && r.jedeMonat, "Kaputte Zahlen in der Auslastung: " + JSON.stringify(r));
  pruefe(r.wartungen > 0 && r.frei > 0, "Auslastung ohne Wartungen oder ohne freie Zeit: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  const t = await oeffnen(KONTEN.techniker);
  const da = await t.seite.evaluate(async () => { window.__t.x("S.view='kalender'; render(); 1"); await new Promise((f) => setTimeout(f, 700));
    return [...document.querySelectorAll(".card h2")].some((h) => /^Auslastung/.test(h.textContent)); });
  pruefe(!da, "Techniker sieht die Auslastung");
  await t.zu();
});

test("Sicherung: Inhaber legt den Datenbestand ab und wird ans Herunterladen erinnert, Techniker nicht", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db;
    x("S.view='faellig'; render(); 1"); await warte(500);
    const erinnerung = [...document.querySelectorAll(".card h2")].some((h) => /^Sicherung herunterladen/.test(h.textContent));
    const e = await x("sicherungAblegen()");
    const datei = Object.keys(db.dateien).filter((k) => /^sicherungen\/datenbank\//.test(k));
    let inhalt = null;
    if (datei.length) {
      const b = db.dateien[datei[0]];
      const txt = /\.gz$/.test(datei[0]) ? await new Response(b.stream().pipeThrough(new DecompressionStream("gzip"))).text() : await b.text();
      const j = JSON.parse(txt); inhalt = { art: j.art, tabellen: Object.keys(j.tabellen).length, protokolle: !!j.tabellen.protokolle, stammdaten: (j.tabellen.stammdaten.zeilen || []).length };
    }
    const merker = (db.tabellen.stammdaten.filter((s) => s.id === "merker:sicherung")[0] || {}).felder || {};
    x("S.view='verwaltung'; S.adm={tab:'inhaber', suche:'', filter:'alle', sort:'filiale', auf:true, sel:null, entwurf:null}; render(); 1"); await warte(500);
    const karte = [...document.querySelectorAll(".card h2")].some((h) => h.textContent === "Sicherung");
    return { erinnerung, zeilen: e.zeilen, datei, inhalt, abgelegt: !!merker.abgelegt, karte };
  });
  pruefe(r.erinnerung, "Keine Erinnerung zum Herunterladen in „Fällig“");
  pruefe(r.datei.length === 1 && r.inhalt && r.inhalt.art === "UKT-Leitstand-Sicherung" && r.inhalt.protokolle && r.inhalt.tabellen >= 20, "Sicherung nicht vollständig abgelegt: " + JSON.stringify(r));
  pruefe(r.abgelegt && r.karte, "Stand der Sicherung fehlt (Merker/Karte): " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  const t = await oeffnen(KONTEN.techniker);
  const rt = await t.seite.evaluate(async () => { const x = window.__t.x; x("S.view='faellig'; render(); 1"); await new Promise((f) => setTimeout(f, 500));
    return { an: x("sicherungAn()"), erinnerung: [...document.querySelectorAll(".card h2")].some((h) => /^Sicherung/.test(h.textContent)) }; });
  pruefe(!rt.an && !rt.erinnerung, "Techniker kann sichern oder wird erinnert: " + JSON.stringify(rt));
  await t.zu();
});

test("Angebot aus dem Folgeauftrag: Befund, Katalog-Vorschlag und Fahrtpauschale, danach aus der Liste", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    db.katalog.push({ id: "k4", text: "Kondensatpumpe liefern und tauschen (Test)", eh: "Stk", preis: 180, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    db.protokolle.push({ id: "pf1", client_id: "pf1", standort_id: "TS1", datum: "2026-05-10", wartungsart: "Wartung", techniker: "Testtechniker",
      anlagen: [{ name: "VRV Anlage" }], maengel: [{ text: "Kondensatpumpe defekt", prio: "hoch" }], version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    await x("Promise.all([ladeProtokolle(), projekteLaden(), katalogLaden()])"); await warte(400);
    x("S.view='projekte'; render(); 1"); await warte(500);
    const karte = document.getElementById("folge_karte");
    const knopf = karte && [...karte.querySelectorAll('[data-f="angebot"]')][0];
    if (!knopf) return { fehler: "kein Knopf „Angebot entwerfen“" };
    knopf.click(); await warte(1200);
    const d = [...document.querySelectorAll(".assistent")].pop();
    const titel = d ? d.querySelector(".as-titel").textContent : "";
    const ok = d && [...d.querySelectorAll(".as-fuss button")].filter((b) => b.textContent === "Speichern")[0];
    if (ok) { ok.click(); await warte(1500); }
    const b = db.belege[db.belege.length - 1] || {};
    return { titel, art: b.art, protokoll: b.protokoll_id, betreff: ((b.kopf || {}).betreff || []).join(" "),
      pos: (b.positionen || []).map((p) => [p.typ, p.text, p.preis]), offen: x("folgeOffen()").map((p) => p._id) };
  });
  pruefe(!r.fehler, r.fehler);
  pruefe(/Angebot/.test(r.titel) && r.art === "angebot" && r.protokoll === "pf1", "Angebot nicht angelegt: " + JSON.stringify(r));
  pruefe(r.pos.some((p) => p[0] === "text" && /Kondensatpumpe defekt/.test(p[1])), "Befund fehlt im Angebot: " + JSON.stringify(r.pos));
  pruefe(r.pos.some((p) => /Kondensatpumpe liefern/.test(p[1]) && p[2] === 180), "Katalog-Vorschlag fehlt: " + JSON.stringify(r.pos));
  pruefe(r.pos.some((p) => /Fahrtpauschale Zone 1/.test(p[1]) && p[2] === 50), "Fahrtpauschale fehlt: " + JSON.stringify(r.pos));
  pruefe(/Filiale 901/.test(r.betreff), "Betreff ohne Markt: " + r.betreff);
  pruefe(r.offen.indexOf("pf1") < 0, "Folgeauftrag bleibt nach dem Angebot in der Liste");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Projekt aus Mailverlauf: Mails wählen, Claude-Vorschlag prüfen, anlegen mit Angaben, Quellen, Beteiligten, Terminen, Tagebuch und Dateien", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    localStorage.setItem("ukt_mailbruecke", JSON.stringify({ schluessel: "ef".repeat(16), konto: x("wer()"), seit: new Date().toISOString() }));
    const M = (uid, d, betreff, anh) => ({ konto: "gmx", ordner: "INBOX", uid, messageId: "<v" + uid + "@test>", datum: d, betreff, von: "Planer <p@planer-test.at>",
      vonListe: [{ name: "Planer", address: "p@planer-test.at" }], an: "", anhaenge: anh || [], kurz: "…" });
    const MAILS = [M(11, "2026-03-02T08:00:00.000Z", "Anfrage Kälte Hotel Verlauf"), M(12, "2026-03-20T08:00:00.000Z", "Angebot 400123", [{ i: 0, name: "Plan.pdf", typ: "application/pdf", groesse: 2048 }])];
    const VORSCHLAG = { titel: "Kälte Hotel Verlauf", kunde: "Hotel Verlauf", kundeTreffer: "", typ: "Neuanlage", status: "angebot",
      angaben: [{ key: "anfrageDatum", wert: "2026-03-02", mail: 0 }, { key: "angebotNr", wert: "400123", mail: 1 }, { key: "angebotNr", wert: "400124", mail: 1 }, { key: "erfunden", wert: "x", mail: 0 }],
      beteiligte: [{ rolle: "Planer HKLS", firma: "Planer GmbH", name: "Paul Planer", telefon: "+43 1", mail_adresse: "p@planer-test.at", mail: 0 }],
      termine: [{ datum: "2026-03-10", text: "Begehung vor Ort", mail: 0 }],
      tagebuch: [{ datum: "2026-03-02", text: "Anfrage vom Planer", mail: 0 }, { datum: "2026-03-20", text: "Angebot geschickt", mail: 1 }],
      dateien: [{ mail: 1, name: "Plan.pdf", art: "plan" }] };
    const altFetch = window.fetch, aufrufe = [];
    window.fetch = (u, o) => {
      u = String(u); if (!u.startsWith("http://localhost:4317")) return altFetch(u, o);
      aufrufe.push(u.replace("http://localhost:4317", ""));
      const antw = (d) => Promise.resolve(new Response(d instanceof Blob ? d : JSON.stringify(d), { status: 200 }));
      if (u.includes("/api/suche")) return antw({ mails: MAILS.map((m) => Object.assign({}, m, { von: m.vonListe })) });
      if (u.includes("/api/verlauf")) return antw({ mails: MAILS, vorschlag: VORSCHLAG });
      /* je Mail ein eigener Inhalt – gleiche Inhalte erkennt die App als doppelt (Inhaber 07.10.2026) */
      if (u.includes("/api/roh?")) return antw(new Blob(["From: p@planer-test.at\r\n\r\nText " + ((/uid=(\d+)/.exec(u) || [])[1] || "")], { type: "message/rfc822" }));
      if (u.includes("/api/anhang?")) return antw(new Blob(["kein KPlus"], { type: "application/pdf" }));
      if (u.includes("/api/status")) return antw({ ok: true, konten: [], claude: true });
      if (u.includes("/api/leitstand/abholen")) return antw({ auftrag: null });
      return Promise.resolve(new Response('{"fehler":"unbekannt"}', { status: 404 }));
    };
    x("mailVerlaufDialog({suche:'Hotel Verlauf'})"); await warte(800);
    let d = dlg();
    const gefunden = d.querySelectorAll("[data-l] input[type=checkbox]").length;
    [...d.querySelectorAll(".as-fuss button")].filter((b) => /Mit Claude auswerten/.test(b.textContent))[0].click(); await warte(800);
    d = dlg();
    const vorschlagText = d.textContent;
    const angZeilen = d.querySelectorAll("[data-ang]").length;
    d.querySelector('[data-k="kunde"]').value = "lidl";
    [...d.querySelectorAll(".as-fuss button")].filter((b) => /Projekt anlegen/.test(b.textContent))[0].click(); await warte(3000);
    const p = db.projekte.filter((q) => q.titel === "Kälte Hotel Verlauf")[0] || null, pd = (p && p.daten) || {};
    window.fetch = altFetch; localStorage.removeItem("ukt_mailbruecke");
    return { gefunden, vorschlagText, angZeilen, angelegt: !!p, status: p && p.status, anfrage: pd.anfrageDatum, angebotNr: pd.angebotNr, quellen: pd.quellen || {},
      beteiligt: (pd.beteiligte || []).map((b) => b.name + "|" + (b.quellen || []).length), termine: (pd.termine || []).map((t) => t.datum + "|" + t.was + "|" + t.erledigt),
      verlauf: ((p && p.verlauf) || []).map((v) => String(v.zeit).slice(0, 10) + "|" + v.text), dateien: (pd.dateien || []).map((f) => f.art + ":" + f.name), mails: (pd.mails || []).length, aufrufe };
  });
  pruefe(r.gefunden === 2, "Suche zeigt nicht beide Mails: " + r.gefunden);
  pruefe(/Angaben zu den Schritten/.test(r.vorschlagText) && /Paul Planer/.test(r.vorschlagText) && /Begehung vor Ort/.test(r.vorschlagText), "Vorschlag unvollständig");
  pruefe(r.angZeilen === 2, "Angaben: doppelter Schlüssel nicht zusammengefasst bzw. unbekannter Schlüssel nicht verworfen (" + r.angZeilen + ")");
  pruefe(r.angelegt && r.status === "angebot", "Projekt nicht angelegt / Stand falsch: " + r.status);
  pruefe(r.anfrage === "2026-03-02" && r.angebotNr === "400123, 400124", "Angaben falsch: " + r.anfrage + " / " + r.angebotNr);
  pruefe((r.quellen.anfrage || []).length === 1 && (r.quellen.angebot || []).length === 1, "Quellen je Schritt fehlen: " + JSON.stringify(r.quellen));
  pruefe(r.beteiligt[0] === "Paul Planer|1", "Beteiligte: " + JSON.stringify(r.beteiligt));
  pruefe(r.termine[0] === "2026-03-10|Begehung vor Ort|true", "Termine: " + JSON.stringify(r.termine));
  pruefe(r.verlauf.some((v) => v === "2026-03-02|Anfrage vom Planer") && r.verlauf.some((v) => v === "2026-03-20|Angebot geschickt"), "Tagebuch mit Mail-Datum fehlt: " + JSON.stringify(r.verlauf));
  pruefe(r.dateien.filter((f) => /^mail:.*\.eml$/.test(f)).length === 2 && r.dateien.some((f) => f === "plan:Plan.pdf"), "Dateien: " + JSON.stringify(r.dateien));
  pruefe(r.mails === 2, "Mail-Verweise: " + r.mails);
  pruefe(!r.aufrufe.some((u) => /senden|aktion|papierkorb/.test(u)), "Leitstand hat versucht zu senden/verschieben");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("KPlus-Rechnung zum Einsatz: Mengen in Klammern geprüft, Vergleich mit der App, abgerechnet, die App lernt daraus", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    /* Prüfung: Text nennt Stunden, Menge passt nicht; Stunden mit Einheit Stk; Gerätetext mit „Stunden“ ist kein Fehler */
    const pruef = x("positionenPruefen(" + JSON.stringify([
      { typ: "pos", nr: "1", menge: 1, eh: "Std", preis: 78.81, text: "Regiestunden Techniker (3 h)" },
      { typ: "pos", nr: "2", menge: 30, eh: "Stk", preis: 74, text: "Zuschlag Stundensatz Facharbeiter 100 % für Sonntag (4 Mann a 10Std)" },
      { typ: "pos", nr: "3", menge: 3, eh: "Stk", preis: 15044, text: "Ausseneinheit … Abtauung nach 5 Stunden" },
      { typ: "pos", nr: "4", menge: 30, eh: "Std", preis: 39.4, text: "Zuschlag Samstag ( 3\nMann a 10 Std)" },
      { typ: "pos", nr: "5", menge: 1, eh: "Stk", preis: 269.34, text: "Kondensathebepumpe 8 l/h" }]) + ").map(function(w){ return w.nr+':'+w.text; })");
    const ohne = x("katalogTextOhneMenge('Zuschlag Samstag ( 3\\nMann a 10 Std)')+'|'+katalogTextOhneMenge('Regiestunden Techniker (3 h)')");
    /* Störungseinsatz 08:00–11:00 mit 2 Mann; im Katalog steht eine Regiestunde MIT alter Menge im Text */
    db.katalog.push({ id: "kr1", text: "Regiestunden Techniker (3 h)", eh: "Std", preis: 78.81, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    const st = (id, d) => ({ id, client_id: id, standort_id: "TS1", datum: d, wartungsart: "Störung", techniker: "Testtechniker", mitarbeiter: ["Zweiter"],
      stoerung: { ankunft: "08:00", ende: "11:00", problemtyp: "Kühlung" }, anlagen: [], version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    db.protokolle.push(st("pk1", "2026-06-01"), st("pk2", "2026-06-08"), st("pk3", "2026-06-15"));
    await x("Promise.all([ladeProtokolle(), katalogLaden(), abrechnungLaden()])"); await warte(400);
    const vor = x("einsatzPositionen(alleProtokolle().filter(function(p){ return p._id==='pk1'; })[0], 'lidl').map(function(p){ return [p.menge, p.text]; })");
    /* die KPlus-Rechnung des Chefs: Regiestunden wie die App, dazu Kleinmaterial, das die App nicht kennt */
    const erg = (nr) => ({ art: "rechnung", nummer: nr, datum: "2026-06-02", kopf: { betreff: ["Filiale 901 Störung"] }, summenPdf: { netto: 552.86 },
      positionen: [{ typ: "pos", nr: "1", menge: 6, eh: "Std", preis: 78.81, betragPdf: 472.86, text: "Regiestunden Techniker" },
        { typ: "pos", nr: "2", menge: 1, eh: "psh", preis: 30, betragPdf: 30, text: "Kleinmaterial pauschal" },
        { typ: "pos", nr: "3", menge: 1, eh: "psh", preis: 50, betragPdf: 50, text: "Fahrtpauschale Zone 1" }] });
    const ablegen = async (pkId, nr) => {
      window.__kpFehler = x("(function(){ try{ kplusVorschau(kontextProtokoll(alleProtokolle().filter(function(p){ return p._id==='" + pkId + "'; })[0]), " + JSON.stringify(erg(nr)) + ", function(){}); return 'ok'; }catch(e){ return String(e.stack||e); } })()"); await warte(500);
      const d = dlg(), txt = d.textContent;
      [...d.querySelectorAll(".as-fuss button")].filter((b) => /Beim Einsatz ablegen/.test(b.textContent))[0].click(); await warte(1200);
      return txt;
    };
    const vergleichText = await ablegen("pk1", "900001");
    await ablegen("pk2", "900002");
    const b1 = db.belege.filter((b) => b.nummer === "900001")[0] || {};
    const abger = db.abrechnung.some((z) => z.protokoll_id === "pk1" && /900001/.test(z.notiz || ""));
    /* neuer Einsatz: der Vorschlag ergänzt das Kleinmaterial aus den zwei KPlus-Rechnungen */
    await x("belegeAlleLaden()");
    x("belegNeu(kontextProtokoll(alleProtokolle().filter(function(p){ return p._id==='pk3'; })[0]), 'rechnung', null, function(){})"); await warte(1200);
    const ed = dlg(), edText = ed ? ed.textContent + " " + [...ed.querySelectorAll("textarea,input")].map((i) => i.value).join(" ") : "";
    x("ansichtenSchliessen()");
    return { kp: window.__kpFehler, pruef, ohne, vor, vergleichText, b1: { protokoll: b1.protokoll_id, extern: b1.extern, lernen: (b1.kopf || {}).lernen }, abger, edText };
  });
  pruefe(r.pruef.some((w) => /^1:.*Text nennt 3 Std/.test(w)), "„(3 h)“ bei Menge 1 nicht erkannt: " + JSON.stringify(r.pruef));
  pruefe(r.pruef.some((w) => /^2:.*40 Std/.test(w)) && r.pruef.some((w) => /^2:.*Einheit „Stk“/.test(w)), "„4 Mann a 10 Std“ / Einheit Stk nicht erkannt: " + JSON.stringify(r.pruef));
  pruefe(!r.pruef.some((w) => /^[345]:/.test(w)), "Fehlalarm (Gerätetext, passende Menge, l/h): " + JSON.stringify(r.pruef));
  pruefe(r.kp === "ok", "KPlus-Vorschau beim Einsatz: " + r.kp);
  pruefe(r.ohne === "Zuschlag Samstag|Regiestunden Techniker", "Katalogtext ohne Menge falsch: " + r.ohne);
  const regie = r.vor.filter((p) => /Regiestunden/.test(p[1]))[0] || [];
  pruefe(regie[0] === 6 && !/\(3 h\)/.test(regie[1]) && /Einsatz 08:00–11:00, 2 Mann/.test(regie[1]), "Regiestunden im Vorschlag: " + JSON.stringify(regie));
  pruefe(/So hätte die App gerechnet/.test(r.vergleichText) && /fehlte in der App/.test(r.vergleichText) && /Kleinmaterial/.test(r.vergleichText), "Vergleich mit der App fehlt" + " KP: " + r.kp);
  pruefe(r.b1.protokoll === "pk1" && r.b1.extern && r.b1.lernen && r.b1.lernen.fehlte.some((f) => /Kleinmaterial/.test(f.text)), "Beleg beim Einsatz / Lernen fehlt: " + JSON.stringify(r.b1));
  pruefe(r.abger, "Einsatz nicht als abgerechnet vermerkt");
  pruefe(/Ergänzt aus früheren KPlus-Rechnungen/.test(r.edText) && /Kleinmaterial pauschal/.test(r.edText), "Neuer Vorschlag lernt das Kleinmaterial nicht");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Rundgänge: jeder Rundgang läuft in jeder Rolle bis zum Ende, die gezeigten Stellen werden gefunden", async () => {
  for (const konto of [KONTEN.inhaber, KONTEN.admin, KONTEN.techniker]) {
    const a = await oeffnen(konto);
    /* genau die Rundgänge, die diese Rolle angeboten bekommt (nach Rolle und nach Thema) */
    const arten = await a.seite.evaluate(() => { const x = window.__t.x, R = x("RUNDGAENGE"), l = ["techniker"];
      if (x("rundgangBuero()")) l.push("admin"); if (x("istInhaber()||demo()")) l.push("inhaber"); l.push("hintergrund");
      Object.keys(R).forEach((k) => { if (R[k].thema && (!R[k].fuer || R[k].fuer())) l.push(k); }); return l; });
    const r = await a.seite.evaluate(async (arten) => {
      const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), erg = {};
      for (const art of arten) {
        x("rundgangStarten('" + art + "')"); await warte(300);
        const schritte = [];
        for (let i = 0; i < 40; i++) {
          await warte(600);
          const R = x("RUNDGANG"); if (!R) break;
          const s = R.schritte[R.i];
          schritte.push({ titel: s.titel, mitZiel: !!s.ziel, gefunden: !!R.el, text: (document.querySelector("#rundgang .rg-text") || {}).textContent || "" });
          document.querySelector('#rundgang [data-rg="weiter"]').click();
        }
        erg[art] = { schritte, offen: !!x("RUNDGANG") };
        x("rundgangEnde()"); x("ansichtenSchliessen()");
      }
      return erg;
    }, arten);
    for (const art of arten) {
      const g = r[art];
      pruefe(g && g.schritte.length >= 5 && !g.offen, "Rundgang " + art + " läuft nicht durch: " + JSON.stringify(g && g.schritte.map((s) => s.titel)));
      pruefe(g.schritte.every((s) => s.text.length > 20 && !/undefined|NaN/.test(s.text)), "Rundgang " + art + ": leerer oder kaputter Text");
      const fehlt = g.schritte.filter((s) => s.mitZiel && !s.gefunden).map((s) => s.titel);
      /* ein, zwei Stellen dürfen fehlen (etwa leere Listen in den Testdaten) – mehr heißt: der Rundgang zeigt ins Leere */
      pruefe(fehlt.length <= 2, "Rundgang " + art + " (" + konto + "): Stelle nicht gefunden bei " + fehlt.join(", "));
    }
    pruefe(!a.fehler.length, "Laufzeitfehler (" + konto + "): " + a.fehler.join("; "));
    await a.zu();
  }
});

test("Rechnung: Bezahl-Code (EPC-QR) – richtiger Inhalt, lesbar, nur mit gültiger IBAN, im PDF", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    /* öffentliches Beispiel-IBAN aus der österreichischen Bankendokumentation – kein echtes Konto */
    const F = { name: "Musterfirma Kälte GmbH", iban: "AT61 1904 3002 3457 3201", bic: "BKAUATWW" };
    const text = x("epcQrText")(F, 1234.5, "Rechnung T-R-2026-0001");
    const falsch = x("epcQrText")({ name: "X", iban: "AT61 1904 3002 3457 3202" }, 10, "R");
    const null0 = x("epcQrText")(F, 0, "R");
    /* das Bild zurücklesen wie eine Banking-App */
    if (!window.jsQR) await x("ladeSkript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js')");
    const url = x("epcQrBild")(text);
    let gelesen = null;
    if (url && window.jsQR) {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const q = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height); gelesen = q ? q.data : null;
    }
    /* im PDF: Rechnung mit und ohne IBAN – mit Code ist das PDF deutlich größer (Bild) */
    await x("belegEinstLaden()");
    x("BELEG_EINST.firma=Object.assign({}, BELEG_EINST.firma||{}, {name:'Musterfirma Kälte GmbH', iban:'AT61 1904 3002 3457 3201', bic:'BKAUATWW'}); 1");
    const b = { art: "rechnung", nummer: "T-R-TEST-1", test: true, datum: "2026-10-03", kopf: {}, positionen: [{ typ: "pos", nr: "1", menge: 1, eh: "Stk", text: "Wartung", preis: 100 }], kunde_id: "lidl" };
    const kx = { projekt: null, protokoll: null, kunde_id: "lidl", standort_id: null };
    const mit = await x("belegPdfErzeugen")(b, kx);
    x("BELEG_EINST.firma.iban=''; 1");
    const ohne = await x("belegPdfErzeugen")(b, kx);
    const angebot = await x("belegPdfErzeugen")(Object.assign({}, b, { art: "angebot" }), kx);
    return { text, falsch, null0, gelesen, mit: mit.size, ohne: ohne.size, angebot: angebot.size };
  });
  const z = (r.text || "").split("\n");
  pruefe(z[0] === "BCD" && z[1] === "002" && z[2] === "1" && z[3] === "SCT" && z[4] === "BKAUATWW" && z[5] === "Musterfirma Kaelte GmbH" &&
    z[6] === "AT611904300234573201" && z[7] === "EUR1234.50" && z[10] === "Rechnung T-R-2026-0001", "EPC-Inhalt falsch: " + JSON.stringify(z));
  pruefe(r.falsch === null && r.null0 === null, "Code trotz falscher IBAN oder 0 €");
  pruefe(r.gelesen === r.text, "Code nicht lesbar: " + JSON.stringify(r.gelesen));
  pruefe(r.mit > r.ohne + 1000 && Math.abs(r.ohne - r.angebot) < 3000, "Code nicht im Rechnungs-PDF (Größen " + r.mit + "/" + r.ohne + "/" + r.angebot + ")");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Kundenauswahl gilt überall: Störungen, Rückfragen, Projekte in Fällig, Karte und Anlagen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    /* ein weiterer Kunde mit einem Markt; je eine offene Störung bei Lidl und beim Kunden; je ein laufendes Projekt */
    const t0 = new Date().toISOString();
    db.stammdaten.push({ id: "kunde:KT1", typ: "kunde", ziel: "KT1", felder: { name: "Testkunde Eins", aktiv: true }, neu: true, geaendert: t0, von: "Test", grund: "Test" });
    db.stammdaten.push({ id: "standort:TS5", typ: "standort", ziel: "TS5", felder: { kundeId: "KT1" }, neu: false, geaendert: t0, von: "Test", grund: "Test" });
    await x("ladeStammdaten()"); await warte(400);
    x("stoerungSpeichern({_id:'skl', standortId:'TS1', auftragsnummer:'L-1', erfasstAm:'2026-06-14T08:00:00.000Z', status:'offen'}, 'Test')");
    x("stoerungSpeichern({_id:'skk', standortId:'TS5', auftragsnummer:'K-1', erfasstAm:'2026-06-14T08:00:00.000Z', status:'offen'}, 'Test')");
    const jetzt = new Date().toISOString();
    db.projekte.push({ id: "pkl", nummer: "P-T-1", titel: "Lidl-Baustelle", kunde_id: "lidl", standort_id: "TS1", status: "baustelle", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    db.projekte.push({ id: "pkk", nummer: "P-T-2", titel: "Kunden-Baustelle", kunde_id: "KT1", standort_id: "TS5", status: "baustelle", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()"); await warte(400);
    const stand = async (wahl) => {
      x("kundenWahlSetzen('" + wahl + "'); S.q=''; S.region='alle'; S.view='faellig'; render(); 1"); await warte(500);
      const karte = document.getElementById("st_karte");
      const eintraege = karte ? [...karte.querySelectorAll(".stoerbox[data-sid]")].map((b) => b.dataset.sid) : [];
      const hinweis = karte ? [...karte.querySelectorAll(".note")].map((n) => n.textContent).filter((t) => /weitere offene Störung/.test(t)).join(" ") : "";
      const kachel = (document.querySelector(".kpis") || {}).textContent || "";
      const rueckfragen = [...document.querySelectorAll(".card h2")].some((h) => /^Rückfragen von Lidl/.test(h.textContent));
      const pk = document.getElementById("pr_karte");
      const projekte = pk ? pk.textContent : "";
      const karteSt = x("stoerungsMaerkte(false).concat(stoerungsMaerkte(true)).map(function(s){ return s.id; })");
      x("S.view='anlagen'; S.q='kein Treffer xyz'; render(); 1"); await warte(400);
      const anl = (document.querySelector("#app .note.warnbox strong") || {}).textContent || "";
      x("S.q=''; render(); 1");
      return { eintraege, hinweis, kachel, rueckfragen, projekte, karteSt, anl };
    };
    return { lidl: await stand("lidl"), weitere: await stand("weitere"), alle: await stand("alle") };
  });
  const L = r.lidl, W = r.weitere, A = r.alle;
  pruefe(L.eintraege.indexOf("skl") >= 0 && L.eintraege.indexOf("skk") < 0 && /Testkunde Eins/.test(L.hinweis), "Nur Lidl: falsche Störungen " + JSON.stringify(L));
  pruefe(W.eintraege.indexOf("skk") >= 0 && W.eintraege.indexOf("skl") < 0 && /Lidl/.test(W.hinweis), "Nur weitere Kunden: Lidl-Störung steht da " + JSON.stringify(W));
  pruefe(A.eintraege.indexOf("skl") >= 0 && A.eintraege.indexOf("skk") >= 0 && !A.hinweis, "Alle Kunden: Störung fehlt " + JSON.stringify(A));
  pruefe(/1\s*offene Störung/.test(W.kachel) && /2\s*offene Störungen/.test(A.kachel), "Kachel zählt nicht nach Auswahl: " + W.kachel + " / " + A.kachel);
  pruefe(!W.rueckfragen, "„Rückfragen von Lidl“ unter „Nur weitere Kunden“");
  pruefe(/Kunden-Baustelle/.test(W.projekte) && !/Lidl-Baustelle/.test(W.projekte) && /Lidl-Baustelle/.test(L.projekte) && !/Kunden-Baustelle/.test(L.projekte),
    "Laufende Projekte ohne Kundenauswahl: " + JSON.stringify([L.projekte, W.projekte]));
  pruefe(W.karteSt.indexOf("TS1") < 0 && W.karteSt.indexOf("TS5") >= 0 && L.karteSt.indexOf("TS5") < 0, "Karte zeigt Störungen anderer Kunden: " + JSON.stringify([L.karteSt, W.karteSt]));
  pruefe(/^1 offene Störung/.test(W.anl) && /^1 offene Störung/.test(L.anl) && /^2 offene Störungen/.test(A.anl), "Anlagen zählt Störungen anderer Kunden: " + JSON.stringify([L.anl, W.anl, A.anl]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Spielwiese für Inhaber, Admins und Techniker – nicht für Kunde und Präsentation", async () => {
  const erg = {};
  for (const [name, konto] of [["inhaber", KONTEN.inhaber], ["admin", KONTEN.admin], ["techniker", KONTEN.techniker], ["kunde", KONTEN.kunde], ["praes", KONTEN.praesentation]]) {
    const a = await oeffnen(konto);
    erg[name] = await a.seite.evaluate(async () => {
      const x = window.__t.x;
      x("S.view='protokoll'; render(); 1"); await new Promise((f) => setTimeout(f, 500));
      return { darf: !!x("spielwieseDarf()"), knopf: !!document.getElementById("k_spiel") };
    });
    await a.zu();
  }
  /* Techniker öffnet die Spielwiese: darin als Techniker, Speichern bleibt in der Kopie */
  const t = await oeffnen(KONTEN.techniker);
  const rs = await t.seite.evaluate(async () => {
    const warte = (ms) => new Promise((f) => setTimeout(f, ms));
    const vorher = window.__db.tabellen.planung.length;
    window.__t.x("spielwieseOeffnen()");
    let w = null;
    for (let i = 0; i < 60 && !(w && w.__t && w.__t.x("Rolle.da")); i++) { await warte(500); const f = document.querySelector(".vorschau-rahmen iframe"); w = f && f.contentWindow; }
    if (!w || !w.__t) return { fehler: "Spielwiese nicht geöffnet" };
    const innen = { rolle: w.__t.x("Rolle.name"), spiel: w.__t.x("spielwiese()") };
    const dbVorher = w.__db.tabellen.planung.length;
    await w.__t.x("Store.sb.from('planung').insert({art:'aufgabe', titel:'nur Spielwiese', datum:'2026-01-05', wer:[]})");
    await warte(300);
    const innenZahl = (await w.__t.x("Store.sb.from('planung').select('id').eq('titel','nur Spielwiese')")).data.length;
    return Object.assign(innen, { innenZahl, dbVorher, dbNachher: w.__db.tabellen.planung.length, echtVorher: vorher, echtNachher: window.__db.tabellen.planung.length });
  });
  pruefe(!rs.fehler && rs.rolle === "techniker" && rs.spiel && rs.innenZahl === 1 && rs.dbVorher === rs.dbNachher && rs.echtVorher === rs.echtNachher, "Spielwiese des Technikers: " + JSON.stringify(rs));
  await t.zu();
  for (const n of ["inhaber", "admin", "techniker"]) pruefe(erg[n].darf && erg[n].knopf, "Spielwiese fehlt für " + n + ": " + JSON.stringify(erg[n]));
  for (const n of ["kunde", "praes"]) pruefe(!erg[n].darf && !erg[n].knopf, "Spielwiese für " + n + " sichtbar: " + JSON.stringify(erg[n]));
});

test("Kalender: privater Termin lässt sich wieder auf nicht-privat stellen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const F = (d, k) => d.querySelector('[data-f="' + k + '"]');
    const fuss = (d) => [...d.querySelectorAll(".as-fuss button")].pop();
    /* privat anlegen */
    x("S.view='kalender'; render(); planEditor(null, {art:'termin', datum:isoLokal(new Date()), beginn:'10:00', ende:'11:00', wer:[meineKennung()]})"); await warte(500);
    let d = dlg();
    F(d, "kategorie").value = "privat"; F(d, "kategorie").dispatchEvent(new Event("change", { bubbles: true }));
    F(d, "titel").value = "Zahnarzt"; F(d, "titel").dispatchEvent(new Event("input", { bubbles: true }));
    fuss(d).click(); await warte(1200);
    const zeile = db.planung[db.planung.length - 1] || {};
    const vorher = { privat: zeile.privat, titel: zeile.titel, privatTeil: db.planung_privat.filter((p) => p.planung_id === zeile.id).length };
    /* wieder öffnen, Haken weg */
    x("ansichtenSchliessen()"); window.__z = x("PLANUNG").filter((e) => e.id === zeile.id)[0];
    x("planEditor(window.__z)"); await warte(500);
    d = dlg();
    const haken = F(d, "privat"); haken.click(); await warte(200);
    const nachKlick = { haken: haken.checked, art: F(d, "kategorie").value, titel: F(d, "titel").value };
    fuss(d).click(); await warte(1200);
    const neu = db.planung.filter((e) => e.id === zeile.id)[0] || {};
    return { vorher, nachKlick, nachher: { privat: neu.privat, kategorie: neu.kategorie, titel: neu.titel, privatTeil: db.planung_privat.filter((p) => p.planung_id === zeile.id).length } };
  });
  pruefe(r.vorher.privat && r.vorher.titel === "Abwesend" && r.vorher.privatTeil === 1, "Privat nicht angelegt: " + JSON.stringify(r.vorher));
  pruefe(!r.nachKlick.haken && r.nachKlick.art === "sonstiges" && r.nachKlick.titel === "Zahnarzt", "Haken springt zurück oder Titel fehlt: " + JSON.stringify(r.nachKlick));
  pruefe(!r.nachher.privat && r.nachher.kategorie === "sonstiges" && r.nachher.titel === "Zahnarzt" && r.nachher.privatTeil === 0, "Nicht auf nicht-privat gespeichert: " + JSON.stringify(r.nachher));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Gründlich (nur mit --gruendlich, dauert einige Minuten): jeden Knopf in jedem Reiter je Rolle antippen,
   im aufgehenden Dialog den Hauptknopf – und melden, was abstürzt, hängt, NaN zeigt oder sich endlos neu zeichnet */
if (process.argv.includes("--gruendlich")) test("Gründlich: jeden Knopf in jedem Reiter antippen (Inhaber, Techniker, Präsentation)", async () => {
  const befunde = [];
  for (const rolle of ["inhaber", "techniker", "praesentation"]) {
    const a = await oeffnen(KONTEN[rolle]);
    await a.x(RENDER_ZAEHLER);
    await a.seite.evaluate(() => { window.print = () => {}; window.open = () => null; });
    const reiter = JSON.parse(await a.x("JSON.stringify(VIEWS.map(function(v){ return v[0]; }).filter(reiterErlaubt))"));
    for (const r of reiter) {
      for (let i = 0; i < 40; i++) {
        const erg = await a.seite.evaluate(async ([r, i]) => {
          const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
          try { x("ansichtenSchliessen()"); } catch (e) {}
          document.body.style.overflow = "";
          x("formDirty=false; S.view='" + r + "'; render(); 1"); await warte(150);
          const verboten = /Abmelden|Navi|Drucken|PDF|Export|herunterladen|Datei|Foto|Kamera|QR|scannen|Mikrofon|🎤|Spielwiese|Vorschau/i;
          const kn = [...document.querySelectorAll("#app button")].filter((b) => b.offsetParent && !b.disabled && !verboten.test(b.textContent + (b.title || "")));
          if (i >= kn.length) return { ende: true };
          const b = kn[i], name = (b.textContent || b.title || "").trim().replace(/\s+/g, " ").slice(0, 40);
          window.__rz.n = 0;
          b.click(); await warte(500);
          const d = [...document.querySelectorAll(".assistent")].pop();
          let haupt = "";
          if (d) {
            const k = [...d.querySelectorAll(".as-fuss button")].filter((y) => y.offsetParent && !y.disabled && !/Abbrechen|Schließen|zurück/i.test(y.textContent) && !verboten.test(y.textContent)).pop();
            if (k) { haupt = k.textContent.trim().slice(0, 30); k.click(); await warte(900); }
          }
          const haengt = [...document.querySelectorAll("button")].filter((y) => y.disabled && y.offsetParent && /wird |lädt/.test(y.textContent)).map((y) => y.textContent.trim());
          const nan = (document.body.innerText.match(/.{0,25}\b(NaN|undefined|\[object Object\])\b.{0,25}/g) || []).slice(0, 2);
          const gesperrt = document.body.style.overflow === "hidden" && !document.querySelector(".assistent, .vorschau-rahmen");
          return { name, haupt, haengt, nan, gesperrt, schleife: window.__rz.n > 30 };
        }, [r, i]);
        if (erg.ende) break;
        const wo = rolle + "/" + r + " „" + erg.name + "“" + (erg.haupt ? " → „" + erg.haupt + "“" : "");
        if (erg.haengt.length) befunde.push(wo + ": Knopf hängt (" + erg.haengt.join(", ") + ")");
        if (erg.nan.length) befunde.push(wo + ": zeigt " + erg.nan.join(" … "));
        if (erg.gesperrt) befunde.push(wo + ": Bildschirm gesperrt");
        if (erg.schleife) befunde.push(wo + ": Endlosschleife");
      }
    }
    if (a.fehler.length) befunde.push(rolle + ": Laufzeitfehler: " + [...new Set(a.fehler)].slice(0, 5).join("; "));
    await a.zu();
  }
  if (befunde.length) console.log("      " + befunde.join("\n      "));
  pruefe(!befunde.length, befunde.length + " Befunde (siehe oben)");
});

test("Stunden ↔ Kalender: Abwesenheit von selbst in den Stunden, Soll je Tag/Woche, Stempeluhr kennt den Plan, Lücken vor dem Bestätigen", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const ich = x("meineKennung()"), mo = x("plusTage(montagVon(isoLokal(new Date())),7)"), so = x("plusTage(montagVon(isoLokal(new Date())),13)");
    const einf = (z) => x("Store.sb.from('planung').insert(" + JSON.stringify(z) + ").select('*')");
    const k = (await einf({ art: "termin", kategorie: "krank", titel: "Krankenstand", datum: mo, datum_bis: so, wer: [ich], wer_namen: ["Test"] })).data[0];
    let soll = 0; for (let i = 0; i < 7; i++) soll += x("sollMinutenTag(plusTage('" + mo + "'," + i + "))");
    const krank = db.arbeitszeiten.filter((z) => z.planung_id === k.id);
    const u = (await einf({ art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: mo, wer: [ich], wer_namen: ["Test"], status: "genehmigt" })).data[0];
    const urlaub = { status: u.status, eintraege: db.arbeitszeiten.filter((z) => z.planung_id === u.id).length };
    /* kürzen: nur noch Montag */
    await x("Store.sb.from('planung').update({datum_bis:null}).eq('id','" + k.id + "').select('*')");
    const gekuerzt = db.arbeitszeiten.filter((z) => z.planung_id === k.id).length;
    /* Kalender-Eintrag in den Stunden löschen darf der Techniker nicht */
    const loeschen = await x("Store.sb.from('arbeitszeiten').delete().eq('planung_id','" + k.id + "').select('id')");
    /* heute geplante Wartung → Stempeluhr schlägt sie vor */
    const heute = x("isoLokal(new Date())");
    await einf({ art: "termin", kategorie: "wartung", titel: "Wartung Testmarkt", datum: heute, beginn: "07:00", ende: "09:00", standort_id: "TS1", wer: [ich], wer_namen: ["Test"] });
    x("planungStand=0; planungNachladen()"); await warte(800);
    x("zeitenStand=0; zeitenLaden()"); await warte(500);
    x("S.view='stunden'; S.stWoche='" + mo + "'; render()"); await warte(800);
    const text = document.body.innerText;
    const krankZeile = [...document.querySelectorAll("[data-tage] a.sprunglink")].some((l) => /Krankenstand/.test(l.textContent));
    const erfassenBeiKrank = [...document.querySelectorAll("[data-tage] [data-erf]")].length;
    const sollDa = document.querySelectorAll("[data-tage] [data-soll]").length, wocheSoll = !!document.querySelector("[data-wochesoll]");
    x("S.stWoche=montagVon(isoLokal(new Date())); render()"); await warte(600);
    const karte = document.getElementById("stempelkarte");
    const chip = [...karte.querySelectorAll(".chip")].find((c) => /Wartung Testmarkt/.test(c.textContent));
    if (chip) chip.click(); await warte(100);
    const st = karte.querySelector("[data-st]"), was = karte.querySelector("[data-was]");
    const bereich = [...karte.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.b);
    /* Zeitausgleich als Art im Kalender, gilt als abwesend */
    const za = x("planKat('zeitausgleich')[1]"), zaAbw = x("PLAN_ABWESEND.indexOf('zeitausgleich')>=0");
    /* Lücken: ein Monat ohne Einträge hat Arbeitstage ohne Eintrag */
    const vorher = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)");
    const luecken = x("monatLueckenText(monatLuecken([], '" + ich + "', '" + vorher + "'))");
    return { soll, krank: { n: krank.length, sum: krank.reduce((s, z) => s + z.minuten, 0), quelle: [...new Set(krank.map((z) => z.quelle))], art: [...new Set(krank.map((z) => z.art))] },
      urlaub, gekuerzt, loeschenFehler: !!loeschen.error, nachLoeschen: db.arbeitszeiten.filter((z) => z.planung_id === k.id).length,
      krankZeile, erfassenBeiKrank, sollDa, wocheSoll, nachGenehmigung: /nach Genehmigung/.test(text), erfasst: /✓ erfasst/.test(text),
      chip: !!chip, st: st && st.value, was: was && was.value, bereich, za, zaAbw, luecken };
  });
  pruefe(r.krank.sum === r.soll && r.krank.quelle.join() === "kalender" && r.krank.art.join() === "krank", "Krankenstand ≠ Wochensoll: " + JSON.stringify(r));
  pruefe(r.urlaub.status === "beantragt" && r.urlaub.eintraege === 0, "beantragter Urlaub steht schon in den Stunden: " + JSON.stringify(r.urlaub));
  pruefe(r.gekuerzt <= 1, "gekürzter Krankenstand: Stunden nicht angepasst (" + r.gekuerzt + ")");
  pruefe(r.loeschenFehler && r.nachLoeschen === r.gekuerzt, "Techniker konnte Kalender-Stunden löschen");
  pruefe(r.krankZeile && r.erfassenBeiKrank === 0 && r.nachGenehmigung && r.erfasst, "Stunden zeigen Abwesenheit falsch: " + JSON.stringify(r));
  pruefe(r.sollDa > 0 && r.wocheSoll, "Soll je Tag/Woche fehlt");
  pruefe(r.chip && r.st === "TS1" && /Wartung Testmarkt/.test(r.was) && r.bereich.join() === "wartung", "Stempeluhr-Vorschlag falsch: " + JSON.stringify(r));
  pruefe(r.za === "Zeitausgleich" && r.zaAbw, "Zeitausgleich fehlt im Kalender");
  pruefe(r.luecken.length && /ohne Eintrag/.test(r.luecken[0]), "Lücken vor dem Bestätigen nicht erkannt: " + JSON.stringify(r.luecken));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Störungsauftrag: breit genug am Laptop, Ausnahme bei der Auftragsnummer, KI-Knopf nur wenn etwas fehlt", async () => {
  const a = await oeffnen(KONTEN.admin);
  const r1 = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    const bild = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const oeffne = (vorlage) => { x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); })"); window.__v = vorlage; x("stoerungDialog(null, null, window.__v)"); };
    oeffne({ seiten: [bild], auftragsnummer: "123456", filialCode: "AT0001", problemtyp: "Klima defekt", zieltermin: "2026-10-10", beschreibung: "zu warm" });
    await warte(400);
    const d = [...document.querySelectorAll(".assistent")].pop();
    const voll = { ki: !!d.querySelector("#st_ki"), breite: d.querySelector(".as-karte").getBoundingClientRect().width,
      ohneBeiNummer: !!d.querySelector('[data-s="auftragsnummer"]').closest(".stack")?.querySelector("#st_ohne") };
    const fl = d.querySelector('[data-s="terminTechniker"]').closest("label"), nr = d.querySelector('[data-s="auftragsnummer"]').closest("label");
    voll.chipsBreiter = fl.getBoundingClientRect().width > nr.getBoundingClientRect().width * 1.5;
    /* Knöpfe statt doppelt: Textfeld zu, „jemand anderes …“ öffnet es, ein Knopf schließt es wieder */
    const tf = d.querySelector('[data-s="terminTechniker"]'), wl = tf.closest("[data-wahl]");
    const zu1 = tf.style.display === "none";
    [...wl.querySelectorAll(".chip")].pop().click(); await warte(50);
    const auf = tf.style.display !== "none";
    const k1 = wl.querySelector(".chip[data-lern]"); k1.click(); await warte(50);
    voll.wahl = zu1 && auf && tf.style.display === "none" && tf.value === k1.dataset.w;
    d.querySelector('[data-s="auftragsnummer"]').scrollIntoView({ block: "start" });
    return voll;
  });
  if (process.env.FOTO) await a.seite.screenshot({ path: process.env.FOTO });
  const r2 = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    const bild = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const oeffne = (vorlage) => { x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); })"); window.__v = vorlage; x("stoerungDialog(null, null, window.__v)"); };
    oeffne({ seiten: [bild], filialCode: "AT0001" });
    await warte(400);
    const d = [...document.querySelectorAll(".assistent")].pop();
    return { ki: !!d.querySelector("#st_ki") };
  });
  const r = { voll: r1, leer: r2 };
  pruefe(!r.voll.ki && r.leer.ki, "KI-Knopf falsch: " + JSON.stringify(r));
  pruefe(r.voll.breite >= 850, "Dialog zu schmal: " + r.voll.breite);
  pruefe(r.voll.ohneBeiNummer, "Ausnahme steht nicht bei der Auftragsnummer");
  pruefe(r.voll.chipsBreiter, "Felder mit Knöpfen nicht über die ganze Breite");
  pruefe(r.voll.wahl, "Auswahl-Knöpfe und Textfeld arbeiten nicht zusammen");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Werkzeug und Material: Standort, Bedarf am Termin, Erinnerung in „Heute für dich“ und „Planung prüfen“, Packliste ohne Doppel", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meineKennung()"), morgen = x("plusTage(isoLokal(new Date()),1)");
    x("S.view='werkzeug'; render()"); await warte(600);
    const reiter = !!document.querySelector('#tabs [data-v="werkzeug"]') && /Werkzeug und Geräte/i.test(document.body.innerText);
    /* Werkzeug anlegen: in Reparatur */
    x("wzEditor(null)"); await warte(400);
    let d = dlg();
    d.querySelector('[data-f="name"]').value = "Vakuumpumpe Test";
    [...d.querySelectorAll("[data-ort] .chip")].find((c) => c.dataset.w === "reparatur").click();
    d.querySelector('[data-f="standort_text"]').value = "Fa. Reparatur";
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(800);
    const w = JSON.parse(JSON.stringify(db.werkzeug.find((z) => z.name === "Vakuumpumpe Test") || {}));
    /* Termin morgen am Markt, darin „+ Material / Werkzeug“ */
    const t = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung Test", datum: morgen, beginn: "08:00", ende: "10:00", standort_id: "TS1", wer: [ich], wer_namen: ["Test"] }) + ").select('*')")).data[0];
    x("planungStand=0; planungNachladen()"); await warte(600);
    x("ansichtenSchliessen(); planEditor(PLANUNG.filter(function(e){ return e.id==='" + t.id + "'; })[0])"); await warte(500);
    d = dlg();
    const plus = [...d.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Material \/ Werkzeug/.test(b.textContent));
    if (plus) plus.click(); await warte(400);
    d = dlg();
    [...d.querySelectorAll("[data-art] .chip")].find((c) => c.dataset.w === "werkzeug").click();
    const sel = d.querySelector('[data-f="werkzeug_id"]'); sel.value = w.id; sel.dispatchEvent(new Event("change"));
    [...d.querySelectorAll("[data-weg] .chip")].find((c) => c.dataset.w === "abholen").click();
    d.querySelector('[data-f="bezugsquelle"]').value = "Fa. Reparatur";
    const hinweisImDialog = d.querySelector("[data-wzhinweis]").textContent;
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(800);
    const b = JSON.parse(JSON.stringify(db.bedarf.find((z) => z.planung_id === t.id) || {}));
    const imTermin = !!(dlg() && dlg().querySelector('[data-bedarfkasten] [data-bedarf="' + b.id + '"]'));
    x("ansichtenSchliessen()");
    /* Erinnerungen */
    x("S.view='faellig'; render()"); await warte(600);
    const heute = /Mitnehmen, abholen, bestellen – für heute und morgen/i.test(document.body.innerText);
    const pruefen = x("planungPruefen('ich','" + morgen + "','" + morgen + "').map(function(t){ return t.material.length; })");
    const zeile = x("(function(){ var m=kalenderEintraege('" + morgen + "','" + morgen + "','ich')['" + morgen + "']||[]; return m.map(function(y){ return kalEintragZeile(y,true).textContent; }).join(' | '); })()");
    const warnung = x("bedarfWerkzeugHinweis(BEDARF.filter(function(b){ return b.id==='" + b.id + "'; })[0])");
    /* „Ich hab’s“ – Rückfrage (Reparatur) wird bestätigt */
    x("wzOrtSchnell(WZ.filter(function(y){ return y.id==='" + w.id + "'; })[0], 'ich')"); await warte(600);
    const w2 = db.werkzeug.find((z) => z.id === w.id) || {};
    const loeschen = await x("Store.sb.from('werkzeug').delete().eq('id','" + w.id + "').select('id')");
    /* Packliste zweimal übernehmen: nichts doppelt */
    window.__pl = { id: "pl1", name: "Split-Montage", eintraege: [{ art: "material", text: "Kupferrohr" }, { art: "werkzeug", text: "Vakuumpumpe Test", werkzeug_id: w.id }] };
    x("PACKLISTEN=[window.__pl]");
    await x("packlisteUebernehmen({projekt_id:'P-T'}, window.__pl)"); await x("packlisteUebernehmen({projekt_id:'P-T'}, window.__pl)");
    const pl = db.bedarf.filter((z) => z.projekt_id === "P-T").length;
    return { reiter, w: { art: w.standort_art, text: w.standort_text }, b: { werkzeug: b.werkzeug_id === w.id, weg: b.beschaffung, quelle: b.bezugsquelle }, hinweisImDialog, imTermin,
      heute, pruefen, zeile, warnung, w2: { art: w2.standort_art, person: w2.person_id === ich }, verlauf: db.werkzeug_verlauf.filter((v) => v.werkzeug_id === w.id).length,
      loeschenFehler: !!loeschen.error, pl };
  });
  if (process.env.FOTO) { await a.seite.evaluate(() => { window.__t.x("ansichtenSchliessen(); S.view='werkzeug'; render()"); }); await a.seite.waitForTimeout(700); await a.seite.screenshot({ path: process.env.FOTO }); }
  pruefe(r.reiter, "Reiter Werkzeug fehlt");
  pruefe(r.w.art === "reparatur" && r.w.text === "Fa. Reparatur", "Werkzeug nicht als „in Reparatur“ gespeichert: " + JSON.stringify(r.w));
  pruefe(r.b.werkzeug && r.b.weg === "abholen" && r.b.quelle === "Fa. Reparatur" && /Reparatur/.test(r.hinweisImDialog), "Bedarf am Termin falsch: " + JSON.stringify(r));
  pruefe(r.imTermin, "Bedarf steht nicht im Termin");
  pruefe(r.heute, "„Heute für dich“ erinnert nicht ans Abholen");
  pruefe(r.pruefen.join() === "1", "„Planung prüfen“ zeigt den Bedarf nicht: " + JSON.stringify(r.pruefen));
  pruefe(/🧰 Vakuumpumpe Test/.test(r.zeile), "Kalenderzeile ohne 🧰: " + r.zeile);
  pruefe(/Reparatur/.test(r.warnung || ""), "keine Warnung „in Reparatur“: " + r.warnung);
  pruefe(r.w2.art === "person" && r.w2.person && r.verlauf >= 1, "„Ich hab’s“ falsch: " + JSON.stringify(r));
  pruefe(r.loeschenFehler, "Techniker konnte Werkzeug löschen");
  pruefe(r.pl === 2, "Packliste doppelt übernommen: " + r.pl);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Werkzeug lernt mit: je Projekttyp, je Markt, aus dem Angebot, unbekanntes Werkzeug aufnehmen, nach dem Einsatz nachfragen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), gestern = x("plusTage(isoLokal(new Date()),-1)");
    /* drei Projekte „VRV-Montage“: zwei mit Bedarf, eins neu */
    ["PL1", "PL2", "PL3"].forEach((id, i) => db.projekte.push({ id, nummer: "P-T-" + i, titel: "Test " + i, status: "auftrag", daten: { typ: "VRV-Montage" }, verlauf: [], erstellt: new Date().toISOString(), geaendert: new Date().toISOString() }));
    db.bedarf.push({ id: "b1", art: "werkzeug", text: "Vakuumpumpe", projekt_id: "PL1", status: "erledigt", beschaffung: "mitnehmen" },
      { id: "b2", art: "werkzeug", text: "Vakuumpumpe", projekt_id: "PL2", status: "erledigt", beschaffung: "mitnehmen" },
      { id: "b3", art: "material", text: "Nur einmal", projekt_id: "PL1", status: "erledigt", beschaffung: "mitnehmen" },
      { id: "b4", art: "werkzeug", text: "Hubsteiger", standort_id: "TS1", status: "erledigt", beschaffung: "abholen" });
    await x("projekteLaden()"); await x("wzLaden(true)");
    const gelernt = x("bedarfGelerntProjekt(PROJEKTE.filter(function(p){ return p.id==='PL3'; })[0]).l.map(function(e){ return e.text+':'+e.n; })");
    /* im Projekt: Vorschlag antippen → übernehmen */
    x("projektAnsicht('PL3')"); await warte(800);
    let d = dlg();
    const knopf = [...d.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Ausgewählte übernehmen/.test(b.textContent));
    if (knopf) knopf.click(); await warte(800);
    const uebernommen = db.bedarf.filter((b) => b.projekt_id === "PL3").map((b) => b.text);
    x("ansichtenSchliessen()");
    /* am Markt: Hubsteiger als Vorschlag im Termin */
    const t = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung Markt", datum: heute, standort_id: "TS1", wer: [ich], wer_namen: ["Inhaber"] }) + ").select('*')")).data[0];
    x("planungStand=0; planungNachladen()"); await warte(500);
    x("planEditor(PLANUNG.filter(function(e){ return e.id==='" + t.id + "'; })[0])"); await warte(500);
    d = dlg();
    const chipMarkt = [...d.querySelectorAll("[data-bedarfkasten] .chip")].find((c) => /Hubsteiger/.test(c.textContent));
    if (chipMarkt) chipMarkt.click(); await warte(600);
    const marktEintrag = db.bedarf.find((b) => b.planung_id === t.id && b.text === "Hubsteiger");
    const tipp = x("planungPruefen('ich','" + heute + "','" + heute + "').map(function(t){ return t.marktTipp.length; }).join()");
    x("ansichtenSchliessen()");
    /* unbekanntes Werkzeug: nach dem Speichern fragen, aufnehmen, verknüpfen */
    x("bedarfEditor(null, {projekt_id:'PL3'})"); await warte(400);
    d = dlg();
    [...d.querySelectorAll("[data-art] .chip")].find((c) => c.dataset.w === "werkzeug").click();
    d.querySelector('[data-f="text"]').value = "Bördelgerät";
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(800);
    d = dlg();
    const frage = d && /In die Werkzeugliste/.test(d.textContent);
    const ja = d && [...d.querySelectorAll("button")].find((b) => /Ja – bei mir/.test(b.textContent));
    if (ja) ja.click(); await warte(800);
    const wz = JSON.parse(JSON.stringify(db.werkzeug.find((w) => w.name === "Bördelgerät") || {}));
    const verknuepft = (db.bedarf.find((b) => b.text === "Bördelgerät") || {}).werkzeug_id === wz.id;
    /* nach dem Einsatz (gestern): wo ist es jetzt? → zurück ins Lager */
    const t2 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Einsatz gestern", datum: gestern, standort_id: "TS1", wer: [ich], wer_namen: ["Inhaber"] }) + ").select('*')")).data[0];
    await x("Store.sb.from('bedarf').insert(" + JSON.stringify({ art: "werkzeug", text: "Bördelgerät", werkzeug_id: wz.id, planung_id: t2.id, status: "offen", beschaffung: "mitnehmen" }) + ").select('*')");
    x("planungStand=0; planungNachladen()"); await warte(400); await x("wzLaden(true)");
    x("ansichtenSchliessen(); S.view='faellig'; render()"); await warte(700);
    const nachfrage = /wo ist das Werkzeug jetzt/i.test(document.body.innerText);
    const lager = [...document.querySelectorAll("button")].find((b) => /zurück ins Lager/.test(b.textContent));
    if (lager) lager.click(); await warte(800);
    const wz2 = db.werkzeug.find((w) => w.id === wz.id) || {};
    const b2 = db.bedarf.find((b) => b.planung_id === t2.id) || {};
    /* Angebot → bestellen (ohne Arbeitszeit) */
    db.belege.push({ id: "be1", art: "angebot", nummer: "T-A-1", projekt_id: "PL3", datum: heute, positionen: [
      { typ: "pos", menge: 1, eh: "Stk", text: "Außengerät VRV 14 kW", preis: 9000 }, { typ: "pos", menge: 16, eh: "h", text: "Montage Arbeitszeit", preis: 70 },
      { typ: "pos", menge: 2, eh: "Stk", text: "Alternativ Gerät", preis: 1, alternativ: true }] });
    x("bedarfAusAngebot(PROJEKTE.filter(function(p){ return p.id==='PL3'; })[0])"); await warte(700);
    d = dlg();
    const haken = [...d.querySelectorAll("input[data-i]")].map((c) => c.checked);
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(800);
    const best = db.bedarf.filter((b) => b.projekt_id === "PL3" && b.beschaffung === "bestellen").map((b) => b.text + "|" + b.menge + "|" + (b.preis === undefined));
    return { gelernt, uebernommen, marktEintrag: !!marktEintrag, tipp, frage, wz: { art: wz.standort_art, person: wz.person_id === ich }, verknuepft,
      nachfrage, wz2: wz2.standort_art, b2: { status: b2.status, gefragt: !!b2.nachgefragt }, haken, best };
  });
  pruefe(r.gelernt.join() === "Vakuumpumpe:2", "je Projekttyp falsch gelernt: " + JSON.stringify(r.gelernt));
  pruefe(r.uebernommen.join() === "Vakuumpumpe", "Vorschlag im Projekt nicht übernommen: " + JSON.stringify(r.uebernommen));
  pruefe(r.marktEintrag, "Vorschlag am Markt fehlt oder nicht übernommen");
  pruefe(r.frage && r.wz.art === "person" && r.wz.person && r.verknuepft, "unbekanntes Werkzeug nicht aufgenommen: " + JSON.stringify(r));
  pruefe(r.nachfrage && r.wz2 === "lager" && r.b2.status === "erledigt" && r.b2.gefragt, "Nachfrage nach dem Einsatz falsch: " + JSON.stringify(r));
  pruefe(r.haken.join() === "true,false" && r.best.length === 1 && /Außengerät/.test(r.best[0]) && /1 Stk/.test(r.best[0]), "Angebot → bestellen falsch: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Reisekosten: Beleg mit Foto, Kilometer Privatauto, Monat abgeben, Chef zahlt aus", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meineKennung()");
    x("S.view='stunden'; render()"); await warte(800);
    const karte = /Reisekosten und Kilometergeld/i.test(document.body.innerText);
    /* ohne Foto: geht nicht */
    x("akEditor(null, {art:'beleg'})"); await warte(400);
    let d = dlg();
    d.querySelector('[data-f="text"]').value = "Bauhaus – Akkuschrauber";
    d.querySelector('[data-f="betrag"]').value = "23.85";
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(400);
    const ohneFoto = { fehler: d.querySelector("[data-err]").textContent, zeilen: db.auslagen.length };
    /* mit Foto */
    const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60; cv.getContext("2d").fillRect(0, 0, 20, 20);
    const blob = await new Promise((f) => cv.toBlob(f, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "beleg.png", { type: "image/png" }));
    const inp = d.querySelector("[data-foto]"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    [...d.querySelectorAll("[data-kat] .chip")].find((c) => c.dataset.w === "werkzeug").click();
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(1500);
    const beleg = JSON.parse(JSON.stringify(db.auslagen.find((z) => z.art === "beleg") || {}));
    d = dlg();
    const wzFrage = !!d && /In die Werkzeugliste/.test(d.textContent);
    if (d) { const nein = [...d.querySelectorAll("button")].find((b) => /Nein/.test(b.textContent)); if (nein) nein.click(); }
    await warte(300);
    /* Kilometer – nur mit eingetragenem Privatauto (Inhaber 05.10.2026) */
    db.fahrzeuge.push({ id: "fzRk", kennzeichen: "S-RK 1", fahrer: [ich], fahrer_namen: ["Testtechniker"], privat_von: ich, privat_name: "Testtechniker", aktiv: true });
    await x("fzLaden(true)");
    x("akEditor(null, {art:'km'})"); await warte(400);
    d = dlg();
    d.querySelector('[data-f="text"]').value = "Salzburg – Saalfelden – Salzburg";
    d.querySelector('[data-f="km"]').value = "175";
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(900);
    const km = JSON.parse(JSON.stringify(db.auslagen.find((z) => z.art === "km") || {}));
    /* PDF-Blatt wie das bisherige Excel */
    const html = x("akPdfHtml(AUSLAGEN, 'Test', S.akMonat, {iban:'AT00 TEST'}, [])");
    /* Monat abgeben → Nachricht an den Inhaber, danach gesperrt */
    x("akAbgeben(S.akMonat)"); await warte(1200);
    const stand = db.auslagen.map((z) => z.status).join();
    const nachricht = db.chat.filter((c) => /Reisekosten/.test(c.text || "")).map((c) => c.an);
    const aendern = await x("Store.sb.from('auslagen').update({betrag:999}).eq('id','" + beleg.id + "').select('id')");
    /* Bedarf: abholen → „Selbst bezahlt – Beleg erfassen“ */
    await x("wzLaden(true)");
    const bd = (await x("Store.sb.from('bedarf').insert({art:'material', text:'Silikon', beschaffung:'abholen', bezugsquelle:'Bauhaus', status:'offen'}).select('*')")).data[0];
    await x("wzLaden(true)");
    x("ansichtenSchliessen(); bedarfEditor(BEDARF.filter(function(b){ return b.id==='" + bd.id + "'; })[0])"); await warte(400);
    const selbst = !![...dlg().querySelectorAll(".as-fuss button")].find((b) => /Selbst bezahlt/.test(b.textContent));
    return { karte, ohneFoto, beleg: { betrag: beleg.betrag, foto: beleg.foto, eigen: (beleg.foto || "").indexOf(ich + "/") === 0, kat: beleg.kategorie }, wzFrage,
      km: { betrag: km.betrag, text: km.text }, html: ["Barbelege", "Kilometer mit Privatauto", "zu zahlen", "AT00 TEST", "Akkuschrauber"].filter((t) => html.indexOf(t) < 0),
      stand, nachricht, aendernFehler: !!aendern.error, selbst, ich };
  });
  pruefe(r.karte, "Karte Reisekosten fehlt im Reiter Stunden");
  pruefe(/fotografieren/.test(r.ohneFoto.fehler) && r.ohneFoto.zeilen === 0, "Beleg ohne Foto gespeichert: " + JSON.stringify(r.ohneFoto));
  pruefe(r.beleg.betrag === 23.85 && r.beleg.eigen && r.beleg.kat === "werkzeug", "Beleg falsch: " + JSON.stringify(r.beleg));
  pruefe(r.wzFrage, "gekauftes Werkzeug: keine Frage nach der Werkzeugliste");
  pruefe(r.km.betrag === 87.5, "Kilometergeld falsch: " + JSON.stringify(r.km));
  pruefe(!r.html.length, "PDF-Blatt unvollständig: " + r.html.join(", "));
  pruefe(r.stand === "eingereicht,eingereicht" && r.nachricht.length >= 1 && r.aendernFehler, "Abgeben falsch: " + JSON.stringify(r));
  pruefe(r.selbst, "„Selbst bezahlt – Beleg erfassen“ fehlt beim Abholen");
  if (process.env.FOTO) { await a.seite.evaluate(() => { window.__t.x("ansichtenSchliessen(); S.view='stunden'; render()"); }); await a.seite.waitForTimeout(800);
    await a.seite.evaluate(() => { const h = [...document.querySelectorAll(".card h2")].find((x) => /^Reisekosten und/.test(x.textContent)); if (h) h.scrollIntoView({ block: "start" }); }); await a.seite.screenshot({ path: process.env.FOTO }); }
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* der Inhaber sieht es, bekommt es ins To-do und zahlt aus */
  const b = await oeffnen(KONTEN.inhaber);
  const r2 = await b.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const m = x("isoLokal(new Date())");
    db.auslagen.push({ id: "ak1", user_id: "u_tech_test_at", name: "Techniker", art: "beleg", datum: m, text: "Bauhaus", kategorie: "material", betrag: 23.85, foto: "u_tech_test_at/x.jpg", status: "eingereicht" },
      { id: "ak2", user_id: "u_tech_test_at", name: "Techniker", art: "km", datum: m, text: "Salzburg – Saalfelden", km: 175, km_satz: 0.5, betrag: 87.5, status: "eingereicht" });
    await x("akAbgegebenLaden()");
    const todo = x("akAbgegebenText()");
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(1200);
    const knopf = [...document.querySelectorAll("button")].find((k) => k.textContent === "ausbezahlt");
    if (knopf) knopf.click(); await warte(900);
    return { todo, knopf: !!knopf, stand: db.auslagen.map((z) => z.status).join() };
  });
  pruefe(r2.todo.length === 1 && /auszahlen/.test(r2.todo[0]), "To-do des Inhabers fehlt: " + JSON.stringify(r2.todo));
  pruefe(r2.knopf && r2.stand === "ausbezahlt,ausbezahlt", "Auszahlen falsch: " + JSON.stringify(r2));
  pruefe(!b.fehler.length, "Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
});

test("Fahrzeug am Handy: man selbst als Fahrer und Privatauto wählbar, Datumsfelder passen in die Breite", async () => {
  const a = await oeffnen(KONTEN.inhaber, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    await x("planTeamLaden()");
    x("fzEditor(null)"); await warte(500);
    const d = [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meinName()"), id = x("meineKennung()");
    const chip = [...d.querySelectorAll("#fz_f .chip")].some((c) => c.textContent === ich);
    const pv = [...d.querySelectorAll("#fz_pvw option")].some((o) => o.value === id);
    const inhalt = d.querySelector(".as-inhalt"), rechts = inhalt.getBoundingClientRect().right;
    const zuBreit = [...d.querySelectorAll("input,select")].filter((e) => e.getBoundingClientRect().right > rechts + 1).map((e) => e.id || e.type);
    return { chip, pv, zuBreit };
  });
  pruefe(r.chip && r.pv, "man selbst fehlt in der Auswahl: " + JSON.stringify(r));
  pruefe(!r.zuBreit.length, "Felder ragen über den Rand: " + r.zuBreit.join(", "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Rundgänge: Knopf neben dem Handbuch, nach dem Ende gleich der nächste mit ✓", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    x("render()"); await warte(300);
    const knopf = document.getElementById("rundganglink");
    const sichtbar = !!knopf && !knopf.hidden;
    if (knopf) knopf.click(); await warte(400);
    const fenster = [...document.querySelectorAll(".assistent")].pop();
    const auswahl = !!fenster && /Geführte Rundgänge/.test(fenster.textContent) && fenster.querySelectorAll("[data-rgart]").length > 3;
    /* einen Rundgang bis „Fertig“ durchklicken */
    const start = fenster.querySelector('[data-rgart="stunden"]') || fenster.querySelector("[data-rgart]");
    const art = start.dataset.rgart; start.click(); await warte(500);
    for (let i = 0; i < 30 && document.getElementById("rundgang"); i++) { document.querySelector('#rundgang [data-rg="weiter"]').click(); await warte(450); }
    const danach = [...document.querySelectorAll(".assistent")].pop();
    const weiter = !!danach && /Weiter mit/.test(danach.textContent);
    const haken = !!danach && /^✓/.test((danach.querySelector('[data-rgart="' + art + '"]') || {}).textContent || "");
    const naechster = danach && [...danach.querySelectorAll("button")].find((b) => /▶ Weiter/.test(b.textContent));
    if (naechster) naechster.click(); await warte(500);
    const laeuft = !!document.getElementById("rundgang") && x("RUNDGANG && RUNDGANG.art") !== art;
    x("rundgangEnde()");
    return { sichtbar, auswahl, weiter, haken, laeuft };
  });
  pruefe(r.sichtbar && r.auswahl, "Knopf „Rundgänge“ fehlt oder öffnet keine Auswahl: " + JSON.stringify(r));
  pruefe(r.weiter && r.haken && r.laeuft, "nach dem Ende kein nächster Rundgang: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Rundgänge am Handy: die gezeigte Stelle ist nie von der Erklärung verdeckt, die Knöpfe bleiben sichtbar", async () => {
  const verdeckt = [];
  /* normal nur der Inhaber (hat alle Rundgänge) – alle drei Rollen mit --gruendlich (sonst dauert die Prüfung auf GitHub zu lang) */
  for (const konto of process.argv.includes("--gruendlich") ? [KONTEN.inhaber, KONTEN.admin, KONTEN.techniker] : [KONTEN.inhaber]) {
    const a = await oeffnen(konto, { handy: true });
    if (process.env.RG_NUR) await a.seite.evaluate((n) => { window.__rgNur = n; }, process.env.RG_NUR);
    const r = await a.seite.evaluate(async () => {
      const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), fehler = [];
      const arten = x("rundgangListe()").map((y) => y[0]).filter((y) => !window.__rgNur || y === window.__rgNur);
      for (const art of arten) {
        x("rundgangStarten('" + art + "')"); await warte(300);
        for (let i = 0; i < 40; i++) {
          await warte(1300);
          const R = x("RUNDGANG"); if (!R) break;
          const titel = R.schritte[R.i].titel, z = R.el;
          const k = document.querySelector("#rundgang .rg-karte").getBoundingClientRect();
          const w = document.querySelector('#rundgang [data-rg="weiter"]').getBoundingClientRect();
          if (w.bottom > innerHeight + 1 || w.top < 0) fehler.push(art + " / " + titel + ": Knöpfe außerhalb");
          if (z && document.body.contains(z)) {
            const t = z.getBoundingClientRect(), seg = Math.min(t.height, 40);
            if (t.width > 2 && t.top >= -1 && t.top + seg <= innerHeight + 1) {
              const ueber = !(t.top + seg <= k.top + 1 || t.top >= k.bottom - 1);
              if (ueber) fehler.push(art + " / " + titel + ": verdeckt (Ziel " + Math.round(t.top) + "–" + Math.round(t.top + seg) + ", Karte " + Math.round(k.top) + "–" + Math.round(k.bottom) + ")");
            } else if (t.width > 2) fehler.push(art + " / " + titel + ": Ziel nicht im Bild (" + Math.round(t.top) + ")");
          }
          document.querySelector('#rundgang [data-rg="weiter"]').click();
        }
        x("rundgangEnde()"); x("ansichtenSchliessen()");
      }
      return fehler;
    });
    r.forEach((f) => verdeckt.push(konto + ": " + f));
    pruefe(!a.fehler.length, "Laufzeitfehler (" + konto + "): " + a.fehler.join("; "));
    await a.zu();
  }
  pruefe(!verdeckt.length, verdeckt.length + " Schritte verdeckt:\n      " + verdeckt.join("\n      "));
});

test("Kalender: Eintrag anklicken öffnet ihn direkt – Woche, Tag, Monat (PC) und Projekttermin", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())");
    await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Testtermin", datum: heute, beginn: "15:00", ende: "16:00", standort_id: "TS1", wer: [ich], wer_namen: ["I"] }) + ").select('*')");
    db.projekte.push({ id: "PK1", nummer: "P-K-1", titel: "Kalendertest", status: "auftrag", daten: { termine: [{ id: "pt1", datum: heute, zeit: "09:00", was: "Baubesprechung", wer: "" }] }, verlauf: [], erstellt: new Date().toISOString(), geaendert: new Date().toISOString() });
    await x("projekteLaden()"); x("planungStand=0; planungNachladen()"); await warte(600);
    const offen = () => [...document.querySelectorAll(".assistent .as-titel")].map((t) => t.textContent).join("|");
    const erg = {};
    for (const modus of ["woche", "tag"]) {
      x("ansichtenSchliessen(); S.view='kalender'; S.kalWer='alle'; S.kalModus='" + modus + "'; S.kTag=isoLokal(new Date()); S.kalWoche=montagVon(isoLokal(new Date())); render()"); await warte(700);
      const b = [...document.querySelectorAll(".kal-tl-b")].find((y) => /Testtermin/.test(y.textContent)); if (b) b.click(); await warte(400);
      erg[modus] = offen();
      x("ansichtenSchliessen()");
      const p = [...document.querySelectorAll(".kal-tl-b")].find((y) => /Baubesprechung/.test(y.textContent)); if (p) p.click(); await warte(500);
      erg[modus + "Projekt"] = offen() + (document.querySelector(".assistent") && [...document.querySelectorAll(".assistent .as-fuss button")].some((k) => /Projekt öffnen/.test(k.textContent)) ? " +Projektknopf" : "");
      x("ansichtenSchliessen()");
    }
    x("S.kalModus='monat'; S.kMonat=isoLokal(new Date()).slice(0,7); render()"); await warte(600);
    const t = [...document.querySelectorAll(".kal-txt[data-x]")].find((y) => /Testtermin/.test(y.textContent)); if (t) t.click(); await warte(400);
    erg.monat = offen();
    x("ansichtenSchliessen()");
    return erg;
  });
  pruefe(r.woche === "Termin" && r.tag === "Termin" && r.monat === "Termin", "Termin öffnet nicht direkt: " + JSON.stringify(r));
  pruefe(/Termine \(Bauzeitplan\) \+Projektknopf/.test(r.wocheProjekt) && /Termine \(Bauzeitplan\) \+Projektknopf/.test(r.tagProjekt), "Projekttermin öffnet nicht direkt: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Stempeluhr ↔ Kalender: Abgleich teilt die gestempelte Zeit nach den Terminen auf, Umstempeln mit einem Tippen", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const ich = x("meineKennung()"), gestern = x("plusTage(isoLokal(new Date()),-1)"), heute = x("isoLokal(new Date())");
    const ein = (z) => x("Store.sb.from('planung').insert(" + JSON.stringify(Object.assign({ art: "termin", wer: [ich], wer_namen: ["T"] }, z)) + ").select('*')");
    await ein({ kategorie: "wartung", titel: "Wartung Eins", datum: gestern, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
    await ein({ kategorie: "wartung", titel: "Wartung Zwei", datum: gestern, beginn: "11:00", ende: "12:30", standort_id: "TS2" });
    const nicht = (await ein({ kategorie: "werkstatt", titel: "Werkstatt aufräumen", datum: gestern, beginn: "14:00", ende: "15:00" })).data[0];
    db.arbeitszeiten.push({ id: "zst1", user_id: ich, name: "T", datum: gestern, beginn: "07:00", ende: "16:00", pause_min: 30, pause_auto: 0, minuten: 510, art: "arbeit", quelle: "stempel", bereich: "wartung" });
    x("planungStand=0; planungNachladen()"); await warte(500); await x("zeitenLaden()");
    x("S.view='stunden'; S.stWoche=montagVon('" + gestern + "'); render()"); await warte(700);
    const knopf = [...document.querySelectorAll("button")].find((b) => /Tag prüfen · 3 Termine/.test(b.textContent));
    if (knopf) knopf.click(); await warte(500);
    let d = [...document.querySelectorAll(".assistent")].pop();
    const dialog = !!d && /Tagesrückblick/.test(d.textContent);
    /* „Werkstatt aufräumen“ nicht gemacht → verschieben */
    const box = [...d.querySelectorAll("[data-an]")].find((c) => /Werkstatt aufräumen/.test(c.closest("label").textContent));
    box.checked = false; box.dispatchEvent(new Event("change")); await warte(200);
    d = [...document.querySelectorAll(".assistent")].pop();
    const vs = d.querySelector("[data-vs]"); if (vs) { vs.checked = true; vs.dispatchEvent(new Event("change")); }
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(1200);
    const teile = db.arbeitszeiten.filter((z) => z.user_id === ich && z.datum === gestern).sort((p, q) => p.beginn.localeCompare(q.beginn))
      .map((z) => z.beginn + "-" + z.ende + " " + z.bereich + (z.planung_id ? " P" : "") + " " + z.minuten);
    const summe = db.arbeitszeiten.filter((z) => z.user_id === ich && z.datum === gestern).reduce((s, z) => s + z.minuten, 0);
    const verschoben = (db.planung.find((p) => p.id === nicht.id) || {}).datum;
    /* heute: eingestempelt, laut Kalender jetzt ein anderer Markt → ein Tippen */
    const jetzt = x("kalHm(Math.max(0, new Date().getHours()*60+new Date().getMinutes()-5))"), spaeter = x("kalHm(Math.min(1439, new Date().getHours()*60+new Date().getMinutes()+50))");
    await ein({ kategorie: "wartung", titel: "Wartung Jetzt", datum: heute, beginn: jetzt, ende: spaeter, standort_id: "TS2" });
    x("planungStand=0; planungNachladen()"); await warte(500);
    await x("stempelDruecken('ein', {bereich:'werkstatt'})"); await warte(600);
    x("ansichtenSchliessen(); S.view='stunden'; S.stWoche=montagVon(isoLokal(new Date())); render()"); await warte(700);
    /* gezielt bei „Wartung Jetzt“ – der verschobene Werkstatt-Termin (an Werktagen heute 14–15 Uhr) steht je nach Uhrzeit davor */
    const um = [...document.querySelectorAll("#stempelkarte button")].find((b) => /Dorthin umstempeln/.test(b.textContent) && /Wartung Jetzt/.test(b.closest(".note").textContent));
    if (um) um.click(); await warte(500);
    d = [...document.querySelectorAll(".assistent")].pop();
    const vorbelegt = d ? { st: d.querySelector("[data-st]").value, was: d.querySelector("[data-neuwas]").value, bereich: [...d.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.b).join() } : null;
    return { knopf: !!knopf, dialog, teile, summe, verschoben, morgenErwartet: x("werktagAb(plusTage('" + gestern + "',1))"), um: !!um, vorbelegt };
  });
  pruefe(r.knopf && r.dialog, "Abgleich nicht angeboten: " + JSON.stringify(r));
  pruefe(r.summe === 510, "Summe hat sich geändert: " + r.summe);
  pruefe(JSON.stringify(r.teile) === JSON.stringify(["07:00-08:00 fahrt 60", "08:00-10:00 wartung P 120", "10:00-11:00 fahrt 60", "11:00-12:30 wartung P 90", "12:30-16:00 wartung 180"]), "Aufteilung falsch: " + JSON.stringify(r.teile));
  pruefe(r.verschoben === r.morgenErwartet, "nicht gemachter Termin nicht verschoben: " + r.verschoben);
  pruefe(r.um && r.vorbelegt && r.vorbelegt.st === "TS2" && /Wartung Jetzt/.test(r.vorbelegt.was) && r.vorbelegt.bereich === "wartung", "Umstempeln nicht vorbelegt: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Abwesenheit und Arbeit am selben Tag: die App fragt sofort – eingesprungen, Tag beenden, Urlaubstag zurückgeben", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), gestern = x("plusTage(isoLokal(new Date()),-1)"), morgen = x("plusTage(isoLokal(new Date()),1)");
    /* gestern krank (ein Tag): Arbeit erfassen → Frage → eingesprungen */
    const k1 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "krank", titel: "Krank", datum: gestern, wer: [ich], wer_namen: ["T"] }) + ").select('*')")).data[0];
    x("planungStand=0; planungNachladen()"); await warte(500);
    x("zeitEditor(null, {datum:'" + gestern + "', beginn:'08:00', ende:'10:00', art:'arbeit', bereich:'werkstatt'})"); await warte(400);
    let d = dlg(); [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(500);
    d = dlg(); const frage1 = !!d && /eingetragen/.test(d.querySelector(".as-titel").textContent);
    [...d.querySelectorAll("button")].find((b) => /Nur kurz eingesprungen/.test(b.textContent)).click(); await warte(1200);
    const ausnahme = ((db.planung.find((p) => p.id === k1.id) || {}).ausnahmen || {})[gestern];
    const arbeitGespeichert = db.arbeitszeiten.some((z) => z.datum === gestern && z.art === "arbeit" && z.user_id === ich);
    const offen1 = x("abwesenheitOffen('" + gestern + "').length");
    x("ansichtenSchliessen()");
    /* krank gestern bis morgen: heute einstempeln → Frage → Krankenstand für heute beenden */
    const k2 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "krank", titel: "Krank lang", datum: gestern, datum_bis: morgen, wer: [ich], wer_namen: ["T"] }) + ").select('*')")).data[0];
    x("planungStand=0; planungNachladen()"); await warte(500);
    x("S.view='stunden'; render()"); await warte(700);
    const karte = document.getElementById("stempelkarte");
    karte.querySelector(".chips .chip[data-b]") && karte.querySelector(".chips .chip[data-b]").click();
    karte.querySelector("[data-ein]").click(); await warte(500);
    d = dlg(); const frage2 = !!d && /Krankenstand/.test(d.textContent);
    [...d.querySelectorAll("button")].find((b) => /für diesen Tag beenden/.test(b.textContent)).click(); await warte(1500);
    const krankTeile = db.planung.filter((p) => p.titel === "Krank lang").map((p) => p.datum + ".." + (p.datum_bis || p.datum)).sort();
    const eingestempelt = x("stempelZustand().art");
    /* die Antwort steht je Tag und Person: ausnahmen[Tag][user_id] */
    return { frage1, ausnahme: ausnahme && (ausnahme[ich] || {}).art, arbeitGespeichert, offen1, frage2, krankTeile, eingestempelt, gestern, heute, morgen };
  });
  pruefe(r.frage1 && r.ausnahme === "eingesprungen" && r.arbeitGespeichert && r.offen1 === 0, "eingesprungen falsch: " + JSON.stringify(r));
  pruefe(r.frage2 && JSON.stringify(r.krankTeile) === JSON.stringify([r.gestern + ".." + r.gestern, r.morgen + ".." + r.morgen]) && r.eingestempelt !== "aus", "Tag beenden falsch: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* Inhaber: eigener Urlaub, Arbeit erfassen → Urlaubstag zurückgeben nimmt den Tag gleich heraus */
  const b = await oeffnen(KONTEN.inhaber);
  const r2 = await b.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), morgen = x("plusTage(isoLokal(new Date()),1)");
    await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: heute, datum_bis: morgen, wer: [ich], wer_namen: ["I"], status: "genehmigt" }) + ").select('*')");
    x("planungStand=0; planungNachladen()"); await warte(500);
    x("zeitEditor(null, {datum:'" + heute + "', beginn:'08:00', ende:'09:00', art:'arbeit', bereich:'buero'})"); await warte(400);
    let d = dlg(); [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(500);
    d = dlg(); [...d.querySelectorAll("button")].find((x2) => /Urlaubstag zurückgeben/.test(x2.textContent)).click(); await warte(1500);
    const u = db.planung.filter((p) => p.kategorie === "urlaub").map((p) => p.datum + ".." + (p.datum_bis || p.datum) + " " + p.status);
    return { u, morgen, urlaubsStunden: db.arbeitszeiten.filter((z) => z.art === "urlaub").map((z) => z.datum) };
  });
  pruefe(JSON.stringify(r2.u) === JSON.stringify([r2.morgen + ".." + r2.morgen + " genehmigt"]), "Urlaubstag nicht herausgenommen: " + JSON.stringify(r2));
  pruefe(!b.fehler.length, "Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
});

/* ---- Tiefentest Stunden: Hilfen im Browser (eine Seite für mehrere Fälle – kurze Laufzeit) ---- */
async function ttHilfen(a) {
  await a.seite.evaluate(() => {
    const x = window.__t.x, db = window.__db.tabellen;
    const tt = window.__tt = {
      warte: (ms) => new Promise((f) => setTimeout(f, ms)),
      ich: () => x("meineKennung()"),
      /* n-ter Werktag vor heute (1 = der letzte) */
      werktag: (n) => { let t = x("plusTage(isoLokal(new Date()),-1)"), k = 0; for (;;) { if (x("sollMinutenTag('" + t + "')") > 0 && ++k === (n || 1)) return t; t = x("plusTage('" + t + "',-1)"); } },
      /* jeder Fall beginnt leer: kein Dialog, keine Termine, keine Stunden */
      leeren: () => { x("ansichtenSchliessen()"); document.querySelectorAll(".assistent").forEach((d) => d.remove()); document.body.style.overflow = "";
        db.arbeitszeiten.length = 0; db.planung.length = 0; db.stempel.length = 0; x("ZEITEN=[]; PLANUNG=[]; 1"); window.__dialoge.length = 0; tt.toasts.length = 0; },
      termin: async (z) => (await x("Store.sb.from('planung').insert(" + JSON.stringify(Object.assign({ art: "termin", wer: [tt.ich()], wer_namen: ["T"] }, z)) + ").select('*')")).data[0],
      gestempelt: (z) => db.arbeitszeiten.push(Object.assign({ id: "tt" + Math.random().toString(36).slice(2, 8), user_id: tt.ich(), name: "T", pause_min: 0, art: "arbeit", quelle: "stempel" }, z)),
      laden: async () => { await x("planungLaden()"); await x("zeitenLaden()"); },
      dialog: () => [...document.querySelectorAll(".assistent")].pop(),
      ok: (d) => [...d.querySelectorAll(".as-fuss button")].pop(),
      /* die Stunden eines Tages kurz: „von-bis Bereich Markt Projekt Minuten“ */
      teile: (tag) => db.arbeitszeiten.filter((z) => z.user_id === tt.ich() && z.datum === tag).sort((p, q) => String(p.beginn).localeCompare(String(q.beginn)))
        .map((z) => z.beginn + "-" + z.ende + " " + z.bereich + " " + (z.standort_id || "-") + " " + (z.projekt_id || "-") + " " + z.minuten),
      toasts: [],
    };
    const altToast = x("toast"); x("toast=function(m){ window.__tt.toasts.push(String(m)); return window.__ttAltToast.apply(this, arguments); }; 1");
    window.__ttAltToast = altToast;
  });
}

test("Tiefentest stunden: Abgleich mit dem Kalender – Lücken behalten Markt und Projekt, Termin im Termin, Vorschau wie gestempelt, Verschieben sicher, Störung einmal, Spielwiese mit klarer Meldung", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const fehl = [];
  /* TT-12: Lücken behalten, was dort gestempelt war (Bereich, Markt, Projekt) – nur die Besprechung wird Büro */
  const r12 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "08:00", minuten: 60, bereich: "fahrt" });
    tt.gestempelt({ datum: T, beginn: "08:00", ende: "16:00", minuten: 450, pause_min: 30, bereich: "baustelle", standort_id: "TS1", projekt_id: "pr12" });
    await tt.termin({ kategorie: "besprechung", titel: "Baubesprechung", datum: T, beginn: "12:00", ende: "13:00" });
    await tt.laden();
    const fahrtVorher = x("lohnAuswertung(ZEITEN, '" + T.slice(0, 7) + "')").fahrt;
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    return { teile: tt.teile(T), fahrtVorher, fahrtNachher: x("lohnAuswertung(ZEITEN, '" + T.slice(0, 7) + "')").fahrt };
  });
  if (JSON.stringify(r12.teile) !== JSON.stringify(["07:00-08:00 fahrt - - 60", "08:00-12:00 baustelle TS1 pr12 210", "12:00-13:00 buero - - 60", "13:00-16:00 baustelle TS1 pr12 180"]) || r12.fahrtNachher !== r12.fahrtVorher)
    fehl.push("TT-12 Lücken verlieren Bereich/Markt/Projekt: " + JSON.stringify(r12));
  /* TT-30: Termin ganz innerhalb eines anderen – bekommt seinen Abschnitt, bleibt nicht still offen */
  const r30 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "15:30", minuten: 480, pause_min: 30, bereich: "wartung" });
    await tt.termin({ kategorie: "wartung", titel: "Wartung lang", datum: T, beginn: "08:00", ende: "12:00", standort_id: "TS1" });
    await tt.termin({ kategorie: "besprechung", titel: "Telefonkonferenz", datum: T, beginn: "09:00", ende: "10:00" });
    await tt.laden();
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    return { teile: tt.teile(T), offen: x("abgleichOffen('" + T + "')").map((i) => i.titel) };
  });
  if (r30.offen.length || JSON.stringify(r30.teile) !== JSON.stringify(["07:00-08:00 fahrt - - 60", "08:00-09:00 wartung TS1 - 60", "09:00-10:00 buero - - 60", "10:00-12:00 wartung TS1 - 120", "12:00-15:30 wartung - - 180"]))
    fehl.push("TT-30 Termin im Termin: " + JSON.stringify(r30));
  /* TT-15: die Vorschau „So wird die gestempelte Zeit aufgeteilt“ ergibt die gestempelte Summe (Pause abgezogen) */
  const r15 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 285, pause_min: 15, bereich: "wartung" });
    tt.gestempelt({ datum: T, beginn: "13:00", ende: "17:00", minuten: 240, bereich: "wartung" });
    await tt.termin({ kategorie: "stoerung", titel: "Störung", datum: T, beginn: "09:00", ende: "10:00", standort_id: "TS2" });
    await tt.termin({ kategorie: "projekt", titel: "Projekttermin", datum: T, beginn: "14:00", ende: "15:00", standort_id: "TS3" });
    await tt.laden();
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    const d = tt.dialog(), hm = (t) => { const m = /(\d+):(\d\d)/.exec(t); return m ? +m[1] * 60 + +m[2] : 0; };
    const zeilen = [...d.querySelectorAll(".rowflex .mono.muted")].map((s) => s.textContent.trim());
    tt.ok(d).click(); await tt.warte(600);
    return { zeilen, vorschau: zeilen.reduce((s, t) => s + hm(t), 0), gespeichert: window.__db.tabellen.arbeitszeiten.filter((z) => z.datum === T).reduce((s, z) => s + z.minuten, 0) };
  });
  if (r15.vorschau !== 525 || r15.gespeichert !== 525) fehl.push("TT-15 Vorschau " + r15.vorschau + " / gespeichert " + r15.gespeichert + " statt 525: " + JSON.stringify(r15.zeilen));
  /* TT-21: nur „auf … verschieben“ angehakt – der Knopf „Abgleichen“ wird frei und verschiebt */
  const r21 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    const w = await tt.termin({ kategorie: "werkstatt", titel: "Werkstatt", datum: T, beginn: "14:00", ende: "15:00" });
    await tt.laden();
    x("S.view='stunden'; S.stWoche=montagVon('" + T + "'); render()"); await tt.warte(300);
    const knopf = [...document.querySelectorAll("button")].find((b) => /Tag prüfen · 1 Termin/.test(b.textContent));
    if (!knopf) return { knopf: false };
    knopf.click(); await tt.warte(200);
    const d = tt.dialog(), ok = tt.ok(d), vorher = ok.disabled;
    const vs = d.querySelector("[data-vs]"); vs.checked = true; vs.dispatchEvent(new Event("change")); await tt.warte(50);
    const nachher = tt.ok(tt.dialog()).disabled;
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    return { knopf: true, vorher, nachher, T, datum: window.__db.tabellen.planung.find((p) => p.id === w.id).datum };
  });
  if (!r21.knopf || r21.nachher || r21.datum === r21.T) fehl.push("TT-21 nur „verschieben“: Knopf bleibt gesperrt: " + JSON.stringify(r21));
  /* TT-28 / TT-27: ein mehrtägiger Termin wird nie zum Ein-Tages-Termin; verschoben wird nie in die Vergangenheit */
  const r28 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(3), heute = x("isoLokal(new Date())");
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    await tt.termin({ kategorie: "wartung", titel: "Wartung früh", datum: T, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
    const w = await tt.termin({ kategorie: "werkstatt", titel: "Werkstatt spät", datum: T, beginn: "14:00", ende: "15:00" });
    const bis = x("plusTage('" + T + "',4)");
    const bau = await tt.termin({ kategorie: "projekt", titel: "Baustelle", datum: T, datum_bis: bis, beginn: "13:00", ende: "16:00", standort_id: "TS3" });
    await tt.laden();
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    const d = tt.dialog();
    const box = (titel) => [...d.querySelectorAll("[data-an]")].map((c) => c.closest(".stack")).find((s) => s.querySelector("strong").textContent === titel);
    const vsBau = box("Baustelle").querySelector("[data-vs]"), vsW = box("Werkstatt spät").querySelector("[data-vs]");
    if (vsBau) { vsBau.checked = true; vsBau.dispatchEvent(new Event("change")); }
    const dd = tt.dialog(), vsW2 = [...dd.querySelectorAll("[data-vs]")].find((c) => c.closest(".stack").querySelector("strong").textContent === "Werkstatt spät");
    vsW2.checked = true; vsW2.dispatchEvent(new Event("change"));
    tt.ok(tt.dialog()).click(); await tt.warte(800);
    const db = window.__db.tabellen, g = db.planung.find((p) => p.id === bau.id);
    return { heute, bau: g.datum + ".." + (g.datum_bis || g.datum), bauVorher: T + ".." + bis, angeboten: !!vsBau, werkstatt: db.planung.find((p) => p.id === w.id).datum, text: vsW.closest("label").textContent };
  });
  if (r28.bau !== r28.bauVorher) fehl.push("TT-28 mehrtägiger Termin verändert: " + JSON.stringify(r28));
  if (r28.werkstatt < r28.heute) fehl.push("TT-27 in die Vergangenheit verschoben: " + JSON.stringify(r28));
  /* TT-06: Verschieben scheitert (Antwort mit Fehler / keine Verbindung) – sichtbare Meldung, kein „verschoben“, nichts hängt */
  for (const variante of ["fehler", "netz"]) {
    const r6 = await a.seite.evaluate(async (variante) => {
      const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
      await tt.termin({ kategorie: "wartung", titel: "Wartung gemacht", datum: T, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
      const w = await tt.termin({ kategorie: "werkstatt", titel: "Werkstatt offen", datum: T, beginn: "14:00", ende: "15:00" });
      tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
      await tt.laden();
      const sb = x("Store.sb"), altFrom = sb.from;
      if (variante === "fehler") /* wie supabase-js ohne Netz: update liefert {error}, statt zu werfen */
        sb.from = function (t) { const q = altFrom.call(this, t); if (t === "planung") { const u = q.update; q.update = function () { u.apply(q, arguments); q.then = (ok, nok) => Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }).then(ok, nok); return q; }; } return q; };
      x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
      const d = tt.dialog(), vs = d.querySelector("[data-vs]"); vs.checked = true; vs.dispatchEvent(new Event("change"));
      const ok = tt.ok(tt.dialog());
      if (variante === "netz") window.__netzWeg = true;
      ok.click(); await tt.warte(800);
      window.__netzWeg = false; sb.from = altFrom;
      return { T, toast: tt.toasts.slice(-1)[0] || "", datum: window.__db.tabellen.planung.find((p) => p.id === w.id).datum,
        haengt: document.body.contains(d) && ok.disabled, knopf: ok.textContent, fehler: window.__fehler.filter((f) => /promise/.test(f)) };
    }, variante);
    if (/1 Termin verschoben/.test(r6.toast) || !/nicht verschoben/.test(r6.toast) || r6.haengt || r6.fehler.length) fehl.push("TT-06 (" + variante + ") Verschieben gescheitert: " + JSON.stringify(r6));
  }
  /* TT-16 (zuletzt – die Störung bleibt in den Stammdaten): über die Tour eingeplant = Störung mit Einsatztag UND Kalendertermin – einmal im Abgleich */
  const r16 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    await x("stoerungSpeichern({_id:'stv16', standortId:'TS2', auftragsnummer:'T-16', problemtyp:'Kühlung', erfasstAm:new Date().toISOString(), status:'offen', termin:'" + T + "', terminZeit:'09:00', terminTechniker:meinName(), _ohneMeldung:true}, 'Test')");
    await tt.termin({ kategorie: "stoerung", titel: "Störung TS2", datum: T, beginn: "09:00", ende: "10:00", standort_id: "TS2", stoerung_id: "stv16" });
    tt.gestempelt({ datum: T, beginn: "08:00", ende: "12:00", minuten: 240, bereich: "wartung" });
    await tt.laden();
    const geplant = x("geplantFuerMich('" + T + "')").map((i) => i.schluessel.split(":")[0] + " " + i.titel);
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    return { offen: x("OFFENE.filter(function(o){ return o._id==='stv16'; }).length"), geplant,
      stoerMin: window.__db.tabellen.arbeitszeiten.filter((z) => z.datum === T && z.bereich === "stoerung").reduce((s, z) => s + z.minuten, 0) };
  });
  if (r16.offen !== 1 || r16.geplant.length !== 1 || r16.stoerMin !== 60) fehl.push("TT-16 Störung doppelt: " + JSON.stringify(r16));
  /* TTQ-15: in der Spielwiese (Schattendatenbank) sagen Stempeluhr und Abgleich „in der Spielwiese nicht verfügbar“ – nicht „Datenbank nicht eingerichtet“ */
  const rq15 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    await tt.termin({ kategorie: "wartung", titel: "Wartung", datum: T, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
    await tt.laden();
    window.__ttEcht = x("Store.sb"); x("Store.sb=schattenClient(Store.sb); window.UKT_VORSCHAU='Spielwiese'; 1");
    try {
      await x("stempelDruecken('ein', {bereich:'werkstatt'})"); await tt.warte(100);
      const stempel = tt.toasts.filter((t) => /gestempelt/i.test(t)).pop() || "";
      x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
      const d = tt.dialog(); tt.ok(d).click(); await tt.warte(400);
      const e = d.querySelector(".warnbox:not([hidden])");
      return { stempel, abgleich: e ? e.textContent : "" };
    } finally { x("Store.sb=window.__ttEcht; window.UKT_VORSCHAU=undefined; ansichtenSchliessen(); 1"); }
  });
  if (!/Spielwiese/.test(rq15.stempel) || /nicht eingerichtet/.test(rq15.stempel) || !/Spielwiese/.test(rq15.abgleich) || /nicht eingerichtet/.test(rq15.abgleich)) fehl.push("TTQ-15 Spielwiese: irreführende Meldung: " + JSON.stringify(rq15));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest stunden: Zeit erfassen – Kalender-Vorschlag ohne Abwesenheit, Verknüpfung nur am Tag des Termins, nur Notiz bleibt gestempelt, Dauer geprüft, gestempelter Tag nie doppelt", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const fehl = [];
  /* TT-08: Krankenstand/Urlaub kommen von selbst – als Vorschlag zum Antippen gäbe es sie doppelt bzw. beantragten Urlaub schon als Urlaub */
  const r8 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T1 = tt.werktag(1), T2 = tt.werktag(2);
    await tt.termin({ kategorie: "krank", titel: "Krankenstand", datum: T1 });
    await tt.termin({ kategorie: "urlaub", titel: "Urlaub", datum: T2 });
    await tt.laden();
    const erfassen = async (tag, muster) => {
      x("zeitEditor(null, {datum:'" + tag + "'})"); await tt.warte(150);
      const d = tt.dialog(), chip = [...d.querySelectorAll("[data-vorschlag] .chip")].find((c) => muster.test(c.textContent));
      if (!chip) { x("ansichtenSchliessen()"); return "kein Vorschlag"; }
      chip.click(); tt.ok(d).click(); await tt.warte(500); x("ansichtenSchliessen()");
      return chip.textContent;
    };
    const chipK = await erfassen(T1, /Krankenstand/), chipU = await erfassen(T2, /Urlaub/);
    const am = (t) => db.arbeitszeiten.filter((z) => z.datum === t).map((z) => z.art + " " + z.minuten + " " + (z.quelle || "hand"));
    return { chipK, chipU, krank: am(T1), urlaub: am(T2) };
  });
  if (r8.krank.filter((s) => /^krank/.test(s)).length > 1 || r8.urlaub.some((s) => /^urlaub/.test(s)) || r8.chipK !== "kein Vorschlag" || r8.chipU !== "kein Vorschlag")
    fehl.push("TT-08 Abwesenheit als Vorschlag: " + JSON.stringify(r8));
  /* TT-24: Vorschlag gewählt, dann das Datum geändert – keine Verknüpfung mit dem Termin des anderen Tages */
  const r24 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T1 = tt.werktag(1), T2 = tt.werktag(2);
    const w = await tt.termin({ kategorie: "wartung", titel: "Wartung Eins", datum: T1, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
    await tt.laden();
    x("zeitEditor(null, {datum:'" + T1 + "'})"); await tt.warte(150);
    const d = tt.dialog();
    [...d.querySelectorAll("[data-vorschlag] .chip")].find((c) => /Wartung Eins/.test(c.textContent)).click();
    const dat = d.querySelector('[data-f="datum"]'); dat.value = T2; dat.dispatchEvent(new Event("change", { bubbles: true }));
    tt.ok(d).click(); await tt.warte(500);
    const z = window.__db.tabellen.arbeitszeiten.find((y) => y.datum === T2);
    return { gespeichert: !!z, planung_id: z && z.planung_id, termin: w.id };
  });
  if (!r24.gespeichert || r24.planung_id === r24.termin) fehl.push("TT-24 mit dem Termin des anderen Tages verknüpft: " + JSON.stringify(r24));
  /* TT-07: gestempelt (Sekunden zählen), dann nur die Notiz geändert – Minuten und „gestempelt“ bleiben */
  const r7 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const ein = new Date(Date.now() - 20 * 60000); ein.setSeconds(50, 0);
    const aus = new Date(ein.getTime() + 19 * 60000 + 15000);   /* 19 min 15 s später: Ende-Sekunden kleiner als Beginn-Sekunden */
    db.stempel.push({ id: "stt07", user_id: tt.ich(), name: "T", art: "ein", zeit: ein.toISOString(), bereich: "werkstatt" });
    window.__stempelVersatz = aus.getTime() - Date.now();
    x("stempelStand=0"); await x("stempelNachladen(true)"); await x("zeitenLaden()");
    await x("stempelDruecken('aus', {taetigkeit:'Werkstatt'})"); window.__stempelVersatz = 0; await tt.warte(100);
    x("ansichtenSchliessen()");
    const z0 = db.arbeitszeiten.find((z) => /^stempel/.test(z.quelle || ""));
    if (!z0) return { fehlt: true };
    const vorher = { min: z0.minuten, quelle: z0.quelle };
    x("zeitEditor(ZEITEN.filter(function(z){ return z.id==='" + z0.id + "'; })[0])"); await tt.warte(150);
    const d = tt.dialog(), n = d.querySelector('[data-f="notiz"]'); n.value = "Material vergessen"; n.dispatchEvent(new Event("input", { bubbles: true }));
    tt.ok(d).click(); await tt.warte(500);
    const z1 = db.arbeitszeiten.find((z) => z.id === z0.id);
    return { vorher, nachher: { min: z1.minuten, quelle: z1.quelle, notiz: z1.notiz } };
  });
  if (r7.fehlt || r7.nachher.notiz !== "Material vergessen" || r7.nachher.min !== r7.vorher.min || r7.nachher.quelle !== r7.vorher.quelle) fehl.push("TT-07 nur Notiz geändert: " + JSON.stringify(r7));
  /* TT-19: negative oder unsinnige Dauer („-3“, „7:75“) wird mit Meldung abgewiesen, nichts gespeichert */
  const r19 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const T = tt.werktag(1), erg = {};
    for (const dauer of ["-3", "7:75"]) {
      x("zeitEditor(null, {datum:'" + T + "', art:'arbeit', bereich:'werkstatt'})"); await tt.warte(150);
      const d = tt.dialog(), du = d.querySelector('[data-f="dauer"]'); du.value = dauer; du.dispatchEvent(new Event("input", { bubbles: true }));
      tt.ok(d).click(); await tt.warte(300);
      const e = d.querySelector("[data-err]"); erg[dauer] = e && !e.hidden ? e.textContent : ""; x("ansichtenSchliessen()");
    }
    return { erg, gespeichert: window.__db.tabellen.arbeitszeiten.map((z) => z.minuten) };
  });
  if (r19.gespeichert.length || !/gültige Dauer/.test(r19.erg["-3"]) || !/gültige Dauer/.test(r19.erg["7:75"])) fehl.push("TT-19 unsinnige Dauer: " + JSON.stringify(r19));
  /* TT-29: gestempelter Tag – „erfassen“ beim Termin ohne Uhrzeit nur mit Rückfrage; über Mitternacht gestempelt: kein „erfassen“, Überschneidung erkannt */
  const r29 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const T = tt.werktag(1), heute = x("isoLokal(new Date())"), gestern = x("plusTage(isoLokal(new Date()),-1)");
    const zeile = async (tag, titel) => {
      x("S.view='stunden'; S.stWoche=montagVon('" + tag + "'); render()"); await tt.warte(250);
      return [...document.querySelectorAll("[data-tage] .rowflex")].find((e) => e.querySelector("a.sprunglink") && e.textContent.includes(titel));
    };
    /* (a) gestempelt 07:00–15:30, Baustelle ganztägig – „erfassen“ mit 8 h */
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "15:30", minuten: 480, pause_min: 30, bereich: "baustelle" });
    await tt.termin({ kategorie: "projekt", titel: "Baustelle ganztägig", datum: T, standort_id: "TS3" });
    await tt.laden();
    const za = await zeile(T, "Baustelle ganztägig"), erf = za && za.querySelector("[data-erf]");
    let summeA = 480;
    if (erf) {
      window.__antwort.confirm = false; erf.click(); await tt.warte(150);
      const d = tt.dialog(), du = d.querySelector('[data-f="dauer"]'); du.value = "8"; du.dispatchEvent(new Event("input", { bubbles: true }));
      tt.ok(d).click(); await tt.warte(400); window.__antwort.confirm = true; x("ansichtenSchliessen()");
      summeA = db.arbeitszeiten.filter((z) => z.datum === T).reduce((s, z) => s + z.minuten, 0);
    }
    const rueckfrageA = window.__dialoge.filter((d) => d[0] === "confirm").length;
    /* (b) gestern 22:00 bis 00:30 gestempelt, Termin 22:30–23:30; heute von Hand 00:00–00:30 */
    tt.gestempelt({ datum: gestern, beginn: "22:00", ende: "00:30", minuten: 150, bereich: "stoerung" });
    await tt.termin({ kategorie: "wartung", titel: "Nachtwartung", datum: gestern, beginn: "22:30", ende: "23:30", standort_id: "TS1" });
    await tt.laden();
    const zb = await zeile(gestern, "Nachtwartung"), kb = zb ? [...zb.querySelectorAll("button")].map((b) => b.textContent.trim()) : null;
    window.__dialoge.length = 0;
    x("zeitEditor(null, {datum:'" + heute + "', beginn:'00:00', ende:'00:30', art:'arbeit', bereich:'stoerung'})"); await tt.warte(150);
    tt.ok(tt.dialog()).click(); await tt.warte(400);
    const neuB = db.arbeitszeiten.find((z) => z.datum === heute && z.beginn === "00:00");
    return { summeA, rueckfrageA, kb, rueckfrageB: window.__dialoge.filter((d) => d[0] === "confirm").length, markiertB: !!(neuB && x("zeitenUeberschneidungen(ZEITEN)")[neuB.id]) };
  });
  if (!(r29.summeA === 480 && r29.rueckfrageA)) fehl.push("TT-29 (a) gestempelter Tag, „erfassen“ ohne Rückfrage: " + JSON.stringify(r29));
  if (!r29.kb || r29.kb.includes("erfassen") || !r29.rueckfrageB || !r29.markiertB) fehl.push("TT-29 (b) über Mitternacht gestempelt: " + JSON.stringify(r29));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest stunden: Hinweise über 12 h / 60 h zählen nur Arbeit, auch über den Monatswechsel; laufender Monat bis gestern", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await ttHilfen(a);
  const fehl = [];
  /* TT-09: Urlaub Mo–Fr aus dem Kalender, Fr zusätzlich 6 h Arbeit, Sa und So je 11 h – weder „über 12 h“ noch „über 60 h“ */
  const r9 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const mo = x("plusTage(montagVon(isoLokal(new Date())),-7)"), tag = (i) => x("plusTage('" + mo + "'," + i + ")");
    for (let i = 0; i < 5; i++) db.arbeitszeiten.push({ id: "t9u" + i, user_id: tt.ich(), name: "I", datum: tag(i), minuten: i === 4 ? 390 : 480, art: "urlaub", quelle: "kalender", pause_min: 0 });
    tt.gestempelt({ datum: tag(4), beginn: "07:00", ende: "13:30", minuten: 360, pause_min: 30, quelle: "hand", bereich: "werkstatt" });
    tt.gestempelt({ datum: tag(5), beginn: "06:00", ende: "17:30", minuten: 660, pause_min: 30, quelle: "hand", bereich: "werkstatt" });
    tt.gestempelt({ datum: tag(6), beginn: "06:00", ende: "17:30", minuten: 660, pause_min: 30, quelle: "hand", bereich: "werkstatt" });
    await tt.laden();
    x("S.view='stunden'; S.stWoche='" + mo + "'; render()"); await tt.warte(300);
    return { ueber12: [...document.querySelectorAll("[data-tage] strong")].filter((s) => /über 12 h/.test(s.textContent)).map((s) => s.textContent.slice(0, 9)),
      woche: ((document.querySelector("[data-summen]") || {}).textContent || "").slice(0, 80) };
  });
  if (r9.ueber12.length || /über 60 h/.test(r9.woche)) fehl.push("TT-09 Urlaub zählt bei 12 h / 60 h mit: " + JSON.stringify(r9));
  /* TT-35: 5 × 12,5 h von Mo 28.09. bis Fr 02.10. – über 60 h in der Woche, auch wenn sie über den Monatswechsel geht (Auswertung und Tabelle des Inhabers) */
  const r35 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const l = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((d, i) => ({ id: "t35" + i, user_id: "u_tech_test_at", name: "Testtechniker", datum: d, beginn: "06:00", ende: "19:00", pause_min: 30, minuten: 750, art: "arbeit", quelle: "hand", bereich: "werkstatt" }));
    window.__l35 = l; l.forEach((z) => db.arbeitszeiten.push(Object.assign({}, z)));
    const sep = x("lohnAuswertung(window.__l35, '2026-09')").ueber60, okt = x("lohnAuswertung(window.__l35, '2026-10')").ueber60;
    x("S.view='stunden'; S.stMonat='2026-10'; render()"); await tt.warte(500);
    const karte = [...document.querySelectorAll(".card h2")].find((h) => /^Alle Mitarbeiter/.test(h.textContent));
    const zeile = karte && [...karte.closest(".card").querySelectorAll("tbody tr")].find((r) => /Testtechniker/.test(r.textContent));
    return { sep, okt, tabelle: zeile ? /über 60 h/.test(zeile.textContent) : null };
  });
  if (!r35.sep.length || !r35.okt.length || !r35.tabelle) fehl.push("TT-35 Woche über 60 h über den Monatswechsel nicht gemeldet: " + JSON.stringify(r35));
  /* TT-33: laufender Monat, jeder Arbeitstag bis gestern genau mit dem Tagessoll erfasst – kein rotes Minus (wie die Woche: „bis gestern“) */
  const r33 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const heute = x("isoLokal(new Date())");
    for (let t = heute.slice(0, 7) + "-01"; t < heute; t = x("plusTage('" + t + "',1)")) {
      const s = x("sollMinutenTag('" + t + "')"); if (s) db.arbeitszeiten.push({ id: "t33" + t, user_id: tt.ich(), name: "I", datum: t, minuten: s, art: "arbeit", quelle: "hand", bereich: "werkstatt" });
    }
    await tt.laden();
    x("S.view='stunden'; S.stWoche=montagVon('" + heute + "'); render()"); await tt.warte(300);
    const su = document.querySelector("[data-summen] span");
    return { text: su.textContent, rot: [...su.querySelectorAll("span")].filter((s) => /crit/.test(s.getAttribute("style") || "") && !s.hasAttribute("data-wochesoll")).map((s) => s.textContent) };
  });
  if (r33.rot.some((t) => /^[−-]/.test(t))) fehl.push("TT-33 Monatszeile rot im Minus, obwohl bis gestern alles erfasst: " + r33.text);
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest stunden: Abwesenheit – Tag herausnehmen nur für die eine Person, Antwort je Person, nur Tage im Zeitraum", async () => {
  const fehl = [];
  /* Inhaber nimmt Tage heraus */
  const a = await oeffnen(KONTEN.inhaber);
  await ttHilfen(a);
  /* TT-04: Urlaub vom Techniker angelegt, niemand eingetragen („gilt als seins“) – Mittwoch herausnehmen: Rest bleibt bei ihm */
  const r4 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const tech = "u_tech_test_at", mo = x("plusTage(montagVon(isoLokal(new Date())),7)"), mi = x("plusTage('" + mo + "',2)"), fr = x("plusTage('" + mo + "',4)");
    db.planung.push({ id: "tt04", art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: mo, datum_bis: fr, wer: [], wer_namen: [], status: "genehmigt", erstellt_von: tech, erstellt_name: "Testtechniker", erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    await x("Store.sb.from('planung').update({details:'Sommer'}).eq('id','tt04').select('*')");   /* Kalender legt die Urlaubsstunden an */
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='tt04'; })[0])"); await tt.warte(150);
    const knopf = [...tt.dialog().querySelectorAll("button")].find((b) => /^Tag herausnehmen$/.test(b.textContent.trim()));
    knopf.parentNode.querySelector('input[type="date"]').value = mi; knopf.click(); await tt.warte(500);
    const soll = [0, 1, 3, 4].filter((i) => x("sollMinutenTag(plusTage('" + mo + "'," + i + "))")).length;   /* ohne Mittwoch, ohne Feiertage */
    return { tech, soll, plan: db.planung.filter((p) => p.kategorie === "urlaub").map((p) => p.datum + ".." + (p.datum_bis || p.datum) + " " + ((p.wer || []).join() || p.erstellt_von)),
      stunden: db.arbeitszeiten.filter((z) => z.art === "urlaub").map((z) => z.datum.slice(5) + " " + z.user_id).sort() };
  });
  if (r4.stunden.length !== r4.soll || !r4.stunden.every((s) => s.endsWith(r4.tech)) || !r4.plan.every((s) => s.endsWith(r4.tech))) fehl.push("TT-04 zweiter Teil gehört dem Inhaber: " + JSON.stringify(r4));
  /* TT-05: zurückgegebener Tag liegt nach dem Kürzen außerhalb – kein Knopf, der Urlaub wird nicht verlängert */
  const r5 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const tech = "u_tech_test_at", mo = x("plusTage(montagVon(isoLokal(new Date())),7)"), di = x("plusTage('" + mo + "',1)"), don = x("plusTage('" + mo + "',3)"), fr = x("plusTage('" + mo + "',4)");
    const u = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: mo, datum_bis: fr, wer: [tech], wer_namen: ["Testtechniker"], status: "genehmigt" }) + ").select('*')")).data[0];
    const aus = {}; aus[don] = { art: "zurueck", von: "Testtechniker", zeit: new Date().toISOString() };
    await x("Store.sb.from('planung').update(" + JSON.stringify({ ausnahmen: aus }) + ").eq('id','" + u.id + "').select('*')");
    await x("Store.sb.from('planung').update(" + JSON.stringify({ datum_bis: di }) + ").eq('id','" + u.id + "').select('*')");
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='" + u.id + "'; })[0])"); await tt.warte(150);
    const knopf = [...tt.dialog().querySelectorAll("button")].find((b) => /zurückgegeben/.test(b.textContent));
    if (knopf) { knopf.click(); await tt.warte(500); }
    return { knopf: knopf ? knopf.textContent : null, plan: db.planung.map((p) => p.datum + ".." + (p.datum_bis || p.datum)), soll: [mo + ".." + di],
      stunden: db.arbeitszeiten.filter((z) => z.art === "urlaub").map((z) => z.datum).sort(), sollStunden: [mo, di].filter((t) => x("sollMinutenTag('" + t + "')")) };
  });
  if (r5.knopf || JSON.stringify(r5.plan) !== JSON.stringify(r5.soll) || JSON.stringify(r5.stunden) !== JSON.stringify(r5.sollStunden)) fehl.push("TT-05 Tag außerhalb herausgenommen: " + JSON.stringify(r5));
  /* TTQ-01 (Inhaber): Betriebsurlaub für drei, einer gibt einen Tag zurück – nur er verliert ihn */
  const rq1 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const ids = ["u_tech_test_at", "u_admin_test_at", "u_inhaber_test_at"], mo = x("plusTage(montagVon(isoLokal(new Date())),7)"), mi = x("plusTage('" + mo + "',2)"), fr = x("plusTage('" + mo + "',4)");
    const u = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "urlaub", titel: "Betriebsurlaub", datum: mo, datum_bis: fr, wer: ids, wer_namen: ["Testtechniker", "Testadmin", "Testinhaber"], status: "genehmigt" }) + ").select('*')")).data[0];
    const aus = {}; aus[mi] = { art: "zurueck", von: "Testtechniker", zeit: new Date().toISOString() };   /* Antwort im älteren Format (nur Name) */
    await x("Store.sb.from('planung').update(" + JSON.stringify({ ausnahmen: aus }) + ").eq('id','" + u.id + "').select('*')");
    await tt.laden();
    const vorher = db.arbeitszeiten.filter((z) => z.art === "urlaub").length;
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='" + u.id + "'; })[0])"); await tt.warte(150);
    const knopf = [...tt.dialog().querySelectorAll("button")].find((b) => /zurückgegeben von Testtechniker/.test(b.textContent));
    if (knopf) { knopf.click(); await tt.warte(600); }
    const amMi = (uid) => db.planung.some((p) => (p.wer || []).includes(uid) && x("planTage(" + JSON.stringify(p) + ")").includes(mi));
    const std = (uid) => db.arbeitszeiten.filter((z) => z.art === "urlaub" && z.user_id === uid).map((z) => z.datum).sort();
    const soll = (l) => l.filter((i) => x("sollMinutenTag(plusTage('" + mo + "'," + i + "))")).length;   /* Feiertage zählen nicht */
    return { knopf: !!knopf, vorher, ohneMi: soll([0, 1, 3, 4]), alle: soll([0, 1, 2, 3, 4]), tech: { mi: amMi(ids[0]), std: std(ids[0]).length }, admin: { mi: amMi(ids[1]), std: std(ids[1]).length }, inhaber: { mi: amMi(ids[2]), std: std(ids[2]).length } };
  });
  if (!rq1.knopf || rq1.tech.mi || rq1.tech.std !== rq1.ohneMi || !rq1.admin.mi || rq1.admin.std !== rq1.alle || !rq1.inhaber.mi || rq1.inhaber.std !== rq1.alle) fehl.push("TTQ-01 Betriebsurlaub: Tag für alle herausgenommen: " + JSON.stringify(rq1));
  if (a.fehler.length) fehl.push("Laufzeitfehler (Inhaber): " + a.fehler.join("; "));
  await a.zu();
  /* Techniker: gemeinsamer Kurs mit einer Kollegin */
  const b = await oeffnen(KONTEN.techniker);
  await ttHilfen(b);
  const kurs = async (antwort) => b.seite.evaluate(async (antwort) => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const ich = tt.ich(), kollegin = "u_admin_test_at", heute = x("isoLokal(new Date())"), gestern = x("plusTage('" + heute + "',-1)"), morgen = x("plusTage('" + heute + "',1)");
    db.planung.push({ id: "ttk", art: "termin", kategorie: "schule", titel: "Kältekurs", datum: gestern, datum_bis: morgen, wer: [ich, kollegin], wer_namen: ["Testtechniker", "Testadmin"], status: "offen", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    [heute, morgen].forEach((t) => db.arbeitszeiten.push({ id: "ttk" + t, user_id: kollegin, name: "Testadmin", datum: t, minuten: 480, art: "schule", quelle: "kalender", planung_id: "ttk", pause_min: 0 }));
    await tt.laden();
    const offenVorher = x("abwesenheitOffen('" + heute + "','" + kollegin + "').length");
    x("zeitEditor(null, {datum:'" + heute + "', beginn:'08:00', ende:'10:00', art:'arbeit', bereich:'werkstatt'})"); await tt.warte(150);
    tt.ok(tt.dialog()).click(); await tt.warte(300);
    const knopf = [...tt.dialog().querySelectorAll("button")].find((k) => new RegExp(antwort).test(k.textContent));
    if (knopf) { knopf.click(); await tt.warte(700); }
    const amHeute = (uid) => db.planung.some((p) => (p.wer || []).includes(uid) && x("planTage(" + JSON.stringify(p) + ")").includes(heute));
    return { knopf: !!knopf, offenVorher, offenKollegin: x("abwesenheitOffen('" + heute + "','" + kollegin + "').length"), offenIch: x("abwesenheitOffen('" + heute + "').length"),
      kolleginHeute: amHeute(kollegin), ichHeute: amHeute(ich), ichMorgen: db.planung.some((p) => (p.wer || []).includes(ich) && x("planTage(" + JSON.stringify(p) + ")").includes(morgen)),
      kolleginStunden: db.arbeitszeiten.filter((z) => z.user_id === kollegin).map((z) => z.datum).sort(), heute, morgen };
  }, antwort);
  /* TTQ-02: „Nur kurz eingesprungen“ gilt nur für mich – bei der Kollegin bleibt der Tag ungeklärt */
  const rq2 = await kurs("Nur kurz eingesprungen");
  if (!rq2.knopf || rq2.offenVorher !== 1 || rq2.offenKollegin !== 1 || rq2.offenIch !== 0) fehl.push("TTQ-02 Antwort gilt für alle: " + JSON.stringify(rq2));
  /* TTQ-01 (Techniker): „für diesen Tag beenden“ – nur ich verliere den Tag, die Kollegin behält Kurs und Stunden */
  const rq1b = await kurs("für diesen Tag beenden");
  if (!rq1b.knopf || rq1b.ichHeute || !rq1b.ichMorgen || !rq1b.kolleginHeute || JSON.stringify(rq1b.kolleginStunden) !== JSON.stringify([rq1b.heute, rq1b.morgen].sort()))
    fehl.push("TTQ-01 Kurs für zwei: Tag für beide beendet: " + JSON.stringify(rq1b));
  if (b.fehler.length) fehl.push("Laufzeitfehler (Techniker): " + b.fehler.join("; "));
  await b.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest stunden: Präsentation – Abgleich lässt Summe und Pause gleich, Tag herausnehmen und Verschieben schicken nichts an die Datenbank", async () => {
  const a = await oeffnen(KONTEN.praesentation);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, ich = tt.ich(), sb = x("Store.sb"), altFrom = sb.from;
    /* jede Schreibanfrage mitschreiben */
    window.__schreib = [];
    sb.from = function (t) { const q = altFrom.call(this, t); ["insert", "update", "upsert", "delete"].forEach((m) => { const o = q[m]; q[m] = function () { window.__schreib.push(t + "." + m); return o.apply(q, arguments); }; }); return q; };
    const T = tt.werktag(1), dlg = () => tt.dialog();
    /* TT-01: Abgleich in der Präsentation rechnet wie die Datenbank – Summe 510, Pause 30 */
    x("ZEITEN").push({ id: "tp01", user_id: ich, name: "P", datum: T, beginn: "07:00", ende: "16:00", pause_min: 30, minuten: 510, art: "arbeit", quelle: "stempel", bereich: "wartung" });
    x("PLANUNG").push({ id: "tp01p", art: "termin", kategorie: "wartung", titel: "Wartung", datum: T, beginn: "08:00", ende: "10:00", wer: [ich], wer_namen: ["P"], standort_id: "TS1", status: "offen", erstellt_von: ich });
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    tt.ok(dlg()).click(); await tt.warte(400);
    const l = x("ZEITEN").filter((z) => z.datum === T);
    const t01 = { summe: l.reduce((s, z) => s + z.minuten, 0), pause: l.reduce((s, z) => s + (z.pause_min || 0), 0), teile: l.length };
    /* TT-02 (a): Krankenstand Mo–Fr, Arbeit am Mittwoch → „für diesen Tag beenden“ */
    const mo = x("plusTage(montagVon(isoLokal(new Date())),7)"), mi = x("plusTage('" + mo + "',2)");
    x("PLANUNG").push({ id: "tp02k", art: "termin", kategorie: "krank", titel: "Krankenstand", datum: mo, datum_bis: x("plusTage('" + mo + "',4)"), wer: [ich], wer_namen: ["P"], status: "offen", erstellt_von: ich, ausnahmen: {} });
    x("zeitEditor(null, {datum:'" + mi + "', beginn:'08:00', ende:'10:00', art:'arbeit', bereich:'werkstatt'})"); await tt.warte(150);
    tt.ok(dlg()).click(); await tt.warte(300);
    const beenden = [...dlg().querySelectorAll("button")].find((k) => /für diesen Tag beenden/.test(k.textContent));
    if (beenden) { beenden.click(); await tt.warte(400); }
    const schreibA = window.__schreib.slice(); x("ansichtenSchliessen()"); document.querySelectorAll(".assistent").forEach((d) => d.remove());
    /* TT-02 (b): Abgleich mit einem nicht gemachten Termin → verschieben (nur im Speicher) */
    window.__schreib.length = 0;
    const T2 = tt.werktag(2);
    x("ZEITEN").push({ id: "tp02z", user_id: ich, name: "P", datum: T2, beginn: "07:00", ende: "12:00", pause_min: 0, minuten: 300, art: "arbeit", quelle: "stempel", bereich: "wartung" });
    x("PLANUNG").push({ id: "tp02a", art: "termin", kategorie: "wartung", titel: "Wartung", datum: T2, beginn: "08:00", ende: "10:00", wer: [ich], wer_namen: ["P"], standort_id: "TS1", status: "offen", erstellt_von: ich },
      { id: "tp02b", art: "termin", kategorie: "werkstatt", titel: "Werkstatt", datum: T2, beginn: "14:00", ende: "15:00", wer: [ich], wer_namen: ["P"], status: "offen", erstellt_von: ich });
    x("abgleichDialog('" + T2 + "', false)"); await tt.warte(200);
    const vs = dlg().querySelector("[data-vs]"); vs.checked = true; vs.dispatchEvent(new Event("change"));
    tt.ok(dlg()).click(); await tt.warte(500);
    sb.from = altFrom;
    return { t01, beenden: !!beenden, schreibA, schreibB: window.__schreib.slice(), T2, verschoben: x("PLANUNG").find((p) => p.id === "tp02b").datum, toast: tt.toasts.slice(-1)[0] || "" };
  });
  const fehl = [];
  if (r.t01.summe !== 510 || r.t01.pause !== 30 || r.t01.teile !== 3) fehl.push("TT-01 Präsentation: Summe/Pause nach dem Abgleich " + JSON.stringify(r.t01));
  if (!r.beenden || r.schreibA.length) fehl.push("TT-02 (a) „Tag beenden“ schickt " + JSON.stringify(r.schreibA) + " an die Datenbank");
  if (r.schreibB.length || r.verschoben === r.T2) fehl.push("TT-02 (b) Verschieben: " + JSON.stringify(r.schreibB) + " an die Datenbank / im Speicher nicht verschoben: " + JSON.stringify(r));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest stunden: Datenbank-Skripte mehrfach ausführbar, Nachbildung wie die SQL", async () => {
  const fehl = [];
  /* SQL-1: stunden-kalender.sql („Mehrfach ausführbar“) nach stempel-abgleich.sql nochmals ausgeführt – der Abgleich bleibt erlaubt und „geändert“ sichtbar */
  const sk = readFileSync(join(WURZEL, "tools", "stunden-kalender.sql"), "utf8"), sa = readFileSync(join(WURZEL, "tools", "stempel-abgleich.sql"), "utf8");
  const quellen = (s) => ((/arbeitszeiten_quelle_check\s+check \(quelle in \(([^)]*)\)/.exec(s) || [])[1] || "").split(",").map((q) => q.trim());
  const merken = (s) => ((/old\.quelle in \(([^)]*)\) and zeit_geaendert/.exec(s) || [])[1] || "").split(",").map((q) => q.trim());
  const fehlt = quellen(sa).filter((q) => !quellen(sk).includes(q)), fehltT = merken(sa).filter((q) => !merken(sk).includes(q));
  if (!/Mehrfach ausführbar/.test(sk) || fehlt.length || fehltT.length) fehl.push("SQL-1 stunden-kalender.sql setzt den Abgleich zurück – fehlt: " + JSON.stringify({ quellen: fehlt, trigger: fehltT }));
  /* ATT-1: die Nachbildung (tests/attrappe.js) verhält sich wie die SQL-Funktionen bzw. supabase-js */
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"), ich = tt.ich(), e = {};
    /* (1) bestätigter Monat: der Kalender legt dort keine Stunden an (planung_stunden_sync) */
    tt.leeren(); const vm = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)");
    db.arbeitszeiten.push({ id: "att1b", user_id: ich, name: "T", datum: vm + "-01", minuten: 60, art: "arbeit", quelle: "hand", bestaetigt: new Date().toISOString() });
    let tag = vm + "-15"; while (!x("sollMinutenTag('" + tag + "')")) tag = x("plusTage('" + tag + "',1)");
    await tt.termin({ kategorie: "krank", titel: "Krank", datum: tag });
    e.bestaetigt = db.arbeitszeiten.filter((z) => z.datum === tag && z.quelle === "kalender").length;
    /* (2) stempel_abgleich: Pause automatisch bleibt, „geändert“ bleibt sichtbar, Pause muss in einen Abschnitt passen */
    tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "15:30", minuten: 480, pause_min: 30, pause_auto: 30, quelle: "stempel_geaendert", bereich: "wartung" });
    const rr = await sb.rpc("stempel_abgleich", { p_datum: T, p_teile: [{ beginn: "07:00", ende: "08:00", bereich: "fahrt" }, { beginn: "08:00", ende: "15:30", bereich: "wartung" }] });
    const ab = (rr.data || {}).eintraege || [];
    e.pauseAuto = ab.reduce((s, z) => s + (z.pause_auto || 0), 0); e.quellen = ab.map((z) => z.quelle).join();
    tt.leeren(); tt.gestempelt({ datum: T, beginn: "07:00", ende: "08:00", minuten: 20, pause_min: 40, bereich: "wartung" });
    const rp = await sb.rpc("stempel_abgleich", { p_datum: T, p_teile: [{ beginn: "07:00", ende: "07:30", bereich: "fahrt" }, { beginn: "07:30", ende: "08:00", bereich: "wartung" }] });
    e.pausePasst = rp.error ? rp.error.message : "angenommen";
    /* (3) planung: Ende vor dem Beginn lehnt die Datenbank ab */
    const pf = await sb.from("planung").insert({ art: "termin", kategorie: "krank", titel: "x", datum: T, datum_bis: x("plusTage('" + T + "',-2)"), wer: [ich] }).select("*");
    e.bisVorBeginn = pf.error ? "abgelehnt" : "angenommen";
    /* (4) delete().select('id') liefert nur die Kennung */
    tt.leeren(); tt.gestempelt({ id: "att1d", datum: T, beginn: "07:00", ende: "08:00", minuten: 60, quelle: "hand" });
    const del = await sb.from("arbeitszeiten").delete().eq("id", "att1d").select("id");
    e.spalten = Object.keys((del.data || [])[0] || {}).join();
    /* (5) ohne Netz wie supabase-js: {error} statt zu werfen – auch bei Funktionen */
    window.__netzWeg = "antwort";
    try { const nu = await sb.from("planung").update({ titel: "y" }).eq("id", "gibtsnicht").select("*"); e.netzTabelle = nu.error ? "Fehler" : "ok"; } catch (y) { e.netzTabelle = "geworfen"; }
    try { const nr = await sb.rpc("stempeln", { p_art: "ein" }); e.netzRpc = nr.error ? "Fehler" : "ok"; } catch (y) { e.netzRpc = "geworfen"; }
    window.__netzWeg = false;
    /* (6) stempeln: Pause je TAG (frühere gestempelte Zeit des Tages zählt mit); Ende in der Zukunft geht nicht */
    tt.leeren(); const ein = new Date(Date.now() - 3 * 3600000), tagE = x("isoLokal(new Date(" + ein.getTime() + "))");
    tt.gestempelt({ datum: tagE, beginn: "00:00", ende: "00:01", minuten: 240, bereich: "werkstatt" });   /* 4 h früher am Tag */
    db.stempel.push({ id: "att1s", user_id: ich, name: "T", art: "ein", zeit: ein.toISOString(), bereich: "werkstatt" });
    const aus = await sb.rpc("stempeln", { p_art: "aus", p_name: "T" });
    e.pauseTag = ((aus.data || {}).eintraege || []).reduce((s, z) => s + (z.pause_auto || 0), 0);
    db.stempel.length = 0; db.stempel.push({ id: "att1z", user_id: ich, name: "T", art: "ein", zeit: new Date(Date.now() - 3600000).toISOString(), bereich: "werkstatt" });
    const spaeter = new Date(Date.now() + 30 * 60000), hm = ("0" + spaeter.getHours()).slice(-2) + ":" + ("0" + spaeter.getMinutes()).slice(-2);
    const zk = await sb.rpc("stempeln", { p_art: "aus", p_name: "T", p_ende_hand: hm });
    e.zukunft = zk.error ? zk.error.message : "angenommen";
    return e;
  });
  if (r.bestaetigt !== 0) fehl.push("ATT-1 Kalender-Stunden im bestätigten Monat angelegt: " + JSON.stringify(r));
  if (r.pauseAuto !== 30 || r.quellen !== "stempel_geaendert,stempel_geaendert" || !/Pause passt/.test(r.pausePasst)) fehl.push("ATT-1 stempel_abgleich anders als die SQL: " + JSON.stringify(r));
  if (r.bisVorBeginn !== "abgelehnt") fehl.push("ATT-1 planung: Ende vor Beginn angenommen: " + JSON.stringify(r));
  if (r.spalten !== "id") fehl.push("ATT-1 delete().select('id') liefert " + r.spalten);
  if (r.netzTabelle !== "Fehler" || r.netzRpc !== "Fehler") fehl.push("ATT-1 ohne Netz nicht wie supabase-js: " + JSON.stringify(r));
  if (r.pauseTag !== 30 || !/Zukunft/.test(r.zukunft)) fehl.push("ATT-1 stempeln anders als stempeluhr-4.sql: " + JSON.stringify(r));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

/* ---- Tiefentest Kalender: eine Seite je Rolle für mehrere Fälle (kurze Laufzeit), Routendienst abgelehnt ---- */
const ROUTENDIENSTE = ["routing.openstreetmap.de", "router.project-osrm.org", "nominatim.openstreetmap.org"];
async function tkOeffnen(konto, opt) {
  const a = await oeffnen(konto, opt);
  await a.seite.route((u) => ROUTENDIENSTE.includes(u.hostname), (rt) => rt.abort());
  await ttHilfen(a);
  await a.seite.evaluate(() => {
    const x = window.__t.x, tt = window.__tt;
    /* Termine am Tag in zwei Tagen (Planung prüfen) */
    tt.tag2 = () => x("plusTage(isoLokal(new Date()),2)");
    tt.termine = async (l) => { for (const z of l) await tt.termin(z); x("planungStand=0"); await tt.laden(); };
    tt.pruefen = async (tag) => { x("planungPruefenAnsicht('ich', '" + tag + "', '" + tag + "')"); await tt.warte(150); return tt.dialog(); };
    tt.knopf = (d, re, zeile) => [...d.querySelectorAll("button")].find((b) => re.test(b.textContent) && (!zeile || zeile.test(b.parentNode.textContent)));
    tt.zeit = (titel) => { const p = window.__db.tabellen.planung.find((y) => y.titel === titel); return p ? p.beginn + "–" + p.ende : "fehlt"; };
  });
  return a;
}

test("Tiefentest kalender: Planung prüfen und Abwesenheit – Reihenfolge einmal und nie nach Mitternacht, ohne Netz gemeldet, Tag herausnehmen ganz oder ehrlich, alte Einplanung, „gilt als deins“, Startpunkt, halber Tag", async () => {
  const fehl = [];
  const a = await tkOeffnen(KONTEN.techniker);
  /* TT-KAL-02: derselbe Markt zweimal am Tag – jeder Termin einmal neu gesetzt, der früheste Beginn bleibt */
  const r02 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const tag = tt.tag2();
    x("STARTPUNKTE[meineKennung()]={betrieb:true}");
    const z = (titel, sid, b, e) => ({ kategorie: "wartung", titel, datum: tag, beginn: b, ende: e, standort_id: sid });
    await tt.termine([z("A früh", "TS3", "08:00", "09:00"), z("B", "TS4", "10:00", "11:00"), z("A spät", "TS3", "12:00", "13:00")]);
    const k = tt.knopf(await tt.pruefen(tag), /Reihenfolge übernehmen/);
    if (!k) return { fehler: "kein Vorschlag" };
    const upd = [], sb = x("Store.sb"), alt = sb.from;
    sb.from = function (t) { const q = alt.call(this, t); const o = q.update; q.update = function (dd) { upd.push(t); return o.apply(q, arguments); }; return q; };
    k.click(); await tt.warte(500); sb.from = alt;
    return { frueh: tt.zeit("A früh"), spaet: tt.zeit("A spät"), b: tt.zeit("B"), updates: upd.length };
  });
  if (r02.fehler || !r02.frueh.startsWith("08:00") || !r02.spaet.startsWith("09:00") || r02.updates !== 3) fehl.push("TT-KAL-02 Tag beginnt später / Termine doppelt geschrieben: " + JSON.stringify(r02));
  /* TT-KAL-03: nie eine Uhrzeit nach 24:00 oder ein Ende vor dem Beginn – (a) Reihenfolge übernehmen, (b) Tour → Kalender ab 19:00, (c) „📅 Handy“ bei altem Eintrag „26:00“ */
  const r03 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const tag = tt.tag2();
    x("STARTPUNKTE={}");
    const z = (titel, sid, b, e) => ({ kategorie: "besprechung", titel, datum: tag, beginn: b, ende: e, standort_id: sid });
    await tt.termine([z("Wien", "TS1", "14:00", "15:00"), z("West", "TS4", "15:00", "16:00"), z("Linz", "TS5", "16:00", "17:00"), z("Innsbruck", "TS3", "17:00", "18:00")]);
    const k = tt.knopf(await tt.pruefen(tag), /Reihenfolge übernehmen/);
    if (k) { k.click(); await tt.warte(500); }
    const zeiten = ["Wien", "West", "Linz", "Innsbruck"].map((t) => [t].concat(tt.zeit(t).split("–")));
    const meldungA = tt.toasts.slice(-1)[0] || "";
    tt.leeren();
    window.__T = { tage: [{ nr: 1, stopps: [
      { standort: x("byId.TS1"), positionen: [x("posById.TP1")], fahrtH: 0.5, arbeitH: 3 },
      { standort: x("byId.TS3"), positionen: [x("posById.TP4")], fahrtH: 0.5, arbeitH: 3 }] }], anzahlStopps: 2, kmGesamt: 40, stundenProTag: 8 };
    x("tourSchicken(window.__T)"); await tt.warte(300);
    const d = tt.dialog(), st = d.querySelector("[data-a=start]"); st.value = "19:00"; st.dispatchEvent(new Event("input", { bubbles: true }));
    tt.ok(d).click(); await tt.warte(500);
    db.planung.forEach((p) => zeiten.push([p.titel, p.beginn, p.ende]));
    const meldungB = document.body.contains(d) ? d.querySelector("[data-a=fehler]").textContent : "Dialog zu";
    tt.leeren();
    x("PLANUNG").push({ id: "alt26", art: "termin", kategorie: "wartung", titel: "Alt", datum: tag, beginn: "23:00", ende: "26:00", wer: [tt.ich()], wer_namen: ["T"], standort_id: "TS1", status: "offen" });
    let ics = "ok";
    try { x("planIcs(PLANUNG[0])"); } catch (e) { ics = String(e.message || e); }
    return { reihenfolge: !!k, zeiten, meldungA, meldungB, ics };
  });
  const spaet = r03.zeiten.filter(([, b, e]) => b > "23:59" || e > "23:59" || b > e).map((z) => z.join(" "));
  if (!r03.reihenfolge || spaet.length || !/Mitternacht/.test(r03.meldungA) || !/Mitternacht/.test(r03.meldungB) || r03.ics !== "ok")
    fehl.push("TT-KAL-03 Uhrzeit nach 24:00 bzw. Ende vor Beginn: " + JSON.stringify({ spaet, meldungA: r03.meldungA, meldungB: r03.meldungB, ics: r03.ics, reihenfolge: r03.reihenfolge }));
  /* TT-KAL-04: ohne Netz – „Reihenfolge übernehmen“ und „mit einplanen“ melden es sichtbar, kein unbehandelter Fehler */
  const r04 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const tag = tt.tag2(), erg = {};
    x("STARTPUNKTE={}");
    const z = (titel, sid, b, e, kat) => ({ kategorie: kat || "besprechung", titel, datum: tag, beginn: b, ende: e, standort_id: sid });
    await tt.termine([z("Innsbruck", "TS3", "08:00", "09:00"), z("Wien", "TS1", "10:00", "11:00", "wartung"), z("West", "TS4", "12:00", "13:00")]);
    /* netz „antwort“: die Datenbank lehnt ab ({error}) – dann keine Erfolgsmeldung */
    for (const [name, re, zeile, netz] of [["Reihenfolge übernehmen", /Reihenfolge übernehmen/], ["mit einplanen", /mit einplanen/, /Testfiliale 901/], ["abgelehnt", /Reihenfolge übernehmen/, null, "antwort"]]) {
      x("ansichtenSchliessen()"); tt.toasts.length = 0;
      const k = tt.knopf(await tt.pruefen(tag), re, zeile);
      if (!k) { erg[name] = "Knopf fehlt"; continue; }
      const f0 = window.__fehler.length;
      window.__netzWeg = netz || true; k.click(); await tt.warte(400); window.__netzWeg = false;
      const unbeh = window.__fehler.slice(f0).filter((y) => y.startsWith("promise"));
      if (!(netz ? /^Nicht/ : /Verbindung/).test(tt.toasts.join(" ")) || unbeh.length) erg[name] = { toasts: tt.toasts.slice(), unbehandelt: unbeh };
    }
    return erg;
  });
  if (Object.keys(r04).length) fehl.push("TT-KAL-04 ohne Netz keine Meldung bzw. unbehandelter Fehler: " + JSON.stringify(r04));
  /* TT-KAL-05: Einzelne Tage herausnehmen (Mitte) – reißt die Verbindung beim zweiten Schritt ab: ganz oder gar nicht, sonst ehrlich „nur zum Teil“ */
  const r05 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, h = (n) => x("plusTage(isoLokal(new Date())," + n + ")"), erg = {};
    const teile = (l) => l.filter((p) => p.titel === "Krank TV").map((p) => p.datum + ".." + (p.datum_bis || p.datum)).sort().join(" ");
    for (const modus of ["einmal", "weg"]) {
      tt.leeren();
      await tt.termine([{ kategorie: "krank", titel: "Krank TV", datum: h(14), datum_bis: h(18) }]);
      x("planEditor(PLANUNG.filter(function(e){ return e.titel==='Krank TV'; })[0])"); await tt.warte(200);
      const karte = [...tt.dialog().querySelectorAll(".card")].find((c) => /Einzelne Tage herausnehmen/.test(c.textContent));
      if (!karte) return { fehler: "Karte „Einzelne Tage herausnehmen“ fehlt" };
      karte.querySelector("input[type=date]").value = h(16);
      /* das Kürzen klappt, beim Anlegen des zweiten Teils reißt die Verbindung ab – „einmal“: gleich danach ist sie wieder da */
      const sb = x("Store.sb"), alt = sb.from;
      sb.from = function (t) { if (modus === "einmal" && window.__netzWeg) window.__netzWeg = false;
        const q = alt.call(this, t); if (t === "planung") { const ins = q.insert; q.insert = function () { window.__netzWeg = true; return ins.apply(q, arguments); }; } return q; };
      const knopf = [...karte.querySelectorAll("button")].find((b) => /Tag herausnehmen/.test(b.textContent));
      tt.toasts.length = 0; knopf.click(); await tt.warte(400);
      sb.from = alt; window.__netzWeg = false;
      erg[modus] = { db: teile(db.planung), lokal: teile(x("PLANUNG")), toast: tt.toasts.join(" ") };
      /* nochmals tippen, die Verbindung ist wieder da: fertig */
      if (modus === "weg" && !knopf.disabled) { knopf.click(); await tt.warte(400); erg.nochmals = teile(db.planung); }
    }
    erg.vorher = h(14) + ".." + h(18); erg.halb = h(14) + ".." + h(15); erg.fertig = h(14) + ".." + h(15) + " " + h(17) + ".." + h(18);
    return erg;
  });
  if (r05.fehler || r05.einmal.db !== r05.vorher || !/^Nicht geändert/.test(r05.einmal.toast) || r05.weg.db !== r05.halb || r05.weg.lokal !== r05.halb || !/nur zum Teil/.test(r05.weg.toast) || r05.nochmals !== r05.fertig)
    fehl.push("TT-KAL-05 Tag herausnehmen halb gespeichert bzw. Meldung falsch: " + JSON.stringify(r05));
  /* TT-KAL-07: eine längst vergangene Einplanung (vor einem Jahr) verdeckt die fällige Wartung am selben Markt nicht */
  const r07 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const tag = tt.tag2(), alt = x("plusTage(isoLokal(new Date()),-375)");
    const offen = () => x("planungPruefen('ich','" + tag + "','" + tag + "')[0].amMarkt.map(function(a){ return a.p ? a.p.id : a.art; })");
    await tt.termine([{ kategorie: "wartung", titel: "Wartung TS1", datum: tag, beginn: "08:00", ende: "10:00", standort_id: "TS1" }]);
    const vorher = offen();
    await tt.termine([{ kategorie: "wartung", titel: "Alte Einplanung", datum: alt, standort_id: "TS1", position_ids: ["TP1"] }]);
    return { vorher, nachher: offen(), eingeplant: !!x("planFuerPosition('TP1')"), status: x("posById.TP1.status") };
  });
  if (!r07.vorher.includes("TP1") || r07.eingeplant || !r07.nachher.includes("TP1")) fehl.push("TT-KAL-07 fällige Wartung trotz alter Einplanung übersehen: " + JSON.stringify(r07));
  /* TT-KAL-08: Krankenstand ohne eingetragene Person („gilt als deins“) zählt auch für Tour, Auslastung und Doppelbuchung */
  const r08 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren(); const t7 = x("werktagAb(plusTage(isoLokal(new Date()),7))");
    await tt.termine([{ kategorie: "krank", titel: "Krank ohne wer", datum: t7, datum_bis: x("plusTage('" + t7 + "',1)"), wer: [], wer_namen: [] }]);
    return { t7, abwesenheitAm: x("abwesenheitAm('" + t7 + "').length"), tourAbwesend: x("tourAbwesend(meineKennung(), '" + t7 + "')"),
      tourTag: x("tourTagFrei(meineKennung(), '" + t7 + "')"), doppelt: x("verplantPruefen([meineKennung()], [meinName()], '" + t7 + "', '" + t7 + "', 600, 660).length") };
  });
  if (r08.abwesenheitAm !== 1 || !r08.tourAbwesend || r08.tourTag === r08.t7 || !r08.doppelt) fehl.push("TT-KAL-08 Krankenstand ohne „Wer“ zählt nicht für Tour/Doppelbuchung: " + JSON.stringify(r08));
  /* TT-KAL-15: Techniker speichert seinen Startpunkt (Nachbildung wie tools/startpunkte.sql); nicht gespeichert = gilt auch nicht */
  const r15 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const ich = tt.ich(), tag = tt.tag2();
    x("STARTPUNKTE={}");
    const waehlen = async () => { x("startpunktWaehlen('ich', '" + tag + "')"); await tt.warte(150); const d = tt.dialog(); tt.knopf(d, /Betrieb/).click(); await tt.warte(300); return d; };
    window.__netzWeg = true; const d1 = await waehlen(); window.__netzWeg = false;
    const ohneNetz = { gilt: JSON.stringify(x("STARTPUNKTE[meineKennung()]") || null), toast: tt.toasts.slice(-1)[0] || "" };
    d1.remove(); x("ansichtenSchliessen()");
    const d2 = await waehlen();
    return { ohneNetz, toast: tt.toasts.slice(-1)[0] || "", gespeichert: db.einstellungen.some((e) => e.schluessel === "startpunkt:" + ich), offen: document.body.contains(d2) };
  });
  if (!r15.gespeichert || r15.offen || r15.ohneNetz.gilt !== "null") fehl.push("TT-KAL-15 Startpunkt nicht gespeichert bzw. gilt trotz Fehler: " + JSON.stringify(r15));
  /* TT-10: halber Tag Zeitausgleich mit Uhrzeit – die Frage nennt die eingetragenen Stunden, nicht „das Tagessoll“ (ob überhaupt gefragt wird, entscheidet das Büro) */
  const rT10 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    await tt.termine([{ kategorie: "zeitausgleich", titel: "Zeitausgleich", datum: T, beginn: "12:00", ende: "15:30" }]);
    const za = db.arbeitszeiten.filter((z) => z.datum === T && z.art === "zeitausgleich").map((z) => z.minuten).join();
    x("abwesenheitPruefen('" + T + "', function(){})"); await tt.warte(150);
    const d = tt.dialog(), frage = d ? d.innerText.replace(/\s+/g, " ") : "";
    return { za, frage: frage.slice(0, 260) };
  });
  if (rT10.za !== "210" || /Tagessoll/.test(rT10.frage) || !/3:30 h/.test(rT10.frage)) fehl.push("TT-10 Frage nennt nicht die eingetragenen Stunden: " + JSON.stringify(rT10));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest kalender: Tour – Teilerfolg ehrlich gemeldet, Störung nie doppelt, Handanpassung nur mit Rückfrage, Route wartet höchstens die Frist", async () => {
  const fehl = [];
  const a = await tkOeffnen(KONTEN.inhaber);
  /* TT-KAL-06: Tour → „In meinen Kalender“: Anlegen klappt, danach (Termin der Aufgabe verschieben) reißt die Verbindung ab */
  const r06 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    await x("stoerungSpeichern({_id:'stk1', standortId:'TS2', auftragsnummer:'T-K1', erfasstAm:new Date().toISOString(), status:'offen'}, 'Test')");
    const auf = await tt.termin({ art: "aufgabe", kategorie: "sonstiges", titel: "Aufgabe TS1", standort_id: "TS1" }); await tt.laden();
    window.__T = { tage: [{ nr: 1, stopps: [
      { standort: x("byId.TS1"), positionen: [{ id: "plan:" + auf.id, anlagentyp: "Aufgabe" }], fahrtH: 0.5, arbeitH: 1 },
      { standort: x("byId.TS2"), positionen: [{ id: "stoer:stk1", anlagentyp: "Störung" }], fahrtH: 0.5, arbeitH: 1 }] }], anzahlStopps: 2, kmGesamt: 40, stundenProTag: 8 };
    const schicken = async (netzWegBeimVerschieben) => {
      x("tourSchicken(window.__T)"); await tt.warte(300);
      const d = tt.dialog(); tt.knopf(d, /^Ich/).click(); await tt.warte(50);
      const sb = x("Store.sb"), alt = sb.from;
      if (netzWegBeimVerschieben) sb.from = function (t) { const q = alt.call(this, t); if (t === "planung") { const up = q.update; q.update = function () { window.__netzWeg = true; return up.apply(q, arguments); }; } return q; };
      const knopf = tt.ok(d); tt.toasts.length = 0; knopf.click(); await tt.warte(500);
      sb.from = alt; window.__netzWeg = false;
      const meldung = (document.body.contains(d) ? d.querySelector("[data-a=fehler]").textContent + " " : "") + tt.toasts.join(" ");
      /* nochmals tippen, falls der Knopf wieder frei ist */
      if (document.body.contains(d) && !knopf.disabled) { knopf.click(); await tt.warte(500); }
      x("ansichtenSchliessen()");
      return { meldung, stoerung: db.planung.filter((p) => p.stoerung_id === "stk1").length };
    };
    const erst = await schicken(true), nochmal = await schicken(false);
    return { erst, nochmal, aufgabe: tt.zeit("Aufgabe TS1"), stoerZeit: db.planung.filter((p) => p.stoerung_id === "stk1").map((p) => p.datum + " " + p.beginn) };
  });
  if (r06.erst.stoerung !== 1 || !/1 Termin.*nicht/.test(r06.erst.meldung) || /nichts gespeichert/.test(r06.erst.meldung) || r06.nochmal.stoerung !== 1)
    fehl.push("TT-KAL-06 Teilerfolg nicht ehrlich gemeldet bzw. Störung doppelt im Kalender: " + JSON.stringify(r06));
  /* TT-KAL-09: Tour von Hand angepasst (✕) – ein Auswahl-Chip verwirft das nur nach Rückfrage; ein Chip, der nichts ändert, verwirft nichts */
  const r09 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren();
    x("S.view='karte'; S.tour.startId='__betrieb'; S.tour.ergebnis=null; S.tour.manuell=null; render()"); await tt.warte(200);
    document.querySelector("#t_go").click();
    for (let i = 0; i < 40 && !x("S.tour.ergebnis"); i++) await tt.warte(100);
    const weg = document.querySelector("[data-tourweg]"); if (!weg) return { fehler: "kein ✕ in der Route" };
    weg.click();
    for (let i = 0; i < 40 && !(x("S.tour.manuell") && !document.querySelector("[data-tourweg='" + weg.dataset.tourweg + "']")); i++) await tt.warte(100);
    const manuell = JSON.stringify(x("S.tour.manuell")), fragen = () => window.__dialoge.filter((y) => y[0] === "confirm").length, erg = { manuell };
    /* (a) „ganz Österreich“ ist schon gewählt – nichts ändert sich */
    let f0 = fragen(); document.querySelector("#t_land .chip[data-l=__alle]").click(); await tt.warte(100);
    erg.gleich = { gefragt: fragen() - f0, manuell: JSON.stringify(x("S.tour.manuell")) };
    /* (b) anderer Chip, Rückfrage abgelehnt – die Anpassung bleibt; (c) bestätigt – sie entfällt */
    for (const [fall, antwort] of [["nein", false], ["ja", true]]) {
      window.__antwort.confirm = antwort; f0 = fragen();
      document.querySelector("#t_folge").click(); await tt.warte(100);
      window.__antwort.confirm = true;
      erg[fall] = { gefragt: fragen() - f0, manuell: JSON.stringify(x("S.tour.manuell")), folge: x("S.tour.naechsterMonat") };
    }
    x("S.tour.naechsterMonat=false; S.tour.ergebnis=null; S.tour.manuell=null; S.tour.dazu=null");
    return erg;
  });
  if (r09.fehler || r09.manuell === "null" || r09.gleich.gefragt || r09.gleich.manuell !== r09.manuell || r09.nein.gefragt !== 1 || r09.nein.manuell !== r09.manuell || r09.nein.folge || r09.ja.manuell !== "null" || !r09.ja.folge)
    fehl.push("TT-KAL-09 Handanpassung ohne Rückfrage verworfen: " + JSON.stringify(r09));
  /* TT-KAL-01: „Route vorschlagen“, der Straßendienst antwortet nicht – der Knopf wartet höchstens die Frist (im Test 3 s statt 15 s),
     nicht je Dienst nacheinander; die Linie kommt im Hintergrund; der Knopf sagt, was gerade passiert */
  const r01 = {};
  for (const fall of ["beide Dienste hängen", "Matrix vom Ersatzdienst, Linie hängt"]) {
    const haengen = (rt) => {
      const u = new URL(rt.request().url());
      if (fall !== "beide Dienste hängen" && u.hostname === "router.project-osrm.org" && u.pathname.startsWith("/table/")) {
        const n = decodeURIComponent(u.pathname).split("/").pop().split(";").length;
        const m = (w) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : w)));
        return rt.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }, body: JSON.stringify({ code: "Ok", durations: m(3600), distances: m(80000) }) });
      }
      /* sonst: Verbindung angenommen, nie eine Antwort */
    };
    const passt = (u) => ["routing.openstreetmap.de", "router.project-osrm.org"].includes(u.hostname);
    await a.seite.route(passt, haengen);
    r01[fall] = await a.seite.evaluate(async () => {
      const tt = window.__tt, x = window.__t.x; tt.leeren();
      x("if(typeof ROUTER_FRIST!=='undefined'){ ROUTER_FRIST=3000; routerLangsam={}; } routerBasis=null; S.view='karte'; S.tour.startId='__betrieb'; S.tour.ergebnis=null; S.tour.manuell=null; S.tour.dazu=null; render()"); await tt.warte(200);
      document.querySelector("#t_go").click();
      const t0 = Date.now(), texte = new Set(); let frei = null;
      while (Date.now() - t0 < 8000) {
        await tt.warte(100);
        const b = document.querySelector("#t_go");
        if (b) texte.add(b.textContent.trim());
        if (b && !b.disabled) { frei = Date.now() - t0; break; }
      }
      return { frei, texte: [...texte], echteStrasse: !!(x("S.tour.ergebnis") || {}).echteStrasse };
    });
    await a.seite.unroute(passt, haengen);
  }
  const b01 = r01["beide Dienste hängen"], m01 = r01["Matrix vom Ersatzdienst, Linie hängt"];
  if (b01.frei == null || b01.frei > 4000 || !b01.texte.some((t) => /antwortet nicht/.test(t)) || m01.frei == null || m01.frei > 2500 || !m01.echteStrasse)
    fehl.push("TT-KAL-01 Route vorschlagen hängt: " + JSON.stringify(r01));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest kalender: Präsentation – Reihenfolge übernehmen, mit einplanen und Tag beenden schicken nichts an die Datenbank", async () => {
  const a = await tkOeffnen(KONTEN.praesentation);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x; tt.leeren();
    const ich = tt.ich(), tag = tt.tag2(), h = (n) => x("plusTage(isoLokal(new Date())," + n + ")");
    const sb = x("Store.sb"), alt = sb.from, schreib = [];
    sb.from = function (t) { const q = alt.call(this, t); ["insert", "update", "delete", "upsert"].forEach((m) => { const o = q[m]; q[m] = function () { schreib.push(t + "." + m); return o.apply(q, arguments); }; }); return q; };
    /* nur im Speicher, wie sie der Termin-Editor in der Präsentation anlegt */
    const e = (id, kategorie, titel, sid, b, en) => ({ id, art: "termin", kategorie, titel, datum: tag, beginn: b, ende: en, standort_id: sid, wer: [ich], wer_namen: ["P"], status: "offen", erstellt_von: ich, position_ids: [] });
    x("PLANUNG").push(e("pl_d1", "besprechung", "Innsbruck", "TS3", "08:00", "09:00"), e("pl_d2", "wartung", "Wien", "TS1", "10:00", "11:00"), e("pl_d3", "besprechung", "West", "TS4", "12:00", "13:00"),
      { id: "pl_d4", art: "termin", kategorie: "krank", titel: "Krank", datum: h(14), datum_bis: h(18), wer: [ich], wer_namen: ["P"], status: "offen", erstellt_von: ich, ausnahmen: {} });
    const erg = {};
    for (const [name, re, zeile] of [["Reihenfolge übernehmen", /Reihenfolge übernehmen/], ["mit einplanen", /mit einplanen/, /Testfiliale 901/]]) {
      x("ansichtenSchliessen()");
      const k = tt.knopf(await tt.pruefen(tag), re, zeile), s0 = schreib.length;
      if (k) { k.click(); await tt.warte(300); }
      erg[name] = k ? schreib.slice(s0) : "Knopf fehlt";
    }
    erg.imSpeicher = x("PLANUNG").filter((p) => p.id === "pl_d2").map((p) => p.beginn + " " + (p.position_ids || []).join())[0];
    x("ansichtenSchliessen()");
    x("abwesenheitPruefen('" + h(16) + "', function(){})"); await tt.warte(200);
    const k2 = tt.knopf(tt.dialog(), /für diesen Tag beenden/), s1 = schreib.length;
    if (k2) { k2.click(); await tt.warte(300); }
    erg["Tag beenden"] = k2 ? schreib.slice(s1) : "Knopf fehlt";
    sb.from = alt;
    return erg;
  });
  const fehl = [];
  const raus = Object.entries(r).filter(([k, v]) => k !== "imSpeicher" && (typeof v === "string" || v.length)).map(([k, v]) => k + ": " + v);
  if (raus.length) fehl.push("TT-KAL-13 Präsentation schickt Schreibanfragen: " + raus.join(" | "));
  if (!/TP1/.test(r.imSpeicher || "")) fehl.push("TT-KAL-13 Präsentation: im Speicher nicht mit eingeplant: " + JSON.stringify(r));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tiefentest kalender: Woche zeigt den Startpunkt wie der Rundgang; Rundgänge am Handy quer; Handbuch vollständig", async () => {
  const fehl = [];
  /* TT-KAL-10: Woche (Zeitraster) bei gewählter Person: „🚗 Start …“ bzw. „Startpunkt unbekannt“ – am PC 7 Tage, am Handy 3 und 7 Tage */
  for (const handy of [false, true]) {
    const a = await tkOeffnen(KONTEN.techniker, { handy });
    const r = await a.seite.evaluate(async (handy) => {
      const tt = window.__tt, x = window.__t.x; tt.leeren(); const heute = x("isoLokal(new Date())"), o = {};
      await tt.termine([{ kategorie: "wartung", titel: "Einsatz TS3", datum: heute, beginn: "09:00", ende: "10:00", standort_id: "TS3" }]);
      for (const [modus, wa] of handy ? [["woche", "3"], ["woche", "7"], ["tag", ""]] : [["woche", "7"], ["tag", ""]]) {
        x("S.view='kalender'; S.kalWer='ich'; S.kalModus='" + modus + "'; S.kTag=isoLokal(new Date()); S.kalWoche=montagVon(isoLokal(new Date())); S.kalAb=isoLokal(new Date()); S.kalWocheArt='" + (wa || "3") + "'; render()");
        await tt.warte(150);
        o[modus + (wa ? " " + wa + " Tage" : "")] = /🚗 Start|Startpunkt unbekannt/.test(document.getElementById("kal_karte").innerText);
      }
      return o;
    }, handy);
    Object.entries(r).forEach(([k, v]) => { if (!v) fehl.push("TT-KAL-10 Startpunkt-Zeile fehlt: " + (handy ? "Handy " : "PC ") + k); });
    /* TT-KAL-12: Rundgang „Termin anlegen“ nennt alle Terminarten; Handbuch nennt Zeitausgleich und „Abwesenheit und Arbeit am selben Tag“ */
    if (!handy) {
      const d = await a.seite.evaluate(() => {
        const x = window.__t.x;
        const rg = x("RUNDGAENGE.kalender.schritte.filter(function(s){ return s.titel==='Termin anlegen'; })[0].text");
        const text = x("handbuchKarte(handbuchZahlen())").textContent, ab11 = (text.split("11 · Kalender")[1] || "").split("12 · ")[0];
        return { fehltImRundgang: x("PLAN_KAT.map(function(k){ return k[1]; })").filter((k) => !rg.includes(k.split(" ")[0])), zeitausgleich: ab11.includes("Zeitausgleich"),
          abwesenheitUndArbeit: /eingesprungen/.test(ab11) && /Urlaubstag zurückgeben/.test(ab11) && /herausnehmen/.test(ab11), laenge: text.length };
      });
      if (d.laenge < 1000 || d.fehltImRundgang.length || !d.zeitausgleich || !d.abwesenheitUndArbeit) fehl.push("TT-KAL-12 Handbuch/Rundgang unvollständig: " + JSON.stringify(d));
    }
    if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
    await a.zu();
  }
  /* TT-KAL-11: Rundgang am Handy im Querformat (844×390) – die gezeigte Stelle (obere 40 px) ist nie von der Erklärung verdeckt */
  {
    const a = await oeffnen(KONTEN.techniker, { handy: true });
    await a.seite.setViewportSize({ width: 844, height: 390 });
    await a.seite.waitForTimeout(300);
    const r = await a.seite.evaluate(async () => {
      const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), fehler = [];
      x("rundgangStarten('techniker')"); await warte(300);
      let n = 0;
      for (let i = 0; i < 40; i++) {
        await warte(900);
        const R = x("RUNDGANG"); if (!R) break; n++;
        const titel = R.schritte[R.i].titel, z = R.el, k = document.querySelector("#rundgang .rg-karte").getBoundingClientRect();
        const w = document.querySelector("#rundgang [data-rg=weiter]").getBoundingClientRect();
        if (w.bottom > innerHeight + 1 || w.top < 0) fehler.push(titel + ": Knöpfe außerhalb");
        if (z && document.body.contains(z)) {
          const t = z.getBoundingClientRect(), seg = Math.min(t.height, 40);
          if (t.width > 2 && t.top >= -1 && t.top + seg <= innerHeight + 1 && !(t.top + seg <= k.top + 1 || t.top >= k.bottom - 1))
            fehler.push(titel + " (Ziel " + Math.round(t.top) + "–" + Math.round(t.top + seg) + ", Karte " + Math.round(k.top) + "–" + Math.round(k.bottom) + ")");
        }
        document.querySelector("#rundgang [data-rg=weiter]").click();
      }
      x("rundgangEnde()");
      return { n, fehler };
    });
    if (r.n < 5 || r.fehler.length) fehl.push("TT-KAL-11 Rundgang quer: " + r.fehler.length + " von " + r.n + " Schritten verdeckt: " + r.fehler.join("; "));
    if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
    await a.zu();
  }
  pruefe(!fehl.length, fehl.join(" | "));
});

/* ---- Tiefentest Werkzeug und Material (Prüflauf 05.10.2026): je Test werden alle Abweichungen gesammelt und zusammen gemeldet ---- */
test("Tiefentest werkzeug: Erinnerung und Hinweise – Projekttermin, mehrtägig, eigenes Auto, Störung, Neuladen im Kalender", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, f = [], soll = (bed, text) => { if (!bed) f.push(text); };
    const dlg = () => [...document.querySelectorAll(".assistent")].pop(), app = () => document.getElementById("app").innerText;
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), gestern = x("plusTage(isoLokal(new Date()),-1)"), morgen = x("plusTage(isoLokal(new Date()),1)");
    const neuTermin = async (z) => (await x("Store.sb.from('planung').insert(" + JSON.stringify(Object.assign({ art: "termin", wer: [ich], wer_namen: ["Testtechniker"] }, z)) + ").select('*')")).data[0];
    const neuBedarf = async (z) => (await x("Store.sb.from('bedarf').insert(" + JSON.stringify(Object.assign({ status: "offen", beschaffung: "mitnehmen" }, z)) + ").select('*')")).data[0];
    const bd = (id) => "BEDARF.filter(function(b){ return b.id==='" + id + "'; })[0]";
    db.fahrzeuge.push({ id: "FZTV4", kennzeichen: "T-TV 4", fahrer: [ich], fahrer_namen: ["Testtechniker"], aktiv: true }, { id: "FZF5", kennzeichen: "T-FREMD 5", fahrer: ["u_admin_test_at"], aktiv: true });
    db.werkzeug.push({ id: "WTV4", name: "Vakuumpumpe TV4", standort_art: "fahrzeug", fahrzeug_id: "FZTV4", fahrzeug_name: "T-TV 4", zustand: "ok", aktiv: true },
      { id: "WTV5", name: "Bördelgerät TV5", standort_art: "fahrzeug", fahrzeug_id: "FZF5", fahrzeug_name: "T-FREMD 5", zustand: "ok", aktiv: true });
    /* Attrappe wie fahrzeuge.sql: Techniker lesen nur ihr eigenes Fahrzeug */
    const fremdeFz = ((await x("Store.sb.from('fahrzeuge').select('*')")).data || []).map((z) => z.id).filter((id) => id !== "FZTV4");
    soll(!fremdeFz.length, "Attrappe: Techniker liest fremdes Fahrzeug " + JSON.stringify(fremdeFz));
    /* Projekt-Bedarf ohne Person, Projekttermin morgen mit mir */
    db.projekte.push({ id: "PTV2", nummer: "P-TV-2", titel: "Baustelle TV2", status: "baustelle", daten: {}, verlauf: [], erstellt: new Date().toISOString(), geaendert: new Date().toISOString() });
    await x("projekteLaden()");
    await neuTermin({ kategorie: "baustelle", titel: "Montage TV2", datum: morgen, beginn: "07:00", ende: "15:00", projekt_id: "PTV2" });
    db.bedarf.push({ id: "BTV2", art: "material", text: "Kondensatpumpe TV2", projekt_id: "PTV2", beschaffung: "abholen", bezugsquelle: "Großhandel", status: "offen", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString() });
    /* Werkzeug im eigenen Auto, Termin heute */
    const t4 = await neuTermin({ kategorie: "wartung", titel: "Wartung TV4", datum: heute, beginn: "10:00", ende: "12:00", standort_id: "TS1" });
    await neuBedarf({ art: "werkzeug", text: "Vakuumpumpe TV4", werkzeug_id: "WTV4", planung_id: t4.id, standort_id: "TS1" });
    /* mehrtägig gestern bis morgen, Werkzeug im fremden Auto */
    const t5 = await neuTermin({ kategorie: "baustelle", titel: "Montage TV5", datum: gestern, datum_bis: morgen, standort_id: "TS1" });
    const b5 = await neuBedarf({ art: "werkzeug", text: "Bördelgerät TV5", werkzeug_id: "WTV5", planung_id: t5.id, standort_id: "TS1" });
    /* Störung heute für mich, Werkzeug im fremden Auto */
    db.bedarf.push({ id: "BTV24S", art: "werkzeug", text: "Bördelgerät TV5", werkzeug_id: "WTV5", stoerung_id: "STV24", standort_id: "TS1", status: "offen", beschaffung: "mitnehmen" });
    x("planungStand=0; planungNachladen()"); await warte(500);
    x("FZ=[]; fzGeladen=false; 1");   /* Fahrzeuge noch nicht geladen – Fällig lädt sie nicht */
    await x("wzLaden(true)");
    x("OFFENE.push({_id:'STV24', standortId:'TS1', termin:'" + heute + "', terminTechniker:meinName(), erledigt:false}); 1");
    const wer2 = x("JSON.stringify(bedarfWer(" + bd("BTV2") + "))");
    soll(x("bedarfWann(" + bd("BTV2") + ")") === morgen && x("bedarfIstMeins(" + bd("BTV2") + ")"), "Projekt-Bedarf: Techniker des Projekttermins nicht erkannt " + wer2);
    const st = JSON.parse(x("JSON.stringify(bedarfWerkzeugInfo(" + bd("BTV24S") + "))"));
    soll(st && st.warnen, "Störung: Werkzeug im fremden Auto nur 📍 statt ⚠ " + JSON.stringify(st));
    x("OFFENE=OFFENE.filter(function(o){ return o._id!=='STV24'; }); 1");
    const gruppe5 = x("bedarfGruppen([" + bd(b5.id) + "]).map(function(g){ return g[0]; }).join()");
    soll(!/vorbei/.test(gruppe5), "mehrtägiger Termin gilt am 2. Tag als vorbei: " + gruppe5);
    soll(!x("wzNachfragen().some(function(b){ return b.werkzeug_id==='WTV5'; })"), "Nachfrage „wo ist das Werkzeug jetzt?“ mitten im mehrtägigen Einsatz");
    x("ansichtenSchliessen(); S.view='faellig'; render()"); await warte(800);
    const faellig = app();
    soll(/Kondensatpumpe TV2/.test(faellig), "„Heute für dich“ erinnert den Techniker des Projekttermins nicht");
    soll(/Bördelgerät TV5/.test(faellig) && !/wo ist das Werkzeug jetzt/i.test(faellig), "„Heute für dich“: mehrtägiger Einsatz falsch (fehlt oder „wo ist das Werkzeug jetzt?“)");
    soll(!/⚠ Fahrzeug T-TV 4/.test(faellig), "⚠ für Werkzeug im eigenen Auto, solange die Fahrzeuge nicht geladen sind");
    x("wzAufnehmenFragen({text:'Etwas TV4'})"); await warte(300);
    const knoepfe4 = [...dlg().querySelectorAll("button")].map((b) => b.textContent).join(" | ");
    soll(/in meinem Auto/.test(knoepfe4), "„Ja – in meinem Auto“ fehlt: " + knoepfe4);
    x("ansichtenSchliessen(); S.bdAlle=false; S.view='werkzeug'; render()"); await warte(600);
    soll(/Kondensatpumpe TV2/.test(app()), "Werkzeug „Meine“ zeigt den Projekt-Bedarf nicht");
    /* Bedarf heute – danach im Kalender neu laden */
    const t3 = await neuTermin({ kategorie: "wartung", titel: "Wartung TV3", datum: heute, beginn: "09:00", ende: "10:00", standort_id: "TS1" });
    await neuBedarf({ art: "material", text: "Kondensatpumpe TV3", planung_id: t3.id, standort_id: "TS1", beschaffung: "abholen", bezugsquelle: "Großhandel" });
    x("S.view='kalender'; render()"); await warte(300);
    sessionStorage.setItem("ukt_ansicht", JSON.stringify({ view: "kalender", tab: "", region: "alle" }));
    return { f, heute };
  });
  await a.seite.reload({ waitUntil: "load" });
  await a.seite.waitForFunction(() => !!window.__t, null, { timeout: 30000 });
  await a.seite.evaluate((m) => window.__t.x(`Store.sb.auth.signInWithPassword({email:'${m}',password:'test123'})`), KONTEN.techniker);
  await a.seite.waitForFunction(() => window.__t.x("Rolle.da && Store.modus==='supabase'"), null, { timeout: 15000 });
  await a.seite.waitForFunction(() => window.__t.x("wzGeladen && planungGeladen"), null, { timeout: 4000 }).catch(() => {});
  const r2 = await a.seite.evaluate(async (heute) => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), f = [], soll = (bed, text) => { if (!bed) f.push(text); };
    const zeile = x("(kalenderEintraege('" + heute + "','" + heute + "','ich')['" + heute + "']||[]).map(function(y){ return kalEintragZeile(y,true).textContent; }).join(' | ')");
    const material = x("planungPruefen('ich','" + heute + "','" + heute + "').map(function(t){ return t.material.map(function(b){ return b.text; }).join(','); }).join('|')");
    soll(x("S.view") === "kalender", "Kalender nach dem Neuladen nicht wiederhergestellt");
    soll(/Kondensatpumpe TV3/.test(zeile) && /Kondensatpumpe TV3/.test(material), "nach dem Neuladen im Kalender: 🧰 bzw. „Vorher besorgen“ fehlt: " + JSON.stringify({ geladen: x("wzGeladen"), zeile, material }));
    /* „Planung prüfen“ lädt Werkzeug und Material selbst */
    x("BEDARF=[]; wzGeladen=false; 1");
    x("planungPruefenAnsicht('ich','" + heute + "','" + heute + "')"); await warte(800);
    const d = [...document.querySelectorAll(".assistent")].pop();
    soll(d && /Kondensatpumpe TV3/.test(d.innerText), "„Planung prüfen“ ohne geladenes Material: „Vorher besorgen“ fehlt");
    x("ansichtenSchliessen()");
    return f;
  }, r.heute);
  const alle = r.f.concat(r2);
  pruefe(!alle.length, alle.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest werkzeug: privater Termin, Störung fürs Büro, verliehen überfällig, Lernen ohne 1000er-Grenze, Attrappe wie die Datenbank", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const daten = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop(), kopie = (o) => JSON.parse(JSON.stringify(o));
    const ich = x("meineKennung()"), morgen = x("plusTage(isoLokal(new Date()),1)"), uebermorgen = x("plusTage(isoLokal(new Date()),2)");
    const neuTermin = async (z) => (await x("Store.sb.from('planung').insert(" + JSON.stringify(Object.assign({ art: "termin", kategorie: "sonstiges", wer: [ich], wer_namen: ["Testtechniker"] }, z)) + ").select('*')")).data[0];
    const tA = await neuTermin({ titel: "Arzt TV01", datum: morgen, beginn: "08:00", ende: "09:00", standort_id: "TS1" });
    const tB = await neuTermin({ titel: "Termin TV01B", datum: uebermorgen, beginn: "10:00", ende: "11:00" });
    x("planungStand=0; planungNachladen()"); await warte(500); await x("wzLaden(true)");
    const oeffne = async (t) => { x("ansichtenSchliessen(); planEditor(PLANUNG.filter(function(e){ return e.id==='" + t.id + "'; })[0])"); await warte(500); return dlg(); };
    const eintragen = async (t, text) => {
      let d = await oeffne(t);
      [...d.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Material \/ Werkzeug/.test(b.textContent)).click(); await warte(300);
      d = dlg(); d.querySelector('[data-f="text"]').value = text;
      [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(600);
    };
    const privatSpeichern = async (t, antwort) => {
      const d = await oeffne(t);
      const cb = d.querySelector('[data-f="privat"]'); cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); await warte(150);
      const vorher = window.__dialoge.length; window.__antwort.confirm = antwort;
      [...d.querySelectorAll(".as-fuss button")].find((b) => /Speichern/.test(b.textContent)).click(); await warte(1000);
      window.__antwort.confirm = true;
      return window.__dialoge.slice(vorher).map((z) => z[1]).join(" | ");
    };
    await eintragen(tA, "Überweisung Kardiologie TV01");
    await eintragen(tB, "Rezept TV01B");
    const frageA = await privatSpeichern(tA, false);
    const frageB = await privatSpeichern(tB, true);
    x("ansichtenSchliessen()");
    return { planung: kopie(db.planung.filter((p) => p.id === tA.id)), bedarf: kopie(db.bedarf.filter((b) => b.planung_id === tA.id)), frageA, frageB,
      bleibtB: db.bedarf.filter((b) => b.planung_id === tB.id).map((b) => b.text), morgen };
  });
  pruefe(!a.fehler.length, "Laufzeitfehler (Techniker): " + a.fehler.join("; "));
  await a.zu();
  const f = [], soll = (bed, text) => { if (!bed) f.push(text); };
  soll(daten.planung.length === 1 && daten.planung[0].privat && daten.planung[0].titel === "Abwesend" && daten.bedarf.length === 1, "Ausgangslage falsch: " + JSON.stringify(daten));
  soll(/Material/.test(daten.frageA) && /Material/.test(daten.frageB) && !daten.bleibtB.length, "nachträglich privat: keine Frage bzw. Material nicht gelöscht " + JSON.stringify({ frageA: daten.frageA, frageB: daten.frageB, bleibtB: daten.bleibtB }));
  const b = await oeffnen(KONTEN.inhaber);
  const r = await b.seite.evaluate(async (d) => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, f = [], soll = (bed, text) => { if (!bed) f.push(text); };
    const app = () => document.getElementById("app").innerText, bd = (id) => "BEDARF.filter(function(b){ return b.id==='" + id + "'; })[0]";
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), vorgestern = x("plusTage(isoLokal(new Date()),-2)");
    db.planung.push(...d.planung); db.bedarf.push(...d.bedarf);
    db.fahrzeuge.push({ id: "FZI24", kennzeichen: "T-CHEF 24", fahrer: [ich], aktiv: true });
    db.werkzeug.push({ id: "WTV24B", name: "Pumpe TV24B", standort_art: "fahrzeug", fahrzeug_id: "FZI24", fahrzeug_name: "T-CHEF 24", zustand: "ok", aktiv: true },
      { id: "WTV21", name: "Vakuumpumpe TV21", standort_art: "sonst", standort_text: "verliehen an Subfirma", zurueck_am: vorgestern, zustand: "ok", aktiv: true },
      { id: "WTV21R", name: "Rohrzange TV21", standort_art: "reparatur", standort_text: "Fa. Rep", zurueck_am: vorgestern, zustand: "ok", aktiv: true });
    db.bedarf.push({ id: "BTV24B", art: "werkzeug", text: "Pumpe TV24B", werkzeug_id: "WTV24B", stoerung_id: "STV24B", standort_id: "TS1", status: "offen", beschaffung: "mitnehmen" });
    x("planungStand=0; planungNachladen()"); await warte(500); await x("fzLaden(true)"); await x("wzLaden(true)");
    /* privater Termin des Technikers: der Inhaber sieht „Abwesend“ – das Material dazu sieht er auch (volle Kontrolle, Inhaber 05.10.2026), als Vorschlag lernt es aber niemand */
    const zeile = x("(kalenderEintraege('" + d.morgen + "','" + d.morgen + "','alle')['" + d.morgen + "']||[]).map(function(y){ return kalEintragZeile(y,true).textContent; }).join(' | ')");
    soll(/Abwesend/.test(zeile) && /Kardiologie/.test(zeile), "Inhaber sieht im Kalender beim privaten Termin nicht „Abwesend“ mit Material: " + zeile);
    soll(!x("bedarfGelerntMarkt('TS1',[]).some(function(e){ return /Kardiologie/.test(e.text); })"), "Eintrag des privaten Termins als „An diesem Markt schon gebraucht“");
    x("S.bdAlle=true; S.view='werkzeug'; render()"); await warte(600);
    soll(/Kardiologie/.test(app()), "Inhaber sieht den Eintrag des privaten Termins im Reiter Werkzeug unter „Alle“ nicht");
    /* Störung für den Techniker, Werkzeug im Büro-Auto: ⚠ (nicht „hat der Betrachter“) */
    x("OFFENE.push({_id:'STV24B', standortId:'TS1', termin:'" + heute + "', terminTechniker:'Testtechniker', erledigt:false}); 1");
    const info = JSON.parse(x("JSON.stringify(bedarfWerkzeugInfo(" + bd("BTV24B") + "))"));
    x("OFFENE=OFFENE.filter(function(o){ return o._id!=='STV24B'; }); 1");
    soll(info && info.warnen, "Büro: Werkzeug im eigenen Auto, Störung für den Techniker – kein ⚠: " + JSON.stringify(info));
    /* verliehen („sonst wo“) und überfällig: Hinweis und To-do wie bei Reparatur */
    const todo = x("wzToDo()");
    soll(todo.some((t) => /Rohrzange TV21/.test(t)), "Vergleich: Reparatur fehlt im To-do " + JSON.stringify(todo));
    soll(x("wzHinweise(WZ.filter(function(w){ return w.id==='WTV21'; })[0]).length") > 0 && todo.some((t) => /Vakuumpumpe TV21/.test(t)), "verliehen und überfällig ohne Hinweis/To-do: " + JSON.stringify(todo));
    /* Attrappe wie werkzeug.sql / planung.sql */
    const t26 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung TV26", datum: heute, standort_id: "TS1", wer: [ich], wer_namen: ["Inhaber"] }) + ").select('*')")).data[0];
    const b26 = (await x("Store.sb.from('bedarf').insert(" + JSON.stringify({ art: "material", text: "Filter TV26", planung_id: t26.id, standort_id: "TS1", status: "offen", beschaffung: "mitnehmen" }) + ").select('*')")).data[0];
    await x("Store.sb.from('planung').delete().eq('id','" + t26.id + "').select('id')");
    soll(db.bedarf.find((z) => z.id === b26.id).planung_id == null, "Attrappe: Termin gelöscht, bedarf.planung_id bleibt (SQL: on delete set null)");
    const w26 = (await x("Store.sb.from('werkzeug').insert(" + JSON.stringify({ name: "Zange TV26", standort_art: "person", person_id: ich, person_name: "Inhaber" }) + ").select('*')")).data[0];
    const vl = () => db.werkzeug_verlauf.filter((v) => v.werkzeug_id === w26.id).length;
    soll(vl() === 1, "Attrappe: kein Verlauf beim Anlegen (" + vl() + ")");
    await x("Store.sb.from('werkzeug').update({standort_art:'lager'}).eq('id','" + w26.id + "').select('*')");
    soll(db.werkzeug.find((z) => z.id === w26.id).person_id == null, "Attrappe: person_id bleibt nach „Lager“ (SQL: werkzeug_merken räumt auf)");
    const vor = vl();
    await x("Store.sb.from('werkzeug').update({zustand:'defekt'}).eq('id','" + w26.id + "').select('*')");
    soll(vl() === vor + 1, "Attrappe: kein Verlauf beim Zustandswechsel");
    /* Lernen und Listen: mehr als 1000 Zeilen */
    for (let i = 0; i < 1000; i++) db.bedarf.push({ id: "alt" + i, art: "material", text: "Altbedarf " + i, standort_id: "TS2", status: "erledigt", erledigt: "2025-01-01T00:00:00Z", beschaffung: "mitnehmen" });
    db.bedarf.push({ id: "h10a", art: "werkzeug", text: "Hubsteiger TV10", standort_id: "TS1", status: "erledigt", erledigt: "2025-02-01T00:00:00Z", beschaffung: "abholen" },
      { id: "h10b", art: "werkzeug", text: "Hubsteiger TV10", standort_id: "TS1", status: "erledigt", erledigt: "2025-03-01T00:00:00Z", beschaffung: "abholen" });
    await x("wzLaden(true)");
    const alleN = x("BEDARF_ALLE.filter(function(b){ return /^Altbedarf |^Hubsteiger TV10$/.test(b.text); }).length");
    soll(alleN === 1002 && x("bedarfGelerntMarkt('TS1',[]).some(function(e){ return e.text==='Hubsteiger TV10'; })"), "nur ein Teil gelernt (" + alleN + " von 1002)");
    return f;
  }, daten);
  const alle = f.concat(r);
  pruefe(!alle.length, alle.join(" | "));
  pruefe(!b.fehler.length, "Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
});

test("Tiefentest werkzeug: Bedienung – nichts doppelt, keine Verbindung, Klartext, Ort und Zustand passen", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, f = [], soll = (bed, text) => { if (!bed) f.push(text); };
    const dlg = () => [...document.querySelectorAll(".assistent")].pop(), app = () => document.getElementById("app").innerText, toast = () => document.getElementById("toast").textContent;
    const knopfIn = (wurzel, text) => [...wurzel.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
    const speichern = (d) => [...d.querySelectorAll(".as-fuss button")].pop().click();
    const ich = x("meineKennung()"), heute = x("isoLokal(new Date())"), gestern = x("plusTage(isoLokal(new Date()),-1)");
    const sb = x("Store.sb"), from = sb.from;
    const kaputt = () => { const q = { then: (ok, nok) => Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }).then(ok, nok) };
      ["select", "order", "limit", "in", "eq", "gte", "range"].forEach((m) => { q[m] = () => q; }); return q; };
    /* Laden ohne Verbindung: Klartext, nicht „Noch kein Werkzeug eingetragen“ */
    sb.from = function (t) { return ["werkzeug", "bedarf", "packlisten"].includes(t) ? kaputt() : from.call(sb, t); };
    await x("wzLaden(true)"); x("S.view='werkzeug'; render()"); await warte(500);
    sb.from = from;
    soll(!/Failed to fetch/.test(app()) && !/Noch kein Werkzeug eingetragen/.test(app()), "Reiter Werkzeug ohne Verbindung: rohe Meldung bzw. „Noch kein Werkzeug eingetragen“");
    /* Bestand */
    db.werkzeug.push({ id: "WTV6", name: "Lecksucher TV6", standort_art: "sonst", standort_text: "Keller Testfirma", zustand: "ok", aktiv: true },
      { id: "WTV7", name: "Waage TV7", standort_art: "person", person_id: ich, person_name: "Testtechniker", zustand: "ok", aktiv: true },
      { id: "WTV16", name: "Altes Messgerät TV16", standort_art: "lager", zustand: "ok", aktiv: false },
      { id: "WTV18", name: "Waage TV18", standort_art: "lager", zustand: "ok", aktiv: true },
      { id: "WTV22", name: "Manometer TV22", standort_art: "reparatur", standort_text: "Fa. Kältereparatur", zustand: "ok", aktiv: true },
      { id: "WTV23", name: "Lecksucher TV23", standort_art: "lager", zustand: "verloren", aktiv: true });
    db.werkzeug_verlauf.push({ id: "v18", werkzeug_id: "WTV18", zeit: new Date().toISOString(), standort: "Lager", von_name: "Test" });
    db.packlisten.push({ id: "PLTV9", name: "Störung Kälte TV9", eintraege: [{ art: "material", text: "Kältemittel R32" }, { art: "material", text: "Lecksuchspray" }, { art: "material", text: "Filtertrockner" }] });
    db.bedarf.push({ id: "BTV16", art: "werkzeug", text: "Altes Messgerät TV16", werkzeug_id: "WTV16", projekt_id: "P-TV16", status: "offen", beschaffung: "mitnehmen", erstellt_von: ich, erstellt: new Date().toISOString() });
    const tG = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung TV6", datum: gestern, standort_id: "TS1", wer: [ich], wer_namen: ["Testtechniker"] }) + ").select('*')")).data[0];
    for (const w of ["WTV6", "WTV7"]) await x("Store.sb.from('bedarf').insert(" + JSON.stringify({ art: "werkzeug", text: w, werkzeug_id: w, planung_id: tG.id, standort_id: "TS1", status: "offen", beschaffung: "mitnehmen" }) + ").select('*')");
    const t14 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung TV14", datum: heute, beginn: "08:00", ende: "10:00", standort_id: "TS1", wer: [ich], wer_namen: ["Testtechniker"] }) + ").select('*')")).data[0];
    const t9 = (await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "stoerung", titel: "Störung TV9", datum: heute, beginn: "13:00", ende: "15:00", standort_id: "TS1", wer: [ich], wer_namen: ["Testtechniker"] }) + ").select('*')")).data[0];
    x("planungStand=0; planungNachladen()"); await warte(500); await x("wzLaden(true)");
    /* „Wo ist das Werkzeug jetzt?“: ohne Verbindung bleibt der Knopf bedienbar; „bei mir“ ersetzt den alten Ortstext */
    x("ansichtenSchliessen(); S.view='faellig'; render()"); await warte(700);
    const zeileVon = (name, text) => [...document.querySelectorAll("button")].find((b) => b.textContent === text && b.closest(".stack") && b.closest(".stack").textContent.includes(name));
    const lager7 = zeileVon("Waage TV7", "zurück ins Lager");
    window.__netzWeg = true; if (lager7) lager7.click(); await warte(600);
    const meldung = toast(); window.__netzWeg = false; await warte(300);
    soll(lager7 && /Nicht gespeichert/.test(meldung) && lager7.isConnected && !lager7.disabled, "keine Verbindung: Knopf bleibt gesperrt bzw. keine Meldung " + JSON.stringify({ meldung, da: !!lager7 && lager7.isConnected, gesperrt: !!lager7 && lager7.disabled }));
    const beiMir6 = zeileVon("Lecksucher TV6", "bei mir"); if (beiMir6) beiMir6.click(); await warte(700);
    const w6 = db.werkzeug.find((z) => z.id === "WTV6");
    soll(beiMir6 && w6.standort_art === "person" && !w6.standort_text, "„bei mir“ behält den alten Ortstext: " + JSON.stringify({ art: w6.standort_art, text: w6.standort_text }));
    /* verlorenes Werkzeug „Ich hab’s“ */
    x("S.view='werkzeug'; S.wzFilter='alle'; S.wzSuche=''; render()"); await warte(500);
    let vorher = window.__dialoge.length;
    const hab = [...document.querySelectorAll('[data-wz="WTV23"] button')].find((b) => /Ich hab/.test(b.textContent)); if (hab) hab.click(); await warte(600);
    const w23 = db.werkzeug.find((z) => z.id === "WTV23");
    soll(hab && w23.standort_art === "person" && w23.zustand !== "verloren" && window.__dialoge.slice(vorher).some((z) => /verloren/.test(z[1])), "verlorenes Werkzeug „Ich hab’s“: " + JSON.stringify({ art: w23.standort_art, zustand: w23.zustand }));
    /* Werkzeug-Editor: Ort wechseln → „Wo genau?“ des alten Orts nicht übernehmen */
    x("wzEditor(WZ.filter(function(w){ return w.id==='WTV22'; })[0])"); await warte(400);
    let d = dlg();
    [...d.querySelectorAll("[data-ort] .chip")].find((c) => c.dataset.w === "lager").click(); await warte(100);
    const feld22 = d.querySelector('[data-f="standort_text"]').value;
    speichern(d); await warte(700);
    const w22 = db.werkzeug.find((z) => z.id === "WTV22");
    soll(w22.standort_art === "lager" && w22.standort_text !== "Fa. Kältereparatur", "Reparaturfirma als Lagerplatz gespeichert: " + JSON.stringify({ feld22, text: w22.standort_text }));
    /* Verlauf: Ladefehler melden und beim nächsten Aufklappen neu laden */
    x("ansichtenSchliessen(); wzEditor(WZ.filter(function(w){ return w.id==='WTV18'; })[0])"); await warte(400);
    const det = dlg().querySelector("[data-verlauf]");
    sb.from = function (t) { return t === "werkzeug_verlauf" ? kaputt() : from.call(sb, t); };
    det.open = true; await warte(400);
    const vText1 = det.innerText;
    sb.from = from;
    det.open = false; await warte(150); det.open = true; await warte(400);
    const vText2 = det.innerText.replace(/Verlauf – wo es war/, "");
    soll(!/Noch kein Verlauf/.test(vText1) && /Lager/.test(vText2), "Verlauf: Ladefehler als „Noch kein Verlauf.“ bzw. kein neuer Versuch " + JSON.stringify({ vText1, vText2 }));
    x("ansichtenSchliessen()");
    /* „In die Werkzeugliste?“: zwei Antworten schnell hintereinander – ein Werkzeug */
    x("bedarfEditor(null, {projekt_id:'P-TV11'})"); await warte(300);
    d = dlg();
    [...d.querySelectorAll("[data-art] .chip")].find((c) => c.dataset.w === "werkzeug").click();
    d.querySelector('[data-f="text"]').value = "Rohrabschneider TV11";
    speichern(d); await warte(600);
    d = dlg();
    const ja1 = d && [...d.querySelectorAll("button")].find((b) => /Ja – im Lager/.test(b.textContent)), ja2 = d && [...d.querySelectorAll("button")].find((b) => /Ja – bei mir/.test(b.textContent));
    if (ja1) ja1.click(); if (ja2) ja2.click(); await warte(800);
    const wz11 = db.werkzeug.filter((w) => w.name === "Rohrabschneider TV11").map((w) => w.standort_art);
    soll(ja1 && wz11.length === 1, "Werkzeug doppelt angelegt: " + JSON.stringify(wz11));
    x("ansichtenSchliessen()");
    /* nach „Nein“ nicht bei jedem Speichern wieder fragen */
    x("bedarfEditor(null, {projekt_id:'P-TV15'})"); await warte(300);
    d = dlg();
    [...d.querySelectorAll("[data-art] .chip")].find((c) => c.dataset.w === "werkzeug").click();
    d.querySelector('[data-f="text"]').value = "Pressmaschine TV15";
    speichern(d); await warte(600);
    d = dlg(); const frage15a = !!d && /In die Werkzeugliste/.test(d.textContent);
    if (d) [...d.querySelectorAll("button")].find((b) => /Nein, nicht aufnehmen/.test(b.textContent)).click(); await warte(200);
    x("bedarfEditor(BEDARF.filter(function(b){ return b.text==='Pressmaschine TV15'; })[0])"); await warte(300);
    d = dlg(); d.querySelector('[data-f="menge"]').value = "1 Stk"; speichern(d); await warte(600);
    d = dlg(); const frage15b = !!d && /In die Werkzeugliste/.test(d.textContent);
    soll(frage15a && !frage15b, "„In die Werkzeugliste?“ kommt nach „Nein“ wieder: " + JSON.stringify({ frage15a, frage15b }));
    x("ansichtenSchliessen()");
    /* Bedarf mit ausgeschiedenem Werkzeug: Verknüpfung bleibt */
    x("bedarfEditor(BEDARF.filter(function(b){ return b.id==='BTV16'; })[0])"); await warte(300);
    d = dlg(); d.querySelector('[data-f="menge"]').value = "1 Stk"; speichern(d); await warte(600);
    const b16 = db.bedarf.find((z) => z.id === "BTV16"), frage16 = !!dlg() && /In die Werkzeugliste/.test(dlg().textContent);
    soll(b16.menge === "1 Stk" && b16.werkzeug_id === "WTV16" && !frage16, "Verknüpfung mit ausgeschiedenem Werkzeug still entfernt: " + JSON.stringify({ menge: b16.menge, werkzeug_id: b16.werkzeug_id, frage16 }));
    x("ansichtenSchliessen()");
    /* Bedarf löschen ohne Verbindung: sichtbare Meldung */
    const b20 = (await x("Store.sb.from('bedarf').insert(" + JSON.stringify({ art: "material", text: "Dichtband TV20", projekt_id: "P-TV20", status: "offen", beschaffung: "mitnehmen" }) + ").select('*')")).data[0];
    await x("wzLaden(true)");
    x("bedarfEditor(BEDARF.filter(function(y){ return y.id==='" + b20.id + "'; })[0])"); await warte(300);
    d = dlg();
    const t = document.getElementById("toast"); t.textContent = ""; t.style.display = "none";
    const fv = window.__fehler.length;
    window.__netzWeg = true; knopfIn(d, "Löschen").click(); await warte(800); window.__netzWeg = false;
    const err20 = d.querySelector("[data-err]");
    soll((err20 && !err20.hidden && /Nicht gelöscht/.test(err20.textContent)) || (t.style.display === "block" && /Nicht gelöscht/.test(t.textContent)), "Löschen ohne Verbindung: keine sichtbare Meldung " + JSON.stringify(window.__fehler.slice(fv)));
    x("ansichtenSchliessen()");
    /* gelöschter Bedarf am Markt nicht als „schon gebraucht“ */
    x("marktAnsicht('TS1')"); await warte(800);
    d = dlg();
    [...d.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Material \/ Werkzeug/.test(b.textContent)).click(); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Spezialfilter TV13 (vertippt)"; speichern(d); await warte(600);
    d = dlg();
    [...d.querySelectorAll("[data-bedarfkasten] [data-bedarf]")].find((z) => /Spezialfilter TV13/.test(z.textContent)).querySelector("a").click(); await warte(300);
    knopfIn(dlg(), "Löschen").click(); await warte(600);
    d = dlg();
    const chips13 = [...d.querySelectorAll("[data-bedarfkasten] .chip")].map((c) => c.textContent);
    soll(!db.bedarf.some((z) => /Spezialfilter TV13/.test(z.text)), "Spezialfilter TV13 nicht gelöscht");
    soll(!chips13.some((c) => /Spezialfilter TV13/.test(c)) && !x("bedarfGelerntMarkt('TS1',[]).some(function(e){ return /Spezialfilter TV13/.test(e.text); })"), "Gelöschtes wird als „schon gebraucht“ vorgeschlagen");
    x("ansichtenSchliessen()");
    /* im Termin abgehakt: nicht gleich wieder vorgeschlagen */
    x("planEditor(PLANUNG.filter(function(e){ return e.id==='" + t14.id + "'; })[0])"); await warte(500);
    d = dlg();
    [...d.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Material \/ Werkzeug/.test(b.textContent)).click(); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Taschenfilter TV14"; speichern(d); await warte(600);
    d = dlg();
    const cb = [...d.querySelectorAll("[data-bedarfkasten] [data-bedarf]")].find((z) => /Taschenfilter TV14/.test(z.textContent)).querySelector("input[type=checkbox]");
    cb.checked = true; cb.dispatchEvent(new Event("change")); await warte(600);
    d = dlg();
    const chips14 = [...d.querySelectorAll("[data-bedarfkasten] .chip")].map((c) => c.textContent);
    const tipp14 = x("planungPruefen('ich','" + heute + "','" + heute + "').map(function(t){ return t.marktTipp.map(function(m){ return m.l.map(function(e){ return e.text; }).join(','); }).join(';'); }).join('|')");
    soll((db.bedarf.find((z) => z.text === "Taschenfilter TV14") || {}).status === "erledigt", "Taschenfilter TV14 nicht abgehakt");
    soll(!chips14.some((c) => /Taschenfilter TV14/.test(c)) && !/Taschenfilter TV14/.test(tipp14), "abgehakter Eintrag sofort wieder vorgeschlagen: " + JSON.stringify({ chips14, tipp14 }));
    x("ansichtenSchliessen()");
    /* Packliste mit gleicher Zeile mehrfach; zweimal schnell übernommen */
    x("packlisteEditor(null)"); await warte(300);
    d = dlg(); d.querySelector('[data-f="name"]').value = "Leitern TV12"; d.querySelector('[data-f="eintraege"]').value = "Leiter\nKabelbinder\nleiter\nLeiter ";
    speichern(d); await warte(600);
    await x("packlisteUebernehmen({projekt_id:'P-TV12'}, PACKLISTEN.filter(function(p){ return p.name==='Leitern TV12'; })[0])");
    const leiter = db.bedarf.filter((z) => z.projekt_id === "P-TV12" && /leiter/i.test(z.text)).length;
    soll(leiter === 1, "Leiter " + leiter + "× übernommen");
    x("ansichtenSchliessen(); planEditor(PLANUNG.filter(function(e){ return e.id==='" + t9.id + "'; })[0])"); await warte(500);
    const pk = () => [...document.querySelectorAll("[data-bedarfkasten] button")].find((b) => /Packliste übernehmen/.test(b.textContent));
    const waehle = () => [...dlg().querySelectorAll("button.row")].find((b) => /Störung Kälte TV9/.test(b.textContent)).click();
    pk().click(); waehle(); pk().click(); waehle(); await warte(1000);
    const pl9 = db.bedarf.filter((z) => z.planung_id === t9.id).map((z) => z.text);
    soll(pl9.length === 3, "Packliste doppelt übernommen: " + JSON.stringify(pl9));
    x("ansichtenSchliessen()");
    return f;
  });
  pruefe(!r.length, r.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest werkzeug: Präsentation meldet nie echtes Speichern; Kunde liest kein Werkzeug", async () => {
  const a = await oeffnen(KONTEN.praesentation);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop(), toast = () => document.getElementById("toast").textContent;
    x("WZ=[{id:'WTV19', name:'Leiter TV19', standort_art:'person', person_id:'u_admin_test_at', person_name:'Testadmin', zustand:'ok', aktiv:true}]; BEDARF=[{id:'BTV19', art:'material', text:'Silikon TV19', projekt_id:'P-TV19', status:'offen', beschaffung:'mitnehmen'}]; wzGeladen=true; 1");
    x("wzOrtSchnell(WZ[0], 'ich')"); await warte(150); const t1 = toast();
    x("wzOrtSchnell(WZ[0], 'lager')"); await warte(150); const t2 = toast();
    await x("bedarfStatus(BEDARF[0], 'erledigt')"); await warte(100); const t3 = toast();
    await x("bedarfAusVorschlag([{text:'Kabel TV19', art:'material'}], {projekt_id:'P-TV19'})"); await warte(100); const t4 = toast();
    document.getElementById("toast").textContent = "";
    x("packlisteEditor(null)"); await warte(300);
    const d = dlg(); d.querySelector('[data-f="name"]').value = "Präsi TV19"; d.querySelector('[data-f="eintraege"]').value = "Leiter";
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(300);
    return { t: [t1, t2, t3, t4, toast()], db: db.werkzeug.length + db.bedarf.length + db.packlisten.length };
  });
  pruefe(r.db === 0, "Präsentation hat gespeichert: " + JSON.stringify(r));
  pruefe(r.t.every((t) => /Präsentation/.test(t)), "Meldung ohne „Präsentation, nicht gespeichert“: " + JSON.stringify(r.t));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* Attrappe wie werkzeug.sql: der Kunde liest weder Werkzeug noch Bedarf */
  const k = await oeffnen(KONTEN.kunde);
  const kunde = await k.seite.evaluate(async () => { const db = window.__db.tabellen;
    db.werkzeug.push({ id: "WK26", name: "Geheim TV26", standort_art: "lager", aktiv: true }); db.bedarf.push({ id: "BK26", art: "material", text: "Geheim TV26", status: "offen" });
    return ((await window.__t.x("Store.sb.from('werkzeug').select('*')")).data || []).length + ((await window.__t.x("Store.sb.from('bedarf').select('*')")).data || []).length; });
  await k.zu();
  pruefe(kunde === 0, "Attrappe: Kunde liest Werkzeug bzw. Bedarf (" + kunde + ")");
});

test("Tiefentest kern: „Zählt als“ folgt dem geänderten Protokolldatum, von Hand Gewähltes bleibt", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    /* JW (TP1) steht in wenigen Tagen an, die HJI (TP2) im Frühjahr ist versäumt */
    x("posById.TP2.historie=[plusMonate(isoLokal(new Date()),-18)]; berechneFaelligkeiten(); 1");
    const tp = (id) => x("(function(){ var p=POS.filter(function(p){ return p.id==='" + id + "'; })[0]||{}; return p.status+' '+(p.naechste||''); })()");
    const vor = { TP1: tp("TP1"), TP2: tp("TP2") };
    const datum = x("plusTage('" + vor.TP2.split(" ")[1] + "', 20)");   /* Nachtrag: Besuch 20 Tage nach dem versäumten HJI-Termin */
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos=null; S.view='protokoll'; render(); 1"); await w(500);
    const form = document.getElementById("proto"), slot = () => form.querySelector(".posslot"), df = form.querySelector("#f_datum");
    const datumSetzen = async (d) => { df.value = d; df.dispatchEvent(new Event("input", { bubbles: true })); df.dispatchEvent(new Event("change", { bubbles: true })); await w(200); };
    const slotHeute = slot().value;
    await datumSetzen(datum);
    const slotNachDatum = slot().value, angehakt = slot().closest("label").querySelector('input[name="posw"]').checked;
    /* zum Vergleich: was die App für dieses Datum selbst vorwählt (Markt neu wählen baut die Auswahl neu) */
    form.querySelector("#f_standort").onchange(); await w(200);
    const kontrolle = slot().value;
    /* von Hand gewählt bleibt beim nächsten Datumswechsel */
    slot().value = "TP1"; slot().onchange();
    await datumSetzen(x("plusTage('" + datum + "', 1)"));
    const vonHand = slot().value + "/" + slot().closest("label").querySelector('input[name="posw"]').value;
    slot().value = "TP2"; slot().onchange();
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    document.getElementById("f_allesok").click();
    const fehlt = form._fehltNoch();
    if (!fehlt.length) document.getElementById("save").click();
    for (let i = 0; i < 40 && !db.protokolle.length; i++) await w(250);
    await w(500);
    return { vor, datum, slotHeute, slotNachDatum, angehakt, kontrolle, vonHand, fehlt, gespeichertAls: (db.protokolle[0] || {}).position_ids, nach: { TP1: tp("TP1"), TP2: tp("TP2") } };
  });
  pruefe(r.slotHeute === "TP1" && r.kontrolle === "TP2", "Ausgangslage anders: " + JSON.stringify(r));
  pruefe(r.slotNachDatum === r.kontrolle && r.angehakt, "Vorwahl nach Datumsänderung " + r.slotNachDatum + " (für " + r.datum + " wählt die App selbst " + r.kontrolle + "): " + JSON.stringify(r));
  pruefe(r.vonHand === "TP1/TP1", "von Hand gewählter Termin beim Datumswechsel überschrieben: " + r.vonHand);
  pruefe(JSON.stringify(r.gespeichertAls) === '["TP2"]' && /^faellig/.test(r.nach.TP1), "gespeichert " + JSON.stringify(r.gespeichertAls) + " – die fällige JW verschwindet: " + JSON.stringify(r.nach) + " " + r.fehlt);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest kern: geführtes Protokoll am Handy – Vor-Ort-Frage, Mangel nur mit Maßnahme, Ausnahme ohne Lidl-Auftrag, ab 30 kg kein „nur JW“", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const ov = () => document.querySelector(".assistent[data-gefuehrt]"), schritt = () => (ov() ? ov().querySelector(".as-schritt").textContent : "");
    const knopf = (re) => ov() && [...ov().querySelectorAll(".as-fuss button")].find((b) => re.test(b.textContent.trim()));
    const gesehen = [];   /* Schritte, die die offene Vor-Ort-Frage zeigen */
    const bis = async (re) => { for (let i = 0; i < 30 && !re.test(schritt()); i++) { if (/zweite Außeneinheit/.test(ov().textContent)) gesehen.push(schritt()); const k = knopf(/^Weiter$/) || knopf(/Überspringen/); if (!k) break; k.click(); await w(250); } return schritt(); };
    const oeffne = async (art, sid, pid) => { if (ov()) ov().querySelector('[data-as="zu"]').click();
      x("formDirty=false; S.protoArt='" + art + "'; S.stoerungAus=null; S.bearbeiten=null; S.protoStandort='" + sid + "'; S.protoPos='" + pid + "'; S.view='protokoll'; render(); 1"); await w(450);
      document.getElementById("p_gefuehrt").click(); await w(300); };
    const erg = {};
    /* offene Vor-Ort-Frage am Markt: steht auch im geführten Dialog und lässt sich dort beantworten */
    db.vor_ort_fragen.push({ id: "vfk3", standort_id: "TS1", frage: "Gibt es im Lager eine zweite Außeneinheit?", angelegt: new Date().toISOString(), angelegt_von: "Büro" });
    await x("vorOrtLaden(true)");
    await oeffne("wartung", "TS1", "TP1");
    await bis(/· Gewartete Anlagen$/);
    const vk = ov().querySelector(".as-inhalt [data-vorort]");
    if (vk) { vk.querySelector('[data-v="antwort"]').value = "ja, im Lager"; vk.querySelector('[data-v="speichern"]').click(); await w(500); }
    erg.antwort = (db.vor_ort_fragen.find((f) => f.id === "vfk3") || {}).antwort || "";
    /* Mangel nur mit Maßnahme: bleibt sichtbar, die Übersicht nennt ihn, gespeichert wird erst vollständig */
    await bis(/· Arbeiten$/);
    [...ov().querySelectorAll(".as-inhalt button")].find((b) => /alle auswählen/.test(b.textContent)).click(); await w(150);
    await bis(/· Mängel$/);
    erg.anlageWahl = /Für welche Anlage?/.test(ov().textContent);
    const m = [...ov().querySelectorAll(".as-feld")].find((f) => /Empfohlene Maßnahme/.test(f.querySelector(".as-label").textContent)).querySelector("input");
    m.value = "Filter tauschen bis Ende Monat"; m.dispatchEvent(new Event("input", { bubbles: true }));
    [...ov().querySelectorAll(".as-inhalt button")].find((b) => /weiterer Mangel/.test(b.textContent)).click(); await w(150);
    erg.nochSichtbar = [...ov().querySelectorAll(".as-inhalt input")].some((i) => /Filter tauschen/.test(i.value));
    await bis(/· Übersicht$/);
    erg.warn = (ov().querySelector(".warnbox") || {}).textContent || "";
    erg.zeileMaengel = ([...ov().querySelectorAll(".as-zeile")].find((z) => /^Mängel/.test(z.textContent)) || {}).textContent || "";
    knopf(/Protokoll speichern/).click(); await w(800);
    erg.dialogOffen = !!ov(); erg.gespeichert = db.protokolle.length;
    /* Lidl-Störung ohne Auftragsnummer: die Ausnahme „kein Lidl-Auftrag“ ist auch im Dialog wählbar, dann wird gespeichert */
    await oeffne("stoerung", "TS1", "TP1");
    await bis(/· Störungsauftrag$/);
    const aus = [...ov().querySelectorAll(".as-inhalt label.chk")].find((l) => /kein Lidl-Auftrag/.test(l.textContent));
    erg.ausnahme = !!aus;
    if (aus) { aus.querySelector("input").click(); await w(100); }
    await bis(/· Störungsbehebung$/);
    ov().querySelectorAll(".as-inhalt textarea").forEach((t, i) => { t.value = ["zu warm", "Filter zu", "Filter getauscht"][i] || "x"; t.dispatchEvent(new Event("input", { bubbles: true })); });
    await bis(/· Übersicht$/);
    erg.warnStoer = (ov().querySelector(".warnbox") || {}).textContent || "";
    knopf(/Protokoll speichern/).click();
    for (let i = 0; i < 30 && !db.protokolle.length; i++) await w(200);
    erg.stoer = db.protokolle.map((p) => ({ nr: p.auftragsnummer || "", ohne: !!(p.stoerung || {}).ohneAuftrag }));
    erg.gesehen = gesehen;
    /* bekannte Füllmenge ab 30 kg: „Nein – nur Jahreswartung“ wird nicht angeboten (HJW bleibt Pflicht) */
    x("posById.TP4.kaeltemittelKg=35; posById.TP4.ueber30kg=true; posById.TP4.kaeltemittelText='35 kg'; berechneFaelligkeiten(); 1");
    await oeffne("wartung", "TS3", "TP4");
    await bis(/· Anlage · /);
    erg.nurJwAngeboten = !!ov().querySelector("[data-halbnein]");
    erg.hjwKnopf = (ov().querySelector("[data-halbja]") || {}).textContent || "";
    return erg;
  });
  pruefe(r.gesehen.length > 0 && r.antwort === "ja, im Lager", "offene Vor-Ort-Frage im geführten Dialog nicht gezeigt bzw. nicht beantwortbar: " + JSON.stringify([r.gesehen, r.antwort]));
  pruefe(r.anlageWahl, "Geführtes Protokoll: beim Mangel keine Anlagen-Auswahl");
  pruefe(r.nochSichtbar, "Maßnahme nach „+ weiterer Mangel“ nicht mehr im Dialog sichtbar");
  pruefe(!r.nurJwAngeboten && /HJW/.test(r.hjwKnopf), "bei 35 kg wird „Nein – nur Jahreswartung“ angeboten bzw. kein HJW-Knopf: " + JSON.stringify([r.nurJwAngeboten, r.hjwKnopf]));
  pruefe(/Mangel beschreiben.*Filter tauschen/.test(r.warn) && /ohne Beschreibung/.test(r.zeileMaengel), "Übersicht nennt den unvollständigen Mangel nicht: " + JSON.stringify(r));
  pruefe(r.dialogOffen && r.gespeichert === 0, "Dialog geschlossen bzw. unvollständig gespeichert: " + JSON.stringify(r));
  pruefe(r.ausnahme, "Schritt „Störungsauftrag“ bietet die Ausnahme „kein Lidl-Auftrag“ nicht an: " + r.warnStoer);
  pruefe(!/Lidl-Auftragsnummer/.test(r.warnStoer) && r.stoer.length === 1 && r.stoer[0].ohne, "Störung ohne Lidl-Auftrag im Dialog nicht gespeichert: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest kern: Störungsauftrag – weiterer Kunde ohne Lidl, KI-Knopf folgt dem Abtippen, vergebene Nummer beim Ändern", async () => {
  const a = await oeffnen(KONTEN.admin);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, t0 = new Date().toISOString();
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const fussKnopf = (d, re) => [...d.querySelectorAll(".as-fuss button")].find((b) => re.test(b.textContent));
    const erg = {};
    /* weiterer Kunde: Kontakt mit der Firma des Kunden ins Adressbuch, Dialog ohne Lidl-Texte */
    db.stammdaten.push({ id: "kunde:KT1", typ: "kunde", ziel: "KT1", felder: { name: "Testkunde Eins", aktiv: true }, neu: true, geaendert: t0, von: "Test", grund: "Test" });
    db.stammdaten.push({ id: "standort:TS5", typ: "standort", ziel: "TS5", felder: { kundeId: "KT1" }, neu: false, geaendert: t0, von: "Test", grund: "Test" });
    await x("ladeStammdaten(true)"); await w(300);
    x("ansichtenSchliessen(); stoerungDialog(null, null, {standortId:'TS5'})"); await w(300);
    let d = dlg();
    erg.texte = [d.querySelector(".as-schritt").textContent, d.querySelector('[data-s="lidlKontakt"]').closest("label").querySelector("span").textContent,
      d.querySelector('[data-s="lidlTelefon"]').closest("label").querySelector("span").textContent, d.querySelector("#st_ohne + span").textContent].join(" | ");
    const k = d.querySelector('[data-s="lidlKontakt"]'); k.value = "Frau Beispielkontakt"; k.dispatchEvent(new Event("input", { bubbles: true }));
    const nr = d.querySelector('[data-s="auftragsnummer"]'); nr.value = "K-4711"; nr.dispatchEvent(new Event("input", { bubbles: true }));
    fussKnopf(d, /Störungsauftrag anlegen/).click(); await w(1200);
    erg.lidl = x("istLidl(byId.TS5)");
    erg.stoerung = db.stammdaten.filter((s) => s.typ === "stoerung").map((s) => s.ziel);
    erg.kontakte = db.kontakte.filter((c) => /Beispielkontakt/.test(c.name || "")).map((c) => ({ firma: c.firma, kategorie: c.kategorie, kunde_id: c.kunde_id || null }));
    /* Auftrag als Bild: „Fehlendes mit KI auslesen“ verschwindet, sobald alles abgetippt ist, und nennt sonst, was noch fehlt */
    window.__v = { seiten: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="], standortId: "TS1" };
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(null, null, window.__v)"); await w(300);
    d = dlg();
    const setz = (k, v) => { const i = d.querySelector('[data-s="' + k + '"]'); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); };
    erg.kiVorher = !!d.querySelector("#st_ki");
    setz("auftragsnummer", "700123"); setz("problemtyp", "Klima defekt"); setz("zieltermin", "2026-12-01");
    erg.kiTitel = (d.querySelector("#st_ki") || {}).title || "";
    setz("beschreibung", "zu warm im Verkaufsraum");
    erg.kiNachher = !!d.querySelector("#st_ki");
    setz("beschreibung", "");
    erg.kiWieder = !!d.querySelector("#st_ki");
    /* Ändern auf eine schon vergebene Auftragsnummer: Prüfung im Dialog wie beim Anlegen („Vorhandene öffnen“) */
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); })");
    await x("stoerungSpeichern({_id:'sd1', standortId:'TS1', auftragsnummer:'600001', status:'offen'}, 'Test')");
    await x("stoerungSpeichern({_id:'sd2', standortId:'TS2', auftragsnummer:'600002', status:'offen'}, 'Test')");
    const aendern = async (neu) => {
      x("document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(OFFENE.filter(function(o){ return o._id==='sd2'; })[0])"); await w(300);
      d = dlg(); const nr = d.querySelector('[data-s="auftragsnummer"]'); nr.value = neu; nr.dispatchEvent(new Event("input", { bubbles: true }));
      fussKnopf(d, /Änderung speichern/).click(); await w(800);
      const box = d.querySelector("#st_fehlt");
      return { meldung: box && !box.hidden ? box.textContent : "", vorhandeneOeffnen: !!d.querySelector('#st_fehlt [data-a="vorh"]'), offen: d.isConnected };
    };
    erg.vergeben = await aendern("600001");
    /* die App kennt die andere Störung nicht (etwa gerade auf einem anderen Gerät erfasst): die Datenbank lehnt ab – kein „später nochmals“ */
    db.stammdaten.push({ id: "sd9", typ: "stoerung", ziel: "TS3", felder: { auftragsnummer: "600009", status: "offen" }, neu: false, geaendert: t0, von: "Test", grund: "Test" });
    erg.dbSperre = await aendern("600009");
    erg.nrSd2 = (db.stammdaten.find((s) => s.typ === "stoerung" && /sd2$/.test(s.id)) || { felder: {} }).felder.auftragsnummer;
    return erg;
  });
  pruefe(r.lidl === false && r.stoerung.indexOf("TS5") >= 0, "Ausgangslage anders: " + JSON.stringify(r));
  pruefe(r.kontakte.length === 1 && r.kontakte[0].firma === "Testkunde Eins" && r.kontakte[0].kategorie === "Kunde / Bauherr" && r.kontakte[0].kunde_id === "KT1",
    "Kontakt des weiteren Kunden landet als Lidl im Adressbuch: " + JSON.stringify(r.kontakte));
  pruefe(!/Lidl/.test(r.texte), "Dialog nennt beim weiteren Kunden Lidl: " + r.texte);
  pruefe(r.kiVorher && r.kiTitel === "Fehlt: Beschreibung" && !r.kiNachher && r.kiWieder, "KI-Knopf folgt dem Abtippen nicht: " + JSON.stringify([r.kiVorher, r.kiTitel, r.kiNachher, r.kiWieder]));
  pruefe(r.vergeben.vorhandeneOeffnen && r.vergeben.offen, "keine Prüfung im Dialog („Vorhandene öffnen“) beim Ändern auf eine vergebene Nummer: " + JSON.stringify(r.vergeben));
  pruefe(r.dbSperre.offen && /schon als Störung erfasst/.test(r.dbSperre.meldung) && !/später nochmals/.test(r.dbSperre.meldung) && r.nrSd2 === "600002",
    "Ablehnung der Datenbank: " + JSON.stringify([r.dbSperre, r.nrSd2]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest kern: Vor Ort klären ohne Netz, alte Liste erkennt Filiale „0901“ = „901“", async () => {
  const a = await oeffnen(KONTEN.inhaber, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const erg = {};
    /* „Frage für vor Ort“ ohne Netz: die getippte Frage geht nicht verloren, mit Netz wird sie gespeichert */
    x("vorOrtNeu('TS1')"); await w(300);
    let d = [...document.querySelectorAll(".assistent")].pop(), ta = d.querySelector("textarea");
    ta.value = "Wo ist der Zugang zum Dach?"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    window.__netzWeg = true;
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await w(600);
    window.__netzWeg = false;
    d = [...document.querySelectorAll(".assistent")].pop();
    erg.offen = !!d && [...d.querySelectorAll("textarea")].some((t) => /Zugang zum Dach/.test(t.value));
    erg.toast = document.getElementById("toast").textContent;
    erg.zeilenOhneNetz = db.vor_ort_fragen.length;
    if (erg.offen) { [...d.querySelectorAll(".as-fuss button")].pop().click(); await w(500); }
    erg.gespeichert = db.vor_ort_fragen.map((f) => f.frage);
    /* Alte Liste prüfen: zweiter Markt ~20 m neben TS1 („Probegasse 1a“) – „0901“ und „901“ sind dieselbe Filialnummer */
    const lauf = async (fil) => {
      db.stammdaten = db.stammdaten.filter((s) => s.id !== "standort:NS1");
      db.stammdaten.push({ id: "standort:NS1", typ: "standort", ziel: "NS1", neu: true, geaendert: new Date().toISOString(), von: "Test", grund: "Test",
        felder: { filiale: fil, name: "Testfiliale Zwei", adresse: "1100 Musterstadt, Probegasse 1a", plz: "1100", ort: "Musterstadt", region: "Wien", lat: 48.1702, lon: 16.38, genauigkeit: "adresse", aktiv: true } });
      delete x("stammUeber")["standort:NS1"];
      await x("ladeStammdaten(true)"); await w(300);
      return x("altlisteFunde().filter(function(f){ return f.art==='Doppelt?'; }).length");
    };
    erg.doppelt = { mit901: await lauf("901"), mit0901: await lauf("0901"), mit902: await lauf("902") };
    return erg;
  });
  pruefe(r.zeilenOhneNetz === 0 && /Nicht gespeichert|Verbindung/.test(r.toast), "Ausgangslage anders: " + JSON.stringify(r));
  pruefe(r.offen, "Dialog zu, eingetippte Frage weg, obwohl nicht gespeichert: " + JSON.stringify(r));
  pruefe(r.gespeichert.length === 1 && /Zugang zum Dach/.test(r.gespeichert[0]), "Frage nach erneutem Tippen nicht gespeichert: " + JSON.stringify(r.gespeichert));
  pruefe(r.doppelt.mit901 === 1 && r.doppelt.mit902 === 0, "Kontrolle (901 bzw. 902) anders: " + JSON.stringify(r.doppelt));
  pruefe(r.doppelt.mit0901 === 1, "Filiale „0901“ neben „901“ nicht als „Doppelt?“ gefunden: " + JSON.stringify(r.doppelt));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest kern: Werkzeug ausscheiden – Rückfrage, auffindbar, zurückholbar; „Fahrzeug“ nur, wenn eines wählbar ist", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop(), app = () => document.getElementById("app").innerText;
    const erg = {};
    /* „im Bestand“ abwählen: Rückfrage; danach unter „Ausgeschieden“ zu finden und zurückzuholen */
    db.werkzeug.push({ id: "WTV8", name: "Bohrhammer TV8", standort_art: "lager", zustand: "ok", aktiv: true });
    await x("wzLaden(true)"); x("S.view='werkzeug'; S.wzFilter='alle'; S.wzSuche=''; render()"); await warte(400);
    erg.chipVorher = !!document.querySelector('#app .chip[data-w="weg"]');
    x("wzEditor(WZ.filter(function(w){ return w.id==='WTV8'; })[0])"); await warte(300);
    let d = dlg(); d.querySelector('[data-f="aktiv"]').checked = false;
    window.__antwort.confirm = false;   /* erst „Abbrechen“: nichts gespeichert */
    let vorher = window.__dialoge.length;
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(400);
    erg.abgebrochen = { frage: window.__dialoge.slice(vorher).map((q) => q[1]).join(" "), aktiv: db.werkzeug.find((w) => w.id === "WTV8").aktiv, offen: d.isConnected };
    window.__antwort.confirm = true;
    [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(600);
    erg.aktiv = db.werkzeug.find((w) => w.id === "WTV8").aktiv;
    x("ansichtenSchliessen(); S.wzFilter='alle'; S.wzSuche='Bohrhammer'; render()"); await warte(250);
    erg.inAlle = /Bohrhammer TV8/.test(app());
    x("S.wzFilter='weg'; render()"); await warte(250);
    erg.inWeg = /Bohrhammer TV8/.test(app());
    const link = [...document.querySelectorAll('#app [data-wz="WTV8"] a')][0];
    if (link) { link.click(); await warte(300); d = dlg(); d.querySelector('[data-f="aktiv"]').checked = true;
      vorher = window.__dialoge.length; [...d.querySelectorAll(".as-fuss button")].pop().click(); await warte(600);
      erg.zurueckOhneFrage = window.__dialoge.length === vorher; }
    erg.zurueck = db.werkzeug.find((w) => w.id === "WTV8").aktiv;
    x("ansichtenSchliessen(); S.wzFilter='alle'; S.wzSuche=''; render()");
    /* Techniker ohne eigenes Fahrzeug (sieht nur das eigene): „Fahrzeug“ ist keine Sackgasse */
    const fahrzeugWahl = async (nachladen) => {
      if (nachladen) x("fzGeladen=false; 1"); else await x("fzLaden(true)");   /* nachladen: Fahrzeuge kommen erst, während das Fenster offen ist */
      x("ansichtenSchliessen(); wzEditor(WZ.filter(function(w){ return w.id==='WTV8'; })[0])"); await warte(300);
      const dd = dlg(), chip = dd.querySelector('[data-ort] .chip[data-w="fahrzeug"]');
      return { fz: x("FZ.length"), chip: !!chip && !chip.hidden, hinweis: [...dd.querySelectorAll(".muted")].some((m) => !m.hidden && /Kein Fahrzeug zur Wahl/.test(m.textContent)),
        optionen: dd.querySelectorAll('[data-f="fahrzeug_id"] option').length };
    };
    erg.ohneAuto = await fahrzeugWahl();
    /* mit eigenem Fahrzeug: wählbar wie bisher */
    db.fahrzeuge.push({ id: "FTV25", kennzeichen: "T-TV25", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], aktiv: true });
    erg.mitAuto = await fahrzeugWahl(true);
    x("ansichtenSchliessen()");
    return erg;
  });
  pruefe(!r.chipVorher, "Filter „Ausgeschieden“ ohne ausgeschiedenes Werkzeug sichtbar");
  pruefe(/ausgeschieden/.test(r.abgebrochen.frage) && r.abgebrochen.aktiv !== false && r.abgebrochen.offen, "keine Rückfrage beim Ausscheiden bzw. trotz „Abbrechen“ gespeichert: " + JSON.stringify(r.abgebrochen));
  pruefe(r.aktiv === false && !r.inAlle && r.inWeg, "ausgeschiedenes Werkzeug nicht unter „Ausgeschieden“ zu finden: " + JSON.stringify(r));
  pruefe(r.zurueck === true && r.zurueckOhneFrage, "Werkzeug lässt sich nicht zurückholen: " + JSON.stringify(r));
  pruefe(r.ohneAuto.fz === 0 && !r.ohneAuto.chip && r.ohneAuto.hinweis, "Techniker ohne Fahrzeug: „Fahrzeug“ wählbar, Liste leer: " + JSON.stringify(r.ohneAuto));
  pruefe(r.mitAuto.fz === 1 && r.mitAuto.chip && !r.mitAuto.hinweis && r.mitAuto.optionen === 2, "Techniker mit eigenem Fahrzeug: " + JSON.stringify(r.mitAuto));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Tiefentest Reisekosten und Kilometergeld, Fahrzeuge (Funde RK-…, TTQ-…): je Test eine zusammengehörige Gruppe,
   alle Abweichungen eines Tests werden gesammelt gemeldet */
const RK_HILFEN = `
  window.__rk = {
    warte: (ms) => new Promise((f) => setTimeout(f, ms)),
    karte: (re) => [...document.querySelectorAll(".card")].find((c) => { const h = c.querySelector("h2"); return h && re.test(h.textContent); }),
    dlg: () => [...document.querySelectorAll(".assistent")].pop(),
    speichern: (d) => [...d.querySelectorAll(".as-fuss button")].find((b) => /^Speichern$/.test(b.textContent.trim())).click(),
    knopf: (wo, re) => [...(wo || document).querySelectorAll("button")].find((b) => re.test(b.textContent)),
    toastSpion: () => { window.__toasts = []; window.__t.x("(function(){ if(window.__toastSpion) return 1; window.__toastSpion=1; var alt=toast; toast=function(m){ window.__toasts.push(String(m)); return alt.apply(this, arguments); }; return 1; })()"); },
    anmelden: async (mail, rolle) => {
      const x = window.__t.x;
      await x("Store.sb.auth.signOut()"); await window.__rk.warte(300);
      await x("Store.sb.auth.signInWithPassword({email:'" + mail + "',password:'test123'})");
      for (let i = 0; i < 80 && !x("Rolle.da && Rolle.name==='" + rolle + "'"); i++) await window.__rk.warte(100);
      await window.__rk.warte(300);
    },
  }; 1`;
async function rkSeite(konto) { const a = await oeffnen(konto); await a.seite.evaluate((h) => eval(h), RK_HILFEN); return a; }

test("Tiefentest reisekosten: Kontowechsel und Nachladen – keine fremden Reisekosten, IBAN oder Fahrzeuge, Zurückgegebenes wieder änderbar, nach Ladefehler neuer Versuch im Klartext", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, karte, knopf } = window.__rk;
    const rk = () => (karte(/^Reisekosten und Kilometergeld/) || {}).textContent || "";
    const neu = () => { x("S.view='faellig'; render()"); x("S.view='stunden'; render()"); };
    const heute = x("isoLokal(new Date())"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    /* RK-01, RK-09: der Inhaber hat eigene Reisekosten, IBAN und Fahrzeuge im Speicher der Seite */
    db.auslagen.push({ id: "tkG1", user_id: "u_inhaber_test_at", name: "Testinhaber", art: "beleg", datum: heute, text: "TT-Geheim Hotel", kategorie: "naechtigung", betrag: 177.7, foto: "u_inhaber_test_at/g.jpg", status: "offen", erstellt: new Date().toISOString() });
    db.auslagen_konto.push({ user_id: "u_inhaber_test_at", kontoinhaber: "Testinhaber", iban: "AT88 0000 0000 0000 0001" });
    db.fahrzeuge.push({ id: "fzF", kennzeichen: "S-FREMD 1", fahrer: ["u_admin_test_at"], fahrer_namen: ["Testadmin"], privat_von: "u_admin_test_at", privat_name: "Testadmin", aktiv: true },
      { id: "fzS", kennzeichen: "S-TECH 1", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], aktiv: true });
    /* die Fahrzeuge lädt die App schon beim Start (mit Werkzeug und Material) – die eben eingefügten erst mit neuem Laden */
    await x("fzLaden(true)");
    x("S.view='fahrzeuge'; render()"); await warte(600);
    x("S.view='stunden'; render()"); await warte(700);
    const inhaberSieht = /TT-Geheim/.test(rk()) && x("FZ.length") >= 2;
    /* Abmelden, als Techniker anmelden – ohne Neuladen der Seite */
    await window.__rk.anmelden("tech@test.at", "techniker");
    /* so liefert die Regel „fahrzeuge lesen“ dem Techniker: nur Fahrzeuge, bei denen er Fahrer ist */
    db.fahrzeuge.splice(db.fahrzeuge.findIndex((f) => f.id === "fzF"), 1);
    /* RK-02: ein eigener, schon abgegebener Eintrag */
    db.auslagen.push({ id: "tkR1", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Parkgarage Test", kategorie: "parken", betrag: 8, foto: "u_tech_test_at/p.jpg", status: "eingereicht", erstellt: new Date().toISOString() });
    window.__rk.toastSpion();
    x("ansichtenSchliessen(); S.view='fahrzeuge'; render()"); await warte(600);
    const fahrzeuge = [...document.querySelectorAll("[data-fzid] h2")].map((h) => h.textContent);
    p(!fahrzeuge.includes("S-FREMD 1"), "RK-09 Techniker sieht nach dem Kontowechsel ein fremdes Fahrzeug: " + JSON.stringify(fahrzeuge));
    x("S.view='stunden'; render()"); await warte(700);
    const k = karte(/^Reisekosten und Kilometergeld/), iban = k ? k.querySelector('[data-k="iban"]').value : null;
    p(!/TT-Geheim/.test(rk()) && !x("AUSLAGEN.some(function(z){ return z.user_id!==meineKennung(); })") && !iban,
      "RK-01 Techniker sieht Reisekosten/IBAN des Inhabers: " + JSON.stringify({ iban, auslagen: x("AUSLAGEN.map(function(z){ return z.text; })") }));
    if (k) knopf(k, /Konto speichern/).click();
    await warte(400);
    p(((db.auslagen_konto.find((z) => z.user_id === "u_tech_test_at") || {}).iban || null) !== "AT88 0000 0000 0000 0001", "RK-01 fremde IBAN als eigenes Auszahlungskonto gespeichert");
    const chatVorher = db.chat.length, ab = knopf(karte(/^Reisekosten und Kilometergeld/), /Monat abgeben/);
    if (ab) ab.click();
    await warte(600);
    p(db.chat.length === chatVorher && !window.__toasts.some((t) => /^Abgegeben/.test(t)), "RK-01 falsche Abgabe-Meldung/Nachricht an den Inhaber: " + JSON.stringify(window.__toasts));
    /* RK-02: der Inhaber gibt zurück – eine Minute später lädt die Liste beim Zeichnen neu */
    db.auslagen.find((z) => z.id === "tkR1").status = "offen";
    x("akStand=0"); neu(); await warte(600);
    const stand = x("AUSLAGEN.filter(function(z){ return z.id==='tkR1'; }).map(function(z){ return z.status; }).join()");
    x("akEditor(AUSLAGEN.filter(function(z){ return z.id==='tkR1'; })[0])"); await warte(300);
    const d = window.__rk.dlg();
    p(stand === "offen" && d && !/Schon abgegeben/.test(d.textContent), "RK-02 Zurückgegebenes bleibt gesperrt (Liste nie nachgeladen): " + stand);
    x("ansichtenSchliessen()");
    /* RK-02: Ladefehler so, wie supabase-js ihn liefert ({error:{message:"TypeError: Failed to fetch"}}) – Klartext, danach neuer Versuch */
    x("(function(){ var sb=Store.sb, alt=sb.from.bind(sb), n=0; sb.from=function(t){ var q=alt(t); if(t==='auslagen' && n++===0) q.then=function(ok,nok){ return Promise.resolve({data:null,error:{message:'TypeError: Failed to fetch'}}).then(ok,nok); }; return q; }; return 1; })()");
    x("akStand=0"); neu(); await warte(600);
    const fehlerText = rk();
    p(!/Failed to fetch/.test(fehlerText) && /Verbindung/.test(fehlerText), "RK-02 Ladefehler als Rohtext: " + fehlerText.slice(0, 250));
    x("akStand=0"); neu(); await warte(600);
    p(/Parkgarage/.test(rk()) && !/Verbindung/.test(rk()), "RK-02 nach dem Ladefehler kein neuer Versuch: " + rk().slice(0, 250));
    return { inhaberSieht, rolle: x("Rolle.name"), fehlt };
  });
  pruefe(r.inhaberSieht && r.rolle === "techniker", "Aufbau falsch: " + JSON.stringify(r));
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest reisekosten: Monat abgeben, Konto, ausbezahlt, Kilometergeld-Satz – ehrliche Rückmeldung, auch ohne Verbindung", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, karte, knopf } = window.__rk;
    const heute = x("isoLokal(new Date())"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const meine = () => karte(/^Reisekosten und Kilometergeld/);
    db.auslagen.push({ id: "tkA1", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Parken Test", kategorie: "parken", betrag: 11.5, foto: "u_tech_test_at/a.jpg", status: "offen", erstellt: new Date().toISOString() });
    window.__rk.toastSpion();
    x("S.view='stunden'; render()"); await warte(700);
    /* RK-07: am zweiten Gerät schon abgegeben – das Abgeben trifft keine Zeile */
    db.auslagen.find((z) => z.id === "tkA1").status = "eingereicht";
    let chatVorher = db.chat.length;
    knopf(meine(), /Monat abgeben/).click(); await warte(700);
    p(!window.__toasts.some((t) => /^Abgegeben/.test(t)) && db.chat.length === chatVorher && window.__toasts.some((t) => /schon abgegeben/i.test(t)),
      "RK-07 Abgeben traf keine Zeile, trotzdem „Abgegeben“/Nachricht an den Inhaber: " + JSON.stringify({ toasts: window.__toasts, chat: db.chat.length - chatVorher }));
    /* RK-10: ohne Verbindung – Monat abgeben und Konto speichern melden sich */
    db.auslagen.push({ id: "tkA2", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Maut Test", kategorie: "maut", betrag: 4, foto: "u_tech_test_at/m.jpg", status: "offen", erstellt: new Date().toISOString() });
    await x("akLaden(true)"); x("render()"); await warte(300);
    window.__toasts.length = 0; window.__netzWeg = true;
    const ab = knopf(meine(), /Monat abgeben/); ab.click(); await warte(400);
    const abgeben = window.__toasts.splice(0);
    knopf(meine(), /Konto speichern/).click(); await warte(400);
    const konto = window.__toasts.splice(0);
    window.__netzWeg = false;
    p(abgeben.some((t) => /Verbindung/.test(t)), "RK-10 „Monat abgeben“ ohne Verbindung ohne Rückmeldung: " + JSON.stringify(abgeben));
    p(konto.some((t) => /Verbindung/.test(t)), "RK-10 „Konto speichern“ ohne Verbindung ohne Rückmeldung: " + JSON.stringify(konto));
    /* Inhaber: ausbezahlt und Kilometergeld-Satz ohne Verbindung */
    await window.__rk.anmelden("inhaber@test.at", "inhaber");
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(700);
    const alle = karte(/^Reisekosten aller/);
    window.__toasts.length = 0; window.__netzWeg = true;
    const az = [...alle.querySelectorAll("button")].find((b) => b.textContent === "ausbezahlt");
    az.click(); await warte(400);
    const ausbezahlt = window.__toasts.splice(0), grau = az.disabled;
    alle.querySelector("[data-satz]").value = "0,42"; alle.querySelector("[data-satzok]").click(); await warte(400);
    const satz = window.__toasts.splice(0);
    window.__netzWeg = false;
    p(ausbezahlt.some((t) => /Verbindung/.test(t)) && !grau, "RK-10 „ausbezahlt“ ohne Verbindung: keine Meldung oder Knopf bleibt grau: " + JSON.stringify({ ausbezahlt, grau }));
    p(satz.some((t) => /Verbindung/.test(t)), "RK-10 Kilometergeld-Satz ohne Verbindung ohne Rückmeldung: " + JSON.stringify(satz));
    p(db.auslagen.every((z) => z.status !== "ausbezahlt"), "ohne Verbindung trotzdem ausbezahlt");
    return { rolle: x("Rolle.name"), fehlt };
  });
  pruefe(r.rolle === "inhaber", "Aufbau falsch: " + JSON.stringify(r));
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest reisekosten: Inhaber ändert fremde Einträge – Privatauto bleibt, kein Vorschlag aus dem eigenen Kalender, Belegfoto bleibt bei der Person, eigene Karte und „Reisekosten aller“ stimmen", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, karte, dlg, speichern } = window.__rk;
    const heute = x("isoLokal(new Date())"), ich = x("meineKennung()"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    db.fahrzeuge.push({ id: "fzT", kennzeichen: "S-TT 100", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], privat_von: "u_tech_test_at", privat_name: "Testtechniker", aktiv: true });
    db.auslagen.push({ id: "akK", user_id: "u_tech_test_at", name: "Testtechniker", art: "km", datum: heute, text: "Salzburg – Wels – Salzburg", km: 200, km_satz: 0.5, betrag: 100, fahrzeug_id: "fzT", fahrzeug_name: "S-TT 100", status: "eingereicht", erstellt: new Date().toISOString() },
      { id: "akB", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Baumarkt Fremd", kategorie: "material", betrag: 23.85, foto: "u_tech_test_at/b.jpg", status: "eingereicht", erstellt: new Date().toISOString() });
    await x("fzLaden(true)");
    /* eigener Termin des Inhabers heute an einem Markt – daraus darf kein Strecken-Vorschlag für den Techniker werden */
    await x("Store.sb.from('planung').insert(" + JSON.stringify({ art: "termin", kategorie: "wartung", titel: "Wartung Test", datum: heute, wer: [ich], wer_namen: ["I"], standort_id: "TS1" }) + ").select('*')");
    x("planungStand=0; planungNachladen()"); await warte(400);
    window.__entfernt = [];
    x("(function(){ var st=Store.sb.storage, alt=st.from.bind(st); st.from=function(n){ var e=alt(n), rm=e.remove; e.remove=function(p){ window.__entfernt.push(n+':'+JSON.stringify(p)); return rm.apply(e, arguments); }; return e; }; return 1; })()");
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(800);
    /* RK-04: km-Eintrag des Technikers mit seinem Privatauto */
    x("akEditor(AK_ALLE.liste.filter(function(z){ return z.id==='akK'; })[0])"); await warte(400);
    let d = dlg();
    const auswahl = d.querySelector('[data-f="fahrzeug_id"]').value, chips = [...d.querySelectorAll("[data-vorschlag] .chip")].map((c) => c.textContent);
    d.querySelector('[data-f="text"]').value = "Salzburg – Wels – Linz – Salzburg";
    speichern(d); await warte(700);
    const k = db.auslagen.find((q) => q.id === "akK");
    p(/Linz/.test(k.text) && k.fahrzeug_id === "fzT" && k.fahrzeug_name === "S-TT 100", "RK-04 Privatauto des Technikers beim Speichern still entfernt: " + JSON.stringify({ auswahl, text: k.text, fahrzeug_id: k.fahrzeug_id, fahrzeug_name: k.fahrzeug_name }));
    p(!chips.some((c) => /laut Kalender/.test(c)), "RK-04 Strecken-Vorschlag aus dem Kalender des Inhabers beim Eintrag des Technikers: " + JSON.stringify(chips));
    /* RK-05, RK-06: Beleg des Technikers ändern (Betrag; ein neues Foto darf nicht im Ordner des Inhabers landen) */
    x("akEditor(AK_ALLE.liste.filter(function(z){ return z.id==='akB'; })[0])"); await warte(400);
    d = dlg();
    d.querySelector('[data-f="betrag"]').value = "30,00";
    const inp = d.querySelector("[data-foto]");
    if (inp) {
      const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60; cv.getContext("2d").fillRect(0, 0, 20, 20);
      const blob = await new Promise((f) => cv.toBlob(f, "image/png"));
      const dt = new DataTransfer(); dt.items.add(new File([blob], "neu.png", { type: "image/png" }));
      inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    }
    speichern(d); await warte(900);
    const b = db.auslagen.find((q) => q.id === "akB");
    p(b.betrag === 30, "RK-05/06 Betrag nicht gespeichert: " + b.betrag);
    /* Speicher-Regel „auslagen fotos lesen“ (tools/reisekosten.sql): die Person liest nur ihren eigenen Ordner – der Inhaber ersetzt
       das Foto dort (Antwort des Inhabers 05.10.2026, statt RK-05 „nur die Person“); das alte wird erst nach dem Speichern entfernt */
    p(String(b.foto || "").indexOf("u_tech_test_at/") === 0 && b.foto !== "u_tech_test_at/b.jpg" && window.__entfernt.length === 1 && /u_tech_test_at\/b\.jpg/.test(window.__entfernt[0]),
      "RK-05 Belegfoto liegt nicht im Ordner der Person bzw. das alte nicht (genau einmal) entfernt: " + JSON.stringify({ foto: b.foto, entfernt: window.__entfernt }));
    const eigene = (karte(/^Reisekosten und Kilometergeld/) || {}).textContent || "";
    p(!/Baumarkt Fremd|Linz/.test(eigene) && x("AUSLAGEN.filter(function(z){ return z.user_id!==meineKennung(); }).length") === 0, "RK-06 fremde Einträge in der eigenen Reisekosten-Karte des Inhabers");
    const alleText = (karte(/^Reisekosten aller/) || {}).textContent || "";
    p(x("(AK_ALLE.liste.filter(function(z){ return z.id==='akB'; })[0]||{}).betrag") === 30 && !/23,85/.test(alleText), "RK-06 „Reisekosten aller“ zeigt nach dem Speichern den alten Betrag");
    /* RK-06: löschen – die Zeile verschwindet auch aus „Reisekosten aller“ */
    x("akEditor(AK_ALLE.liste.filter(function(z){ return z.id==='akB'; })[0])"); await warte(400);
    [...dlg().querySelectorAll(".as-fuss button")].find((q) => /Löschen/.test(q.textContent)).click(); await warte(900);
    p(!db.auslagen.some((z) => z.id === "akB") && !/Baumarkt Fremd/.test((karte(/^Reisekosten aller/) || {}).textContent || ""), "RK-06 gelöschter Eintrag steht weiter in „Reisekosten aller“");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest reisekosten: To-do „Reisekosten … – auszahlen“ aktualisiert sich und führt in den Monat der Abgabe; Ladefehler bei „Reisekosten aller“ ohne Endlosschleife", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, karte } = window.__rk;
    const fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const todos = () => [...document.querySelectorAll("#kal_todo button")].filter((b) => /Reisekosten/.test(b.textContent));
    x("S.view='kalender'; render()"); await warte(800);
    const vorher = todos().length;
    /* RK-08: der Techniker gibt den Vormonat ab, während der Kalender des Inhabers offen ist */
    const vm = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)");
    db.auslagen.push({ id: "tkV1", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: vm + "-28", text: "Baumarkt Test", kategorie: "material", betrag: 55, foto: "u_tech_test_at/v.jpg", status: "eingereicht", erstellt: new Date().toISOString() });
    x("typeof akAbgegebenStand==='undefined' || (akAbgegebenStand=0)");   /* gedrosselt: eine Minute später */
    for (let i = 0; i < 2; i++) { x("S.view='faellig'; render()"); await warte(150); x("S.view='kalender'; render()"); await warte(500); }
    const nachher = todos().map((b) => b.textContent);
    p(vorher === 0 && nachher.length === 1, "RK-08 To-do zeigt die neue Abgabe erst nach Neuladen der Seite: " + JSON.stringify({ vorher, nachher }));
    /* RK-03: der Klick führt in den Monat der Abgabe */
    x("S.akMonatAlle=isoLokal(new Date()).slice(0,7)");
    if (todos()[0]) todos()[0].click();
    await warte(900);
    const ka = karte(/^Reisekosten aller/), inhalt = ka ? ka.querySelector("[data-inhalt]") : null;
    p(x("S.akMonatAlle") === vm && inhalt && /Testtechniker/.test(inhalt.textContent), "RK-03 To-do führt nicht in den abgegebenen Monat: " + JSON.stringify({ monat: x("S.akMonatAlle"), vm, inhalt: inhalt ? inhalt.textContent.slice(0, 80) : null }));
    /* TTQ-19: wirft die Abfrage (Netz weg beim Lesen), zeichnet sich der Reiter nicht endlos neu */
    x("(function(){ var sb=Store.sb, alt=sb.from.bind(sb); sb.from=function(t){ var q=alt(t); if(t==='auslagen') q.then=function(ok,nok){ return Promise.reject(new TypeError('Failed to fetch')).then(ok,nok); }; return q; }; return 1; })()");
    x("(function(){ window.__rz={n:0}; var alt=render; render=function(){ window.__rz.n++; if(window.__rz.n>200) return; return alt.apply(this, arguments); }; return 1; })()");
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(1000);
    const n = x("window.__rz.n"), alleText = (karte(/^Reisekosten aller/) || {}).textContent || "";
    p(n < 10 && /Verbindung/.test(alleText), "TTQ-19 Ladefehler bei „Reisekosten aller“: " + n + " Neuzeichnungen in 1 s; Karte: " + alleText.slice(-80));
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest reisekosten: Erfassen – Vorschau wie gespeichert, Grenzen der Datenbank auf Deutsch, Vorbelegung aus dem Bedarf passt, Präsentation rechnet richtig", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, dlg, speichern } = window.__rk;
    const heute = x("isoLokal(new Date())"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const foto = async (d, name) => {
      const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60; cv.getContext("2d").fillRect(0, 0, 20, 20);
      const blob = await new Promise((f) => cv.toBlob(f, "image/png"));
      const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: "image/png" }));
      const inp = d.querySelector("[data-foto]"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    };
    /* RK-11: alter Eintrag mit 0,42 €/km – die Vorschau nennt den Satz, mit dem gespeichert wird */
    db.auslagen.push({ id: "tkK1", user_id: "u_tech_test_at", name: "Testtechniker", art: "km", datum: heute, text: "Salzburg – Hallein – Salzburg", km: 100, km_satz: 0.42, betrag: 42, status: "offen", erstellt: new Date().toISOString() });
    /* Kilometergeld nur mit eingetragenem Privatauto (Inhaber 05.10.2026) */
    db.fahrzeuge.push({ id: "fzTk", kennzeichen: "S-TK 1", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], privat_von: "u_tech_test_at", privat_name: "Testtechniker", aktiv: true });
    await x("fzLaden(true)");
    x("S.view='stunden'; render()"); await warte(700);
    x("akEditor(AUSLAGEN.filter(function(z){ return z.id==='tkK1'; })[0])"); await warte(300);
    let d = dlg();
    const vorschau = d.querySelector("[data-kmbetrag]").textContent;
    speichern(d); await warte(500);
    p(db.auslagen.find((z) => z.id === "tkK1").betrag === 42 && /42,00/.test(vorschau), "RK-11 Vorschau zeigt einen anderen Betrag als gespeichert wird: " + vorschau);
    /* RK-11: km mit zwei Nachkommastellen – die Datenbank speichert eine (numeric(8,1)) */
    x("ansichtenSchliessen(); akEditor(null, {art:'km'})"); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Salzburg – Anif";
    const kmFeld = d.querySelector('[data-f="km"]'); kmFeld.value = "12,35"; kmFeld.dispatchEvent(new Event("input"));
    const vorschau2 = d.querySelector("[data-kmbetrag]").textContent;
    speichern(d); await warte(500);
    const k2 = db.auslagen.find((z) => z.text === "Salzburg – Anif") || {};
    p(/12,4 km/.test(vorschau2) && /6,20/.test(vorschau2) && k2.betrag === 6.2, "RK-11 Vorschau „12,35 km“ weicht vom Gespeicherten ab: " + JSON.stringify({ vorschau2, km: k2.km, betrag: k2.betrag }));
    /* TTQ-22: über den Grenzen der Datenbank – deutsche Meldung, nichts gespeichert */
    x("ansichtenSchliessen(); akEditor(null, {art:'km'})"); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Salzburg – Lissabon"; d.querySelector('[data-f="km"]').value = "6000";
    speichern(d); await warte(500);
    const errKm = d.querySelector("[data-err]").textContent;
    p(/5[.\s]?000/.test(errKm) && !/check|violates/i.test(errKm) && !db.auslagen.some((z) => z.km === 6000), "TTQ-22 über 5000 km: " + errKm);
    x("ansichtenSchliessen(); akEditor(null, {art:'beleg'})"); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Testkauf groß"; d.querySelector('[data-f="betrag"]').value = "150000"; await foto(d, "g.png");
    speichern(d); await warte(600);
    const errB = d.querySelector("[data-err]").textContent;
    p(/100[.\s]?000/.test(errB) && !/check|violates/i.test(errB) && !db.auslagen.some((z) => z.betrag === 150000), "TTQ-22 über 100 000 €: " + errB);
    /* RK-14: Bedarf „abholen“ mit langem Text und langer Bezugsquelle → „Selbst bezahlt – Beleg erfassen“ */
    x("ansichtenSchliessen()");
    await x("wzLaden(true)");
    const bd = (await x("Store.sb.from('bedarf').insert({art:'material', text:'" + "Testmaterial ".repeat(16).slice(0, 200) + "', beschaffung:'abholen', bezugsquelle:'" + "Testquelle ".repeat(16).slice(0, 175) + "', status:'offen'}).select('*')")).data[0];
    await x("wzLaden(true)");
    x("bedarfEditor(BEDARF.filter(function(b){ return b.id==='" + bd.id + "'; })[0])"); await warte(300);
    [...dlg().querySelectorAll(".as-fuss button")].find((b) => /Selbst bezahlt/.test(b.textContent)).click(); await warte(300);
    const laenge = dlg().querySelector('[data-f="text"]').value.length;
    p(laenge <= 300, "RK-14 vorbelegter Text länger als die Datenbank erlaubt (300): " + laenge);
    x("ansichtenSchliessen()");
    /* RK-12: Präsentation – km ändern rechnet neu, Beleg mit Foto ohne „Foto fehlt“ */
    await window.__rk.anmelden("praes@test.at", "praesentation");
    x("ansichtenSchliessen(); S.akMonat=''; S.view='stunden'; render()"); await warte(500);
    x("akEditor(null, {art:'km'})"); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Salzburg – Hallein"; d.querySelector('[data-f="km"]').value = "12,5"; speichern(d); await warte(300);
    x("akEditor(AUSLAGEN.filter(function(z){ return z.art==='km'; })[0])"); await warte(300);
    d = dlg(); d.querySelector('[data-f="km"]').value = "100"; speichern(d); await warte(300);
    const km = x("AUSLAGEN.filter(function(z){ return z.art==='km'; }).map(function(z){ return z.km+' km = '+z.betrag; }).join()");
    x("akEditor(null, {art:'beleg'})"); await warte(300);
    d = dlg(); d.querySelector('[data-f="text"]').value = "Baumarkt Test"; d.querySelector('[data-f="betrag"]').value = "9,90"; await foto(d, "b.png");
    speichern(d); await warte(400);
    x("ansichtenSchliessen(); S.view='stunden'; render()"); await warte(400);
    const kp = window.__rk.karte(/^Reisekosten und Kilometergeld/);
    p(km === "100 km = 50", "RK-12 Präsentation: km geändert, Betrag nicht neu gerechnet: " + km);
    p(kp && /Baumarkt Test/.test(kp.textContent) && !/Foto fehlt/.test(kp.textContent), "RK-12 Präsentation: Beleg mit Foto steht als „⚠ Foto fehlt“");
    return { rolle: x("Rolle.name"), fehlt };
  });
  pruefe(r.rolle === "praesentation", "Aufbau falsch: " + JSON.stringify(r));
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest reisekosten: Blätter, PDF, CSV und Rundgang – gleiche Beleg-Nummern, jeder Kilometergeld-Satz genannt, Zahlen ohne Tausendertrenner, kein fester Satz im Rundgang", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, karte } = window.__rk;
    const heute = x("isoLokal(new Date())"), m = heute.slice(0, 7), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    /* RK-13: zwei Belege vom selben Tag – in Postgres ist die Reihenfolge bei order('datum') nicht festgelegt, hier der später erfasste zuerst */
    db.auslagen.push({ id: "tkS2", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Zweiter Kauf", kategorie: "material", betrag: 1234.5, foto: "u_tech_test_at/2.jpg", status: "eingereicht", erstellt: "2026-01-02T10:00:00Z" },
      { id: "tkS1", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Erster Kauf", kategorie: "material", betrag: 1, foto: "u_tech_test_at/1.jpg", status: "eingereicht", erstellt: "2026-01-01T10:00:00Z" },
      { id: "tkC2", user_id: "u_tech_test_at", name: "Testtechniker", art: "km", datum: heute, text: "Salzburg – Wien", km: 222.4, km_satz: 0.5, betrag: 111.2, status: "eingereicht", erstellt: new Date().toISOString() });
    /* Kontoinhaber tippt jede Person selbst – in der CSV darf daraus keine Excel-Formel werden */
    db.auslagen_konto.push({ user_id: "u_tech_test_at", kontoinhaber: "=1+1", iban: "AT00 TEST" });
    await x("akAlleLaden('" + m + "')");
    /* Blatt der Person: akImMonat; PDF des Inhabers: je Person aus AK_ALLE.liste in dieser Reihenfolge */
    const person = x("akSummen(akImMonat(AK_ALLE.liste,'" + m + "')).belege.map(function(z){ return z.text; })");
    const inhaber = x("akSummen(AK_ALLE.liste.filter(function(z){ return z.user_id==='u_tech_test_at'; })).belege.map(function(z){ return z.text; })");
    p(JSON.stringify(person) === JSON.stringify(inhaber), "RK-13 Beleg-Nr. im Blatt der Person und im PDF des Inhabers vertauscht: " + JSON.stringify({ person, inhaber }));
    /* RK-15: CSV „Reisekosten aller“ */
    x("(function(){ pdfHerunterladen=function(b){ window.__csv=b; }; return 1; })()");
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(800);
    [...karte(/^Reisekosten aller/).querySelectorAll("button")].find((b) => b.textContent.indexOf("Liste (CSV)") >= 0).click(); await warte(200);
    const zeile = window.__csv ? (await window.__csv.text()).split(String.fromCharCode(10))[1] || "" : "";
    p(zeile && zeile.indexOf(String.fromCharCode(160)) < 0 && /;1235,50;/.test(zeile), "RK-15 CSV: Beträge mit Tausendertrenner (U+00A0): " + zeile.split(String.fromCharCode(160)).join("<NBSP>"));
    p(zeile.indexOf(";=1+1") < 0, "RK-15 CSV: selbst getippter Kontoinhaber als Excel-Formel: " + zeile);
    /* TTQ-20: zwei Kilometergeld-Sätze im Monat – beide stehen im PDF */
    const html = x("akPdfHtml([{art:'km',datum:'2026-09-03',text:'A',km:100,km_satz:0.5,betrag:50},{art:'km',datum:'2026-09-20',text:'B',km:100,km_satz:0.42,betrag:42}],'Test','2026-09',null,[])");
    p(html.indexOf("0,42") >= 0 && html.indexOf("0,50") >= 0, "TTQ-20 PDF nennt nur einen Kilometergeld-Satz");
    /* RK-17: der Rundgang nennt keinen festen Satz */
    x("KM_SATZ=0.42");
    const s = x("RUNDGAENGE.stunden.schritte.filter(function(s){ return s.titel==='Reisekosten und Kilometergeld'; })[0]");
    const t = typeof s.text === "function" ? s.text() : s.text;
    p(!/0,50 € je km/.test(t), "RK-17 Rundgang nennt fest „0,50 € je km“, eingestellt ist 0,42");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* ---- Tiefentest Mail: Hilfen im Browser – das Mail-Programm am PC nachgebaut (nichts geht ins Netz) ---- */
const TM_HILFEN = `
  window.__tm = {
    warte: (ms) => new Promise((f) => setTimeout(f, ms)),
    /* warten, bis bed() stimmt (höchstens ms) – kürzer als feste Wartezeiten */
    bis: async (bed, ms) => { const ende = Date.now() + (ms || 5000); for (;;) { let ok = false; try { ok = bed(); } catch (e) {} if (ok || Date.now() > ende) return ok; await new Promise((f) => setTimeout(f, 40)); } },
    dlg: () => [...document.querySelectorAll(".assistent")].pop(),
    knopf: (wo, re) => [...(wo || document).querySelectorAll("button")].find((b) => re.test(b.textContent)),
    fuss: (re) => [...((window.__tm.dlg() || document).querySelectorAll(".as-fuss button"))].find((b) => re.test(b.textContent)),
    toastSpion: () => { window.__toasts = []; window.__t.x("(function(){ if(window.__toastSpion) return 1; window.__toastSpion=1; var alt=toast; toast=function(m){ window.__toasts.push(String(m)); return alt.apply(this, arguments); }; return 1; })()"); },
    toastBis: (re, ms) => window.__tm.bis(() => window.__toasts.some((t) => re.test(t)), ms),
    verbinden: () => localStorage.setItem("ukt_mailbruecke", JSON.stringify({ schluessel: "ef".repeat(16), konto: window.__t.x("wer()"), seit: new Date().toISOString() })),
    /* c: Antwort je Pfad (/api/<pfad>) – Wert, Funktion (u, o) oder Promise; ohne Angabe die Vorgaben */
    programm: (c) => {
      const tm = window.__tm, alt = tm.altFetch || (tm.altFetch = window.fetch);
      tm.aufrufe = [];
      const res = (d) => d instanceof Response ? d : new Response(d instanceof Blob ? d : typeof d === "string" ? d : JSON.stringify(d), { status: 200 });
      const vorgabe = { status: { ok: true, konten: [], claude: true }, "leitstand/abholen": { auftrag: null },
        roh: () => new Blob(["From: p@planer-test.at\\r\\n\\r\\nText"], { type: "message/rfc822" }),
        anhang: (u) => new Blob(["%PDF-1.4 " + u], { type: "application/pdf" }),
        suche: () => ({ mails: c.mails || [] }), mail: () => c.mail,
        /* wie das Mail-Programm: nur die gewählten Mails kommen zurück */
        verlauf: (u, o) => { const w = JSON.parse(o.body).mails.map((m) => m.uid); return { mails: (c.mails || []).filter((m) => w.indexOf(m.uid) >= 0), vorschlag: c.vorschlag || {} }; } };
      window.fetch = (u, o) => {
        u = String(u); if (!u.startsWith("http://localhost:4317")) return alt(u, o);
        const pfad = (/\\/api\\/([a-z\\/]+)/.exec(u) || [])[1] || ""; tm.aufrufe.push(pfad);
        let w = pfad in c ? c[pfad] : vorgabe[pfad];
        if (typeof w === "function") w = w(u, o);
        if (w === undefined) return Promise.resolve(new Response('{"fehler":"unbekannt"}', { status: 404 }));
        return Promise.resolve(w).then(res);
      };
    },
    ende: () => { if (window.__tm.altFetch) window.fetch = window.__tm.altFetch; },
    /* Mailverlauf: suchen, auswerten lassen, Vorschlag abwarten */
    verlauf: async (vorgabe, vorher) => {
      const tm = window.__tm;
      window.__t.x("ansichtenSchliessen()"); window.__t.x("mailVerlaufDialog(" + JSON.stringify(vorgabe) + ")");
      await tm.bis(() => tm.fuss(/Mit Claude auswerten \\(/));
      if (vorher) await vorher(tm.dlg());
      await tm.bis(() => !tm.fuss(/Mit Claude auswerten/).disabled, 1000);
      tm.fuss(/Mit Claude auswerten/).click();
      await tm.bis(() => tm.fuss(/Projekt anlegen|Ins Projekt übernehmen/));
      return tm.dlg();
    },
    anmelden: async (mail, rolle) => {
      const x = window.__t.x;
      await x("Store.sb.auth.signOut()"); await window.__tm.warte(300);
      await x("Store.sb.auth.signInWithPassword({email:'" + mail + "',password:'test123'})");
      for (let i = 0; i < 80 && !x("Rolle.da && Rolle.name==='" + rolle + "'"); i++) await window.__tm.warte(100);
      await window.__tm.warte(300);
    },
  }; 1`;
async function tmSeite(konto) { const a = await oeffnen(konto); await a.seite.evaluate((h) => eval(h), TM_HILFEN); return a; }

test("Tiefentest mail: Rechte – Posteingang nur für Mitarbeiter, KPlus-PDFs und Mails mit Angebot/Rechnung nur für den Inhaber", async () => {
  /* M5: alle Datenbank-Regeln zum Posteingang (Tabelle und Dateien) lesen nur mit darf_schreiben() – nie für jedes Konto */
  const { readdirSync } = await import("node:fs");
  const sql = readdirSync(join(WURZEL, "tools")).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(WURZEL, "tools", f), "utf8")).join("\n") + "\n" + readFileSync(join(WURZEL, "supabase-setup.sql"), "utf8");
  const regeln = [...sql.matchAll(/create policy "posteingang (lesen|ansehen)"[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " "));
  pruefe(regeln.length >= 4 && regeln.every((t) => /darf_schreiben\(\)/.test(t) && !/using \(true\)/.test(t)), "M5 Posteingang für jedes angemeldete Konto lesbar: " + regeln.join(" | "));
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const sb = x("Store.sb");
    /* M5: weitergeleitete Mail eines anderen Kunden im Posteingang – das Kunden-Konto und die Präsentation bekommen nichts davon */
    await sb.storage.from("posteingang").upload("2026/10/tm5_mail.eml", new Blob(["From: a@anderer-kunde-test.at\r\n\r\nText"]));
    db.posteingang.push({ id: "tm5a", nachricht_id: "<tm5@test>", art: "mail", dateiname: "Anfrage anderer Kunde.eml", pfad: "2026/10/tm5_mail.eml", status: "neu", betreff: "Anfrage anderer Kunde", absender: "a@anderer-kunde-test.at", eingang: jetzt, bytes: 300 });
    for (const [konto, rolle] of [["kunde@test.at", "kunde"], ["praes@test.at", "praesentation"]]) {
      await tm.anmelden(konto, rolle);
      const zeilen = await x("Store.sb").from("posteingang").select("*"), datei = await x("Store.sb").storage.from("posteingang").createSignedUrl("2026/10/tm5_mail.eml", 600);
      p(!(zeilen.data || []).length && !datei.data, "M5 " + rolle + " liest den Posteingang: " + (zeilen.data || []).length + " Zeilen, Datei " + (datei.data ? "abrufbar" : "gesperrt"));
    }
    await tm.anmelden("inhaber@test.at", "inhaber");
    p(((await x("Store.sb").from("posteingang").select("*")).data || []).length >= 1, "M5 Inhaber liest den Posteingang nicht mehr");
    db.posteingang.find((e) => e.id === "tm5a").status = "verworfen";

    /* M3/M4: KPlus-PDFs (6-stellige Nummer) sind Angebote/Rechnungen – nur der Inhaber legt sie ab (Büro-Ordner);
       die Mail selbst (.eml) enthält sie als Anhang und liegt dann ebenso nur beim Inhaber */
    tm.verbinden(); tm.toastSpion(); window.UKT_CONFIG.posteingangAktiv = true;
    x("kplusLesen=function(d){ var t=new TextDecoder().decode(d), nr=(/4139\\d\\d/.exec(t)||[''])[0]; if(!nr) return Promise.reject(new Error('kein KPlus')); return Promise.resolve({art:nr==='413953'?'angebot':'rechnung', nummer:nr, datum:'2026-03-20', kopf:{}, positionen:[{typ:'pos', nr:'1', menge:1, eh:'Stk', text:'Testposition', preis:1000}], summenPdf:{netto:1000}}); }");
    const roh = (nr) => new Blob(["From: buero@test-firma.at\r\nSubject: Rechnung " + nr + "\r\n\r\nAnbei die Rechnung, netto 1.000,00 (Anhang " + nr + ".pdf als base64)"], { type: "message/rfc822" });
    const anh = (u) => { const nr = (/uid=(\d+)/.exec(u) || [])[1]; return new Blob(["%PDF-1.4 " + (nr === "33" ? "Plan" : "KPlus 4139" + nr)], { type: "application/pdf" }); };
    db.projekte.push({ id: "tmp_r3", nummer: "P-2026-903", titel: "Rechte Kälte", kunde_id: "lidl", status: "baustelle", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()");
    const MV = { konto: "gmx", ordner: "INBOX", uid: 52, messageId: "<tm52@test>", datum: "2026-03-20T08:00:00.000Z", betreff: "Rechnung 413952", von: [{ name: "Büro", address: "buero@test-firma.at" }], an: [],
      anhaenge: [{ i: 0, name: "413952.pdf", typ: "application/pdf", groesse: 4096 }] };
    tm.programm({ mails: [MV], vorschlag: { titel: "Rechte Rechnungstest", kunde: "Lidl", kundeTreffer: "Lidl", status: "abgerechnet", angaben: [], beteiligte: [], termine: [], tagebuch: [], dateien: [] },
      roh: (u) => roh("4139" + (/uid=(\d+)/.exec(u) || [])[1]), anhang: anh });
    await tm.verlauf({ suche: "413952" });
    tm.fuss(/Projekt anlegen/).click();
    await tm.toastBis(/angelegt:|^Nicht fertig/);
    const pv = db.projekte.find((q) => q.titel === "Rechte Rechnungstest"), dv = ((pv && pv.daten.dateien) || []).map((f) => f.art + "|" + f.pfad);
    p(dv.some((f) => /^rechnung\|buero\/.*413952\.pdf$/.test(f)) && dv.some((f) => /^mail\|buero\/.*\.eml$/.test(f)), "M3 Mailverlauf: Mail mit KPlus-Rechnung nicht nur beim Inhaber: " + JSON.stringify(dv));
    /* „Mail zu Projekt legen“ (Mail-Programm): KPlus-Anhang als Angebot unter buero/, die Mail ebenso; eine Mail nur mit Plan bleibt für alle */
    const MZ = (uid, name) => ({ konto: "gmx", ordner: "INBOX", uid, messageId: "<tm" + uid + "@test>", datum: "2026-03-21T08:00:00.000Z", betreff: "Unterlagen " + uid, von: [{ name: "Büro", address: "buero@test-firma.at" }], an: [], text: "Anbei",
      anhaenge: [{ i: 0, name, typ: "application/pdf", groesse: 4096 }] });
    for (const [uid, name] of [[53, "413953.pdf"], [33, "Plan EG.pdf"]]) {
      tm.programm({ mail: MZ(uid, name), roh: (u) => roh("4139" + uid), anhang: anh }); window.__toasts = [];
      x("ansichtenSchliessen()"); x("mailUebernehmen({k:'gmx', o:'INBOX', u:" + uid + ", a:'zuprojekt', p:'tmp_r3'})");
      await tm.bis(() => tm.fuss(/Ins Projekt legen/));
      tm.fuss(/Ins Projekt legen/).click();
      await tm.toastBis(/abgelegt|^Nicht/);
    }
    const dz = (db.projekte.find((q) => q.id === "tmp_r3").daten.dateien || []).map((f) => f.art + "|" + f.pfad + "|" + f.name);
    p(dz.some((f) => /^angebot\|buero\/.*413953\.pdf$/.test(f)) && dz.some((f) => /^mail\|buero\/.*Unterlagen 53\.eml$/.test(f)), "M3/M4 Mail zu Projekt: KPlus-Angebot bzw. die Mail dazu nicht nur beim Inhaber: " + JSON.stringify(dz));
    p(dz.some((f) => /^mail\|tmp_r3\/.*Unterlagen 33\.eml$/.test(f)), "M3 Mail ohne Angebot/Rechnung landet unnötig im Büro-Ordner: " + JSON.stringify(dz));
    /* Posteingang beim Inhaber: KPlus-PDF als Rechnung erkannt (Büro-Ordner), die Mail ebenso */
    const sbI = x("Store.sb"), pe = (id, gr, art, name, pfad) => ({ id, nachricht_id: "<" + gr + "@test>", art, dateiname: name, pfad, status: "neu", betreff: "Fwd: Rechnung P-2026-903", absender: "office@ukt.at", eingang: jetzt, bytes: 400 });
    /* (ohne Dateityp hochgeladen – die Attrappe kennt für den Posteingang nur PDF und Bilder) */
    await sbI.storage.from("posteingang").upload("2026/10/tm4_mail.eml", new Blob(["From: buero@test-firma.at\r\n\r\nAnbei die Rechnung 413954"]));
    await sbI.storage.from("posteingang").upload("2026/10/tm4_413954.pdf", new Blob(["%PDF-1.4 KPlus 413954"], { type: "application/pdf" }));
    db.posteingang.push(pe("tm4a", "tm4", "mail", "Fwd Rechnung P-2026-903.eml", "2026/10/tm4_mail.eml"), pe("tm4b", "tm4", "unbekannt", "413954.pdf", "2026/10/tm4_413954.pdf"));
    let k = x("posteingangKarte()"); document.body.appendChild(k); await tm.bis(() => k.querySelector(".posbox"));
    tm.knopf(k, /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    let d = tm.dlg(), zeile = () => [...d.querySelectorAll("[data-d] .rowflex")].find((z) => /413954\.pdf/.test(z.textContent));
    await tm.bis(() => zeile().querySelector("select").value === "rechnung", 1500);
    p(zeile().querySelector("select").value === "rechnung", "M4 Posteingang (Inhaber): KPlus-PDF nicht als Rechnung erkannt, vorgewählt „" + zeile().querySelector("select").value + "“");
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/);
    const dp = (db.projekte.find((q) => q.id === "tmp_r3").daten.dateien || []).filter((f) => /Fwd Rechnung|413954/.test(f.name)).map((f) => f.art + "|" + f.pfad);
    p(dp.length === 2 && dp.every((f) => /\|buero\//.test(f)), "M3/M4 Posteingang (Inhaber): Rechnung bzw. Mail dazu nicht im Büro-Ordner: " + JSON.stringify(dp));
    k.remove(); x("ansichtenSchliessen()"); tm.ende();

    /* als Admin: Mail und Rechnung aus dem Mailverlauf sind nicht zu sehen; Projektmails im Posteingang auch nicht */
    await tm.anmelden("admin@test.at", "admin"); tm.toastSpion(); await x("projekteLaden()");
    x("projektAnsicht('" + pv.id + "')"); await tm.bis(() => tm.dlg() && /Dateien/.test(tm.dlg().textContent));
    const karte = [...tm.dlg().querySelectorAll(".card")].find((c) => /^Dateien/.test((c.querySelector("h2") || {}).textContent || ""));
    const sicht = karte ? [...karte.querySelectorAll("[data-liste] a")].map((l) => l.textContent) : ["(keine Karte)"];
    p(!sicht.some((n) => /\.eml$|413952/.test(n)), "M3 Admin sieht die Mail mit Rechnung bzw. die Rechnung: " + JSON.stringify(sicht));
    x("ansichtenSchliessen()");
    const sbA = x("Store.sb");
    await sbA.storage.from("posteingang").upload("2026/10/tm4c_mail.eml", new Blob(["From: buero@test-firma.at\r\n\r\nAnbei die Rechnung 413955"]));
    await sbA.storage.from("posteingang").upload("2026/10/tm4c_413955.pdf", new Blob(["%PDF-1.4 KPlus 413955"], { type: "application/pdf" }));
    await sbA.storage.from("posteingang").upload("2026/10/tm4c_plan.pdf", new Blob(["%PDF-1.4 Plan"], { type: "application/pdf" }));
    await sbA.storage.from("posteingang").upload("2026/10/tm4d_413956.pdf", new Blob(["%PDF-1.4 KPlus 413956"], { type: "application/pdf" }));
    db.posteingang.push(pe("tm4c1", "tm4c", "mail", "Fwd Unterlagen P-2026-903.eml", "2026/10/tm4c_mail.eml"), pe("tm4c2", "tm4c", "unbekannt", "413955.pdf", "2026/10/tm4c_413955.pdf"),
      pe("tm4c3", "tm4c", "unbekannt", "Plan OG.pdf", "2026/10/tm4c_plan.pdf"), pe("tm4d1", "tm4d", "mail", "Fwd Rechnung 413956.eml", "2026/10/tm4c_mail.eml"), pe("tm4d2", "tm4d", "unbekannt", "413956.pdf", "2026/10/tm4d_413956.pdf"));
    /* Antwort des Inhabers 05.10.2026: weitergeleitete Mails (Projekte) samt Anhängen sieht NUR der Inhaber – der Admin
       bekommt sie weder aus der Datenbank noch als Karte (früher legte er hier den Plan ab, Angebot/Rechnung blieben liegen) */
    const zeilenA = ((await sbA.from("posteingang").select("*")).data || []).filter((e) => /^tm4[cd]/.test(e.id));
    k = x("posteingangKarte()"); document.body.appendChild(k); await tm.bis(() => !/wird geladen/.test(k.textContent));
    p(!zeilenA.length && !/413955|413956|Plan OG|Fwd Unterlagen/.test(k.textContent), "M4 Admin sieht Projektmails im Posteingang: " + JSON.stringify(zeilenA.map((e) => e.id)) + " " + k.textContent.slice(0, 200));
    k.remove();
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Rechte: Protokollfotos, Auftrags- und Rapport-PDFs – das Kunden-Konto nur zu Protokollen seiner Standorte, gleiche Regel in allen Skripten", async () => {
  /* „fotos ansehen“ steht in drei Skripten: jede Fassung gleich (sonst setzt ein erneutes Ausführen zurück), und der Kunde
     kommt an <client_id>/… nur noch über ein Protokoll, das er lesen darf (früher „else true“: alle Protokolldateien) */
  const fassung = (f) => { const m = /create policy "fotos ansehen"[\s\S]*?(using \(bucket_id = 'protokollfotos'[\s\S]*?\);)/.exec(readFileSync(join(WURZEL, "tools", f), "utf8")); return m ? m[1] : "fehlt in " + f; };
  const f = ["anlagenfotos.sql", "chat.sql", "wunsch-fotos.sql"].map(fassung);
  pruefe(f.every((t) => t === f[0]), "„fotos ansehen“ ist nicht in allen Skripten gleich: " + f.join(" | "));
  pruefe(!/else true/.test(f[0]) && /else \(public\.meine_rolle\(\) <> 'kunde'\s+or exists \(select 1 from public\.protokolle p\s+where p\.client_id = split_part\(storage\.objects\.name, '\/', 1\)\)\)/.test(f[0]),
    "„fotos ansehen“ lässt das Kunden-Konto an alle Protokolldateien: " + f[0]);
  const kopf = readFileSync(join(WURZEL, "supabase-setup.sql"), "utf8").split("create table")[0], ks = kopf.indexOf("tools/kunden-projekte-stunden.sql"), af = kopf.indexOf("tools/anlagenfotos.sql");
  pruefe(ks >= 0 && af > ks, "Kopf von supabase-setup.sql: tools/anlagenfotos.sql fehlt oder steht vor tools/kunden-projekte-stunden.sql");
  /* die Attrappe wie die Regel – und die App legt und sucht die Dateien wirklich unter der Kennung des Protokolls (client_id) */
  const a = await tmSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), e = {};
    db.stammdaten.push({ id: "kunde:KT1", typ: "kunde", ziel: "KT1", felder: { name: "Testkunde Eins", aktiv: true }, neu: true, geaendert: jetzt, von: "Test", grund: "Test" });
    db.stammdaten.push({ id: "standort:TS5", typ: "standort", ziel: "TS5", felder: { kundeId: "KT1" }, neu: false, geaendert: jetzt, von: "Test", grund: "Test" });
    const zeile = (cid, sid) => ({ id: "srv_" + cid, client_id: cid, standort_id: sid, erstellt: jetzt, erstellt_von: "u_tech_test_at", datum: jetzt.slice(0, 10), wartungsart: "Stoerung", version: 1,
      fotos: [{ id: "f1", name: "Foto 1" }], stoerung: { auftragDatei: { name: "auftrag.pdf" } } });
    db.protokolle.push(zeile("p_tf_lidl", "TS1"), zeile("p_tf_kt1", "TS5"));
    const pfade = ["p_tf_lidl/f1.jpg", "p_tf_lidl/auftrag.pdf", "p_tf_kt1/f1.jpg", "p_tf_kt1/auftrag.pdf", "p_tf_kt1/rapport-x.pdf", "p_tf_waise/f1.jpg", "chat/tf/1.jpg", "anlagen/TP1/tf-1.jpg", "wunsch/u_tech_test_at/tf/1.jpg"];
    for (const pf of pfade) await x("Store.sb").storage.from("protokollfotos").upload(pf, new Blob(["x"], { type: /\.pdf$/.test(pf) ? "application/pdf" : "image/jpeg" }));
    const sicht = async () => { const o = []; for (const pf of pfade) if ((await x("Store.sb").storage.from("protokollfotos").createSignedUrl(pf, 600)).data) o.push(pf); return o; };
    e.techniker = await sicht();
    for (const [konto, rolle] of [["kunde@test.at", "kunde"], ["praes@test.at", "praesentation"], ["admin@test.at", "admin"], ["inhaber@test.at", "inhaber"]]) {
      await tm.anmelden(konto, rolle);
      e[rolle] = await sicht();
      if (rolle !== "kunde") continue;
      const zeilen = ((await x("Store.sb").from("protokolle").select("*")).data || []).filter((z) => /^p_tf_/.test(z.client_id));
      e.kundeProtokolle = zeilen.map((z) => z.client_id);
      const pr = x("ausZeile")(zeilen[0] || zeile("p_tf_lidl", "TS1"));
      e.kundeFotos = (await x("ladeFotos")(pr)).map((b) => !!b.url);
      e.kundeAuftrag = !!(await x("ladeAuftragPdf")(pr));
      /* dieselben Abrufe für das Protokoll des anderen Kunden (etwa über eine erratene Kennung) */
      const fremd = x("ausZeile")(zeile("p_tf_kt1", "TS5"));
      e.fremdFotos = (await x("ladeFotos")(fremd)).map((b) => !!b.url);
      e.fremdAuftrag = !!(await x("ladeAuftragPdf")(fremd));
    }
    return e;
  });
  const alle = ["p_tf_lidl/f1.jpg", "p_tf_lidl/auftrag.pdf", "p_tf_kt1/f1.jpg", "p_tf_kt1/auftrag.pdf", "p_tf_kt1/rapport-x.pdf", "p_tf_waise/f1.jpg"];
  const gleich = (ist, soll) => JSON.stringify(ist) === JSON.stringify(soll);
  pruefe(gleich(r.kunde, ["p_tf_lidl/f1.jpg", "p_tf_lidl/auftrag.pdf"]), "Kunden-Konto (Lidl) sieht im Speicher: " + JSON.stringify(r.kunde));
  pruefe(gleich(r.kundeProtokolle, ["p_tf_lidl"]), "Kunden-Konto (Lidl) liest Protokolle: " + JSON.stringify(r.kundeProtokolle));
  pruefe(gleich(r.kundeFotos, [true]) && r.kundeAuftrag, "Kunden-Konto: Foto bzw. Auftrag des eigenen Protokolls fehlt in der App: " + JSON.stringify(r));
  pruefe(gleich(r.fremdFotos, [false]) && !r.fremdAuftrag, "Kunden-Konto: Foto bzw. Auftrag eines anderen Kunden abrufbar: " + JSON.stringify(r));
  pruefe(gleich(r.praesentation, alle), "Präsentation sieht im Speicher: " + JSON.stringify(r.praesentation));
  pruefe(gleich(r.techniker, alle.concat(["chat/tf/1.jpg", "anlagen/TP1/tf-1.jpg", "wunsch/u_tech_test_at/tf/1.jpg"])), "Techniker sieht im Speicher: " + JSON.stringify(r.techniker));
  pruefe(gleich(r.admin, alle.concat(["chat/tf/1.jpg", "anlagen/TP1/tf-1.jpg"])), "Admin sieht im Speicher: " + JSON.stringify(r.admin));
  pruefe(gleich(r.inhaber, alle.concat(["chat/tf/1.jpg", "anlagen/TP1/tf-1.jpg", "wunsch/u_tech_test_at/tf/1.jpg"])), "Inhaber sieht im Speicher: " + JSON.stringify(r.inhaber));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest mail: Projekt aus Mailverlauf – vorhandene KPlus-Belege bleiben, nach einem Abbruch „Weiter ablegen“ ohne zweites Projekt", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    tm.verbinden(); tm.toastSpion();
    const leer = { angaben: [], beteiligte: [], termine: [], tagebuch: [], dateien: [] };
    const M = (uid, datum, betreff, anh, von) => ({ konto: "gmx", ordner: "INBOX", uid, messageId: "<tm" + uid + "@test>", datum, betreff, von: [von || { name: "Paula Planer", address: "p@planer-test.at" }], an: [], anhaenge: anh || [] });
    /* M6: Rechnung 413960 ist bezahlt (Projekt tmp_alt), Angebot 413961 abgelehnt (anderes Projekt) – „Verlauf übernehmen“ darf daran nichts ändern */
    db.projekte.push({ id: "tmp_alt", nummer: "P-2026-960", titel: "Altprojekt Belege", kunde_id: "lidl", status: "abgerechnet", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt },
      { id: "tmp_anderes", nummer: "P-2026-961", titel: "Anderes Projekt", kunde_id: "lidl", status: "verloren", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    db.belege.push({ id: "tmb960", art: "rechnung", nummer: "413960", status: "bezahlt", bezahlt: "2026-05-01", faellig: "2026-04-20", projekt_id: "tmp_alt", kunde_id: "lidl", extern: true, test: false, datum: "2026-03-20", positionen: [], kopf: {} },
      { id: "tmb961", art: "angebot", nummer: "413961", status: "abgelehnt", projekt_id: "tmp_anderes", kunde_id: "lidl", extern: true, test: false, datum: "2026-02-10", positionen: [], kopf: {} });
    await x("projekteLaden()");
    x("kplusLesen=function(d){ var t=new TextDecoder().decode(d), nr=(/41396\\d/.exec(t)||[''])[0]; if(!nr) return Promise.reject(new Error('kein KPlus')); return Promise.resolve({art:nr==='413960'?'rechnung':'angebot', nummer:nr, datum:'2026-03-20', kopf:{}, positionen:[{typ:'pos', nr:'1', menge:1, eh:'Stk', text:'Testposition', preis:100}], summenPdf:{netto:100}}); }");
    const pdf = (nr) => [{ i: 0, name: nr + ".pdf", typ: "application/pdf", groesse: 4096 }];
    tm.programm({ mails: [M(60, "2026-03-20T08:00:00.000Z", "Rechnung 413960", pdf("413960")), M(61, "2026-02-10T08:00:00.000Z", "Angebot 413961", pdf("413961"))],
      vorschlag: Object.assign({ status: "abgerechnet" }, leer), anhang: (u) => new Blob(["%PDF-1.4 KPlus " + (u.includes("uid=60") ? "413960" : "413961")], { type: "application/pdf" }) });
    let d = await tm.verlauf({ projektId: "tmp_alt", suche: "413960, 413961" });
    await tm.bis(() => /413961 schon vorhanden/.test(d.innerText), 1500);
    p(/Rechnung 413960 schon vorhanden \(bezahlt/.test(d.innerText) && /Angebot 413961 schon vorhanden \(abgelehnt, P-2026-961/.test(d.innerText), "M6 Vorschlag zeigt nicht, dass die KPlus-Belege schon vorhanden sind");
    tm.fuss(/Ins Projekt übernehmen/).click();
    await tm.toastBis(/^Übernommen|^Nicht fertig/);
    const b = (nr) => { const z = db.belege.find((y) => y.nummer === nr); return z.status + "|" + z.projekt_id + "|" + (z.bezahlt || ""); };
    p(b("413960") === "bezahlt|tmp_alt|2026-05-01", "M6 bezahlte Rechnung überschrieben: " + b("413960"));
    p(b("413961") === "abgelehnt|tmp_anderes|", "M6 abgelehntes Angebot (anderes Projekt) überschrieben: " + b("413961"));
    p(db.belege.filter((y) => /^41396/.test(y.nummer)).length === 2, "M6 Belege doppelt");
    p(window.__toasts.some((t) => /schon vorhanden/.test(t)), "M6 Meldung nennt die schon vorhandenen Belege nicht: " + JSON.stringify(window.__toasts));

    /* M1/M2: das Ablegen bricht ab (erst ist das Mail-Programm kurz weg, dann die Verbindung zur Datenbank) – die Meldung nennt das
       schon angelegte Projekt in Klartext, „Weiter ablegen“ setzt es fort: kein zweites Projekt, nichts doppelt */
    let rohSchritt = 0;
    tm.programm({ mails: [M(21, "2026-03-02T08:00:00.000Z", "Anfrage Doppeltest")], vorschlag: Object.assign({ titel: "Doppeltest Kälte", kunde: "Lidl", kundeTreffer: "Lidl", status: "anfrage" }, leer),
      roh: () => { rohSchritt++; if (rohSchritt === 1) return Promise.reject(new TypeError("Failed to fetch")); if (rohSchritt === 2) window.__netzWeg = true;
        return new Blob(["From: p@planer-test.at\r\n\r\nText"], { type: "message/rfc822" }); } });
    d = await tm.verlauf({ suche: "Doppeltest" });
    const fort = () => [...d.querySelectorAll(".note")].map((n) => n.textContent).filter((t) => /abgebrochen|Abgebrochen/.test(t)).join(" ");
    const weiter = () => tm.fuss(/Weiter ablegen|Projekt anlegen/);
    tm.fuss(/Projekt anlegen/).click();
    await tm.bis(() => fort() && !weiter().disabled);
    const m1 = { fort: fort(), knopf: weiter().textContent };
    window.__toasts = []; weiter().click();
    await tm.bis(() => window.__netzWeg && !weiter().disabled && window.__toasts.some((t) => /abgebrochen|^Nicht fertig/.test(t)));
    window.__netzWeg = false;
    const m2 = { fort: fort(), toast: window.__toasts.filter((t) => /abgebrochen|^Nicht fertig/.test(t)).pop() || "" };
    window.__toasts = []; weiter().click();
    await tm.toastBis(/angelegt:|^Übernommen|abgebrochen|^Nicht fertig/);
    const doppel = db.projekte.filter((q) => q.titel === "Doppeltest Kälte"), dd = ((doppel[0] || {}).daten || {});
    p(/P-20\d\d-\d+/.test(m1.fort) && /angelegt/.test(m1.fort) && /Weiter ablegen/.test(m1.knopf), "M1 nach dem Abbruch: Projekt nicht genannt bzw. kein „Weiter ablegen“: " + JSON.stringify(m1));
    p(!/nichts gespeichert|Failed to fetch/.test(m2.toast + " " + m2.fort) && /P-20\d\d-\d+/.test(m2.toast), "M2 Meldung passt nicht zum Stand (Projekt ist angelegt): " + JSON.stringify(m2));
    p(doppel.length === 1, "M1 „Weiter ablegen“ legt ein weiteres Projekt an: " + doppel.map((q) => q.nummer).join(", "));
    p((dd.mails || []).length === 1 && (dd.dateien || []).filter((f) => /\.eml$/.test(f.name)).length === 1, "M1 nach „Weiter ablegen“: Mail fehlt oder doppelt: " + JSON.stringify({ mails: (dd.mails || []).length, dateien: (dd.dateien || []).map((f) => f.name) }));

    /* M7/M14: „Verlauf übernehmen“ ins bestehende Projekt – der Stand bleibt (Claude schlägt einen älteren vor), schon übernommene
       Mails sind markiert und nicht vorgehakt, Mail, Beteiligte und Termine kommen nicht doppelt */
    db.projekte.push({ id: "tmp_914", nummer: "P-2026-914", titel: "Doppeltverlauf Kälte", kunde_id: "lidl", status: "baustelle", erstellt: jetzt, geaendert: jetzt, verlauf: [{ zeit: jetzt, wer: "T", text: "Stand: Baustelle" }],
      daten: { mails: [{ id: "<tm161@test>", konto: "gmx", betreff: "Anfrage Doppeltverlauf", von: "p@planer-test.at", datum: "2026-03-02T08:00:00.000Z" }],
        dateien: [{ pfad: "tmp_914/mail-abc-Anfrage_Doppeltverlauf.eml", name: "Anfrage Doppeltverlauf.eml", art: "mail", groesse: 100, typ: "message/rfc822", von: "T", zeit: jetzt }],
        beteiligte: [{ id: "bt1", rolle: "Planer HKLS", firma: "Planer GmbH", name: "Paula Planer", mail: "p@planer-test.at", quellen: [] }],
        termine: [{ id: "tm1", datum: "2026-03-05", was: "Begehung vor Ort", quellen: [] }] } });
    await x("projekteLaden()");
    tm.programm({ mails: [M(161, "2026-03-02T08:00:00.000Z", "Anfrage Doppeltverlauf"), M(162, "2026-03-10T08:00:00.000Z", "Nachtrag Doppeltverlauf")],
      vorschlag: Object.assign({}, leer, { status: "angebot", beteiligte: [{ rolle: "Planer HKLS", firma: "Planer GmbH", name: "Paula Planer", mail_adresse: "p@planer-test.at", mail: 0 }],
        termine: [{ datum: "2026-03-05", text: "Begehung vor Ort", mail: 0 }, { datum: "2026-03-12", text: "Baubesprechung", mail: 1 }] }) });
    let liste14 = {};
    d = await tm.verlauf({ projektId: "tmp_914", suche: "Doppeltverlauf" }, (dl) => {
      const z = [...dl.querySelectorAll("[data-l] label")], z161 = z.find((l) => /Anfrage Doppeltverlauf/.test(l.textContent));
      liste14 = { haken161: z161.querySelector("input").checked, markiert: /im Projekt/.test(z161.textContent), haken162: z.find((l) => /Nachtrag/.test(l.textContent)).querySelector("input").checked };
      /* bewusst nochmals mitlesen lassen – abgelegt wird sie trotzdem nicht doppelt */
      z161.querySelector("input").checked = true; z161.querySelector("input").dispatchEvent(new Event("change"));
    });
    p(!liste14.haken161 && liste14.markiert && liste14.haken162, "M14 Suchliste: schon übernommene Mail vorgehakt bzw. nicht als „im Projekt“ markiert: " + JSON.stringify(liste14));
    const stand14 = d.querySelector('[data-k="status"]').value;
    p(stand14 === "baustelle", "M7 Stand im bestehenden Projekt mit Claudes Vorschlag vorbelegt: " + stand14);
    window.__toasts = []; tm.fuss(/Ins Projekt übernehmen/).click(); await tm.toastBis(/^Übernommen|^Nicht fertig/);
    let p914 = db.projekte.find((q) => q.id === "tmp_914");
    p(p914.status === "baustelle", "M7 Stand still von „baustelle“ auf „" + p914.status + "“ gesetzt");
    p(p914.daten.beteiligte.filter((b) => b.name === "Paula Planer").length === 1, "M14 Beteiligte doppelt: " + JSON.stringify(p914.daten.beteiligte.map((b) => b.name)));
    p(p914.daten.dateien.filter((f) => f.name === "Anfrage Doppeltverlauf.eml").length === 1 && p914.daten.dateien.filter((f) => f.name === "Nachtrag Doppeltverlauf.eml").length === 1,
      "M14 Mails doppelt bzw. die neue fehlt: " + JSON.stringify(p914.daten.dateien.map((f) => f.name)));
    p(p914.daten.termine.filter((t) => t.was === "Begehung vor Ort").length === 1 && p914.daten.termine.some((t) => t.was === "Baubesprechung"), "M14 Termine doppelt bzw. der neue fehlt: " + JSON.stringify(p914.daten.termine.map((t) => t.datum + " " + t.was)));
    p(p914.daten.mails.length === 2, "M14 Mail-Verweise: " + p914.daten.mails.length);
    /* bewusst einen anderen Stand gewählt: der gilt, mit „Stand: …“ im Tagebuch */
    d = await tm.verlauf({ projektId: "tmp_914", suche: "Doppeltverlauf" }, (dl) => tm.knopf(dl, /^alle$/).click());
    d.querySelector('[data-k="status"]').value = "inbetriebnahme";
    window.__toasts = []; tm.fuss(/Ins Projekt übernehmen/).click(); await tm.toastBis(/^Übernommen|^Nicht fertig/);
    p914 = db.projekte.find((q) => q.id === "tmp_914");
    p(p914.status === "inbetriebnahme" && p914.verlauf.some((v) => /^Stand: Inbetriebnahme/.test(v.text)), "M7 bewusst gewählter Stand nicht gespeichert bzw. ohne Tagebuch: " + p914.status + " " + JSON.stringify(p914.verlauf.map((v) => v.text)));

    /* M8/M22: neues (vergangenes) Projekt – Claude liefert Daten als TT.MM.JJJJ: umgewandelt, nichts unsichtbar oder später still gelöscht;
       ein Termin mit unklarem Datum ist nicht vorgehakt; „Anfrage vom“ ohne Angabe = Datum der ältesten Mail (mit ihr als Quelle), nicht heute */
    tm.programm({ mails: [M(221, "2024-05-06T08:00:00.000Z", "Anfrage Altbau Datumtest"), M(222, "2024-05-20T08:00:00.000Z", "Angebot Altbau Datumtest")],
      vorschlag: Object.assign({}, leer, { titel: "Altbau Datumtest", kunde: "Lidl", kundeTreffer: "Lidl", status: "abgerechnet", angaben: [{ key: "angebotDatum", wert: "20.05.2024", mail: 1 }],
        termine: [{ datum: "10.06.2024", text: "Begehung Altbau", mail: 1 }, { datum: "demnächst", text: "Montage irgendwann", mail: 1 }],
        tagebuch: [{ datum: "20.05.2024", text: "Angebot geschickt", mail: 1 }, { datum: "Mitte Mai", text: "Rückruf Planer", mail: 0 }] }) });
    d = await tm.verlauf({ suche: "Altbau Datumtest" });
    const unklar8 = [...d.querySelectorAll("label")].find((l) => /Montage irgendwann/.test(l.textContent));
    p(unklar8 && !unklar8.querySelector("input").checked && /unklar/.test(unklar8.textContent), "M8 Termin mit unklarem Datum vorgehakt bzw. nicht markiert: " + (unklar8 ? unklar8.textContent : "fehlt"));
    window.__toasts = []; tm.fuss(/Projekt anlegen/).click(); await tm.toastBis(/angelegt:|abgebrochen|^Nicht fertig/);
    const p22 = db.projekte.find((q) => q.titel === "Altbau Datumtest"), d22 = (p22 && p22.daten) || {};
    p(d22.angebotDatum === "2024-05-20", "M8 „Angebot vom“ nicht als JJJJ-MM-TT gespeichert: " + d22.angebotDatum);
    p((d22.termine || []).map((t) => t.datum + "|" + t.was).join() === "2024-06-10|Begehung Altbau", "M8 Termine: " + JSON.stringify(d22.termine));
    p(p22.verlauf.some((v) => /^2024-05-20T/.test(v.zeit) && v.text === "Angebot geschickt") && p22.verlauf.some((v) => /^2024-05-06T/.test(v.zeit) && v.text === "Rückruf Planer"),
      "M8 Tagebuch-Datum: " + JSON.stringify(p22.verlauf.map((v) => v.zeit + "|" + v.text)));
    p(d22.anfrageDatum === "2024-05-06" && ((d22.quellen || {}).anfrage || []).length === 1, "M22 „Anfrage vom“ " + d22.anfrageDatum + " (heute statt älteste Mail?), Quelle " + JSON.stringify((d22.quellen || {}).anfrage));
    /* im Projekt sichtbar – und nach „Angaben speichern“ (nur der Titel geändert) noch da */
    x("ansichtenSchliessen()"); x("projektAnsicht('" + p22.id + "')"); await tm.bis(() => tm.dlg() && tm.dlg().querySelector('[data-d="angebotDatum"]'));
    const v22 = tm.dlg();
    p(v22.querySelector('[data-d="angebotDatum"]').value === "2024-05-20", "M8 „Angebot vom“ im Projekt nicht sichtbar: " + v22.querySelector('[data-d="angebotDatum"]').value);
    v22.querySelector('[data-p="titel"]').value = "Altbau Datumtest neu"; v22.querySelector("[data-speichern]").click();
    await tm.bis(() => db.projekte.find((q) => q.id === p22.id).titel === "Altbau Datumtest neu", 2000);
    p(db.projekte.find((q) => q.id === p22.id).daten.angebotDatum === "2024-05-20", "M8 „Angaben speichern“ hat „Angebot vom“ gelöscht");

    /* M19/M16: während Claude liest, gibt ein Häkchen den Knopf nicht frei (keine zweite, kostenpflichtige Auswertung);
       eine leere Antwort („null“) lässt den Knopf nicht hängen, die App sagt es in Klartext */
    let verlaufAufrufe = 0;
    tm.programm({ mails: [M(191, "2026-03-01T08:00:00.000Z", "Häkchentest 191"), M(192, "2026-03-02T08:00:00.000Z", "Häkchentest 192")],
      verlauf: () => { verlaufAufrufe++; return new Promise((f) => setTimeout(() => f("null"), 600)); } });
    x("ansichtenSchliessen()"); x("mailVerlaufDialog({suche:'Häkchentest'})");
    await tm.bis(() => tm.fuss(/Mit Claude auswerten \(2/));
    d = tm.dlg(); const los = tm.fuss(/Mit Claude auswerten/);
    los.click(); await tm.warte(100);
    const haken = d.querySelector("[data-l] input:checked"); haken.checked = false; haken.dispatchEvent(new Event("change"));
    const frei19 = !los.disabled; if (frei19) los.click();
    await tm.bis(() => !los.disabled && verlaufAufrufe && !/liest/.test(los.textContent), 2500); await tm.warte(700);
    p(!frei19 && verlaufAufrufe === 1, "M19 während Claude liest, gibt ein Häkchen den Knopf frei – " + verlaufAufrufe + " Auswertungen");
    p(!los.disabled && /nichts gefunden/.test(d.querySelector(".as-schritt").textContent), "M16 Antwort „null“: Knopf " + (los.disabled ? "hängt („" + los.textContent + "“)" : "frei") + ", Hinweis: " + d.querySelector(".as-schritt").textContent);
    tm.ende(); x("ansichtenSchliessen()");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest mail: Projekt aus Mail und Mails dazu – leere Antwort von Claude in Klartext, eigene Eingaben bleiben, dieselbe Mail nicht still doppelt", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    tm.verbinden(); tm.toastSpion();
    const MAIL = (uid, betreff) => ({ konto: "gmx", ordner: "INBOX", uid, messageId: "<tp" + uid + "@test>", betreff, datum: "2026-10-02T09:12:00.000Z",
      von: [{ name: "Max Planer", address: "max@planer-test.at" }], an: [], cc: [], text: "Bitte um Angebot.", html: null, anhaenge: [], notiz: null, auftraege: [] });
    const oeffne = async (uid) => { x("ansichtenSchliessen()"); x("mailBrueckeStatus=null"); x("mailUebernehmen({k:'gmx', o:'INBOX', u:" + uid + ", a:'projekt'})");
      await tm.bis(() => tm.dlg() && tm.dlg().querySelector('[data-f="titel"]')); return tm.dlg(); };
    /* M16: Claude antwortet leer ({}) – keine Erfolgsmeldung ohne Inhalt */
    tm.programm({ mail: MAIL(96, "Anfrage Leertest"), extrahieren: {} });
    let d = await oeffne(96);
    await tm.bis(() => !/liest/.test(d.querySelector("[data-claude] button").textContent), 2000);
    const ct = d.querySelector("[data-claudetext]").textContent, orange = [...d.querySelectorAll("[data-f]")].filter((f) => f.style.background).length;
    p(!/✓ von Claude ausgefüllt/.test(ct) && /nichts gefunden/.test(ct), "M16 leere Antwort {}: „" + ct + "“ bei " + orange + " ausgefüllten Feldern");

    /* M9: was man tippt, während Claude noch liest, bleibt stehen – nur die übrigen Felder füllt Claude */
    tm.programm({ mail: MAIL(91, "Anfrage Eingabetest"), extrahieren: () => new Promise((f) => setTimeout(() => f({ titel: "Claude Titel", ansprechpartner: "Claude Kontakt", telefon: "+43 1 999", kunde: "" }), 700)) });
    d = await oeffne(91);
    const fd = (n) => d.querySelector('[data-f="' + n + '"]');
    const tippe = (n, w) => { fd(n).value = w; fd(n).dispatchEvent(new Event("input", { bubbles: true })); };
    const liest9 = /Claude liest/.test(d.textContent);
    tippe("telefon", "0664 1234567"); tippe("ansprechpartner", "Selbst getippt");
    await tm.bis(() => !/liest/.test(d.querySelector("[data-claude] button").textContent), 2500);
    const m9 = { liest9, tel: fd("telefon").value, ap: fd("ansprechpartner").value, titel: fd("titel").value };
    p(m9.liest9 && m9.tel === "0664 1234567" && m9.ap === "Selbst getippt" && m9.titel === "Claude Titel", "M9 eigene Eingaben während des Lesens ersetzt (bzw. Claude füllt nichts): " + JSON.stringify(m9));

    /* M10: dieselbe Mail ein zweites Mal „als neues Projekt“ – Hinweis auf das vorhandene Projekt, ein zweites nur nach Rückfrage */
    tm.programm({ mail: MAIL(61, "Anfrage Zweimaltest"), extrahieren: {} });
    d = await oeffne(61); d.querySelector('[data-f="kunde"]').value = "lidl";
    window.__toasts = []; tm.fuss(/Projekt anlegen/).click(); await tm.toastBis(/angelegt/);
    d = await oeffne(61);
    const hinweis10 = d.querySelector(".as-inhalt").innerText.replace(/Anfrage Zweimaltest/g, "");
    d.querySelector('[data-f="kunde"]').value = "lidl";
    window.__antwort.confirm = false; window.__dialoge.length = 0;
    tm.fuss(/Projekt anlegen/).click(); await tm.warte(500);
    window.__antwort.confirm = true;
    const proj10 = db.projekte.filter((q) => ((q.daten || {}).mails || []).some((m) => m.id === "<tp61@test>")).map((q) => q.nummer);
    p(/liegt schon in P-20\d\d-\d+/.test(hinweis10) && window.__dialoge.some((z) => /schon/.test(z[1])) && proj10.length === 1,
      "M10 dieselbe Mail ergibt " + proj10.length + " Projekte (Hinweis: " + /liegt schon/.test(hinweis10) + ", Rückfragen: " + JSON.stringify(window.__dialoge) + ")");

    /* M17: „Mails dazu“ – gesendete Mail ohne Empfänger zeigt kein „undefined“ */
    x("ansichtenSchliessen()");
    tm.programm({ suche: { mails: [{ konto: "gmx", ordner: "Gesendet", uid: 5, messageId: "<g5@test>", datum: "2026-09-01T08:00:00.000Z", betreff: "Angebot Leerempfänger", gesendet: true, von: [], an: [] }] } });
    const k17 = x("mailsDazuKarte([{text:'P-2026-917', inhalt:true}], {})"); document.body.appendChild(k17);
    await tm.bis(() => /Leerempfänger/.test(k17.innerText));
    p(/Leerempfänger/.test(k17.innerText) && !/undefined/.test(k17.innerText), "M17 Zeile zeigt „undefined“: " + k17.innerText.replace(/\s+/g, " "));
    k17.remove();

    /* M21: „Mail zu Projekt legen“ ohne passendes Projekt – nichts vorgewählt, ein schneller Klick legt nichts ab */
    tm.programm({ mail: Object.assign(MAIL(71, "Fotos vom Wochenende"), { von: [{ name: "Familie", address: "familie@gmx.at" }] }) });
    x("mailUebernehmen({k:'gmx', o:'INBOX', u:71, a:'zuprojekt'})"); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    const wahl21 = tm.dlg().querySelector("[data-p]").value;
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.warte(300);
    p(!wahl21 && !db.projekte.some((q) => ((q.daten || {}).mails || []).some((m) => m.id === "<tp71@test>")) && window.__toasts.some((t) => /Projekt wählen/.test(t)),
      "M21 Mail zu Projekt: ohne Vorschlag „" + wahl21 + "“ vorgewählt bzw. abgelegt, Meldungen " + JSON.stringify(window.__toasts));
    tm.ende(); x("ansichtenSchliessen()");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tiefentest mail: Posteingang – „Zu Projekt legen“ legt nichts doppelt ab und meldet ehrlich, was gespeichert ist", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    tm.toastSpion(); window.UKT_CONFIG.posteingangAktiv = true;
    const sb = x("Store.sb");
    const pe = (id, gr, art, name, betreff, absender) => ({ id, nachricht_id: "<" + gr + "@test>", art, dateiname: name, pfad: "2026/10/" + id + "_" + name.replace(/\W+/g, "_"), status: "neu", betreff,
      absender: absender || "a@planer-test.at", eingang: jetzt, bytes: 400 });
    const ablegen = async (...eintraege) => { for (const e of eintraege) { await sb.storage.from("posteingang").upload(e.pfad, new Blob(["Inhalt " + e.dateiname])); db.posteingang.push(e); } };
    const projekt = (id, nr, titel) => db.projekte.push({ id, nummer: nr, titel, kunde_id: "lidl", status: "baustelle", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    const karte = async () => { document.querySelectorAll("#tmPe").forEach((k) => k.remove()); const k = x("posteingangKarte()"); k.id = "tmPe"; document.body.appendChild(k);
      await tm.bis(() => !/wird geladen/.test(k.textContent)); return k; };
    const box = (k, re) => [...k.querySelectorAll(".posbox")].find((b) => re.test(b.textContent));
    const namen = (pid) => ((db.projekte.find((q) => q.id === pid).daten || {}).dateien || []).map((f) => f.name);
    projekt("tmp_911", "P-2026-911", "Doppelklick Kälte"); projekt("tmp_912", "P-2026-912", "Teilfehler Kälte"); projekt("tmp_913", "P-2026-913", "Vermerk Kälte");
    await x("projekteLaden()");

    /* M11: Doppelklick auf „Zu Projekt legen“ – nur ein Dialog, nichts doppelt */
    await ablegen(pe("pe11a", "pe11", "mail", "Plan P-2026-911.eml", "Plan P-2026-911"), pe("pe11b", "pe11", "unbekannt", "Plan EG.pdf", "Plan P-2026-911"));
    let k = await karte();
    const kn = tm.knopf(box(k, /P-2026-911/), /Zu Projekt legen/); kn.click(); kn.click(); await tm.warte(300);
    const dlg11 = [...document.querySelectorAll(".assistent")].filter((d) => /Zu Projekt legen/.test(d.querySelector(".as-titel").textContent));
    for (const d of dlg11) { window.__toasts = []; tm.knopf(d.querySelector(".as-fuss"), /Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht|schon/); }
    p(dlg11.length === 1 && namen("tmp_911").length === 2, "M11 Doppelklick: " + dlg11.length + " Dialoge, Dateien " + JSON.stringify(namen("tmp_911")));
    x("ansichtenSchliessen()");

    /* M12: eine Datei scheitert einmal – „nochmals“ lädt nur hoch, was noch fehlt */
    await ablegen(pe("pe12a", "pe12", "mail", "Unterlagen P-2026-912.eml", "Unterlagen P-2026-912"), pe("pe12b", "pe12", "unbekannt", "Plan Teilfehler.pdf", "Unterlagen P-2026-912"),
      pe("pe12c", "pe12", "unbekannt", "Datenblatt.pdf", "Unterlagen P-2026-912"));
    const altFrom = sb.storage.from; let einmal = 1;
    sb.storage.from = function (n) { const e = altFrom.call(this, n); if (n === "projektdateien") { const up = e.upload.bind(e);
      e.upload = (pf, b, o) => (/Teilfehler/.test(pf) && einmal-- > 0) ? Promise.resolve({ data: null, error: { message: "Zeitüberschreitung" } }) : up(pf, b, o); } return e; };
    k = await karte();
    tm.knopf(box(k, /P-2026-912/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/Nicht alles|abgelegt/);
    const m12 = window.__toasts.slice();
    await tm.bis(() => !tm.fuss(/Ins Projekt legen/).disabled, 1000);
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/Nicht alles|abgelegt/);
    sb.storage.from = altFrom;
    p(m12.some((t) => /Nicht alles hochgeladen/.test(t)) && namen("tmp_912").length === 3, "M12 nach „nochmals“: " + JSON.stringify(namen("tmp_912")) + " (erste Meldungen " + JSON.stringify(m12) + ")");
    x("ansichtenSchliessen()");

    /* M13: der Erledigt-Vermerk scheitert – keine reine Erfolgsmeldung, die Karte bleibt mit Hinweis; nochmals legt nichts doppelt ab */
    await ablegen(pe("pe13a", "pe13", "mail", "Plan P-2026-913.eml", "Plan P-2026-913"), pe("pe13b", "pe13", "unbekannt", "Plan OG.pdf", "Plan P-2026-913"));
    k = await karte();
    const altF = sb.from;
    sb.from = function (t) { const q = altF.call(this, t); if (t === "posteingang") { const u = q.update.bind(q);
      q.update = function (dd) { u(dd); q.then = (ok2, nok) => Promise.resolve({ data: null, error: { message: "Zeitüberschreitung" } }).then(ok2, nok); return q; }; } return q; };
    tm.knopf(box(k, /P-2026-913/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/i); await tm.warte(200);
    sb.from = altF;
    const m13 = { toasts: window.__toasts.slice(), karte: !!box(k, /P-2026-913/), hinweis: /nicht als erledigt/.test((box(k, /P-2026-913/) || {}).textContent || "") };
    x("ansichtenSchliessen()");
    if (box(k, /P-2026-913/)) { tm.knopf(box(k, /P-2026-913/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen|vermerken/));
      window.__toasts = []; tm.fuss(/Ins Projekt legen|vermerken/).click(); await tm.toastBis(/abgelegt|^Nicht/); }
    p(!m13.toasts.some((t) => /^In P-2026-913 abgelegt: /.test(t)) && m13.karte && m13.hinweis, "M13 Vermerk gescheitert: " + JSON.stringify(m13));
    p(namen("tmp_913").length === 2 && db.posteingang.filter((e) => /^pe13/.test(e.id)).every((e) => e.status === "erledigt"),
      "M13 nach dem zweiten Versuch: Dateien " + JSON.stringify(namen("tmp_913")) + ", Posteingang " + JSON.stringify(db.posteingang.filter((e) => /^pe13/.test(e.id)).map((e) => e.status)));
    x("ansichtenSchliessen()");

    /* M21: kein Projekt passt – nichts vorgewählt, ein schneller Klick legt nichts irgendwo ab */
    projekt("tmp_921", "P-2026-921", "Ganz anderes Projekt"); await x("projekteLaden()");
    await ablegen(pe("pe21a", "pe21", "mail", "Fotos vom Wochenende.eml", "Fotos vom Wochenende", "familie@gmx.at"), pe("pe21b", "pe21", "unbekannt", "IMG_0001.jpg", "Fotos vom Wochenende", "familie@gmx.at"));
    k = await karte();
    tm.knopf(box(k, /Wochenende/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    const wahl21 = tm.dlg().querySelector("[data-p]").value;
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.warte(300);
    const abgelegt21 = db.projekte.filter((q) => ((q.daten || {}).dateien || []).some((f) => /Wochenende|IMG_0001/.test(f.name))).map((q) => q.nummer);
    p(!wahl21 && !abgelegt21.length && window.__toasts.some((t) => /Projekt wählen/.test(t)), "M21 ohne Vorschlag vorgewählt „" + wahl21 + "“, abgelegt in " + JSON.stringify(abgelegt21) + ", Meldungen " + JSON.stringify(window.__toasts));
    x("ansichtenSchliessen()");

    /* M15: weitergeleitete Projektmail ohne .eml (Rohmail über 20 MB) – die Pläne lassen sich trotzdem gemeinsam einem Projekt zuordnen */
    projekt("tmp_915", "P-2026-915", "Große Pläne Hotel"); await x("projekteLaden()");
    await ablegen(...["EG", "OG", "DG"].map((n, i) => pe("pe15" + i, "pe15", "unbekannt", "Plan " + n + " gross.pdf", "Fwd: Pläne P-2026-915", "planer@planer-test.at")));
    k = await karte();
    const b15 = box(k, /Plan EG gross/), kn15 = b15 && tm.knopf(b15, /Zu Projekt legen/);
    if (kn15) { kn15.click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/)); window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/i); }
    p(kn15 && namen("tmp_915").length === 3 && !box(k, /Plan (EG|OG|DG) gross/), "M15 Pläne einer Mail ohne .eml: Knopf „Zu Projekt legen“ " + (kn15 ? "da" : "fehlt") + ", im Projekt " + JSON.stringify(namen("tmp_915")) +
      ", Karten noch da: " + [...k.querySelectorAll(".posbox")].map((b) => b.querySelector("strong").textContent).join(", "));
    x("ansichtenSchliessen()");

    /* M20: Präsentation bzw. Vorschau eines Änderungswunsches (speichert nie) – die Meldung sagt, dass nichts gespeichert wurde */
    projekt("tmp_920", "P-2026-920", "Präsentation Kälte"); await x("projekteLaden()");
    await ablegen(pe("pe20a", "pe20", "mail", "Plan P-2026-920.eml", "Plan P-2026-920"));
    k = await karte();
    window.UKT_VORSCHAU = "W-Test";
    tm.knopf(box(k, /P-2026-920/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    window.__toasts = []; tm.fuss(/Ins Projekt legen/).click(); await tm.bis(() => !document.querySelector(".assistent"), 2000); await tm.warte(100);
    const t20 = document.getElementById("toast").textContent;
    delete window.UKT_VORSCHAU;
    p(/Präsentation|nichts gespeichert|gespeichert wurde nichts/.test(t20) && !namen("tmp_920").length && db.posteingang.find((e) => e.id === "pe20a").status === "neu",
      "M20 Präsentation meldet „" + t20 + "“ (Dateien in der Datenbank: " + namen("tmp_920").length + ")");
    x("ansichtenSchliessen()"); document.querySelectorAll("#tmPe").forEach((kk) => kk.remove());

    /* M18: der Rundgang „Projekt anlegen“ verspricht keinen Weg, den es nicht gibt – der Posteingang legt nur zu bestehenden Projekten ab */
    const rg = x("JSON.stringify(RUNDGAENGE.projekte.schritte[0].text)");
    p(!/aus einer Mail im Posteingang/.test(rg) && /Posteingang[^.]*bestehend/.test(rg), "M18 Rundgang „Projekt anlegen“: " + rg);
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* ---------------- Tiefentest rechnungen: Angebote, Rechnungen, Katalog, KPlus ----------------
   Je Fund ein Schritt (reSchritt); die Schritte einer Gruppe laufen nacheinander auf derselben Seite (spart
   Zeit), jeder mit eigenen erfundenen Daten. Gemeldet werden alle fehlgeschlagenen Schritte zusammen. */
const RE_GRUPPEN = { eingaben: [], editor: [], kplus: [], tempo: [] };
const reSchritt = (gruppe, id, fn) => RE_GRUPPEN[gruppe].push({ id, fn });
async function reGruppe(gruppe) {
  if (!RE_GRUPPEN[gruppe].length) return;
  const a = await oeffnen(KONTEN.inhaber);
  await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    const R = (window.__re = {
      warte, toasts: [], confirms: [], ja: true,
      /* warten, bis f() etwas liefert (höchstens max ms) */
      bis: async (f, max = 3000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = f(); } catch (e) {} if (v || Date.now() - t0 > max) return v; await warte(20); } },
      dlg: () => [...document.querySelectorAll(".assistent")].pop() || null,
      knopf: (d, re) => [...(d || document).querySelectorAll("button")].filter((b) => re.test(b.textContent.trim()))[0] || null,
      setze: (i, w) => { i.value = w; i.dispatchEvent(new Event("input", { bubbles: true })); },
      pk: (id) => x("alleProtokolle(true)").filter((p) => p._id === id)[0],
      stoerung: async (id, datum) => {
        db.protokolle.push({ id, client_id: id, standort_id: "TS1", datum, wartungsart: "Störung", techniker: "Testtechniker", anlagen: [],
          stoerung: { ankunft: "08:00", ende: "09:00" }, version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
        await x("ladeProtokolle()");
      },
      /* KPlus-Rechnung wie aus kplusAuswerten: Fahrtpauschale und ggf. weitere Positionen */
      erg: (nr, mehr) => { const pos = [{ typ: "pos", nr: "1", menge: 1, eh: "psh", preis: 50, betragPdf: 50, text: "Fahrtpauschale Zone 1 (Testtext)" }].concat(mehr || []);
        return { art: "rechnung", nummer: nr, datum: "2026-06-02", kopf: { betreff: ["Test"] }, summenPdf: { netto: x("belegSummen")(pos).netto }, positionen: pos }; },
      vorschau: (pkId, erg, datei) => { x("kplusVorschau")(x("kontextProtokoll")(R.pk(pkId)), erg, function () {}, datei); return R.dlg(); },
      /* „Beim Einsatz ablegen“ tippen und warten, bis es fertig ist (jede Antwort endet mit einer Meldung) */
      ablegen: async (d) => { const n = R.toasts.length, k = R.knopf(d, /ablegen$/); k.click();
        await R.bis(() => R.toasts.length > n && (!document.body.contains(d) || !/wird abgelegt/.test(k.textContent)), 5000); await warte(80); },
    });
    x("(function(){ var alt=toast; toast=function(m){ window.__re.toasts.push(technikDeutsch(m)); return alt.apply(this, arguments); }; return 1; })()");
    window.confirm = (m) => { R.confirms.push(String(m)); return R.ja; };
    await x("Promise.all([ladeProtokolle(), katalogLaden(), abrechnungLaden(), belegeAlleLaden()])");
  });
  const fehler = [];
  for (const s of RE_GRUPPEN[gruppe]) {
    try { const f = await s.fn(a); if (f) fehler.push(s.id + ": " + f); }
    catch (e) { fehler.push(s.id + ": " + String(e.message || e).split("\n")[0]); }
    await a.x("(function(){ ansichtenSchliessen(); window.__re.ja=true; return 1; })()").catch(() => {});
  }
  if (a.fehler.length) fehler.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehler.length, fehler.join(" | "));
}
test("Tiefentest rechnungen: Eingaben, Rundung, Positionsvorschläge, Katalog pflegen", () => reGruppe("eingaben"));
test("Tiefentest rechnungen: Beleg-Editor, Rechnung zum Einsatz, Status, Briefkopf", () => reGruppe("editor"));
test("Tiefentest rechnungen: KPlus-PDF lesen, beim Einsatz ablegen, daraus lernen", () => reGruppe("kplus"));
test("Tiefentest rechnungen: Reiter Rechnungen bleibt mit vielen Belegen schnell", () => reGruppe("tempo"));

/* Dezimalpunkt: „1.5“ und „78.81“ sind 1,5 und 78,81 – nie 15 und 7881 (Beleg-Editor und Katalog) */
reSchritt("eingaben", "R01", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    x("belegNeu({projekt:null, protokoll:null, kunde_id:'lidl', standort_id:null}, 'rechnung', null, function(){})");
    const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelector("[data-plus]") && d; });
    d.querySelector("[data-plus]").click();
    const z = [...d.querySelectorAll(".bpos")].pop();
    R.setze(z.querySelector('[data-f="text"]'), "Montage Dezimalpunkt"); R.setze(z.querySelector('[data-f="menge"]'), "1.5"); R.setze(z.querySelector('[data-f="preis"]'), "78.81");
    const n0 = db.belege.length; R.knopf(d, /^Speichern$/).click();
    await R.bis(() => db.belege.length > n0);
    const b = db.belege[db.belege.length - 1] || {}, p = (b.positionen || []).filter((q) => /Dezimalpunkt/.test(q.text || ""))[0] || {};
    x("ansichtenSchliessen()");
    x("katalogAnsicht()");
    const det = await R.bis(() => R.dlg() && R.dlg().querySelector("details")); det.open = true;
    det.querySelector('[data-n="text"]').value = "Dezimalpunkt Testposition"; det.querySelector('[data-n="preis"]').value = "447.30";
    det.querySelector('[data-n="ok"]').click();
    const k = await R.bis(() => db.katalog.filter((q) => q.text === "Dezimalpunkt Testposition")[0]);
    return { menge: p.menge, preis: p.preis, netto: (b.summen || {}).netto, kPreis: k ? k.preis : null };
  });
  return r.menge === 1.5 && r.preis === 78.81 && r.kPreis === 447.3 ? "" : `„1.5“ × „78.81“ gespeichert als ${r.menge} × ${r.preis} (netto ${r.netto}); Katalog „447.30“ als ${r.kPreis}`;
});
/* Cent kaufmännisch: 1,5 × 39,41 = 59,115 → 59,12 (nicht 59,11 wegen Gleitkomma) – Summe und Tabelle */
reSchritt("eingaben", "R02", async (a) => {
  const r = JSON.parse(await a.x("JSON.stringify([belegSummen([{typ:'pos',menge:1.5,preis:39.41}]).netto, belegSummen([{typ:'pos',menge:0.5,preis:40.41}]).netto, belegSummen([{typ:'pos',menge:0.25,preis:16.06}]).netto])"));
  const t = await a.x("belegTabelle([{typ:'pos',nr:'1',menge:1.5,eh:'Std',text:'Test',preis:39.41}], null).querySelector('tbody').textContent");
  return r.join("/") === "59.12/20.21/4.02" && /59,12/.test(t) ? "" : "nicht kaufmännisch gerundet (erwartet 59.12/20.21/4.02): " + JSON.stringify(r) + " · Tabelle: " + t;
});
/* Material aus dem Protokoll: „2 Stk“ und „3 m“ bleiben 2 Stk und 3 m; Unlesbares wird sichtbar markiert */
reSchritt("eingaben", "R08", async (a) => {
  const r = JSON.parse(await a.x(`JSON.stringify(einsatzPositionen({_id:'tm8',standortId:'TS1',datum:'2026-06-01',wartungsart:'Störung',stoerung:{ankunft:'08:00',ende:'09:00',
    material:[{text:'Kondensatpumpe',menge:'2 Stk'},{text:'Kupferrohr 12 mm',menge:'3 m'},{text:'Isolierband',menge:'0,5 Rolle'},{text:'Dichtung',menge:'etwas'}]}},'lidl')
    .filter(function(p){ return /Kondensatpumpe|Kupferrohr|Isolierband|Dichtung/.test(p.text); }).map(function(p){ return p.text.replace(/\\n/g,' / ')+': '+p.menge+' '+p.eh; }))`));
  return r[0] === "Kondensatpumpe: 2 Stk" && r[1] === "Kupferrohr 12 mm: 3 m" && r[2] === "Isolierband: 0.5 Rolle" && /^Dichtung .*„etwas“.*: 1 Stk$/.test(r[3] || "")
    ? "" : "Material „2 Stk“ / „3 m“ / „0,5 Rolle“ / „etwas“ im Vorschlag: " + JSON.stringify(r);
});
/* Tiroler Markt mit Postleitzahl, aber ohne Kartenlage: der Hinweis nennt die echte Ursache */
reSchritt("eingaben", "R20", async (a) => {
  const r = await a.x("(function(){ var alt=byId.TS4.lon; byId.TS4.lon=null; try{ return einsatzPositionen({standortId:'TS4',datum:'2026-01-01',anlagen:[{name:'VRV'}]},'lidl').pop().text; } finally { byId.TS4.lon=alt; } })()");
  return !/ohne Postleitzahl/.test(r) && /Lage/.test(r) ? "" : "Fahrtpauschale für PLZ 6460 ohne Kartenlage: " + r;
});
/* Positionsprüfung: Uhrzeit-Bereiche und „24h-Notdienst“ sind keine Menge, „2 x 3 h“ = 6 Std; Mengen ohne Klammer nicht in den Katalogtext */
reSchritt("eingaben", "R23", async (a) => {
  const r = await a.seite.evaluate(() => {
    const x = window.__t.x, f = x("positionPruefen"), o = x("katalogTextOhneMenge");
    return { uhr: f({ typ: "pos", text: "Regiestunden Techniker Mo-Fr 7-16 h", menge: 3, eh: "Std" }), notdienst: f({ typ: "pos", text: "Zuschlag 24h-Notdienst", menge: 1, eh: "psh" }),
      mal: f({ typ: "pos", text: "Zuschlag Nacht (2 x 3 h)", menge: 6, eh: "Std" }), malFalsch: f({ typ: "pos", text: "Zuschlag Nacht (2 x 3 h)", menge: 3, eh: "Std" }),
      o1: o("Zuschlag Samstag 3 Mann a 10 Std"), o2: o("Zuschlag Nacht (2 x 3 h)") };
  });
  return !r.uhr.length && !r.notdienst.length && !r.mal.length && r.malFalsch.length === 1 && r.o1 === "Zuschlag Samstag" && r.o2 === "Zuschlag Nacht"
    ? "" : "Fehlalarme bzw. Auftragsmenge im Katalogtext: " + JSON.stringify(r);
});
/* Katalog lernt eine Position ohne Einheit nur einmal (gespeichert wird sie mit „Stk“) */
reSchritt("eingaben", "R18", async (a) => {
  const r = await a.seite.evaluate(async () => {
    for (const q of ["A", "B", "C"]) await window.__t.x("katalogLernen([{typ:'pos',text:'Dichtband ohne Einheit',eh:'',preis:5}],'Test-Rechnung " + q + "',{})");
    return window.__db.tabellen.katalog.filter((k) => k.text === "Dichtband ohne Einheit").map((k) => k.eh + " · " + k.quelle);
  });
  return r.length === 1 ? "" : `${r.length} Katalogeinträge für dieselbe Position: ${JSON.stringify(r)}`;
});
/* auffällige KPlus-Position („(3 h)“ bei Menge 1) ändert den Katalog-Preis nicht */
reSchritt("eingaben", "R07", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen;
    db.katalog.push({ id: "kr7", text: "Regiestunden Techniker R07", eh: "Std", preis: 78.81, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    await x("katalogLaden()");
    const erg = await x("katalogLernen")([{ typ: "pos", nr: "1", menge: 1, eh: "Std", preis: 236.43, betragPdf: 236.43, text: "Regiestunden Techniker R07 (3 h)" }], "KPlus Rechnung 900990", { preiseAktualisieren: true });
    const k = db.katalog.filter((q) => q.id === "kr7")[0];
    return { erg, preis: k.preis, quelle: k.quelle };
  });
  return r.preis === 78.81 && r.erg.unklar === 1 ? "" : `„(3 h)“ bei Menge 1: Katalog-Preis ${r.preis} (${r.quelle}), Ergebnis ${JSON.stringify(r.erg)}`;
});
/* ausgeblendete Katalog-Positionen werden im Angebot aus dem Folgeauftrag nicht vorgeschlagen */
reSchritt("eingaben", "R12", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen;
    db.katalog.push({ id: "k12", text: "Verdampferlüfter liefern und tauschen (alter Preis)", eh: "Stk", preis: 99, kunde_id: "lidl", aktiv: false, quelle: "Test" });
    await x("katalogLaden()");
    const k = x("katalogVorschlag")("Verdampferlüfter defekt – liefern und tauschen", "lidl");
    return k ? k.text : null;
  });
  return !r ? "" : "ausgeblendete Katalog-Position vorgeschlagen: " + r;
});
/* Katalog-Zeile speichern: leerer Preis bzw. leerer Text wird mit Meldung abgelehnt */
reSchritt("eingaben", "R26", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    db.katalog.push({ id: "k26", text: "Leerprobe Position R26", eh: "Stk", preis: 26, kunde_id: null, aktiv: true, quelle: "Test" });
    x("katalogAnsicht()");
    const zeile = () => [...R.dlg().querySelectorAll("[data-sp]")].map((b) => b.parentElement.parentElement).filter((z) => /Leerprobe Position R26/.test(z.querySelector("textarea").value))[0];
    let z = await R.bis(zeile);
    R.toasts.length = 0;
    z.querySelector("[data-preis]").value = ""; z.querySelector("[data-sp]").click(); await R.warte(150);
    const preis = db.katalog.filter((q) => q.id === "k26")[0].preis;
    z = zeile() || z; z.querySelector("[data-preis]").value = "26,00"; z.querySelector("textarea").value = "  "; z.querySelector("[data-sp]").click(); await R.warte(150);
    return { preis, text: db.katalog.filter((q) => q.id === "k26")[0].text, toasts: R.toasts.slice() };
  });
  return r.preis === 26 && r.text === "Leerprobe Position R26" && r.toasts.some((t) => /Preis/.test(t)) && r.toasts.some((t) => /Text/.test(t))
    ? "" : `leerer Preis bzw. Text: Preis jetzt ${r.preis}, Text „${r.text}“, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* Katalog: Doppelklick auf „Anlegen“ legt einmal an; mehr als 150 Treffer → Hinweis auf weitere */
reSchritt("eingaben", "R25", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    x("katalogAnsicht()");
    const det = await R.bis(() => R.dlg() && R.dlg().querySelector("details")); det.open = true;
    det.querySelector('[data-n="text"]').value = "Doppelklick Testposition"; det.querySelector('[data-n="preis"]').value = "12,50";
    const k = det.querySelector('[data-n="ok"]'); k.click(); k.click();
    await R.bis(() => db.katalog.some((q) => q.text === "Doppelklick Testposition")); await R.warte(150);
    const doppelt = db.katalog.filter((q) => q.text === "Doppelklick Testposition").length;
    x("ansichtenSchliessen()");
    for (let i = 0; i < 170; i++) db.katalog.push({ id: "kv" + i, text: "Viele Testposition " + String(i).padStart(3, "0"), eh: "Stk", preis: 1 + i, kunde_id: null, aktiv: true, quelle: "Test" });
    x("katalogAnsicht()");
    const d = await R.bis(() => R.dlg() && R.dlg().querySelectorAll("[data-sp]").length && R.dlg());
    return { doppelt, gesamt: db.katalog.length, sichtbar: d.querySelectorAll("[data-sp]").length, hinweis: /weitere/i.test(d.querySelector(".as-inhalt").textContent) };
  });
  return r.doppelt === 1 && (r.sichtbar === r.gesamt || r.hinweis) ? "" : `Doppelklick legt ${r.doppelt}× an; sichtbar ${r.sichtbar} von ${r.gesamt}, Hinweis auf weitere: ${r.hinweis}`;
});

/* Rechnung aus Angebot: der Baustellenbuch-Vorschlag bleibt beim Kältemittel, auch nach Löschen und Verschieben */
reSchritt("editor", "R04", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, R = window.__re;
    window.__p4 = { id: "prt4", titel: "Testprojekt R04", kunde_id: "lidl", standort_id: "TS1", status: "baustelle",
      daten: { baubuch: [{ art: "kaeltemittel", menge: 5, eh: "kg", text: "R410A nachgefüllt", datum: "2026-06-01" }] } };
    window.__a4 = { id: "ang4", art: "angebot", nummer: "T-A-2026-904", kopf: { betreff: ["Test"] }, positionen: [
      { typ: "pos", nr: "1", menge: 1, eh: "psh", text: "Montage", preis: 100 },
      { typ: "pos", nr: "2", menge: 2, eh: "kg", text: "Kältemittel R410A", preis: 60 },
      { typ: "pos", nr: "3", menge: 1, eh: "psh", text: "Fahrtpauschale", preis: 50 }] };
    x("belegNeu(kontextProjekt(window.__p4), 'rechnung', window.__a4, function(){})");
    const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelectorAll(".bpos").length === 3 && d; });
    const zeilen = () => [...d.querySelectorAll(".bpos")].map((z) => [z.querySelector('[data-f="text"]').value, z.querySelector('[data-f="menge"]').value, !!z.querySelector("[data-vs]")]);
    const vorher = zeilen();
    d.querySelector(".bpos [data-weg]").click();          /* „Montage“ entfernen (Rückfrage: ja) */
    const nachLoeschen = zeilen();
    d.querySelector(".bpos [data-runter]").click();       /* Kältemittel nach unten */
    const nachVerschieben = zeilen();
    const link = d.querySelector("[data-vs]"); if (link) link.click();
    return { vorher, nachLoeschen, nachVerschieben, nachTipp: zeilen() };
  });
  const bei = (l) => JSON.stringify(l.filter((z) => z[2]).map((z) => z[0])), km = r.nachTipp.filter((z) => /Kältemittel/.test(z[0]))[0] || [], fp = r.nachTipp.filter((z) => /Fahrtpauschale/.test(z[0]))[0] || [];
  return bei(r.nachLoeschen) === '["Kältemittel R410A"]' && bei(r.nachVerschieben) === '["Kältemittel R410A"]' && km[1] === "5,00" && fp[1] === "1,00"
    ? "" : `Vorschlag vorher bei ${bei(r.vorher)}, nach dem Löschen bei ${bei(r.nachLoeschen)}, nach dem Verschieben bei ${bei(r.nachVerschieben)}; nach dem Tipp: Kältemittel ${km[1]}, Fahrtpauschale ${fp[1]}`;
});
/* Katalog lernt aus Einsatz-Rechnungen keine Texte mit Uhrzeit oder Protokolldatum */
reSchritt("editor", "R06", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    const prot = (id, d, o) => Object.assign({ id, client_id: id, standort_id: "TS1", datum: d, wartungsart: "Wartung", techniker: "Testtechniker", anlagen: [{ name: "VRV Anlage R06", termin: "JW" }],
      version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" }, o || {});
    db.katalog.push({ id: "kw6", text: "Wartung Klimaanlage lt. Rahmenvertrag (Test)", eh: "Stk", preis: 210, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    db.protokolle.push(prot("s61", "2026-06-01", { wartungsart: "Störung", anlagen: [], stoerung: { ankunft: "08:00", ende: "10:00", problemtyp: "Kühlung" } }),
      prot("s62", "2026-06-08", { wartungsart: "Störung", anlagen: [], stoerung: { ankunft: "13:00", ende: "14:30", problemtyp: "Kühlung" } }),
      prot("w61", "2026-06-05"), prot("w62", "2026-07-05"));
    await x("Promise.all([ladeProtokolle(), katalogLaden()])");
    const vorher = db.katalog.length;
    for (const id of ["s61", "s62", "w61"]) {
      x("belegNeu(kontextProtokoll(window.__re.pk('" + id + "')), 'rechnung', null, function(){})");
      const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelector(".bpos") && R.knopf(d, /^Speichern$/) && d; });
      const n0 = db.belege.length; R.knopf(d, /^Speichern$/).click();
      await R.bis(() => db.belege.length > n0); await R.warte(200);   /* der Katalog lernt nach dem Speichern */
      x("ansichtenSchliessen()");
    }
    const neu = db.katalog.slice(vorher).map((k) => k.text.replace(/\n/g, " / "));
    await x("katalogLaden()");
    const w2 = x("einsatzPositionen(window.__re.pk('w62'), 'lidl')").filter((p) => /wartung/i.test(p.text))[0];
    return { neu, w2: w2 ? w2.text.replace(/\n/g, " / ") : null };
  });
  return !r.neu.length && !/05\.06\.2026/.test(r.w2 || "") ? "" : `${r.neu.length} neue Katalogpositionen aus Einsatz-Rechnungen: ${JSON.stringify(r.neu)}; Vorschlag zur Wartung vom 05.07.2026: „${r.w2}“`;
});
/* ein Angebot zum Einsatz macht ihn nicht „schon verrechnet“ – er bleibt in „nur ohne Rechnung“ */
reSchritt("editor", "R09", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    db.protokolle.push({ id: "pf9", client_id: "pf9", standort_id: "TS1", datum: "2026-05-11", wartungsart: "Wartung", techniker: "Testtechniker", anlagen: [{ name: "VRV Anlage" }],
      maengel: [{ text: "Kondensatpumpe defekt", prio: "hoch" }], version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    await x("Promise.all([ladeProtokolle(), belegeAlleLaden()])");
    const liste = async (ohneFilter) => {
      x("einsatzWaehlen(function(){})");
      const d = await R.bis(() => { const d = R.dlg(); return d && /Rechnung zu einem Einsatz/.test(d.querySelector(".as-titel").textContent) && d; });
      if (ohneFilter) { const cb = d.querySelector("input[type=checkbox]"); cb.checked = false; cb.onchange(); }
      const t = [...d.querySelectorAll(".as-inhalt button")].map((b) => b.textContent).filter((t) => /11\.05\.2026/.test(t)); x("ansichtenSchliessen()"); return t; };
    const vorher = await liste(false);
    x("angebotAusFolge(window.__re.pk('pf9'))");
    const d = await R.bis(() => { const d = R.dlg(); return d && /Angebot/.test(d.querySelector(".as-titel").textContent) && R.knopf(d, /^Speichern$/) && d; });
    const n0 = db.belege.length; R.knopf(d, /^Speichern$/).click(); await R.bis(() => db.belege.length > n0); await R.warte(100);
    x("ansichtenSchliessen()");
    await x("belegeAlleLaden()");
    return { vorher, nachher: await liste(false), ohneFilter: await liste(true) };
  });
  return r.vorher.length === 1 && r.nachher.length === 1 && r.ohneFilter.some((t) => /Angebot T-A-/.test(t)) && !r.ohneFilter.some((t) => /schon Rechnung/.test(t))
    ? "" : `vor dem Angebot ${r.vorher.length}×, danach ${r.nachher.length}× in „nur ohne Rechnung“; ohne Filter: ${JSON.stringify(r.ohneFilter)}`;
});
/* Status-Chip doppelt getippt: nur ein Fenster */
reSchritt("editor", "R28", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    db.belege.push({ id: "b28", art: "rechnung", nummer: "T-R-2026-328", test: true, extern: false, datum: "2026-06-01", status: "entwurf", kunde_id: "lidl",
      kopf: { betreff: ["Test"] }, positionen: [{ typ: "pos", nr: "1", menge: 1, eh: "Stk", text: "Test", preis: 10 }], summen: { netto: 10 } });
    window.__b28 = JSON.parse(JSON.stringify(db.belege.filter((q) => q.id === "b28")[0]));
    x("belegAnsicht({projekt:null, protokoll:null, kunde_id:'lidl', standort_id:null}, window.__b28, function(){})");
    const c = await R.bis(() => [...R.dlg().querySelectorAll("button.chip")].filter((q) => q.textContent === "versendet")[0]);
    c.click(); c.click();
    await R.bis(() => db.belege.filter((q) => q.id === "b28")[0].status === "versendet"); await R.warte(300);
    return [...document.querySelectorAll(".assistent .as-titel")].map((t) => t.textContent);
  });
  return r.length === 1 ? "" : "offene Fenster nach Doppeltipp: " + JSON.stringify(r);
});
/* Beleg inzwischen gelöscht: Editor bleibt mit den Eingaben offen, klare Meldung */
reSchritt("editor", "R29", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    db.belege.push({ id: "b29", art: "rechnung", nummer: "T-R-2026-329", test: true, extern: false, datum: "2026-06-01", status: "entwurf", kunde_id: "lidl",
      kopf: { betreff: ["Test"] }, positionen: [{ typ: "pos", nr: "1", menge: 1, eh: "Stk", text: "Test", preis: 10 }], summen: { netto: 10 } });
    window.__b29 = JSON.parse(JSON.stringify(db.belege.filter((q) => q.id === "b29")[0]));
    x("belegEditor({projekt:null, protokoll:null, kunde_id:'lidl', standort_id:null}, window.__b29, function(){})");
    const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelector('.bpos [data-f="text"]') && d; });
    R.setze(d.querySelector('.bpos [data-f="text"]'), "Geänderter Text R29");
    db.belege.splice(db.belege.findIndex((q) => q.id === "b29"), 1);   /* inzwischen auf einem anderen Gerät gelöscht */
    R.toasts.length = 0; R.knopf(d, /^Speichern$/).click();
    await R.bis(() => R.toasts.length); await R.warte(200);
    return { toasts: R.toasts.slice(), offen: document.body.contains(d), text: d.querySelector('.bpos [data-f="text"]').value, frei: !R.knopf(d, /^Speichern$/).disabled };
  });
  return r.offen && r.frei && r.text === "Geänderter Text R29" && r.toasts.some((t) => /gelöscht/.test(t)) && !r.toasts.some((t) => /329 gespeichert|Cannot read|undefined/.test(t))
    ? "" : `Editor offen: ${r.offen}, Speichern frei: ${r.frei}, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* Briefkopf: IBAN mit falscher Prüfziffer wird nicht gespeichert – Feld markiert, Meldung (wie bei den Reisekosten) */
reSchritt("editor", "R19", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    x("belegEinstellungen()");
    const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelector('[data-e="firma.iban"]') && d; });
    d.querySelector('[data-e="firma.name"]').value = "Musterfirma Test"; d.querySelector('[data-e="firma.bank"]').value = "Testbank";
    d.querySelector('[data-e="firma.iban"]').value = "AT61 1904 3002 3457 3202";   /* öffentliche Beispiel-IBAN mit falscher Prüfziffer */
    R.toasts.length = 0;
    R.knopf(d, /^Speichern$/).click(); await R.warte(300);
    const w = (db.einstellungen.filter((e) => e.schluessel === "belege")[0] || {}).wert;
    return { gespeichert: !!(w && w.firma && w.firma.iban === "AT61 1904 3002 3457 3202"), markiert: d.querySelector('[data-e="firma.iban"]').getAttribute("aria-invalid"),
      offen: document.body.contains(d), toasts: R.toasts.slice() };
  });
  return !r.gespeichert && r.markiert === "true" && r.offen && r.toasts.some((m) => /IBAN/.test(m)) ? "" : `IBAN mit falscher Prüfziffer gespeichert: ${r.gespeichert}, Feld markiert: ${r.markiert}, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* Rundgang und Handbuch erklären „KPlus-Rechnung hochladen“ beim Einsatz und das Lernen daraus */
reSchritt("editor", "R24", async (a) => {
  const t = await a.x("JSON.stringify(RUNDGAENGE)+' '+String(handbuchKarte)");
  return /KPlus-Rechnung hochladen/.test(t) && /So hätte die App gerechnet/.test(t) && /aus hochgeladenen KPlus-Rechnungen/.test(t) ? "" : "Rundgänge/Handbuch erwähnen „KPlus-Rechnung hochladen“, den Vergleich oder das Lernen daraus nicht";
});

/* KPlus lesen: Text unter einer Überschrift ist ein eigener Absatz, weit auseinander stehende Absätze bleiben getrennt */
reSchritt("kplus", "R27", async (a) => {
  const r = await a.seite.evaluate(() => {
    const x = window.__t.x, it = (xx, y, t, f) => ({ s: 1, x: xx, y, w: 20, t, f: f || "F2" });
    const erg = x("kplusAuswerten")([[it(330, 150, "Angebot", "F1"), it(480, 150, "413999", "F1"), it(150, 300, "Bezeichnung"),
      it(160, 320, "1. Kühlzelle", "F1"), it(160, 335, "Lieferung und Montage laut Plan"),
      it(60, 360, "1.1"), it(100, 360, "1,00 Stk"), it(160, 360, "Verdampfer Test"), it(420, 360, "100,00"), it(500, 360, "100,00"),
      it(160, 420, "Erster Hinweis"), it(160, 432, "zweite Zeile davon"), it(160, 520, "Zweiter, eigener Hinweis weiter unten"),
      it(300, 600, "Netto-Summe"), it(500, 600, "100,00")]]);
    return erg.positionen.map((p) => p.typ + ": " + p.text);
  });
  return JSON.stringify(r) === JSON.stringify(["gruppe: 1. Kühlzelle", "text: Lieferung und Montage laut Plan", "pos: Verdampfer Test", "text: Erster Hinweis zweite Zeile davon", "text: Zweiter, eigener Hinweis weiter unten"])
    ? "" : "gelesen: " + JSON.stringify(r);
});
/* KPlus: Gutschrift wird nicht als Angebot abgelegt; ohne erkannte PDF-Summe steht kein „stimmt“ */
reSchritt("kplus", "R03", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, R = window.__re, it = (xx, y, t, f) => ({ s: 1, x: xx, y, w: 20, t, f: f || "F2" });
    await R.stoerung("pg3", "2026-06-01");
    const gs = x("kplusAuswerten")([[it(330, 150, "Gutschrift", "F1"), it(480, 150, "900777", "F1"), it(150, 300, "Bezeichnung"),
      it(60, 320, "1"), it(100, 320, "1,00 psh"), it(160, 320, "Gutschrift Störung Test"), it(420, 320, "-50,00"), it(500, 320, "-50,00"),
      it(300, 400, "Netto-Summe"), it(500, 400, "-50,00")]]);
    const n0 = document.querySelectorAll(".assistent").length, nb = window.__db.tabellen.belege.length;
    R.vorschau("pg3", gs);                                      /* wie „KPlus-Rechnung hochladen“ beim Einsatz */
    const gutschrift = gs.art + ", Fenster " + (document.querySelectorAll(".assistent").length - n0) + ", Belege +" + (window.__db.tabellen.belege.length - nb) + ", Meldung: " + R.toasts.slice(-1)[0];
    const kopf = [it(330, 150, "Rechnung", "F1"), it(480, 150, "900778", "F1"), it(150, 300, "Bezeichnung"),
      it(60, 320, "1"), it(100, 320, "1,00 psh"), it(160, 320, "Fahrtpauschale Zone 1 (Testtext)"), it(420, 320, "50,00"), it(500, 320, "50,00")];
    const minus = x("kplusAuswerten")([kopf.concat([it(300, 400, "Netto-Summe"), it(500, 400, "-50,00")])]).summenPdf.netto;
    const erg = x("kplusAuswerten")([kopf]);                   /* Netto-Summe fehlt im PDF-Text */
    const note = R.vorschau("pg3", erg).querySelector(".as-inhalt .note").textContent;
    return { gutschrift, minus, netto: erg.summenPdf.netto, note };
  });
  return /^gutschrift, Fenster 0, Belege [+]0, Meldung: .*Gutschrift/.test(r.gutschrift) && r.minus === -50 && r.netto == null && !/stimmt/.test(r.note) && /nicht erkannt/.test(r.note)
    ? "" : `Gutschrift ${r.gutschrift}; Netto-Summe „-50,00“ gelesen als ${r.minus}; ohne Summe: ${r.netto}, Hinweis „${r.note}“`;
});
/* KPlus beim Einsatz: scheitert der Abrechnungs-Vermerk, sagt die Meldung das */
reSchritt("kplus", "R13", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    await R.stoerung("pk13", "2026-06-01");
    const sb = x("Store.sb"), altFrom = sb.from;   /* nur das Schreiben in abrechnung scheitert – wie supabase-js es meldet ({error}, kein Wurf) */
    sb.from = function (t) { const q = altFrom.apply(sb, arguments); if (t === "abrechnung") q.upsert = function () { return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }); }; return q; };
    try { R.toasts.length = 0; await R.ablegen(R.vorschau("pk13", R.erg("900555"))); } finally { sb.from = altFrom; }
    return { toasts: R.toasts.slice(), abger: db.abrechnung.some((z) => z.protokoll_id === "pk13"), beleg: db.belege.some((b) => b.nummer === "900555") };
  });
  return r.beleg && !r.abger && r.toasts.some((t) => /NICHT als abgerechnet/.test(t)) && !r.toasts.some((t) => /Einsatz als abgerechnet vermerkt/.test(t))
    ? "" : `Beleg gespeichert: ${r.beleg}, abgerechnet: ${r.abger}, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* KPlus beim Einsatz: scheitert nur der Katalog, heißt es „abgelegt – Katalog nicht ergänzt“ und das Fenster schließt */
reSchritt("kplus", "R21", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    await R.stoerung("pk21", "2026-06-01");
    const sb = x("Store.sb"), altFrom = sb.from;
    sb.from = function (t) { const q = altFrom.apply(sb, arguments);
      if (t === "katalog") q.insert = function () { return { select: function () { return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }); } }; };
      return q; };
    const d = R.vorschau("pk21", R.erg("900621", [{ typ: "pos", nr: "2", menge: 1, eh: "psh", preis: 30, betragPdf: 30, text: "Kleinmaterial pauschal R21" }]));
    try { R.toasts.length = 0; await R.ablegen(d); } finally { sb.from = altFrom; }
    return { toasts: R.toasts.slice(), beleg: db.belege.some((b) => b.nummer === "900621"), abger: db.abrechnung.some((z) => z.protokoll_id === "pk21"), offen: document.body.contains(d) };
  });
  return r.beleg && r.abger && !r.offen && r.toasts.some((t) => /Katalog/.test(t) && /abgelegt/.test(t)) && !r.toasts.some((t) => /Nicht abgelegt/.test(t))
    ? "" : `Beleg gespeichert: ${r.beleg}, abgerechnet: ${r.abger}, Fenster offen: ${r.offen}, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* KPlus-PDF ohne erkannte Nummer: nicht ohne Nummer ablegen (sonst überschreibt die nächste solche Rechnung die erste) */
reSchritt("kplus", "R14", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re, it = (xx, y, t, f) => ({ s: 1, x: xx, y, w: 20, t, f: f || "F2" });
    /* Rechnungsnummer eine Zeile unter dem Titel – kplusAuswerten findet sie nicht */
    const erg = x("kplusAuswerten")([[it(330, 150, "Rechnung", "F1"), it(480, 165, "900801", "F1"), it(150, 300, "Bezeichnung"),
      it(60, 320, "1"), it(100, 320, "1,00 psh"), it(160, 320, "Fahrtpauschale Zone 1 (Testtext)"), it(420, 320, "50,00"), it(500, 320, "50,00"), it(300, 400, "Netto-Summe"), it(500, 400, "50,00")]]);
    await R.stoerung("p141", "2026-06-01"); await R.stoerung("p142", "2026-06-09");
    const n0 = db.belege.length;
    let d = R.vorschau("p141", JSON.parse(JSON.stringify(erg)));
    R.toasts.length = 0; await R.ablegen(d);
    const ohne = db.belege.length - n0, meldung = R.toasts.slice(-1)[0], feld = d.querySelector("[data-nummer]");
    if (feld) { R.setze(feld, "900801"); await R.ablegen(d); }
    x("ansichtenSchliessen()");
    d = R.vorschau("p142", JSON.parse(JSON.stringify(erg)));
    const feld2 = d.querySelector("[data-nummer]"); if (feld2) R.setze(feld2, "900802");
    await R.ablegen(d);
    return { nummer: erg.nummer, ohne, meldung, belege: db.belege.slice(n0).map((b) => [b.nummer, b.protokoll_id]) };
  });
  return r.ohne === 0 && /nummer/i.test(r.meldung || "") && JSON.stringify(r.belege) === '[["900801","p141"],["900802","p142"]]'
    ? "" : `Nummer „${r.nummer}“; ohne Nummer abgelegt: ${r.ohne} (${r.meldung}); danach Belege ${JSON.stringify(r.belege)}`;
});
/* KPlus beim Einsatz: liegt dieselbe Rechnung schon am Projekt, bleibt der Projektbezug; an einem anderen Einsatz erst nach Rückfrage */
reSchritt("kplus", "R22", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const db = window.__db.tabellen, R = window.__re;
    db.belege.push({ id: "b22", art: "rechnung", nummer: "900700", extern: true, test: false, datum: "2026-06-01", status: "versendet", projekt_id: "prt1", kunde_id: "lidl", kopf: {}, positionen: [], summen: { netto: 0 } },
      { id: "b22b", art: "rechnung", nummer: "900701", extern: true, test: false, datum: "2026-06-01", status: "versendet", protokoll_id: "pkAnders", kunde_id: "lidl", kopf: {}, positionen: [], summen: { netto: 0 } });
    await R.stoerung("pk22", "2026-06-01");
    R.confirms.length = 0;
    await R.ablegen(R.vorschau("pk22", R.erg("900700")));
    const b1 = db.belege.filter((q) => q.nummer === "900700").map((q) => [q.projekt_id, q.protokoll_id]);
    R.ja = false;                                         /* „schon bei einem anderen Einsatz – hierher?“ → nein */
    const d = R.vorschau("pk22", R.erg("900701")); await R.ablegen(d);
    const b2 = db.belege.filter((q) => q.nummer === "900701").map((q) => q.protokoll_id);
    return { b1, b2, confirms: R.confirms.slice(), offen: document.body.contains(d) };
  });
  return JSON.stringify(r.b1) === '[["prt1","pk22"]]' && JSON.stringify(r.b2) === '["pkAnders"]' && r.confirms.some((m) => /900701/.test(m)) && r.offen
    ? "" : `am Projekt: ${JSON.stringify(r.b1)}; am anderen Einsatz: ${JSON.stringify(r.b2)}; Rückfragen ${JSON.stringify(r.confirms)}, Fenster offen ${r.offen}`;
});
/* KPlus-Beleg: „PDF ansehen“ zeigt das abgelegte Original – ohne Original nie ein App-PDF mit Briefkopf */
reSchritt("kplus", "R10", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    await R.stoerung("pk10", "2026-06-01");
    await R.ablegen(R.vorschau("pk10", R.erg("900560"), new File([new TextEncoder().encode("%PDF-1.4\n%%EOF\n")], "900560.pdf", { type: "application/pdf" })));
    const mit = await R.bis(() => db.belege.filter((q) => q.nummer === "900560" && q.pdf_pfad)[0]);
    db.belege.push({ id: "b10b", art: "rechnung", nummer: "900561", extern: true, test: false, datum: "2026-06-01", status: "versendet", protokoll_id: "pk10", kunde_id: "lidl", kopf: {}, positionen: [], summen: { netto: 0 } });
    x("(function(){ window.__gezeigt=[]; window.__alt10=[pdfAnsicht, belegPdfErzeugen];"
      + " pdfAnsicht=function(u,n){ window.__gezeigt.push('angezeigt: '+n); };"
      + " belegPdfErzeugen=function(){ window.__gezeigt.push('App-PDF neu erzeugt'); return new Promise(function(){}); }; return 1; })()");
    const zeige = async (b) => { x("ansichtenSchliessen()"); window.__b10 = b;
      x("belegAnsicht(kontextProtokoll(window.__re.pk('pk10')), window.__b10, function(){})");
      const k = await R.bis(() => R.knopf(R.dlg(), /^PDF ansehen$/)); k.click(); await R.warte(250); };
    try { await zeige(mit); const g1 = window.__gezeigt.slice(); window.__gezeigt.length = 0; R.toasts.length = 0;
      await zeige(db.belege.filter((q) => q.id === "b10b")[0]);
      return { pfad: mit && mit.pdf_pfad, g1, g2: window.__gezeigt.slice(), toasts: R.toasts.slice() };
    } finally { x("(function(){ pdfAnsicht=window.__alt10[0]; belegPdfErzeugen=window.__alt10[1]; return 1; })()"); }
  });
  return r.pfad && r.g1.length === 1 && /^angezeigt/.test(r.g1[0]) && !r.g2.length && r.toasts.some((t) => /Original/.test(t))
    ? "" : `Original unter ${r.pfad}; „PDF ansehen“ zeigt ${JSON.stringify(r.g1)}; ohne Original: ${JSON.stringify(r.g2)}, Meldungen ${JSON.stringify(r.toasts)}`;
});
/* Lernen aus KPlus: dieselbe Wartung mit anderem Wortlaut kommt nicht doppelt in den nächsten Vorschlag */
reSchritt("kplus", "R05", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re;
    const prot = (id, d) => ({ id, client_id: id, standort_id: "TS1", datum: d, wartungsart: "Wartung", techniker: "Testtechniker", anlagen: [{ name: "VRV Anlage", termin: "JW" }],
      version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    db.katalog.push({ id: "kw5", text: "Wartung Klimaanlage lt. Rahmenvertrag (Test)", eh: "Stk", preis: 210, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    db.protokolle.push(prot("w51", "2026-03-01"), prot("w52", "2026-04-01"), prot("w53", "2026-05-01"));
    await x("Promise.all([ladeProtokolle(), katalogLaden()])");
    let vgl = "";
    for (const [id, nr] of [["w51", "900051"], ["w52", "900052"]]) {
      const d = R.vorschau(id, R.erg(nr, [{ typ: "pos", nr: "2", menge: 1, eh: "Stk", preis: 210, betragPdf: 210, text: "Jahreswartung VRV lt. FB035/Pos.1" }]));
      vgl = vgl || [...d.querySelectorAll(".as-inhalt .card div[style*=border-left]")].map((z) => z.textContent).join(" | ");
      await R.ablegen(d);
    }
    await x("belegeAlleLaden()");
    x("belegNeu(kontextProtokoll(window.__re.pk('w53')), 'rechnung', null, function(){})");
    const d = await R.bis(() => { const d = R.dlg(); return d && d.querySelector(".bpos") && d; });
    return { vgl, pos: [...d.querySelectorAll(".bpos")].map((z) => z.querySelector('[data-f="text"]').value.split("\n")[0] + " | " + z.querySelector('[data-f="preis"]').value),
      summe: d.querySelector(".bsumme").textContent };
  });
  const w = r.pos.filter((p) => /wartung/i.test(p));
  return w.length === 1 && !/fehlte in der App · Jahreswartung/.test(r.vgl) ? "" : `1 Anlage, aber ${w.length} Wartungspositionen im Vorschlag: ${JSON.stringify(r.pos)} – ${r.summe}. Vergleich beim Ablegen: ${r.vgl}`;
});

/* Reiter Rechnungen: die Suche bleibt bei vielen Protokollen und Belegen schnell */
reSchritt("tempo", "R15", async (a) => {
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, R = window.__re, st = ["TS1", "TS2", "TS3", "TS4", "TS5"];
    for (let i = 0; i < 1500; i++) db.protokolle.push({ id: "pp" + i, client_id: "pp" + i, standort_id: st[i % 5], datum: "2025-" + String(1 + (i % 12)).padStart(2, "0") + "-" + String(1 + (i % 28)).padStart(2, "0"),
      wartungsart: "Wartung", techniker: "Testtechniker", anlagen: [{ name: "VRV Anlage" }], version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" });
    for (let i = 0; i < 600; i++) db.belege.push({ id: "bb" + i, art: "rechnung", nummer: String(900000 + i), extern: true, test: false, datum: "2025-06-01", status: "versendet",
      protokoll_id: "pp" + i, kunde_id: "lidl", standort_id: st[i % 5], kopf: { betreff: ["Filiale Störung"] }, positionen: [], summen: { netto: 100, brutto: 120 } });
    await x("ladeProtokolle()");
    x("S.blFilter='alle'; S.view='belege'; render(); 1");
    const qi = await R.bis(() => document.querySelectorAll("[data-liste] .card").length > 100 && [...document.querySelectorAll("input.search")].filter((i) => /Nummer, Betreff/.test(i.placeholder))[0], 20000);
    const zeiten = [];
    for (const w of ["9", "90", "900"]) { const t0 = performance.now(); qi.value = w; qi.dispatchEvent(new Event("input", { bubbles: true })); zeiten.push(Math.round(performance.now() - t0)); }
    return { zeiten, prot: x("alleProtokolle(true).length"), belege: x("BELEGE_ALLE.length") };
  });
  return Math.max(...r.zeiten) < 1000 ? "" : `${r.prot} Protokolle, ${r.belege} Belege: ${JSON.stringify(r.zeiten)} ms je Tastendruck`;
});

/* Zusammenführung der Tiefentests: KPlus erkennt jetzt Gutschriften (eigene Art) – „Mail zu Projekt“ und der Posteingang legen
   KPlus-PDFs nach der erkannten Art ab; eine Gutschrift (Preise) muss dabei wie eine Rechnung im Büro-Ordner landen */
test("Tiefentest zusammenführung: KPlus-Gutschrift aus Mail und Posteingang liegt nur im Büro-Ordner", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x;
    x("kplusLesen=function(){ return Promise.resolve({art:'gutschrift', nummer:'900777', datum:'2026-06-01', kopf:{}, positionen:[], summenPdf:{}}); }");
    window.__gsDatei = new File([new Uint8Array([37, 80, 68, 70])], "900777.pdf", { type: "application/pdf" });
    window.__gsArt = new Map();
    await x("kplusArtenPruefen([window.__gsDatei], window.__gsArt)");
    const art = window.__gsArt.get(window.__gsDatei);
    return { art, pfad: x("projektDateiPfad({id:'pGS'}, " + JSON.stringify(art || "") + ", '900777.pdf')"), mitBeleg: x("mailMitBeleg([], [" + JSON.stringify(art || "") + "])") };
  });
  pruefe(r.art === "rechnung" && /^buero\//.test(r.pfad) && r.mitBeleg === true, "Gutschrift nicht nur im Büro-Ordner: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Zusammenführung: Werkzeug und Material liest die Präsentation nie (Werkzeug-Zweig) – auch nicht nach einem Kontowechsel ohne
   Neuladen, bei dem Reisekosten und Fahrzeuge schon aufgeräumt werden (Reisekosten-Zweig) */
test("Tiefentest zusammenführung: nach dem Kontowechsel zur Präsentation kein Werkzeug und Material des vorigen Kontos", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte } = window.__rk;
    db.werkzeug.push({ id: "WZK1", name: "TT-Wechsel Pumpe", standort_art: "lager", zustand: "ok", aktiv: true });
    db.bedarf.push({ id: "BZK1", art: "material", text: "TT-Wechsel Material", status: "offen", beschaffung: "mitnehmen" });
    await x("wzLaden(true)");
    const vorher = x("WZ.length+'/'+BEDARF.length");
    await window.__rk.anmelden("praes@test.at", "praesentation");
    x("ansichtenSchliessen(); S.view='werkzeug'; render()"); await warte(400);
    return { vorher, rolle: x("Rolle.name"), nachher: x("WZ.length+'/'+BEDARF.length+'/'+BEDARF_ALLE.length"), sichtbar: /TT-Wechsel/.test(document.getElementById("app").innerText) };
  });
  pruefe(r.vorher !== "0/0" && r.rolle === "praesentation", "Aufbau falsch: " + JSON.stringify(r));
  pruefe(r.nachher === "0/0/0" && !r.sichtbar, "Präsentation sieht Werkzeug/Material des vorigen Kontos: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Tiefentest 05.10.: die CSV der Arbeitszeiten (Inhaber) schützt Zellen wie csv() und die Reisekosten-CSV – Name, Was und Notiz
   tippt jede Person selbst; „=“, „+“, „-“, „@“ am Anfang würde Excel als Formel ausführen. Zahlen (auch negative) bleiben Zahlen. */
test("Tiefentest stunden: CSV Lohnverrechnung und Alle Einträge – selbst getippte Felder werden keine Excel-Formel, negative Stunden bleiben Zahlen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const z = { user_id: "u_tech_test_at", name: "+Testtechniker", art: "arbeit", quelle: "hand", bereich: "werkstatt" };
    db.arbeitszeiten.push(Object.assign({ id: "tcsv1", datum: "2026-09-01", beginn: "07:00", ende: "15:30", pause_min: 30, minuten: 480, taetigkeit: "=1+1", notiz: "@SUMME(A1:A2)" }, z),
      Object.assign({ id: "tcsv2", datum: "2026-09-02", minuten: -30, pause_min: 0, taetigkeit: "Korrektur", notiz: "-Ausgleich" }, z));
    window.__csvs = {};
    x("(function(){ pdfHerunterladen=function(b,n){ window.__csvs[n]=b; }; return 1; })()");
    x("S.view='stunden'; S.stMonat='2026-09'; render()");
    let karte = null;
    for (let i = 0; i < 40 && !karte; i++) { await tt.warte(100);
      const h = [...document.querySelectorAll(".card h2")].find((h) => /^Alle Mitarbeiter/.test(h.textContent));
      karte = h && [...h.closest(".card").querySelectorAll("button")].some((b) => /Lohnverrechnung/.test(b.textContent)) ? h.closest(".card") : null; }
    if (!karte) return { fehlt: "Karte „Alle Mitarbeiter“ ohne CSV-Knöpfe" };
    for (const t of ["Lohnverrechnung (CSV)", "Alle Einträge (CSV)"]) [...karte.querySelectorAll("button")].find((b) => b.textContent === t).click();
    await tt.warte(200);
    const zeilen = async (n) => window.__csvs[n] ? (await window.__csvs[n].text()).split("\r\n").slice(1) : [];
    return { lohn: await zeilen("Lohnverrechnung_2026-09.csv"), alle: await zeilen("Arbeitszeiten_2026-09.csv") };
  });
  pruefe(!r.fehlt, "Aufbau falsch: " + r.fehlt);
  const lohn = r.lohn[0] || "", alle = r.alle.join(" | ");
  pruefe(/^'\+Testtechniker;2026-09;/.test(lohn), "Lohnverrechnung: selbst getippter Name als Excel-Formel: " + lohn);
  pruefe(/;-\d+,\d\d;/.test(lohn) && lohn.indexOf("'-") < 0, "Lohnverrechnung: negative Stunden (Diff.) verfälscht: " + lohn);
  pruefe(alle.indexOf(";'=1+1;") >= 0 && alle.indexOf(";'@SUMME(A1:A2);") >= 0 && alle.indexOf(";'-Ausgleich;") >= 0 && /^'\+Testtechniker;/.test(r.alle[0] || ""),
    "Alle Einträge: Was/Notiz/Name als Excel-Formel: " + alle);
  pruefe(alle.indexOf(";-0,50;") >= 0 && alle.indexOf("'-0,50") < 0, "Alle Einträge: negative Stunden verfälscht: " + alle);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Tiefentest 05.10.: Werkzeug und Material speichern – „noch nicht eingerichtet“ nur bei fehlender Tabelle („does not exist“,
   „schema cache“); eine verletzte Prüfregel nennt auch „relation“ und muss als echte Meldung kommen (wie Reisekosten, TTQ-22) */
test("Tiefentest werkzeug: verletzte Prüfregel beim Speichern meldet nicht „noch nicht eingerichtet“, sondern die echte Meldung", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, sb = x("Store.sb"), altFrom = sb.from;
    let meldung = "";
    /* werkzeug und bedarf antworten mit dem Fehler der Datenbank, alles andere wie immer */
    sb.from = function (t) {
      if (t !== "werkzeug" && t !== "bedarf") return altFrom.apply(this, arguments);
      const p = Promise.resolve({ data: null, error: { message: meldung.replace("TAB", t) } }), q = { insert: () => q, update: () => q, eq: () => q, select: () => p };
      return q;
    };
    const fang = (pr) => pr.then(() => "gespeichert", (e) => String(e && e.message || e));
    const beide = async (m) => { meldung = m;
      return [await fang(x("wzSpeichern(null, {name:'TT-Prüfregel'})")), await fang(x("bedarfSpeichern(null, {art:'material', text:'TT-Prüfregel'})"))]; };
    const erg = {
      pruefregel: await beide('new row for relation "TAB" violates check constraint "TAB_name_check"'),
      fehlt: await beide('relation "public.TAB" does not exist'),
      cache: await beide("Could not find the table 'public.TAB' in the schema cache"),
      netz: await beide("TypeError: Failed to fetch"),
    };
    sb.from = altFrom;
    return erg;
  });
  pruefe(r.pruefregel.every((m) => /violates check constraint/.test(m) && !/nicht eingerichtet/.test(m)), "Prüfregel als „nicht eingerichtet“ gemeldet: " + JSON.stringify(r.pruefregel));
  pruefe(r.fehlt.concat(r.cache).every((m) => /noch nicht eingerichtet/.test(m)), "fehlende Tabelle nicht als „nicht eingerichtet“ gemeldet: " + JSON.stringify([r.fehlt, r.cache]));
  pruefe(r.netz.every((m) => /keine Verbindung/.test(m)), "Netzfehler nicht auf Deutsch: " + JSON.stringify(r.netz));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* ---- Antworten des Inhabers vom 05.10.2026: Stunden und Abwesenheiten ---- */
test("Antworten stunden: Abwesenheiten anderer nur der Inhaber – Admin wie Techniker nur für sich, aus gemeinsamen nur sich selbst herausnehmen", async () => {
  const fehl = [];
  const a = await oeffnen(KONTEN.admin);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"), e = {}; tt.leeren();
    const ich = tt.ich(), tech = "u_tech_test_at", inh = "u_inhaber_test_at";
    const t1 = x("werktagAb(plusTage(isoLokal(new Date()),7))"), t3 = x("plusTage('" + t1 + "',2)");
    const nein = (q) => (q.error || !(q.data || []).length ? "abgelehnt" : "angenommen");
    const knoepfe = (d) => [...d.querySelectorAll(".as-fuss button")].map((b) => b.textContent.trim());
    /* (a) neue Schule für mich und einen Kollegen: wählbar ist nur „ich“, gespeichert nur für mich */
    x("planEditor(null, {art:'termin', kategorie:'schule', titel:'Kurs AW', datum:'" + t1 + "', wer:['" + ich + "','" + tech + "'], wer_namen:['Testadmin','Testtechniker']})"); await tt.warte(300);
    let d = tt.dialog();
    e.chips = [...d.querySelectorAll("[data-wer] .chip")].map((c) => c.textContent);
    tt.ok(d).click(); await tt.warte(400);
    e.gespeichert = db.planung.filter((p) => p.titel === "Kurs AW").map((p) => (p.wer || []).join());
    x("ansichtenSchliessen()");
    /* (b) Datenbank: für einen anderen anlegen, seine Abwesenheit ändern oder löschen – abgelehnt; Wartung für andere wie bisher */
    e.anlegenFremd = nein(await sb.from("planung").insert({ art: "termin", kategorie: "zeitausgleich", titel: "ZA", datum: t1, wer: [tech], wer_namen: ["Testtechniker"] }).select("*"));
    db.planung.push({ id: "aw1u", art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: t1, datum_bis: t3, wer: [tech], wer_namen: ["Testtechniker"], status: "genehmigt", erstellt_von: inh, erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    e.aendernFremd = nein(await sb.from("planung").update({ datum_bis: t1 }).eq("id", "aw1u").select("*"));
    e.loeschenFremd = nein(await sb.from("planung").delete().eq("id", "aw1u").select("id"));
    e.wartungFremd = nein(await sb.from("planung").insert({ art: "termin", kategorie: "wartung", titel: "Wartung", datum: t1, wer: [tech], wer_namen: ["Testtechniker"] }).select("*"));
    /* (c) fremder Urlaub geöffnet: schreibgeschützt mit Hinweis – kein Speichern, Löschen, Tag herausnehmen, nicht ziehbar */
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw1u'; })[0])"); await tt.warte(300);
    d = tt.dialog();
    e.fremd = { hinweis: /ändert nur der Inhaber/.test(d.textContent), knoepfe: knoepfe(d).filter((t) => /Speichern|Löschen/.test(t)), felderAn: [...d.querySelectorAll("form input, form select, form textarea, form button")].filter((f) => !f.disabled).length,
      heraus: /Tage herausnehmen/.test(d.textContent), ziehen: x("kalDarfZiehen({art:'termin', e:PLANUNG.filter(function(p){ return p.id==='aw1u'; })[0]})") };
    x("ansichtenSchliessen()");
    /* (d) gemeinsamer Kurs (ich und der Techniker): nur mich herausnehmen – sonst nichts */
    db.planung.push({ id: "aw1k", art: "termin", kategorie: "schule", titel: "Kältekurs", datum: t1, datum_bis: t3, wer: [ich, tech], wer_namen: ["Testadmin", "Testtechniker"], status: "offen", erstellt_von: inh, erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw1k'; })[0])"); await tt.warte(300);
    d = tt.dialog();
    e.kurs = { optionen: [...d.querySelectorAll("[data-fuer] option")].map((o) => o.textContent), knoepfe: knoepfe(d).filter((t) => /Speichern|Löschen/.test(t)) };
    x("ansichtenSchliessen()");
    e.kurs.titel = nein(await sb.from("planung").update({ titel: "Anders" }).eq("id", "aw1k").select("*"));
    e.kurs.kollegeRaus = nein(await sb.from("planung").update({ wer: [ich], wer_namen: ["Testadmin"] }).eq("id", "aw1k").select("*"));
    e.kurs.antwort = nein(await sb.from("planung").update({ ausnahmen: { [t1]: { [ich]: { art: "eingesprungen", von: "Testadmin" } } } }).eq("id", "aw1k").select("*"));
    e.kurs.selbstRaus = nein(await sb.from("planung").update({ wer: [tech], wer_namen: ["Testtechniker"] }).eq("id", "aw1k").select("*"));
    /* (e) eigene Abwesenheit: anlegen, ändern, löschen – erlaubt */
    const eig = await sb.from("planung").insert({ art: "termin", kategorie: "krank", titel: "Krank", datum: t1, wer: [ich], wer_namen: ["Testadmin"] }).select("*");
    const id = eig.data && eig.data[0].id;
    e.eigen = [nein(eig), id ? nein(await sb.from("planung").update({ datum_bis: t3 }).eq("id", id).select("*")) : "-", id ? nein(await sb.from("planung").delete().eq("id", id).select("id")) : "-"].join();
    return e;
  });
  if (r.chips.length !== 1 || !/\(ich\)/.test(r.chips[0]) || JSON.stringify(r.gespeichert) !== JSON.stringify(["u_admin_test_at"])) fehl.push("(a) Abwesenheit für andere wählbar: " + JSON.stringify([r.chips, r.gespeichert]));
  if (r.anlegenFremd !== "abgelehnt" || r.aendernFremd !== "abgelehnt" || r.loeschenFremd !== "abgelehnt" || r.wartungFremd !== "angenommen") fehl.push("(b) Datenbank: " + JSON.stringify(r));
  if (!r.fremd.hinweis || r.fremd.knoepfe.length || r.fremd.felderAn || r.fremd.heraus || r.fremd.ziehen) fehl.push("(c) fremder Urlaub nicht schreibgeschützt: " + JSON.stringify(r.fremd));
  if (JSON.stringify(r.kurs.optionen) !== JSON.stringify(["nur Testadmin"]) || r.kurs.knoepfe.length || r.kurs.titel !== "abgelehnt" || r.kurs.kollegeRaus !== "abgelehnt" || r.kurs.antwort !== "angenommen" || r.kurs.selbstRaus !== "angenommen")
    fehl.push("(d) gemeinsamer Kurs: " + JSON.stringify(r.kurs));
  if (r.eigen !== "angenommen,angenommen,angenommen") fehl.push("(e) eigene Abwesenheit: " + r.eigen);
  if (a.fehler.length) fehl.push("Laufzeitfehler (Admin): " + a.fehler.join("; "));
  await a.zu();
  /* der Inhaber: für andere anlegen, ändern, löschen – im Termin mit Personenwahl */
  const b = await oeffnen(KONTEN.inhaber);
  await ttHilfen(b);
  const r2 = await b.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, sb = x("Store.sb"); tt.leeren();
    const tech = "u_tech_test_at", t1 = x("werktagAb(plusTage(isoLokal(new Date()),7))");
    const ins = await sb.from("planung").insert({ art: "termin", kategorie: "schule", titel: "Kurs", datum: t1, wer: [tech], wer_namen: ["Testtechniker"] }).select("*");
    const id = ins.data && ins.data[0].id;
    const upd = id ? await sb.from("planung").update({ titel: "Kurs neu" }).eq("id", id).select("*") : {};
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='" + id + "'; })[0])"); await tt.warte(400);
    const d = tt.dialog(), kn = [...d.querySelectorAll(".as-fuss button")].map((k) => k.textContent.trim()), chips = d.querySelectorAll("[data-wer] .chip").length;
    x("ansichtenSchliessen()");
    const del = id ? await sb.from("planung").delete().eq("id", id).select("id") : {};
    return { anlegen: !ins.error, aendern: !upd.error && (upd.data || []).length === 1, speichern: kn.includes("Speichern"), loeschen: kn.includes("Löschen"), chips, loeschenDb: !del.error && (del.data || []).length === 1 };
  });
  if (!r2.anlegen || !r2.aendern || !r2.speichern || !r2.loeschen || r2.chips < 2 || !r2.loeschenDb) fehl.push("Inhaber darf Abwesenheit anderer nicht verwalten: " + JSON.stringify(r2));
  if (b.fehler.length) fehl.push("Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Antworten stunden: genehmigten Urlaub löscht nur der Inhaber – die Person zieht ihn zurück, der Chef bekommt eine Nachricht", async () => {
  const fehl = [];
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"), e = {}; tt.leeren();
    const ich = tt.ich(), t1 = x("werktagAb(plusTage(isoLokal(new Date()),14))"), t3 = x("plusTage('" + t1 + "',2)");
    const nein = (q) => (q.error || !(q.data || []).length ? "abgelehnt" : "angenommen");
    ["genehmigt", "beantragt"].forEach((st) => db.planung.push({ id: "aw2" + st, art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: t1, datum_bis: t3, wer: [ich], wer_namen: ["Testtechniker"], status: st,
      erstellt_von: ich, erstellt: new Date().toISOString(), privat: false, ausnahmen: {} }));
    await tt.laden();
    const oeffne = async (id) => { x("planEditor(PLANUNG.filter(function(p){ return p.id==='" + id + "'; })[0])"); await tt.warte(200); return [...tt.dialog().querySelectorAll(".as-fuss button")]; };
    let kn = await oeffne("aw2genehmigt");
    e.genehmigt = kn.map((b) => b.textContent.trim());
    const zk = kn.find((b) => /zurückziehen/.test(b.textContent)), chatVorher = db.chat.length;
    window.__dialoge.length = 0;
    if (zk) { zk.click(); await tt.warte(600); }
    e.rueckfrage = window.__dialoge.filter((d) => d[0] === "confirm").map((d) => d[1]).join(" | ");
    e.nachricht = db.chat.slice(chatVorher).map((c) => c.an + ": " + c.text);
    e.toast = tt.toasts.join(" | ");
    e.nochDa = db.planung.some((p) => p.id === "aw2genehmigt" && p.status === "genehmigt");
    x("ansichtenSchliessen()");
    e.beantragt = (await oeffne("aw2beantragt")).map((b) => b.textContent.trim()); x("ansichtenSchliessen()");
    e.loeschenGenehmigt = nein(await sb.from("planung").delete().eq("id", "aw2genehmigt").select("id"));
    e.loeschenBeantragt = nein(await sb.from("planung").delete().eq("id", "aw2beantragt").select("id"));
    return e;
  });
  if (r.genehmigt.includes("Löschen") || !r.genehmigt.includes("Urlaub zurückziehen")) fehl.push("Knöpfe bei genehmigtem Urlaub: " + JSON.stringify(r.genehmigt));
  if (!/zurückziehen/.test(r.rueckfrage) || r.nachricht.length !== 1 || !/^u_inhaber_test_at: .*zurück/.test(r.nachricht[0]) || !/Der Chef bekommt eine Nachricht/.test(r.toast) || !r.nochDa)
    fehl.push("Zurückziehen: " + JSON.stringify({ rueckfrage: r.rueckfrage, nachricht: r.nachricht, toast: r.toast, nochDa: r.nochDa }));
  if (!r.beantragt.includes("Löschen") || r.beantragt.includes("Urlaub zurückziehen")) fehl.push("Knöpfe bei beantragtem Urlaub: " + JSON.stringify(r.beantragt));
  if (r.loeschenGenehmigt !== "abgelehnt" || r.loeschenBeantragt !== "angenommen") fehl.push("Datenbank: " + JSON.stringify([r.loeschenGenehmigt, r.loeschenBeantragt]));
  if (a.fehler.length) fehl.push("Laufzeitfehler (Techniker): " + a.fehler.join("; "));
  await a.zu();
  const b = await oeffnen(KONTEN.inhaber);
  await ttHilfen(b);
  const r2 = await b.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"); tt.leeren();
    const t1 = x("werktagAb(plusTage(isoLokal(new Date()),14))");
    db.planung.push({ id: "aw2i", art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: t1, wer: ["u_tech_test_at"], wer_namen: ["Testtechniker"], status: "genehmigt", erstellt_von: "u_tech_test_at", erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw2i'; })[0])"); await tt.warte(200);
    const kn = [...tt.dialog().querySelectorAll(".as-fuss button")].map((k) => k.textContent.trim()); x("ansichtenSchliessen()");
    const del = await sb.from("planung").delete().eq("id", "aw2i").select("id");
    return { kn, geloescht: !del.error && (del.data || []).length === 1 };
  });
  if (!r2.kn.includes("Löschen") || r2.kn.includes("Urlaub zurückziehen") || !r2.geloescht) fehl.push("Inhaber löscht genehmigten Urlaub nicht: " + JSON.stringify(r2));
  if (b.fehler.length) fehl.push("Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Antworten stunden: Krankenstand anderer sehen Kollegen nur als „Abwesend“ – die Art nur der Inhaber und die Person selbst", async () => {
  const fehl = [];
  const sicht = async (konto) => {
    const a = await oeffnen(konto);
    await ttHilfen(a);
    const r = await a.seite.evaluate(async () => {
      const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, e = {}; tt.leeren();
      const adm = "u_admin_test_at", t1 = x("werktagAb(plusTage(isoLokal(new Date()),7))"), t2 = x("plusTage('" + t1 + "',1)");
      const z = { art: "termin", wer: [adm], wer_namen: ["Testadmin"], erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString(), privat: false, ausnahmen: {}, status: "offen" };
      db.planung.push(Object.assign({ id: "aw3k", kategorie: "krank", titel: "Grippe Testadmin", details: "Arztbrief folgt", datum: t1 }, z));
      db.planung.push(Object.assign({ id: "aw3s", kategorie: "schule", titel: "Kältekurs", datum: t2 }, z));
      await tt.laden();
      e.kal = Object.values(x("kalenderEintraege('" + t1 + "', '" + t2 + "', 'alle')")).flat().filter((y) => y.e).map((y) => y.titel + "|" + y.farbe).sort();
      e.grau = x("planKat('privat')[2]"); e.krank = x("planKat('krank')[2]"); e.schule = x("planKat('schule')[2]");
      x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw3k'; })[0])"); await tt.warte(200);
      const d = tt.dialog();
      e.editor = (d.innerText + " " + [...d.querySelectorAll("input, textarea")].map((f) => f.value).join(" ") + " " +
        [...d.querySelectorAll("select")].map((f) => (f.options[f.selectedIndex] || {}).text || "").join(" ")).replace(/\s+/g, " "); x("ansichtenSchliessen()");
      e.verplant = x("verplantPruefen(['" + adm + "'], ['Testadmin'], '" + t1 + "', '" + t1 + "', 0, 1440)").join(" ");
      x("S.view='kalender'; S.kalModus='monat'; S.kMonat='" + t1.slice(0, 7) + "'; S.kalWer='alle'; S.kalNur=''; render()"); await tt.warte(500);
      e.reiter = /Grippe/.test(document.body.innerText);
      return e;
    });
    if (a.fehler.length) fehl.push("Laufzeitfehler (" + konto + "): " + a.fehler.join("; "));
    await a.zu();
    return r;
  };
  const t = await sicht(KONTEN.techniker);
  if (JSON.stringify(t.kal) !== JSON.stringify(["Abwesend|" + t.grau, "Kältekurs|" + t.schule]) || /Grippe|Krankenstand|Arztbrief/.test(t.editor) || !/abwesend/.test(t.editor) ||
      /Grippe/.test(t.verplant) || !/Abwesend/.test(t.verplant) || t.reiter) fehl.push("Techniker sieht den Krankenstand: " + JSON.stringify(t));
  const i = await sicht(KONTEN.inhaber), s = await sicht(KONTEN.admin);
  [["Inhaber", i], ["Person selbst", s]].forEach(([wer, r]) => {
    if (JSON.stringify(r.kal) !== JSON.stringify(["Grippe Testadmin|" + r.krank, "Kältekurs|" + r.schule]) || !/Grippe/.test(r.editor) || !r.reiter) fehl.push(wer + " sieht den Krankenstand nicht: " + JSON.stringify(r));
  });
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Antworten stunden: bestätigter Monat sperrt auch neue Einträge – von Hand, Stempeln, Abgleich; nur der Inhaber trägt nach oder öffnet wieder", async () => {
  const fehl = [], GESPERRT = /Monat ist bestätigt – nur der Inhaber kann noch etwas eintragen/;
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"), e = {}; tt.leeren();
    const ich = tt.ich(), heute = x("isoLokal(new Date())"), vm = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)"), jetzt = new Date().toISOString();
    const zeile = (z) => Object.assign({ user_id: ich, name: "T", minuten: 60, art: "arbeit", quelle: "hand", pause_min: 0 }, z);
    db.arbeitszeiten.push(zeile({ id: "aw4v", datum: vm + "-02", bestaetigt: jetzt }));
    await tt.laden();
    /* (a) von Hand im bestätigten Vormonat: klare Meldung, nichts gespeichert */
    x("zeitEditor(null, {datum:'" + vm + "-10', beginn:'08:00', ende:'10:00', art:'arbeit', bereich:'werkstatt'})"); await tt.warte(200);
    let d = tt.dialog(); e.hinweis = /Monat ist bestätigt/.test(d.textContent);
    tt.ok(d).click(); await tt.warte(300);
    e.meldung = (d.querySelector("[data-err]") || {}).textContent || "";
    e.handGespeichert = db.arbeitszeiten.some((z) => z.datum === vm + "-10");
    x("ansichtenSchliessen()");
    /* (b) Datenbank: neuer Eintrag im bestätigten Monat abgelehnt; im offenen Monat geht es */
    const ins = await sb.from("arbeitszeiten").insert(zeile({ datum: vm + "-11" })).select("*");
    e.db = ins.error ? ins.error.message : "angenommen";
    const ok = await sb.from("arbeitszeiten").insert(zeile({ datum: heute })).select("*");
    e.dbOffen = ok.error ? ok.error.message : "angenommen";
    /* (c) Abgleich im bestätigten Monat (ein später dazugekommener, offener Stempel-Eintrag): App meldet es, Datenbank lehnt ab */
    tt.gestempelt({ datum: vm + "-12", beginn: "07:00", ende: "15:00", minuten: 450, pause_min: 30, bereich: "wartung" });
    await tt.laden(); tt.toasts.length = 0;
    x("abgleichDialog('" + vm + "-12', false)"); await tt.warte(200);
    e.abgleichApp = { toast: tt.toasts.join(" | "), dialog: !!tt.dialog() }; x("ansichtenSchliessen()");
    const ab = await sb.rpc("stempel_abgleich", { p_datum: vm + "-12", p_teile: [{ beginn: "07:00", ende: "15:00", bereich: "wartung" }] });
    e.abgleichDb = ab.error ? ab.error.message : "angenommen";
    /* (d) Stempeln, wenn der laufende Monat schon bestätigt ist: einstempeln meldet es; ausstempeln lehnt die Datenbank ab */
    tt.leeren(); db.arbeitszeiten.push(zeile({ id: "aw4h", datum: heute, bestaetigt: jetzt })); await tt.laden();
    x("stempelGeladen=true; STEMPEL=[]; S.view='stunden'; render()"); await tt.warte(500);
    const karte = document.getElementById("stempelkarte");
    const chip = karte.querySelector(".chips .chip[data-b]"); if (chip) chip.click();
    tt.toasts.length = 0; karte.querySelector("[data-ein]").click(); await tt.warte(500);
    e.einApp = { toast: tt.toasts.join(" | "), stempel: db.stempel.length, frage: !!tt.dialog() };
    x("ansichtenSchliessen()");
    db.stempel.push({ id: "aw4s", user_id: ich, name: "T", art: "ein", zeit: new Date(Date.now() - 60000).toISOString(), bereich: "werkstatt" });
    const vorher = db.arbeitszeiten.length, aus = await sb.rpc("stempeln", { p_art: "aus", p_name: "T" });
    e.ausDb = { meldung: aus.error ? aus.error.message : "angenommen", eintraege: db.arbeitszeiten.length - vorher, nochEin: db.stempel.length === 1 };
    return e;
  });
  if (!r.hinweis || !/Monat ist bestätigt/.test(r.meldung) || r.handGespeichert) fehl.push("(a) von Hand: " + JSON.stringify(r));
  if (!GESPERRT.test(r.db) || r.dbOffen !== "angenommen") fehl.push("(b) Datenbank: " + JSON.stringify([r.db, r.dbOffen]));
  if (!GESPERRT.test(r.abgleichApp.toast) || r.abgleichApp.dialog || !GESPERRT.test(r.abgleichDb)) fehl.push("(c) Abgleich: " + JSON.stringify([r.abgleichApp, r.abgleichDb]));
  if (!GESPERRT.test(r.einApp.toast) || r.einApp.stempel || r.einApp.frage || !GESPERRT.test(r.ausDb.meldung) || r.ausDb.eintraege || !r.ausDb.nochEin) fehl.push("(d) Stempeln: " + JSON.stringify([r.einApp, r.ausDb]));
  if (a.fehler.length) fehl.push("Laufzeitfehler (Techniker): " + a.fehler.join("; "));
  await a.zu();
  /* der Inhaber: trägt im bestätigten Monat nach und öffnet ihn wieder */
  const b = await oeffnen(KONTEN.inhaber);
  await ttHilfen(b);
  const r2 = await b.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"); tt.leeren();
    const tech = "u_tech_test_at", vm = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)");
    db.arbeitszeiten.push({ id: "aw4i", user_id: tech, name: "Testtechniker", datum: vm + "-02", minuten: 480, art: "arbeit", quelle: "hand", pause_min: 0, bestaetigt: new Date().toISOString(), bestaetigt_von: "Testinhaber" });
    const ins = await sb.from("arbeitszeiten").insert({ user_id: tech, name: "Testtechniker", datum: vm + "-03", minuten: 60, art: "arbeit", quelle: "hand" }).select("*");
    x("S.view='stunden'; S.stMonat='" + vm + "'; render()"); await tt.warte(800);
    const knopf = [...document.querySelectorAll("button")].find((k) => /Wieder öffnen/.test(k.textContent));
    if (knopf) { knopf.click(); await tt.warte(500); }
    return { nachtragen: ins.error ? ins.error.message : "angenommen", knopf: !!knopf, nochBestaetigt: db.arbeitszeiten.filter((z) => z.user_id === tech && z.bestaetigt).length };
  });
  if (r2.nachtragen !== "angenommen" || !r2.knopf || r2.nochBestaetigt) fehl.push("Inhaber: " + JSON.stringify(r2));
  if (b.fehler.length) fehl.push("Laufzeitfehler (Inhaber): " + b.fehler.join("; "));
  await b.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Antworten stunden: Arbeit planen (📅) schlägt freitags 07:00–14:00 vor – mit 30 min Pause das Tagessoll von 6:30 h", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, warte = (ms) => new Promise((f) => setTimeout(f, ms));
    x("S.view='stunden'; S.stWoche=montagVon(isoLokal(new Date())); render()"); await warte(600);
    const tage = [...document.querySelectorAll("[data-tage] > div")];
    const vorschlag = (i) => { tage[i].querySelector("[data-planen]").click(); const d = [...document.querySelectorAll(".assistent")].pop();
      const v = d.querySelector('[data-f="beginn"]').value + "–" + d.querySelector('[data-f="ende"]').value; x("ansichtenSchliessen()"); return v; };
    return { montag: vorschlag(0), freitag: vorschlag(4), rundgang: JSON.stringify(x("RUNDGAENGE")).match(/Vorschlag 07:00[^)]*\)/g) };
  });
  pruefe(r.montag === "07:00–15:30" && r.freitag === "07:00–14:00", "Vorschlag beim Planen: " + JSON.stringify(r));
  pruefe(JSON.stringify(r.rundgang) === JSON.stringify(["Vorschlag 07:00–15:30, freitags bis 14:00)"]), "Rundgang nennt die Freitag-Vorgabe falsch: " + JSON.stringify(r.rundgang));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten stunden: halber Tag mit Uhrzeit – gefragt wird nur, wenn die Arbeit bzw. das Einstempeln in die Abwesenheit fällt", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, e = {};
    const frage = () => [...document.querySelectorAll(".assistent")].some((d) => /eingetragen$/.test(d.querySelector(".as-titel").textContent));
    /* Arbeit erfassen: fragt die App? (sonst gespeichert) */
    const erfassen = async (tag, z) => {
      x("zeitEditor(null, " + JSON.stringify(Object.assign({ datum: tag, art: "arbeit", bereich: "werkstatt" }, z)) + ")"); await tt.warte(150);
      tt.ok(tt.dialog()).click(); await tt.warte(300);
      const f = frage(); x("ansichtenSchliessen()"); return f ? "fragt" : db.arbeitszeiten.some((y) => y.datum === tag && y.art === "arbeit") ? "gespeichert" : "?";
    };
    const T = tt.werktag(1), T2 = tt.werktag(2);
    const fall = async (abw, z, tag) => { tt.leeren(); await tt.termin(Object.assign({ kategorie: "zeitausgleich", titel: "Zeitausgleich", datum: tag || T }, abw)); await tt.laden(); return erfassen(tag || T, z); };
    const halb = { beginn: "12:00", ende: "15:30" };
    e.vormittag = await fall(halb, { beginn: "07:00", ende: "11:00" });
    e.konfliktVormittag = x("abwesenheitKonflikt('" + T + "', ZEITEN).length");
    e.mittag = await fall(halb, { beginn: "13:00", ende: "14:00" });
    e.nurDauer = await fall(halb, { minuten: 120 });
    e.ganztaegig = await fall({}, { beginn: "07:00", ende: "11:00" });
    e.mehrtaegig = await fall({ datum_bis: x("plusTage('" + T2 + "',1)"), beginn: "12:00", ende: "15:30" }, { beginn: "07:00", ende: "11:00" }, T2);
    /* Einstempeln jetzt: Abwesenheit heute mit Uhrzeit um „jetzt“ herum – bzw. später */
    const jm = x("new Date().getHours()*60+new Date().getMinutes()"), hm = (m) => x("kalHm(" + m + ")");
    const stempeln = async (b, en) => {
      tt.leeren(); await tt.termin({ kategorie: "zeitausgleich", titel: "Zeitausgleich", datum: x("isoLokal(new Date())"), beginn: hm(b), ende: hm(en) }); await tt.laden();
      x("stempelGeladen=true; STEMPEL=[]; S.view='stunden'; render()"); await tt.warte(400);
      const karte = document.getElementById("stempelkarte"), chip = karte.querySelector(".chips .chip[data-b]"); if (chip) chip.click();
      karte.querySelector("[data-ein]").click(); await tt.warte(500);
      const f = frage(); x("ansichtenSchliessen()"); return f ? "fragt" : db.stempel.length ? "eingestempelt" : "?";
    };
    e.stempelnDrin = await stempeln(Math.max(0, jm - 30), Math.min(1439, jm + 30));
    e.stempelnDraussen = jm + 90 <= 1439 ? await stempeln(jm + 60, jm + 90) : await stempeln(jm - 90, jm - 60);
    return e;
  });
  pruefe(r.vormittag === "gespeichert" && r.konfliktVormittag === 0, "Arbeit vor dem halben Tag: gefragt bzw. ⚠ – " + JSON.stringify(r));
  pruefe(r.mittag === "fragt" && r.nurDauer === "fragt" && r.ganztaegig === "fragt" && r.mehrtaegig === "fragt", "Arbeit im halben Tag, ohne Uhrzeit, ganztägig oder mehrtägig: nicht gefragt – " + JSON.stringify(r));
  pruefe(r.stempelnDrin === "fragt" && r.stempelnDraussen === "eingestempelt", "Einstempeln: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten stunden: was der Inhaber für jemanden einträgt, ändert nur der Inhaber – die Person antwortet nur und bittet um Herausnehmen", async () => {
  const fehl = [];
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, sb = x("Store.sb"), e = {}; tt.leeren();
    const ich = tt.ich(), T = tt.werktag(1), T2 = tt.werktag(2), nein = (q) => (q.error || !(q.data || []).length ? "abgelehnt" : "angenommen");
    const z = { art: "termin", kategorie: "krank", titel: "Krank", wer: [ich], wer_namen: ["Testtechniker"], status: "offen", erstellt: new Date().toISOString(), privat: false, ausnahmen: {} };
    db.planung.push(Object.assign({ id: "aw5k", datum: T, erstellt_von: "u_inhaber_test_at" }, z), Object.assign({ id: "aw5e", datum: T2, erstellt_von: ich }, z));
    await tt.laden();
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw5k'; })[0])"); await tt.warte(200);
    let d = tt.dialog();
    e.editor = { hinweis: /ändert nur der Inhaber/.test(d.textContent), knoepfe: [...d.querySelectorAll(".as-fuss button")].map((b) => b.textContent.trim()).filter((t) => /Speichern|Löschen/.test(t)), heraus: /Tage herausnehmen/.test(d.textContent) };
    x("ansichtenSchliessen()");
    /* Arbeit an diesem Tag: nicht selbst beenden, sondern den Chef bitten */
    const chatVorher = db.chat.length;
    x("abwesenheitPruefen('" + T + "', function(){})"); await tt.warte(150);
    d = tt.dialog(); e.antworten = [...d.querySelectorAll("button")].map((b) => b.textContent.trim().split("\n")[0]);
    const bitte = [...d.querySelectorAll("button")].find((b) => /Chef/.test(b.textContent)); if (bitte) { bitte.click(); await tt.warte(600); }
    e.nachricht = db.chat.slice(chatVorher).map((c) => c.an).join();
    e.antwort = (((db.planung.find((p) => p.id === "aw5k") || {}).ausnahmen || {})[T] || {})[ich];
    x("ansichtenSchliessen()");
    e.db = { aendern: nein(await sb.from("planung").update({ datum_bis: T2 }).eq("id", "aw5k").select("*")), leeren: nein(await sb.from("planung").update({ wer: [], wer_namen: [] }).eq("id", "aw5k").select("*")),
      loeschen: nein(await sb.from("planung").delete().eq("id", "aw5k").select("id")),
      eigenAendern: nein(await sb.from("planung").update({ titel: "Grippe" }).eq("id", "aw5e").select("*")), eigenLoeschen: nein(await sb.from("planung").delete().eq("id", "aw5e").select("id")) };
    return e;
  });
  if (!r.editor.hinweis || r.editor.knoepfe.length || r.editor.heraus) fehl.push("Termin nicht schreibgeschützt: " + JSON.stringify(r.editor));
  if (r.antworten.some((t) => /für diesen Tag beenden/.test(t)) || r.nachricht !== "u_inhaber_test_at" || !r.antwort || r.antwort.art !== "zurueck") fehl.push("Arbeit am Tag: " + JSON.stringify(r));
  if (JSON.stringify(r.db) !== JSON.stringify({ aendern: "abgelehnt", leeren: "abgelehnt", loeschen: "abgelehnt", eigenAendern: "angenommen", eigenLoeschen: "angenommen" })) fehl.push("Datenbank: " + JSON.stringify(r.db));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Antworten stunden: genehmigten Urlaub geändert – wieder beantragt, der Chef bekommt „bitte neu genehmigen“", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen, e = {}; tt.leeren();
    const ich = tt.ich(), t1 = x("werktagAb(plusTage(isoLokal(new Date()),14))"), t3 = x("plusTage('" + t1 + "',2)");
    db.planung.push({ id: "aw6u", art: "termin", kategorie: "urlaub", titel: "Urlaub", datum: t1, datum_bis: t3, wer: [ich], wer_namen: ["Testtechniker"], status: "genehmigt", erstellt_von: ich, erstellt: new Date().toISOString(), privat: false, ausnahmen: {} });
    await tt.laden();
    const aendern = async (feld, wert) => { const vorher = db.chat.length; x("planEditor(PLANUNG.filter(function(p){ return p.id==='aw6u'; })[0])"); await tt.warte(200);
      const d = tt.dialog(), f = d.querySelector('[data-f="' + feld + '"]'); f.value = wert; f.dispatchEvent(new Event("change", { bubbles: true }));
      tt.ok(d).click(); await tt.warte(600); x("ansichtenSchliessen()");
      return { status: db.planung.find((p) => p.id === "aw6u").status, chat: db.chat.slice(vorher).map((c) => c.an + ": " + c.text) }; };
    e.details = await aendern("details", "Sommer");
    tt.toasts.length = 0;
    e.tage = await aendern("datum_bis", x("plusTage('" + t3 + "',1)"));
    e.toast = tt.toasts.join(" | ");
    return e;
  });
  pruefe(r.details.status === "genehmigt" && !r.details.chat.length, "nur Details geändert: " + JSON.stringify(r.details));
  pruefe(r.tage.status === "beantragt" && r.tage.chat.length === 1 && /^u_inhaber_test_at: .*Urlaub geändert – bitte neu genehmigen/.test(r.tage.chat[0]) && /Chef/.test(r.toast), "Tage geändert: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten stunden: Monat bestätigen warnt, wenn die Person noch eingestempelt ist", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren();
    const vm = x("plusMonate(isoLokal(new Date()),-1).slice(0,7)"), zeile = (u, n) => ({ id: "aw7" + u, user_id: u, name: n, datum: vm + "-02", minuten: 480, art: "arbeit", quelle: "hand", pause_min: 0 });
    db.arbeitszeiten.push(zeile("u_tech_test_at", "Testtechniker"), zeile("u_admin_test_at", "Testadmin"));
    db.stempel.push({ id: "aw7s", user_id: "u_tech_test_at", name: "Testtechniker", art: "ein", zeit: new Date(vm + "-28T08:00:00").toISOString() });
    x("S.view='stunden'; S.stMonat='" + vm + "'; render()"); await tt.warte(800);
    const fragen = {};
    for (const n of ["Testtechniker", "Testadmin"]) {
      const zeileTr = [...document.querySelectorAll("tr")].find((tr) => tr.firstChild && tr.firstChild.textContent.startsWith(n));
      window.__antwort.confirm = false; window.__dialoge.length = 0;
      [...zeileTr.querySelectorAll("button")].find((b) => b.textContent === "Bestätigen").click(); await tt.warte(400);
      fragen[n] = window.__dialoge.map((d) => d[1]).join(" | ");
    }
    window.__antwort.confirm = true;
    return fragen;
  });
  pruefe(/Testtechniker ist noch eingestempelt/.test(r.Testtechniker) && !/eingestempelt/.test(r.Testadmin) && /bestätigen\?/.test(r.Testadmin), "Warnung: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Antworten des Inhabers vom 05.10.2026 (Teil kern) */
test("Antworten kern: „Nur Jahreswartung“ sperrt den Halbjahrestermin wie am Markt üblich – bleibt, bis die Verwaltung es zurücknimmt", async () => {
  const a = await oeffnen(KONTEN.admin);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, t0 = new Date().toISOString();
    /* am Markt TS1 hat die Anlage TP1/TP2 eine HJI; dazu zwei kleine Anlagen nur mit JW – eine bewusst „nur Jahreswartung“ */
    const anlage = (id, nurJW) => ({ id: "position:" + id, typ: "position", ziel: id, neu: true, geaendert: t0, von: "Test", grund: "Test",
      felder: Object.assign({ standortId: "TS1", intervallCode: "JW", monat: 3, aktiv: true, anlageZu: id, anlagentyp: "Split " + id, kaeltemittelKg: 2, inbetriebnahme: "2020-03-01" }, nurJW ? { nurJW: true } : {}) });
    db.stammdaten.push(anlage("NJW1", true), anlage("NJW2", false));
    await x("ladeStammdaten(true)"); await w(300);
    const faelle = x("hjMarktFaelle().map(function(f){ return f.a.leader.id; })");
    for (let i = 0; i < 40; i++) { if (!x("hjMarktLaeuft")) x("hjMarktAutomatisch()"); await w(200);
      if (!x("hjMarktLaeuft") && x("ALLE_POS.some(function(p){ return p.anlageZu==='NJW2' && p.hjiMarkt; })")) break; }
    await w(300);
    const hj = (id) => x("ALLE_POS.filter(function(p){ return p.anlageZu==='" + id + "' && p.id!=='" + id + "' && p.aktiv!==false; }).map(function(p){ return p.intervallCode; })");
    return { faelle, njw1: hj("NJW1"), njw2: hj("NJW2"), nurJW1: !!x("anlageDaten(posById.NJW1).nurJW") };
  });
  pruefe(r.faelle.indexOf("NJW2") >= 0 && r.njw2.length === 1, "Kontrolle: Anlage ohne Entscheidung bekommt keinen Halbjahrestermin: " + JSON.stringify(r));
  pruefe(r.faelle.indexOf("NJW1") < 0 && !r.njw1.length && r.nurJW1, "„Nur Jahreswartung“ trotzdem mit Halbjahrestermin bzw. aufgehoben: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Protokoll am Handy – offene Vor-Ort-Fragen ganz oben als Hinweis, antippen springt zur Frage", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const hinweis = () => { const h = document.querySelector("#app [data-vororthinweis]"); return h && !h.hidden && h.offsetParent !== null ? h.textContent.replace(/\s+/g, " ").trim() : ""; };
    const oeffne = async (sid) => { x("formDirty=false; S.protoArt='wartung'; S.stoerungAus=null; S.bearbeiten=null; S.protoStandort='" + sid + "'; S.protoPos=null; S.view='protokoll'; render(); 1"); await w(500); };
    db.vor_ort_fragen.push({ id: "vfa1", standort_id: "TS1", frage: "Wo ist der Schlüssel zum Technikraum?", angelegt: new Date().toISOString(), angelegt_von: "Büro" });
    await x("vorOrtLaden(true)");
    const erg = {};
    await oeffne("TS2"); erg.ohneFrage = hinweis();
    await oeffne("TS1"); erg.mitFrage = hinweis();
    const kopf = document.querySelector("#app [data-vororthinweis]");
    erg.imKopf = !!kopf && !kopf.closest("form") && kopf.getBoundingClientRect().top < document.getElementById("proto").getBoundingClientRect().top;
    erg.untenNoch = !!document.querySelector("#f_vorort [data-vorort]");
    window.scrollTo(0, 0);
    if (kopf) { (kopf.querySelector("a,button") || kopf).click(); await w(900); }
    const ziel = document.querySelector("#f_vorort [data-vorort] .note");
    const rz = ziel ? ziel.getBoundingClientRect() : null;
    erg.gesprungen = !!rz && rz.top >= 0 && rz.top < window.innerHeight && ziel.classList.contains("sprungziel");
    /* beantwortet: der Hinweis oben verschwindet, die Frage steht unten weiter (mit Antwort) */
    const inp = document.querySelector('#f_vorort [data-v="antwort"]');
    if (inp) { inp.value = "hängt im Büro"; document.querySelector('#f_vorort [data-v="speichern"]').click(); await w(600); }
    erg.nachAntwort = hinweis();
    erg.antwort = (db.vor_ort_fragen.find((f) => f.id === "vfa1") || {}).antwort || "";
    return erg;
  });
  pruefe(!r.ohneFrage, "Hinweis ohne offene Frage am Markt: " + r.ohneFrage);
  pruefe(/❓\s*1 Frage vor Ort/.test(r.mitFrage) && r.imKopf && r.untenNoch, "Hinweis „❓ 1 Frage vor Ort“ fehlt oben im Kopf (bzw. die Stelle unter der Marktwahl): " + JSON.stringify(r));
  pruefe(r.gesprungen, "Antippen springt nicht zur Frage: " + JSON.stringify(r));
  pruefe(r.antwort === "hängt im Büro" && !r.nachAntwort, "nach dem Beantworten steht der Hinweis noch da: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Testkonten aus den Personenlisten ausblenden – Haken in der Kontenübersicht, Konto bleibt, nur der Inhaber stellt es ein", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, rk = window.__rk, w = rk.warte, db = window.__db.tabellen, ADM = "u_admin_test_at";
    const erg = {};
    const zuInhaber = async () => { x("ansichtenSchliessen(); S.view='verwaltung'; S.adm=S.adm||{suche:'',filter:'alle',sort:'filiale',auf:true,sel:null,entwurf:null}; S.adm.tab='inhaber'; render(); 1"); await w(700); };
    const haken = () => document.querySelector('#app [data-ausblenden="' + ADM + '"]');
    const team = async () => { await x("planTeamLaden()"); return x("(planTeam||[]).map(function(p){ return p.user_id; })"); };
    const wzPersonen = async () => { x("wzEditor(null)"); await w(300); const d = rk.dlg(); const l = [...d.querySelectorAll('[data-f="person_id"] option')].map((o) => o.value); x("ansichtenSchliessen()"); return l; };
    await zuInhaber();
    erg.vorher = { haken: !!haken() && !haken().checked, team: await team() };
    if (haken()) { haken().click(); await w(700); }
    erg.einstellung = (db.einstellungen.find((e) => e.schluessel === "personen_ausblenden") || {}).wert || null;
    await zuInhaber();
    erg.kontoNochDa = /Testadmin/.test((haken() || { closest: () => null }).closest("tr") ? haken().closest("tr").textContent : "") && haken().checked;
    erg.team = await team();
    erg.wz = await wzPersonen();
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos=null; S.view='protokoll'; render(); 1"); await w(700);
    erg.fuer = [...document.querySelectorAll("#f_fuer option")].map((o) => o.textContent);
    erg.auslastung = await x("chatTeamLaden().then(function(t){ return t.map(function(p){ return p.user_id; }); })");
    /* wieder einblenden und wieder ausblenden */
    await zuInhaber(); haken().click(); await w(700);
    erg.wieder = await team();
    await zuInhaber(); haken().click(); await w(700);
    /* Techniker: sieht die Liste ebenso ohne das Konto, darf die Einstellung aber nicht ändern */
    await rk.anmelden("tech@test.at", "techniker");
    x("chatTeam=null; planTeam=null; planTeamZeit=0; 1");
    erg.tech = await team();
    const v = await x("Store.sb.from('einstellungen').upsert({schluessel:'personen_ausblenden', wert:{ids:[]}})");
    erg.techSchreibt = !(v && v.error);
    erg.nachTech = ((db.einstellungen.find((e) => e.schluessel === "personen_ausblenden") || {}).wert || {}).ids || [];
    return erg;
  });
  pruefe(r.vorher.haken && r.vorher.team.indexOf("u_admin_test_at") >= 0, "Ausgangslage: kein Haken „in Personenlisten ausblenden“ in der Kontenübersicht: " + JSON.stringify(r.vorher));
  pruefe(r.einstellung && (r.einstellung.ids || []).indexOf("u_admin_test_at") >= 0 && r.kontoNochDa, "Einstellung nicht gespeichert bzw. Konto nicht mehr in der Übersicht: " + JSON.stringify(r));
  pruefe(r.team.indexOf("u_admin_test_at") < 0 && r.wz.indexOf("u_admin_test_at") < 0 && !r.fuer.some((n) => /Testadmin/.test(n)) && r.auslastung.indexOf("u_admin_test_at") < 0,
    "ausgeblendetes Konto steht noch in einer Personenliste: " + JSON.stringify([r.team, r.wz, r.fuer, r.auslastung]));
  pruefe(r.wieder.indexOf("u_admin_test_at") >= 0, "nach dem Einblenden fehlt das Konto: " + JSON.stringify(r.wieder));
  pruefe(r.tech.indexOf("u_admin_test_at") < 0 && !r.techSchreibt && r.nachTech.indexOf("u_admin_test_at") >= 0, "Techniker: Liste bzw. Recht falsch: " + JSON.stringify([r.tech, r.techSchreibt, r.nachTech]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Tour-Startpunkt – jeder nur den eigenen, Inhaber und Admin für alle (App und Datenbank)", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, rk = window.__rk, w = rk.warte, db = window.__db.tabellen, ADM = "u_admin_test_at", TECH = "u_tech_test_at";
    rk.toastSpion();
    const tag = x("werktagAb(plusTage(isoLokal(new Date()),2))"), erg = {};
    const gespeichert = (id) => db.einstellungen.some((e) => e.schluessel === "startpunkt:" + id);
    const waehlen = async (id) => { x("ansichtenSchliessen(); startpunktWaehlen('" + id + "', '" + tag + "')"); await w(200); const d = rk.dlg(); const k = d && rk.knopf(d, /Betrieb/); if (k) { k.click(); await w(400); } return !!k; };
    /* Techniker: fremder Startpunkt – kein Dialog, nichts gespeichert, auch kein „festlegen“ beim Kalendertag des anderen */
    x("STARTPUNKTE={}; 1");
    erg.techFremdDialog = await waehlen(ADM);
    erg.techFremdToast = window.__toasts.slice(-1)[0] || "";
    erg.techFremdGespeichert = gespeichert(ADM);
    await x("Store.sb.from('planung').insert({art:'termin', kategorie:'wartung', titel:'Startpunkt-Test', datum:'" + tag + "', beginn:'09:00', ende:'10:00', standort_id:'TS1', wer:['" + ADM + "'], wer_namen:['Testadmin']})");
    await x("planungLaden()");
    const zeile = x("(function(){ var z=startFahrtZeile('" + ADM + "', '" + tag + "', (kalenderEintraege('" + tag + "','" + tag + "','" + ADM + "','')['" + tag + "']||[])); return z ? z.outerHTML : ''; })()");
    erg.zeileMitLink = /<a /.test(zeile); erg.zeile = zeile.replace(/<[^>]+>/g, "");
    /* Datenbank (Attrappe wie die Sperrregel): fremder Startpunkt abgelehnt, eigener geht */
    const fremd = await x("Store.sb.from('einstellungen').upsert({schluessel:'startpunkt:" + ADM + "', wert:{betrieb:true}})");
    erg.dbFremd = !!(fremd && fremd.error);
    erg.eigen = await waehlen("ich"); erg.eigenGespeichert = gespeichert(TECH);
    /* Admin: plant für alle – setzt den Startpunkt des Technikers */
    await rk.anmelden("admin@test.at", "admin");
    db.einstellungen.forEach((e) => { if (e.schluessel === "startpunkt:" + TECH) e.wert = {}; });
    await x("startpunkteLaden()");
    erg.adminDialog = await waehlen(TECH);
    erg.adminGespeichert = JSON.stringify((db.einstellungen.find((e) => e.schluessel === "startpunkt:" + TECH) || {}).wert || null);
    return erg;
  });
  pruefe(!r.techFremdDialog && !r.techFremdGespeichert && /selbst|Büro/.test(r.techFremdToast), "Techniker kann den Startpunkt eines anderen setzen: " + JSON.stringify(r));
  pruefe(!r.zeileMitLink && /Startpunkt/.test(r.zeile), "Kalender zeigt dem Techniker „festlegen/ändern“ beim Startpunkt eines anderen: " + JSON.stringify(r));
  pruefe(r.dbFremd, "Datenbank (Attrappe) nimmt den fremden Startpunkt eines Technikers an");
  pruefe(r.eigen && r.eigenGespeichert, "eigener Startpunkt lässt sich nicht mehr setzen: " + JSON.stringify(r));
  pruefe(r.adminDialog && /betrieb/.test(r.adminGespeichert), "Admin kann den Startpunkt des Technikers nicht setzen: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Werkzeug „im Fahrzeug eines Kollegen“ – jedes Fahrzeug wählbar, von fremden nur Kennzeichen, Bezeichnung, Fahrer", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen;
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    db.fahrzeuge.push({ id: "FKOL1", kennzeichen: "T-KOL1", bezeichnung: "Testbus", fahrer: ["u_admin_test_at"], fahrer_namen: ["Testadmin"], aktiv: true,
      notiz: "nur fürs Büro", pickerl_bis: "2027-01-31", service_km: 90000, tracker_id: "trk-1" });
    db.fahrzeuge.push({ id: "FALT1", kennzeichen: "T-ALT1", fahrer: [], fahrer_namen: [], aktiv: false });
    db.werkzeug.push({ id: "WKOL1", name: "Lecksucher KOL", standort_art: "lager", zustand: "ok", aktiv: true });
    await x("wzLaden(true)"); await x("fzLaden(true)");
    const erg = { fz: x("FZ.length") };
    const rpc = await x("Store.sb.rpc('fahrzeuge_auswahl')");
    erg.spalten = rpc && rpc.data && rpc.data[0] ? Object.keys(rpc.data[0]).sort().join(",") : "";
    erg.anzahl = rpc && rpc.data ? rpc.data.length : -1;
    x("wzEditor(WZ.filter(function(w){ return w.id==='WKOL1'; })[0])"); await w(500);
    let d = dlg();
    const chip = d.querySelector('[data-ort] .chip[data-w="fahrzeug"]');
    erg.chip = !!chip && !chip.hidden;
    erg.hinweis = [...d.querySelectorAll(".muted")].some((m) => !m.hidden && /Kein Fahrzeug zur Wahl/.test(m.textContent));
    erg.optionen = [...d.querySelectorAll('[data-f="fahrzeug_id"] option')].map((o) => o.textContent);
    if (chip) { chip.click(); await w(100); d.querySelector('[data-f="fahrzeug_id"]').value = "FKOL1";
      [...d.querySelectorAll(".as-fuss button")].pop().click(); await w(700); }
    const wz = db.werkzeug.find((z) => z.id === "WKOL1");
    erg.gespeichert = wz.standort_art + "/" + wz.fahrzeug_id + "/" + wz.fahrzeug_name;
    erg.ortText = x("wzOrtText(WZ.filter(function(w){ return w.id==='WKOL1'; })[0])");
    return erg;
  });
  pruefe(r.fz === 0, "Leseregel der Fahrzeuge verändert – Techniker sieht ein fremdes Fahrzeug: " + JSON.stringify(r));
  pruefe(r.spalten === "bezeichnung,fahrer_namen,id,kennzeichen" && r.anzahl === 1, "fahrzeuge_auswahl liefert mehr als Kennzeichen, Bezeichnung, Fahrer (bzw. ausgeschiedene): " + JSON.stringify(r));
  pruefe(r.chip && !r.hinweis && r.optionen.some((o) => /T-KOL1/.test(o)) && !r.optionen.some((o) => /T-ALT1/.test(o)), "Fahrzeug eines Kollegen nicht wählbar: " + JSON.stringify(r));
  pruefe(r.gespeichert === "fahrzeug/FKOL1/T-KOL1" && /T-KOL1/.test(r.ortText), "Werkzeug nicht im Fahrzeug des Kollegen gespeichert: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Material am privaten Termin sperrt die Datenbank selbst – nur wer den Termin angelegt hat oder eingetragen ist, und der Inhaber", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, ADM = "u_admin_test_at", TECH = "u_tech_test_at", tag = x("isoLokal(new Date())");
    const t = (id, wer, von) => ({ id, art: "termin", kategorie: "privat", privat: true, titel: "Abwesend", datum: tag, wer: wer, wer_namen: [], erstellt_von: von, status: "offen" });
    db.planung.push(t("PPRIV1", [ADM], ADM), t("PPRIV2", [TECH], TECH), t("PPRIV3", [], TECH), Object.assign(t("POFF1", [ADM], ADM), { kategorie: "buero", privat: false, titel: "Büro" }));
    const b = (id, pid) => ({ id, art: "material", text: "Teil " + id, planung_id: pid, status: "offen", beschaffung: "mitnehmen", erstellt_von: ADM });
    db.bedarf.push(b("BPRIV1", "PPRIV1"), b("BPRIV2", "PPRIV2"), b("BPRIV3", "PPRIV3"), b("BOFF1", "POFF1"), b("BOHNE", null));
    const lesen = async () => ((await x("Store.sb.from('bedarf').select('*')")).data || []).map((z) => z.id).sort();
    const ids = await lesen();
    const upd = await x("Store.sb.from('bedarf').update({text:'geändert'}).eq('id','BPRIV1').select('*')");
    /* Admin (Kollege): sieht den privaten des Technikers nicht; Inhaber: sieht alles (volle Kontrolle, Sicherung) */
    /* in der App ebenso: bedarfVerborgen blendet beim Admin aus, beim Inhaber nicht */
    const appVerborgen = async () => { await x("planungLaden()"); return x("bedarfVerborgen({planung_id:'PPRIV2'})"); };
    await window.__rk.anmelden("admin@test.at", "admin"); const admin = await lesen(), appAdmin = await appVerborgen();
    await window.__rk.anmelden("inhaber@test.at", "inhaber"); const inhaber = await lesen(), appInhaber = await appVerborgen();
    return { ids, admin, inhaber, appAdmin, appInhaber, updZeilen: (upd.data || []).length, text: db.bedarf.find((z) => z.id === "BPRIV1").text };
  });
  pruefe(r.admin.indexOf("BPRIV2") < 0 && r.admin.indexOf("BPRIV3") < 0 && r.admin.indexOf("BPRIV1") >= 0, "Admin sieht privates Material eines Kollegen: " + JSON.stringify(r.admin));
  pruefe(["BPRIV1", "BPRIV2", "BPRIV3", "BOFF1", "BOHNE"].every((i) => r.inhaber.indexOf(i) >= 0), "Inhaber sieht nicht alles: " + JSON.stringify(r.inhaber));
  pruefe(r.appAdmin === true && r.appInhaber === false, "App blendet privates Material falsch aus (Admin soll nicht, Inhaber soll sehen): " + JSON.stringify([r.appAdmin, r.appInhaber]));
  pruefe(["BOFF1", "BOHNE", "BPRIV2", "BPRIV3"].every((i) => r.ids.indexOf(i) >= 0), "eigene bzw. nicht private Einträge fehlen: " + JSON.stringify(r));
  pruefe(r.ids.indexOf("BPRIV1") < 0, "Material am privaten Termin einer anderen Person kommt aus der Datenbank: " + JSON.stringify(r));
  pruefe(r.updZeilen === 0 && r.text === "Teil BPRIV1", "fremder Eintrag am privaten Termin ließ sich ändern: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten kern: Fahrzeuge – geplante Einsatzfahrten als km-Schätzung neben den km laut km-Stand, ohne GPS-Anbindung", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, TECH = "u_tech_test_at";
    const heute = x("isoLokal(new Date())"), morgen = x("plusTage(isoLokal(new Date()),1)"), vormonat = x("isoLokal(new Date(new Date().getFullYear(), new Date().getMonth()-1, 28))");
    db.fahrzeuge.push({ id: "FKM1", kennzeichen: "T-KM1", fahrer: [TECH], fahrer_namen: ["Testtechniker"], aktiv: true });
    db.fahrzeug_eintraege.push({ id: "FKE1", fahrzeug_id: "FKM1", art: "km", datum: vormonat, km: 10000, quelle: "hand" },
      { id: "FKE2", fahrzeug_id: "FKM1", art: "km", datum: heute, km: 10500, quelle: "hand" });
    db.einstellungen.push({ schluessel: "startpunkt:" + TECH, wert: { betrieb: true } });
    const termin = (id, tag, sid, b, e) => ({ id, art: "termin", kategorie: "wartung", titel: "Einsatz " + sid, datum: tag, beginn: b, ende: e, standort_id: sid, wer: [TECH], wer_namen: ["Testtechniker"], erstellt_von: TECH, status: "offen" });
    db.planung.push(termin("PKM1", heute, "TS1", "08:00", "09:00"), termin("PKM2", heute, "TS2", "11:00", "12:00"));
    x("try{ FAHR_KM={}; }catch(e){} STARTPUNKTE={}; startpunkteGeladen=false; PLANUNG=[]; planungGeladen=false; planungStand=0; 1");
    const karte = async () => { x("ansichtenSchliessen(); fzGeladen=false; S.view='fahrzeuge'; render(); 1"); await w(1200); x("render()"); await w(300);
      const c = document.querySelector('#app [data-fzid="FKM1"]'); return c ? c.innerText.replace(/\s+/g, " ") : ""; };
    const zahl = (t, re) => { const m = re.exec(t); return m ? +m[1].replace(/\D/g, "") : null; };
    const erg = {};
    erg.mitHeim = x("Math.round(fahrKm(BETRIEB,byId.TS1)+fahrKm(byId.TS1,byId.TS2)+fahrKm(byId.TS2,BETRIEB))");
    erg.ohneHeim = x("Math.round(fahrKm(BETRIEB,byId.TS1)+fahrKm(byId.TS1,byId.TS2))");
    let t = await karte();
    erg.text = t;
    erg.schaetzung = zahl(t, /geplante Einsatzfahrten ≈ ([\d.   ]*\d) km/);
    erg.kmStand = zahl(t, /laut km-Stand ([\d.   ]*\d) km/);
    erg.hinweis = /Schätzung – Umwege und Fahrten am Einsatzort nicht enthalten/.test(t);
    /* morgen geht es vom letzten Markt weiter (weit weg – Übernachtung): heute keine Heimfahrt */
    db.planung.push(termin("PKM3", morgen, "TS2", "08:00", "09:00"));
    x("planungStand=0; 1");
    t = await karte();
    erg.mitUebernachtung = zahl(t, /geplante Einsatzfahrten ≈ ([\d.   ]*\d) km/);
    /* die Texte kündigen keine direkte X-GPS-Anbindung bzw. kein Fahrtenbuch mit Orten mehr an */
    erg.gpsText = /Fahrtenbuch mit Orten erst/.test(String(x("fzGpsImport")));
    return erg;
  });
  pruefe(r.kmStand === 500, "gefahrene km laut km-Stand fehlen: " + JSON.stringify(r));
  pruefe(r.schaetzung === r.mitHeim && r.hinweis, "Schätzung „geplante Einsatzfahrten ≈ … km“ fehlt bzw. falsch (Start → Einsätze → zurück): " + JSON.stringify(r));
  pruefe(r.mitUebernachtung === r.ohneHeim, "Übernachtung am letzten Markt: Heimfahrt trotzdem gezählt: " + JSON.stringify(r));
  pruefe(!r.gpsText, "GPS-Import kündigt noch ein Fahrtenbuch mit Orten an");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* Antworten des Inhabers vom 05.10.2026 (Reisekosten, Kilometergeld, Posteingang, Preise in Mails, KPlus-Stand) */
test("Antworten post: Reisekosten – Belegfoto nach der Abgabe nur noch der Inhaber; er ersetzt ein fremdes Foto im Ordner der Person", async () => {
  const a = await rkSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, dat = window.__db.dateien, { warte, dlg, speichern } = window.__rk;
    const heute = x("isoLokal(new Date())"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const bild = async () => { const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60; cv.getContext("2d").fillRect(0, 0, 20, 20);
      const b = await new Promise((f) => cv.toBlob(f, "image/png")); const dt = new DataTransfer(); dt.items.add(new File([b], "neu.png", { type: "image/png" })); return dt.files; };
    const oeffne = async (id) => { x("ansichtenSchliessen(); akEditor(" + JSON.stringify(db.auslagen.find((z) => z.id === id)) + ")"); await warte(400); return dlg(); };
    dat["auslagen/u_tech_test_at/alt.jpg"] = new Blob(["alt"], { type: "image/jpeg" });
    dat["auslagen/u_tech_test_at/offen.jpg"] = new Blob(["offen"], { type: "image/jpeg" });
    db.auslagen.push({ id: "apB", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Baumarkt abgegeben", kategorie: "material", betrag: 12.5, foto: "u_tech_test_at/alt.jpg", status: "eingereicht", erstellt: new Date().toISOString() },
      { id: "apO", user_id: "u_tech_test_at", name: "Testtechniker", art: "beleg", datum: heute, text: "Baumarkt offen", kategorie: "material", betrag: 3, foto: "u_tech_test_at/offen.jpg", status: "offen", erstellt: new Date().toISOString() });
    x("S.view='stunden'; AK_ALLE.monat=''; render()"); await warte(600);
    /* Speichern scheitert: das alte Foto bleibt (entfernt wird erst nach Erfolg) */
    let d = await oeffne("apB"), inp = d.querySelector("[data-foto]");
    p(!!inp, "Inhaber: beim fremden Beleg kein Knopf, um das Foto zu ersetzen");
    if (inp) {
      inp.files = await bild(); inp.dispatchEvent(new Event("change"));
      window.__netzWeg = "antwort"; speichern(d); await warte(700); window.__netzWeg = false;
      p(db.auslagen.find((z) => z.id === "apB").foto === "u_tech_test_at/alt.jpg" && !!dat["auslagen/u_tech_test_at/alt.jpg"], "Speichern gescheitert, altes Foto trotzdem entfernt");
      d = await oeffne("apB"); inp = d.querySelector("[data-foto]");
      inp.files = await bild(); inp.dispatchEvent(new Event("change"));
      speichern(d); await warte(900);
    }
    const b = db.auslagen.find((z) => z.id === "apB");
    p(/^u_tech_test_at\//.test(b.foto) && b.foto !== "u_tech_test_at/alt.jpg" && !!dat["auslagen/" + b.foto], "neues Foto nicht im Ordner der Person: " + b.foto);
    p(!dat["auslagen/u_tech_test_at/alt.jpg"], "altes Foto nach dem Ersetzen nicht entfernt");
    /* die Person selbst: nach der Abgabe weder ersetzen noch entfernen – vorher schon */
    await window.__rk.anmelden("tech@test.at", "techniker");
    d = await oeffne("apB"); inp = d.querySelector("[data-foto]");
    p((!inp || inp.disabled) && /nur (noch )?der Chef/.test(d.textContent), "Techniker: abgegebenes Belegfoto lässt sich ersetzen bzw. kein Hinweis");
    x("ansichtenSchliessen()");
    const sb = x("Store.sb");
    await sb.storage.from("auslagen").remove([b.foto]);
    p(!!dat["auslagen/" + b.foto], "Techniker hat das Foto eines abgegebenen Belegs entfernt");
    await sb.storage.from("auslagen").remove(["u_tech_test_at/offen.jpg"]);
    p(!dat["auslagen/u_tech_test_at/offen.jpg"], "Techniker kann das Foto eines offenen Belegs nicht entfernen");
    const fremd = await sb.storage.from("auslagen").upload("u_inhaber_test_at/x.jpg", new Blob(["x"], { type: "image/jpeg" }));
    p(!!fremd.error && !dat["auslagen/u_inhaber_test_at/x.jpg"], "Techniker legt ein Foto in einen fremden Ordner");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Kilometergeld nur mit eingetragenem Privatauto – App und Datenbank, Abgeben alter Einträge geht weiter, Inhaber ändert fremde", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, dlg, speichern } = window.__rk;
    const heute = x("isoLokal(new Date())"), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const sb = () => x("Store.sb");
    /* ein alter km-Eintrag ohne Fahrzeug (vor der Regel erfasst) */
    db.auslagen.push({ id: "kmAlt", user_id: "u_tech_test_at", name: "Testtechniker", art: "km", datum: heute, text: "Salzburg – Golling – Salzburg", km: 60, km_satz: 0.5, betrag: 30, status: "offen", erstellt: new Date().toISOString() });
    db.fahrzeuge.push({ id: "fzFirma", kennzeichen: "S-FI 1", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], aktiv: true },
      { id: "fzAndere", kennzeichen: "S-AN 2", fahrer: ["u_admin_test_at"], fahrer_namen: ["Testadmin"], privat_von: "u_admin_test_at", privat_name: "Testadmin", aktiv: true });
    await x("fzLaden(true)");
    x("S.view='stunden'; render()"); await warte(500);
    /* App: ohne eigenes Privatauto kein neuer km-Eintrag, sondern der Hinweis */
    x("akEditor(null, {art:'km'})"); await warte(300);
    let d = dlg();
    p(/Zuerst im Reiter Fahrzeuge dein Privatauto eintragen/.test(d.textContent) && !d.querySelector('[data-f="km"]') && ![...d.querySelectorAll(".as-fuss button")].some((b) => /^Speichern$/.test(b.textContent.trim())),
      "ohne Privatauto: km-Eintrag möglich bzw. kein Hinweis: " + d.textContent.slice(0, 160));
    x("ansichtenSchliessen()");
    /* Datenbank: ohne Fahrzeug, mit Firmenfahrzeug oder fremdem Privatauto abgelehnt */
    for (const [fz, was] of [[null, "ohne Fahrzeug"], ["fzFirma", "Firmenfahrzeug"], ["fzAndere", "Privatauto einer anderen Person"]]) {
      const e = await sb().from("auslagen").insert({ art: "km", datum: heute, text: "Test " + was, km: 10, fahrzeug_id: fz }).select("*");
      p(!!e.error && /Privatauto/.test(e.error.message) && !db.auslagen.some((z) => z.text === "Test " + was), "Datenbank nimmt km-Eintrag " + was + " an: " + JSON.stringify(e.error));
    }
    /* reine Statusänderung (Monat abgeben) an einem alten Eintrag ohne Fahrzeug geht weiter */
    const ab = await sb().from("auslagen").update({ status: "eingereicht" }).eq("id", "kmAlt").select("id");
    p(!ab.error && db.auslagen.find((z) => z.id === "kmAlt").status === "eingereicht", "alter km-Eintrag ohne Fahrzeug lässt sich nicht abgeben: " + JSON.stringify(ab.error));
    /* mit eigenem Privatauto: vorgewählt, gespeichert mit Fahrzeug */
    db.fahrzeuge.push({ id: "fzMeins", kennzeichen: "S-PV 3", fahrer: ["u_tech_test_at"], fahrer_namen: ["Testtechniker"], privat_von: "u_tech_test_at", privat_name: "Testtechniker", aktiv: true });
    await x("fzLaden(true)");
    x("akEditor(null, {art:'km'})"); await warte(300);
    d = dlg();
    p(d.querySelector('[data-f="fahrzeug_id"]').value === "fzMeins", "eigenes Privatauto nicht vorgewählt");
    d.querySelector('[data-f="text"]').value = "Salzburg – Werfen – Salzburg"; d.querySelector('[data-f="km"]').value = "80";
    speichern(d); await warte(600);
    const neu = db.auslagen.find((z) => z.text === "Salzburg – Werfen – Salzburg");
    p(neu && neu.fahrzeug_id === "fzMeins" && neu.betrag === 40, "km-Eintrag mit Privatauto nicht gespeichert: " + JSON.stringify(neu));
    /* Inhaber ändert den fremden Eintrag: mit dem Privatauto der Person ja, mit einem anderen nein */
    await window.__rk.anmelden("inhaber@test.at", "inhaber");
    await x("fzLaden(true)");
    x("akEditor(" + JSON.stringify(neu) + ")"); await warte(300);
    d = dlg(); d.querySelector('[data-f="km"]').value = "90"; speichern(d); await warte(600);
    p(db.auslagen.find((z) => z.id === neu.id).km === 90, "Inhaber kann den fremden km-Eintrag nicht ändern: " + ((dlg() || {}).textContent || "").slice(0, 120));
    const falsch = await sb().from("auslagen").update({ fahrzeug_id: "fzAndere", km: 95 }).eq("id", neu.id).select("id");
    p(!!falsch.error && db.auslagen.find((z) => z.id === neu.id).km === 90, "Inhaber: fremder km-Eintrag mit dem Privatauto einer anderen Person gespeichert");
    x("ansichtenSchliessen(); akEditor(null, {art:'km'})"); await warte(300);
    p(/Zuerst im Reiter Fahrzeuge dein Privatauto eintragen/.test(dlg().textContent) && !!dlg().querySelector(".as-fuss button") && /Mein Privatauto/.test(dlg().querySelector(".as-fuss").textContent),
      "Inhaber ohne eigenes Privatauto: kein Hinweis bzw. kein Knopf „+ Mein Privatauto“");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Privatauto – Techniker legen ihre eigenen (auch mehrere) selbst an, aus dem Kilometergeld-Hinweis; fremde und Firmenfahrzeuge nur das Büro", async () => {
  const a = await rkSeite(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, { warte, dlg, speichern } = window.__rk;
    const fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); }, ich = x("meineKennung()"), sb = () => x("Store.sb");
    db.fahrzeuge.push({ id: "fzAdm", kennzeichen: "S-AD 9", fahrer: ["u_admin_test_at", ich], fahrer_namen: ["Testadmin", "Testtechniker"], privat_von: "u_admin_test_at", privat_name: "Testadmin", aktiv: true });
    await x("fzLaden(true)");
    /* aus dem Kilometergeld-Hinweis: „+ Mein Privatauto“, danach geht es mit dem Kilometer-Dialog weiter */
    x("S.view='stunden'; render(); akEditor(null, {art:'km'})"); await warte(300);
    const kn = [...dlg().querySelectorAll(".as-fuss button")].find((b) => /Mein Privatauto/.test(b.textContent));
    p(!!kn, "Kilometergeld-Hinweis ohne „+ Mein Privatauto“");
    if (kn) {
      kn.click(); await warte(300);
      let d = dlg(); d.querySelector('[data-f="kennzeichen"]').value = "s-pv 11"; d.querySelector('[data-f="bezeichnung"]').value = "Kombi";
      speichern(d); await warte(700);
      const neu = db.fahrzeuge.find((f) => f.kennzeichen === "S-PV 11") || {};
      p(neu.privat_von === ich && (neu.fahrer || []).indexOf(ich) >= 0, "Privatauto nicht als eigenes gespeichert: " + JSON.stringify(neu));
      d = dlg();
      p(d && d.querySelector('[data-f="km"]') && d.querySelector('[data-f="fahrzeug_id"]').value === neu.id, "nach dem Anlegen kein Kilometer-Dialog mit dem neuen Auto");
      x("ansichtenSchliessen()");
    }
    /* ein zweites im Reiter Fahrzeuge – dann muss beim Kilometergeld gewählt werden */
    x("S.view='fahrzeuge'; render()"); await warte(500);
    const kf = [...document.querySelectorAll("button")].find((b) => /Mein Privatauto/.test(b.textContent));
    p(!!kf, "Reiter Fahrzeuge ohne „+ Mein Privatauto“");
    if (kf) { kf.click(); await warte(300); const d = dlg(); d.querySelector('[data-f="kennzeichen"]').value = "S-PV 12"; speichern(d); await warte(700); }
    x("ansichtenSchliessen(); akEditor(null, {art:'km'})"); await warte(300);
    let d = dlg(), sel = d.querySelector('[data-f="fahrzeug_id"]');
    p(sel && sel.options.length === 3 && sel.value === "", "zwei Privatautos: keine Auswahl bzw. eines still vorgewählt: " + (sel ? sel.options.length + "/" + sel.value : "-"));
    d.querySelector('[data-f="text"]').value = "Salzburg – Lofer – Salzburg"; d.querySelector('[data-f="km"]').value = "90";
    speichern(d); await warte(400);
    p(/Privatauto wählen/.test(d.querySelector("[data-err]").textContent) && !db.auslagen.some((z) => /Lofer/.test(z.text)), "ohne Auswahl gespeichert");
    const zweit = db.fahrzeuge.find((f) => f.kennzeichen === "S-PV 12") || {};
    sel.value = zweit.id; speichern(d); await warte(600);
    p((db.auslagen.find((z) => /Lofer/.test(z.text)) || {}).fahrzeug_id === zweit.id, "Kilometergeld mit dem gewählten Privatauto nicht gespeichert");
    /* eigenes Privatauto bearbeiten: Kennzeichen ja, Fristen nein */
    await sb().from("fahrzeuge").update({ bezeichnung: "Kombi neu", pickerl_bis: "2027-01-01", tracker_id: "x" }).eq("id", zweit.id).select("id");
    const z2 = db.fahrzeuge.find((f) => f.id === zweit.id);
    p(z2.bezeichnung === "Kombi neu" && !z2.pickerl_bis && !z2.tracker_id, "Techniker ändert Fristen/GPS am Privatauto: " + JSON.stringify(z2));
    /* Datenbank: Firmenfahrzeug, fremdes Privatauto, fremdes Fahrzeug ändern, privat_von umhängen – alles nein */
    const e1 = await sb().from("fahrzeuge").insert({ kennzeichen: "S-FI 77", fahrer: [ich] }).select("id");
    const e2 = await sb().from("fahrzeuge").insert({ kennzeichen: "S-FR 78", privat_von: "u_admin_test_at", fahrer: [ich] }).select("id");
    await sb().from("fahrzeuge").update({ kennzeichen: "S-XX 1" }).eq("id", "fzAdm").select("id");
    await sb().from("fahrzeuge").update({ privat_von: "u_admin_test_at" }).eq("id", zweit.id).select("id");
    p(!!e1.error && !!e2.error && !db.fahrzeuge.some((f) => /S-FI 77|S-FR 78/.test(f.kennzeichen)), "Techniker legt Firmen- bzw. fremdes Privatauto an");
    p(db.fahrzeuge.find((f) => f.id === "fzAdm").kennzeichen === "S-AD 9" && db.fahrzeuge.find((f) => f.id === zweit.id).privat_von === ich, "Techniker ändert fremdes Fahrzeug bzw. hängt sein Privatauto um");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Posteingang – Projektmails nur der Inhaber, Lidl-Aufträge und Rapporte auch Admins, Techniker gar nicht", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    window.UKT_CONFIG.posteingangAktiv = true;
    const pe = (id, art, name) => ({ id, nachricht_id: "<" + id + "@test>", art, dateiname: name, pfad: "2026/10/" + id + "_" + name.replace(/\W+/g, "_"), status: "neu", betreff: "Betreff " + id, absender: "a@test-firma.at", eingang: jetzt, bytes: 300 });
    const zeilen = [pe("ppA", "auftrag", "Auftrag 4711.pdf"), pe("ppR", "rapport", "4711_rapport.pdf"), pe("ppM", "mail", "Anfrage Hotel.eml"), pe("ppU", "unbekannt", "Plan Hotel.pdf")];
    for (const z of zeilen) { await x("Store.sb").storage.from("posteingang").upload(z.pfad, new Blob(["%PDF-1.4 " + z.id], { type: "application/pdf" })); db.posteingang.push(z); }
    const sicht = async () => {
      const sb = x("Store.sb"), l = ((await sb.from("posteingang").select("*")).data || []).map((e) => e.id).sort().join();
      const dat = []; for (const z of zeilen) { const u = await sb.storage.from("posteingang").createSignedUrl(z.pfad, 600); if (u.data) dat.push(z.id); }
      x("S.view='faellig'; render()"); await tm.warte(700);
      const k = [...document.querySelectorAll(".card")].find((c) => /^Posteingang/.test((c.querySelector("h2") || {}).textContent || ""));
      return { l, dat: dat.sort().join(), karte: k ? k.textContent : null, push: x("pushArtenGewaehlt().indexOf('posteingang')>=0") };
    };
    const inh = await sicht();
    p(inh.l === "ppA,ppM,ppR,ppU" && inh.dat === "ppA,ppM,ppR,ppU" && /Anfrage Hotel/.test(inh.karte || "") && /Auftrag 4711/.test(inh.karte || "") && inh.push, "Inhaber sieht nicht alles: " + JSON.stringify(inh));
    await tm.anmelden("admin@test.at", "admin");
    const adm = await sicht();
    p(adm.l === "ppA,ppR" && adm.dat === "ppA,ppR", "Admin liest Projektmails (Tabelle bzw. Dateien): " + JSON.stringify({ l: adm.l, dat: adm.dat }));
    p(adm.karte && /Auftrag 4711/.test(adm.karte) && /4711_rapport/.test(adm.karte) && !/Anfrage Hotel|Plan Hotel|weitergeleitete Mails/.test(adm.karte) && adm.push,
      "Admin: Karte zeigt nicht genau Aufträge und Rapporte: " + (adm.karte || "(keine Karte)").slice(0, 300));
    await tm.anmelden("tech@test.at", "techniker");
    const tec = await sicht();
    p(!tec.l && !tec.dat && tec.karte === null && !tec.push && !x("posteingangAn()"), "Techniker sieht den Posteingang: " + JSON.stringify(tec));
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Mail mit Preisen im Text – die .eml liegt nur beim Inhaber (Büro-Ordner) mit Hinweis, andere legen sie nicht ab", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    /* Erkennung: ein Betrag mit € bzw. EUR (auch „Euro“ hinter der Zahl) */
    const faelle = { "Pauschal 4.800 € netto": true, "EUR 1.234,50 zzgl. USt": true, "Summe 1234,50 EUR": true, "€ 980,-": true, "Kosten: 350 Euro": true, "4800€": true,
      "Abgasnorm Euro 6": false, "netto 1.000,00": false, "Filiale 4711, Auftrag 123456": false, "": false };
    const falsch = Object.keys(faelle).filter((t) => x("mailTextMitPreis(" + JSON.stringify(t) + ")") !== faelle[t]);
    p(!falsch.length, "Preis-Erkennung falsch bei: " + JSON.stringify(falsch));
    /* Text der .eml: base64, quoted-printable, HTML – Anhänge zählen nicht */
    const b64 = btoa(unescape(encodeURIComponent("Guten Tag,\r\nunser Angebot: 4.800 € netto.\r\n")));
    const emlB64 = "From: a@planer-test.at\r\nSubject: Angebot Hotel\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"xx\"\r\n\r\n--xx\r\nContent-Type: text/plain; charset=utf-8\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" + b64 + "\r\n--xx\r\nContent-Type: application/pdf; name=\"Plan.pdf\"\r\nContent-Disposition: attachment; filename=\"Plan.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--xx--\r\n";
    const emlQp = "From: a@planer-test.at\r\nSubject: Wartung\r\nContent-Type: text/html; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Preis: EUR&nbsp;1.234,=\r\n50 f=FCr die Wartung</p>\r\n";
    const emlAnhang = "From: a@planer-test.at\r\nSubject: Plan\r\nContent-Type: multipart/mixed; boundary=\"yy\"\r\n\r\n--yy\r\nContent-Type: text/plain\r\n\r\nAnbei der Plan.\r\n--yy\r\nContent-Type: text/plain; name=\"Liste.txt\"\r\nContent-Disposition: attachment; filename=\"Liste.txt\"\r\n\r\nSumme 500 EUR\r\n--yy--\r\n";
    const emlOhne = "From: a@planer-test.at\r\nSubject: Termin\r\n\r\nBitte um Termin am 12.10. in Filiale 4711.\r\n";
    const liest = [emlB64, emlQp, emlAnhang, emlOhne].map((t) => x("mailTextMitPreis(emlText(" + JSON.stringify(t) + "))"));
    p(JSON.stringify(liest) === "[true,true,false,false]", "Text der .eml falsch gelesen (base64, quoted-printable/HTML, nur im Anhang, ohne): " + JSON.stringify(liest));
    const eml = (t) => new Blob([t], { type: "message/rfc822" });
    db.projekte.push({ id: "tmp_p4", nummer: "P-2026-904", titel: "Preise Hotel", kunde_id: "lidl", status: "anfrage", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()");
    const dateien = () => (db.projekte.find((q) => q.id === "tmp_p4").daten.dateien || []).map((f) => f.art + "|" + f.pfad + "|" + f.name);
    tm.verbinden(); tm.toastSpion();
    /* 1. Mail-Programm „Mail zu Projekt legen“: Preis im Text → .eml unter buero/, Hinweis im Dialog und in der Meldung */
    const MZ = (uid, text) => ({ konto: "gmx", ordner: "INBOX", uid, messageId: "<pp" + uid + "@test>", datum: "2026-10-01T08:00:00.000Z", betreff: "Mail " + uid, von: [{ name: "Planer", address: "a@planer-test.at" }], an: [], text, anhaenge: [] });
    for (const [uid, text, roh] of [[71, "Unser Angebot: 4.800 € netto", emlB64], [72, "Bitte um Termin", emlOhne]]) {
      tm.programm({ mail: MZ(uid, text), roh: () => eml(roh) }); window.__toasts = [];
      x("ansichtenSchliessen()"); x("mailUebernehmen({k:'gmx', o:'INBOX', u:" + uid + ", a:'zuprojekt', p:'tmp_p4'})");
      await tm.bis(() => tm.fuss(/Ins Projekt legen/));
      const hinweis = /enthält Preise/.test(tm.dlg().textContent);
      p(uid === 71 ? hinweis : !hinweis, "Mail zu Projekt " + uid + ": Hinweis „enthält Preise“ " + (hinweis ? "ohne Preis" : "fehlt"));
      tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/);
      if (uid === 71) p(window.__toasts.some((t) => /enthält Preise – nur für den Inhaber abgelegt/.test(t)), "Mail zu Projekt: Meldung ohne Hinweis auf die Preise: " + JSON.stringify(window.__toasts));
    }
    let d1 = dateien();
    p(d1.some((f) => /^mail\|buero\/.*Mail 71\.eml$/.test(f)) && d1.some((f) => /^mail\|tmp_p4\/.*Mail 72\.eml$/.test(f)), "Mail zu Projekt: .eml mit Preisen nicht (nur) im Büro-Ordner: " + JSON.stringify(d1));
    const eintrag = (db.projekte.find((q) => q.id === "tmp_p4").daten.dateien || []).find((f) => /Mail 71/.test(f.name)) || {};
    x("ansichtenSchliessen(); projektAnsicht('tmp_p4')"); await tm.bis(() => tm.dlg() && /Mail 71/.test(tm.dlg().textContent));
    const zeile = [...tm.dlg().querySelectorAll("[data-liste] div")].find((z) => /Mail 71/.test(z.textContent));
    p(eintrag.preise && zeile && /enthält Preise/.test(zeile.textContent), "Projektdateien: kein sichtbarer Hinweis bei der Mail mit Preisen: " + (zeile ? zeile.textContent : "(keine Zeile)"));
    x("ansichtenSchliessen()");
    /* 2. Posteingang (Inhaber): Preis im HTML-Teil – Hinweis schon im Dialog, .eml unter buero/, der Plan ins Projekt */
    window.UKT_CONFIG.posteingangAktiv = true;
    const sb = x("Store.sb"), pe = (id, art, name, pfad) => ({ id, nachricht_id: "<pp9@test>", art, dateiname: name, pfad, status: "neu", betreff: "Fwd: P-2026-904 Wartung", absender: "a@planer-test.at", eingang: jetzt, bytes: 300 });
    await sb.storage.from("posteingang").upload("2026/10/pp9_mail.eml", new Blob([emlQp]));
    await sb.storage.from("posteingang").upload("2026/10/pp9_plan.pdf", new Blob(["%PDF-1.4 Plan"], { type: "application/pdf" }));
    db.posteingang.push(pe("pp9a", "mail", "Fwd P-2026-904 Wartung.eml", "2026/10/pp9_mail.eml"), pe("pp9b", "unbekannt", "Plan Keller.pdf", "2026/10/pp9_plan.pdf"));
    const k = x("posteingangKarte()"); document.body.appendChild(k); await tm.bis(() => k.querySelector(".posbox"));
    tm.knopf(k, /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    await tm.bis(() => /enthält Preise/.test(tm.dlg().textContent), 2000);
    p(/enthält Preise – nur für den Inhaber abgelegt/.test(tm.dlg().textContent), "Posteingang: Dialog ohne Hinweis auf die Preise");
    tm.dlg().querySelector("[data-p]").value = "tmp_p4"; window.__toasts = [];
    tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/);
    d1 = dateien();
    p(d1.some((f) => /^mail\|buero\/.*Fwd P-2026-904 Wartung\.eml$/.test(f)) && d1.some((f) => /^plan\|tmp_p4\/.*Plan Keller\.pdf$/.test(f)), "Posteingang: .eml mit Preisen nicht im Büro-Ordner bzw. Plan fehlt: " + JSON.stringify(d1));
    k.remove(); x("ansichtenSchliessen()");
    /* 3. Mailverlauf: die Mail mit Preisen liegt nur beim Inhaber */
    const MV = { konto: "gmx", ordner: "INBOX", uid: 73, messageId: "<pp73@test>", datum: "2026-09-20T08:00:00.000Z", betreff: "Angebot Kälte", von: [{ name: "Planer", address: "a@planer-test.at" }], an: [], anhaenge: [] };
    tm.programm({ mails: [MV], vorschlag: { titel: "Preise Verlauf", kunde: "Lidl", kundeTreffer: "Lidl", status: "angebot", angaben: [], beteiligte: [], termine: [], tagebuch: [], dateien: [] }, roh: () => eml(emlB64) });
    await tm.verlauf({ suche: "Kälte" }); window.__toasts = [];
    tm.fuss(/Projekt anlegen/).click(); await tm.toastBis(/angelegt:|^Nicht fertig/);
    const pv = db.projekte.find((q) => q.titel === "Preise Verlauf"), dv = ((pv && pv.daten.dateien) || []).map((f) => f.art + "|" + f.pfad);
    p(dv.length === 1 && /^mail\|buero\//.test(dv[0]) && window.__toasts.some((t) => /enthält Preise/.test(t)), "Mailverlauf: .eml mit Preisen nicht im Büro-Ordner bzw. ohne Hinweis: " + JSON.stringify({ dv, t: window.__toasts }));
    tm.ende();
    /* 4. Techniker: eine .eml mit Preisen wird nicht abgelegt (Hinweis), eine ohne Preise schon */
    await tm.anmelden("tech@test.at", "techniker"); tm.toastSpion(); await x("projekteLaden()");
    window.__datei = [new File([emlB64], "Angebot Hotel.eml", { type: "message/rfc822" }), new File([emlOhne + "Zweite Mail.\r\n"], "Termin.eml", { type: "message/rfc822" })];
    const neu = await x("projektDateienHochladen(PROJEKTE.filter(function(q){ return q.id==='tmp_p4'; })[0], 'mail', window.__datei)");
    d1 = dateien();
    p(!d1.some((f) => /Angebot Hotel/.test(f)) && d1.some((f) => /^mail\|tmp_p4\/.*Termin\.eml$/.test(f)) && (neu || []).length === 1, "Techniker: .eml mit Preisen abgelegt bzw. die ohne nicht: " + JSON.stringify(d1));
    p(window.__toasts.some((t) => /Angebot Hotel\.eml.*enthält Preise.*nur der Inhaber/.test(t)), "Techniker: kein Hinweis, warum die Mail nicht abgelegt wurde: " + JSON.stringify(window.__toasts));
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Preis-Erkennung – Beträge in Signatur und Impressum zählen nicht, eine zitierte Mail darunter schon", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(() => {
    const x = window.__t.x;
    const faelle = [
      ["Mit freundlichen Grüßen\nMuster GmbH\nStammkapital EUR 35.000\nFN 123456a, Firmenbuchgericht Salzburg", false],
      ["Danke!\nTest GmbH · Gesellschaftskapital: 70.000 € · UID ATU12345678", false],
      ["Bitte um Termin.\n-- \nTest GmbH\nAktion: Klimacheck ab 99 € im Shop", false],
      ["Unser Angebot: 4.800 € netto\n-- \nTest GmbH\nStammkapital EUR 35.000", true],
      ["Passt so.\n-- \nTest GmbH\n\n> Von: planer@test.example\n> Preis: 1.200 € netto", true],
    ];
    const falsch = faelle.filter((f) => x("mailTextMitPreis(" + JSON.stringify(f[0]) + ")") !== f[1]).map((f) => f[0].slice(0, 40));
    /* auch im HTML-Teil einer .eml: Zeilenumbrüche (<br>) bleiben Zeilen */
    const eml = "From: a@test.example\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Termin passt.</p><p>Test GmbH<br>Stammkapital EUR 35.000<br>FN 123456a</p>\r\n";
    return { falsch, html: x("mailTextMitPreis(emlText(" + JSON.stringify(eml) + "))") };
  });
  pruefe(!r.falsch.length && r.html === false, "Signatur zählt als Preis: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: KPlus-Beleg neu eingelesen – Rechnung und Angebot „versendet“, vorhandene Belege bleiben, wie sie sind", async () => {
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    const erg = (art, nr) => ({ art, nummer: nr, datum: "2026-09-30", kopf: {}, positionen: [{ typ: "pos", nr: "1", menge: 1, eh: "Stk", text: "Testposition", preis: 100 }], summenPdf: { netto: 100 } });
    db.projekte.push({ id: "tmp_p5", nummer: "P-2026-905", titel: "KPlus Stand", kunde_id: "lidl", status: "angebot", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    db.belege.push({ id: "bAlt", art: "rechnung", nummer: "413981", status: "bezahlt", bezahlt: "2026-09-15", projekt_id: "tmp_p5", kunde_id: "lidl", test: false, extern: true, datum: "2026-09-01", kopf: {}, positionen: [], summen: {} });
    await x("projekteLaden()"); tm.toastSpion();
    const ablegen = async (e) => {
      x("ansichtenSchliessen(); kplusVorschau(PROJEKTE.filter(function(q){ return q.id==='tmp_p5'; })[0], " + JSON.stringify(e) + ", function(){})");
      await tm.bis(() => tm.fuss(/Am Projekt ablegen/)); window.__toasts = [];
      tm.fuss(/Am Projekt ablegen/).click(); await tm.toastBis(/abgelegt/);
    };
    await ablegen(erg("angebot", "413980")); await ablegen(erg("rechnung", "413982")); await ablegen(erg("rechnung", "413981"));
    const st = (nr) => (db.belege.find((b) => b.nummer === nr) || {}).status;
    p(st("413980") === "versendet", "KPlus-Vorschau: neues Angebot steht auf „" + st("413980") + "“ statt „versendet“");
    p(st("413982") === "versendet", "KPlus-Vorschau: neue Rechnung steht auf „" + st("413982") + "“");
    p(st("413981") === "bezahlt", "KPlus-Vorschau: vorhandene bezahlte Rechnung wurde „" + st("413981") + "“");
    /* Mailverlauf: neues KPlus-Angebot ebenso „versendet“ */
    tm.verbinden();
    x("kplusLesen=function(d){ var t=new TextDecoder().decode(d), nr=(/4139\\d\\d/.exec(t)||[''])[0]; if(!nr) return Promise.reject(new Error('kein KPlus')); return Promise.resolve({art:'angebot', nummer:nr, datum:'2026-09-20', kopf:{}, positionen:[{typ:'pos', nr:'1', menge:1, eh:'Stk', text:'Testposition', preis:1000}], summenPdf:{netto:1000}}); }");
    const MV = { konto: "gmx", ordner: "INBOX", uid: 83, messageId: "<kp83@test>", datum: "2026-09-20T08:00:00.000Z", betreff: "Angebot 413983", von: [{ name: "Büro", address: "buero@test-firma.at" }], an: [],
      anhaenge: [{ i: 0, name: "413983.pdf", typ: "application/pdf", groesse: 4096 }] };
    tm.programm({ mails: [MV], vorschlag: { titel: "KPlus Verlauf", kunde: "Lidl", kundeTreffer: "Lidl", status: "angebot", angaben: [], beteiligte: [], termine: [], tagebuch: [], dateien: [] },
      anhang: () => new Blob(["%PDF-1.4 KPlus 413983"], { type: "application/pdf" }) });
    await tm.verlauf({ suche: "413983" }); window.__toasts = [];
    tm.fuss(/Projekt anlegen/).click(); await tm.toastBis(/angelegt:|^Nicht fertig/);
    p(st("413983") === "versendet", "Mailverlauf: neues KPlus-Angebot steht auf „" + st("413983") + "“ statt „versendet“");
    tm.ende();
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Antworten post: Synology-Posteingang – ein zu großer Anhang steht als Hinweis da (ohne Datei), die Mail lässt sich trotzdem ablegen", async () => {
  /* das Skript selbst (zu große Anhänge, Lidl am Dateinamen und Absender, Konto ohne Leserecht) prüft tools/posteingang_test.py */
  const a = await tmSeite(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, tm = window.__tm, jetzt = new Date().toISOString(), fehlt = [], p = (bed, text) => { if (!bed) fehlt.push(text); };
    window.UKT_CONFIG.posteingangAktiv = true; tm.toastSpion();
    const sb = x("Store.sb");
    db.projekte.push({ id: "tmp_p6", nummer: "P-2026-906", titel: "Große Pläne", kunde_id: "lidl", status: "anfrage", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()");
    await sb.storage.from("posteingang").upload("2026/10/gr1_mail.eml", new Blob(["From: a@planer-test.at\r\nSubject: P-2026-906 Pläne\r\n\r\nAnbei die Pläne."]));
    const zeile = (id, art, name, pfad, notiz) => ({ id, nachricht_id: "<gr1@test>", art, dateiname: name, pfad, status: "neu", betreff: "Fwd: P-2026-906 Pläne", absender: "a@planer-test.at", eingang: jetzt, bytes: null, notiz: notiz || null });
    db.posteingang.push(zeile("gr1a", "mail", "Fwd P-2026-906 Pläne.eml", "2026/10/gr1_mail.eml"),
      zeile("gr1b", "unbekannt", "Plan riesig.pdf", "", "Anhang zu groß (25,3 MB) – bitte von Hand aus dem Postfach holen"));
    const k = x("posteingangKarte()"); document.body.appendChild(k); await tm.bis(() => k.querySelectorAll(".posbox").length >= 2);
    const boxen = [...k.querySelectorAll(".posbox")], hinweis = boxen.find((b) => /Plan riesig/.test(b.textContent) && /zu groß/.test(b.textContent)), mailBox = boxen.find((b) => /✉/.test(b.textContent));
    p(!!hinweis && /25,3 MB/.test(hinweis.textContent) && !/ansehen|Rapport zuordnen|Störungsauftrag/.test(hinweis.textContent), "zu großer Anhang: kein eigener Hinweis bzw. Knöpfe für eine Datei, die es nicht gibt: " + (hinweis ? hinweis.textContent : "(keiner)"));
    p(mailBox && !/Plan riesig/.test(mailBox.textContent), "die Mail-Karte führt den nicht abgeholten Anhang als Datei: " + (mailBox ? mailBox.textContent : "(keine)"));
    /* die Mail ins Projekt – der Hinweis bleibt stehen, bis er erledigt ist */
    tm.knopf(mailBox, /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    tm.dlg().querySelector("[data-p]").value = "tmp_p6"; window.__toasts = [];
    tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/);
    const st = (id) => db.posteingang.find((e) => e.id === id).status;
    p(st("gr1a") === "erledigt" && st("gr1b") === "neu" && window.__toasts.some((t) => /abgelegt: 1 Datei/.test(t)), "Ablegen mit Hinweis-Zeile: " + JSON.stringify({ a: st("gr1a"), b: st("gr1b"), t: window.__toasts }));
    const erl = hinweis && tm.knopf(hinweis, /erledigt/);
    if (erl) { erl.click(); await tm.bis(() => st("gr1b") !== "neu", 2000); }
    p(erl && st("gr1b") === "erledigt" && !k.contains(hinweis), "Hinweis lässt sich nicht als erledigt abhaken: " + st("gr1b"));
    k.remove(); x("ansichtenSchliessen()");
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

/* ---------------- Antworten des Inhabers 05.10.2026 zu Angeboten und Rechnungen ---------------- */
const AR_HILFEN = `window.__ar = {
  warte: (ms) => new Promise((f) => setTimeout(f, ms)),
  bis: async (f, max = 3000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = f(); } catch (e) {} if (v || Date.now() - t0 > max) return v; await window.__ar.warte(20); } },
  dlgs: () => [...document.querySelectorAll(".assistent")],
  knopf: (d, re) => [...(d || document).querySelectorAll("button")].filter((b) => re.test(b.textContent.trim()))[0] || null,
}; 1`;
test("Antworten rechnung: Nummer erst beim Speichern – Abbrechen verbraucht keine, Doppeltipp öffnet einen Editor, nie dieselbe Nummer", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await a.seite.evaluate((h) => eval(h), AR_HILFEN);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, A = window.__ar, jahr = new Date().getFullYear();
    x("S.view='belege'; render(); 1"); await A.warte(300);
    const plus = document.querySelector('[data-a="frei"]');
    plus.click(); plus.click();                                   /* Doppeltipp auf „+ Rechnung“ */
    await A.bis(() => A.dlgs().length && A.dlgs()[0].querySelector("[data-plus]")); await A.warte(400);
    const editoren = A.dlgs().length, d0 = A.dlgs()[0];
    const kopf = d0.querySelector(".as-titel").textContent + " | " + d0.querySelector(".as-schritt").textContent;
    A.knopf(d0, /^Abbrechen$/).click(); x("ansichtenSchliessen()");
    const speichern = async () => {
      x("belegNeu({projekt:null, protokoll:null, kunde_id:'lidl', standort_id:null}, 'rechnung', null, function(){})");
      const d = await A.bis(() => { const d = A.dlgs().pop(); return d && d.querySelector("[data-plus]") && d; });
      const n0 = db.belege.length; A.knopf(d, /^Speichern$/).click();
      await A.bis(() => db.belege.length > n0); await A.warte(100); x("ansichtenSchliessen()");
      return db.belege.length > n0 ? db.belege[db.belege.length - 1].nummer : null;
    };
    const n1 = await speichern();
    /* die nächste Nummer ist schon vergeben (anderes Gerät, Nummernkreis ohne Zähler der Datenbank): nie doppelt speichern */
    db.belege.push({ id: "ar_fremd", art: "rechnung", nummer: "T-R-" + jahr + "-002", test: true, extern: false, datum: "2026-06-01", status: "entwurf", kopf: {}, positionen: [], summen: {} });
    const n2 = await speichern();
    const nummern = db.belege.filter((b) => b.art === "rechnung").map((b) => b.nummer);
    return { editoren, kopf, n1, n2, jahr, doppelt: nummern.length !== new Set(nummern).size };
  });
  pruefe(r.editoren === 1, "Doppeltipp auf „+ Rechnung“ öffnet " + r.editoren + " Editoren");
  pruefe(/Nummer wird beim Speichern vergeben/.test(r.kopf) && !/T-R-/.test(r.kopf), "Editor zeigt vor dem Speichern schon eine Nummer: " + r.kopf);
  pruefe(r.n1 === "T-R-" + r.jahr + "-001", "Abbrechen hat eine Nummer verbraucht – erste gespeicherte: " + r.n1);
  pruefe(r.n2 === "T-R-" + r.jahr + "-003" && !r.doppelt, "Vergebene Nummer nicht übersprungen: " + r.n2 + (r.doppelt ? " (doppelt)" : ""));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});
test("Antworten rechnung: Vorschlag zum Einsatz – Wartungspreis je JW/HJW/HJI, Reparatur und Prüfung nach Aufwand, Kältemittel ohne Sorte ohne Preis", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await a.seite.evaluate((h) => eval(h), AR_HILFEN);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, A = window.__ar;
    const kat = (id, text, eh, preis) => ({ id, text, eh, preis, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    db.katalog.push(kat("arw0", "Wartung allgemein (Test)", "Stk", 99), kat("arw1", "Jahreswartung Klimaanlage (Test)", "Stk", 210),
      kat("arw2", "Halbjahreswartung Klimaanlage (Test)", "Stk", 150), kat("arw3", "Jahreswartung Techniker (Test)", "Std", 70));
    await x("katalogLaden()");
    const pk = (o) => Object.assign({ _id: "ar_" + Math.random(), standortId: "TS1", datum: "2026-06-01", wartungsart: "planmäßig", techniker: "Testtechniker", anlagen: [] }, o);
    const zeilen = (p) => x("einsatzPositionen")(p, "lidl").map((q) => ({ typ: q.typ, text: q.text, preis: q.preis, menge: q.menge, eh: q.eh, hinweis: q.hinweis || "" }));
    const wartung = pk({ anlagen: [{ name: "Anlage A", termin: "Jahreswartung" }, { name: "Anlage B", termin: "Halbjahreswartung" },
      { name: "Anlage C", termin: "Halbjahresinspektion" }, { name: "Anlage D", termin: "" }] });
    const w = zeilen(wartung);
    /* der Hinweis steht im Editor bei der Position */
    x("belegNeu")(x("kontextProtokoll")(wartung), "rechnung", null, function () {});
    const d = await A.bis(() => { const d = A.dlgs().pop(); return d && d.querySelector(".bpos") && d; });
    const editor = d ? d.textContent : ""; x("ansichtenSchliessen()");
    /* Reparatur (Stunden laut Lidl-Rapport) und Prüfung (ohne Zeiten): nach Aufwand wie eine Störung, keine Wartung je Anlage */
    const anlA = [{ name: "Anlage A", termin: "Jahreswartung" }];
    const reparatur = pk({ wartungsart: "Reparatur", anlagen: anlA, bemerkungen: "Verdichter getauscht", rapport: { daten: { stunden: "3:30" } } });
    const rep = zeilen(reparatur), pruef = zeilen(pk({ wartungsart: "Prüfung", anlagen: anlA }));
    x("belegNeu")(x("kontextProtokoll")(reparatur), "rechnung", null, function () {});
    const d2 = await A.bis(() => { const d = A.dlgs().pop(); return d && d.querySelector(".bpos") && d; });
    const betreff = d2 ? d2.querySelector('[data-k="betreff"]').value : ""; x("ansichtenSchliessen()");
    /* Kältemittel nachgefüllt: ohne Sorte nie irgendeine Sorte samt Preis, mit Sorte wie bisher */
    db.katalog.push(kat("arkm", "Kältemittel R410A (Test)", "kg", 60)); await x("katalogLaden()");
    const km = (o) => zeilen(o).filter((p) => /lte?mittel/i.test(p.text))[0] || {};
    const kmOhne = km(pk({ kaeltemittel: { art: null, nach: 2.5 } })), kmMit = km(pk({ kaeltemittel: { art: "R410A", nach: 2.5 } }));
    const kmStoer = km(pk({ wartungsart: "Störung", stoerung: { kmArt: "", kmNach: "1,5" } }));
    return { w, editor, rep, pruef, betreff, kmOhne, kmMit, kmStoer };
  });
  const anl = (n) => r.w.filter((p) => new RegExp("Anlage " + n).test(p.text))[0] || {};
  pruefe(anl("A").preis === 210 && /Jahreswartung Klimaanlage/.test(anl("A").text), "JW nicht zum JW-Preis: " + JSON.stringify(anl("A")));
  pruefe(anl("B").preis === 150 && /Halbjahreswartung Klimaanlage/.test(anl("B").text), "HJW nicht zum HJW-Preis: " + JSON.stringify(anl("B")));
  pruefe(!anl("C").preis && /Preis für HJI fehlt – alte KPlus-Rechnung mit dieser Position hochladen/.test(anl("C").hinweis), "HJI ohne Katalogposition: " + JSON.stringify(anl("C")));
  pruefe(!anl("D").preis && anl("D").hinweis, "Anlage ohne bekannte Termin-Art bekam einen Preis: " + JSON.stringify(anl("D")));
  pruefe(/Preis für HJI fehlt/.test(r.editor), "Hinweis „Preis für HJI fehlt“ im Editor nicht sichtbar");
  const kurz = (l) => JSON.stringify(l.map((p) => p.typ + ":" + String(p.text).split("\n")[0] + "|" + p.menge + "|" + p.preis + (p.hinweis ? "|⚠" : "")));
  for (const [art, l] of [["Reparatur", r.rep], ["Prüfung", r.pruef]]) {
    pruefe(!l.some((p) => p.typ === "pos" && /^Wartung/.test(p.text)), art + ": Wartung je Anlage vorgeschlagen: " + kurz(l));
    pruefe(l.some((p) => p.typ === "pos" && /Fahrtpauschale/.test(p.text)) && l.some((p) => p.typ === "text" && new RegExp("^" + art).test(p.text)), art + ": Textzeile oder Fahrtpauschale fehlt: " + kurz(l));
  }
  const regie = r.rep.filter((p) => /Regiestunde/.test(p.text))[0] || {};
  pruefe(regie.menge === 3.5 && regie.preis === 70 && regie.eh === "Std", "Reparatur: Regiestunden laut Rapport × Stundensatz fehlen: " + kurz(r.rep));
  const regieP = r.pruef.filter((p) => /Regiestunde/.test(p.text))[0] || {};
  pruefe(regieP.hinweis && !regieP.menge, "Prüfung ohne Zeiten: Regiestunden ohne Hinweis bzw. mit Menge: " + kurz(r.pruef));
  pruefe(/Reparatur/.test(r.betreff) && !/Wartung/.test(r.betreff), "Betreff der Reparatur-Rechnung: " + r.betreff);
  for (const [was, k, menge] of [["Wartung", r.kmOhne, 2.5], ["Störung", r.kmStoer, 1.5]])
    pruefe(/^Kältemittel – Sorte fehlt/.test(k.text || "") && !k.preis && k.hinweis && k.menge === menge, was + ": Kältemittel ohne Sorte: " + JSON.stringify(k));
  pruefe(r.kmMit.preis === 60 && /R410A/.test(r.kmMit.text) && !r.kmMit.hinweis, "Kältemittel mit Sorte nicht wie bisher: " + JSON.stringify(r.kmMit));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});
test("Antworten rechnung: Wartungspreis je Art und Anlagentyp – nie der Preis eines anderen Typs", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen;
    const kat = (id, text, preis) => ({ id, text, eh: "Stk", preis, kunde_id: "lidl", aktiv: true, quelle: "Test" });
    db.katalog.push(kat("at1", "Jahreswartung Split (Test)", 180), kat("at2", "Jahreswartung VRV (Test)", 300), kat("at3", "Jahreswartung allgemein (Test)", 99),
      kat("at4", "Halbjahreswartung (Test)", 150), kat("at5", "HJI Split (Test)", 80));
    await x("katalogLaden()");
    const anl = [["A", "Jahreswartung", { bauart: "Split" }], ["B", "Jahreswartung", { name: "Anlage B VRV Verkaufsraum" }], ["C", "Jahreswartung", { bauart: "Multi-Split" }],
      ["D", "Jahreswartung", {}], ["E", "Halbjahreswartung", { bauart: "Split" }], ["F", "Halbjahresinspektion", { bauart: "VRV luftgekühlt" }]]
      .map(([n, t, o]) => Object.assign({ name: "Anlage " + n, termin: t }, o));
    return x("einsatzPositionen")({ _id: "at", standortId: "TS1", datum: "2026-06-01", wartungsart: "planmäßig", anlagen: anl }, "lidl")
      .filter((p) => /^Wartung/.test(p.text)).map((p) => ({ n: (/Anlage (\w)/.exec(p.text) || [])[1], preis: p.preis, hinweis: p.hinweis || "" }));
  });
  const z = (n) => r.filter((p) => p.n === n)[0] || {};
  pruefe(z("A").preis === 180 && z("B").preis === 300, "Art+Typ nicht gefunden: " + JSON.stringify([z("A"), z("B")]));
  pruefe(!z("C").preis && /Preis für JW Multi-Split fehlt/.test(z("C").hinweis), "Multi-Split bekam einen fremden Preis: " + JSON.stringify(z("C")));
  pruefe(!z("D").preis && z("D").hinweis, "Anlage ohne Typ bekam trotz typ-eigener Positionen einen Preis: " + JSON.stringify(z("D")));
  pruefe(z("E").preis === 150, "HJW ohne typ-eigene Position nicht zum allgemeinen Preis: " + JSON.stringify(z("E")));
  pruefe(!z("F").preis && /Preis für HJI VRV fehlt/.test(z("F").hinweis), "VRV bekam den HJI-Preis von Split: " + JSON.stringify(z("F")));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});
test("Antworten rechnung: KPlus-Rechnung umgehängt – der vorige Einsatz ist wieder „noch nicht abgerechnet“; die App lernt Streichen nach 3 Rechnungen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  await a.seite.evaluate((h) => eval(h), AR_HILFEN);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, A = window.__ar;
    const st = (id, d, o) => Object.assign({ id, client_id: id, standort_id: "TS1", datum: d, wartungsart: "Störung", techniker: "Testtechniker", anlagen: [],
      stoerung: { ankunft: "08:00", ende: "09:00", problemtyp: "Kühlung" }, version: 1, erstellt: new Date().toISOString(), erstellt_von: "u_tech_test_at" }, o || {});
    db.protokolle.push(st("ar_a", "2026-05-01"), st("ar_b", "2026-05-02"), st("ar_c", "2026-05-03"), st("ar_d", "2026-05-04"));
    await x("Promise.all([ladeProtokolle(), katalogLaden(), abrechnungLaden(), belegeAlleLaden()])");
    const pk = (id) => x("alleProtokolle(true)").filter((p) => p._id === id)[0];
    const erg = (nr, pos) => ({ art: "rechnung", nummer: nr, datum: "2026-05-05", kopf: { betreff: ["Test"] }, summenPdf: { netto: null },
      positionen: pos || [{ typ: "pos", nr: "1", menge: 1, eh: "Std", preis: 70, betragPdf: 70, text: "Regiestundensatz Test" }] });
    const ablegen = async (id, e) => {
      x("kplusVorschau")(x("kontextProtokoll")(pk(id)), e, function () {});
      const d = await A.bis(() => { const d = A.dlgs().pop(); return d && A.knopf(d, /Beim Einsatz ablegen/) && d; });
      const vgl = d.textContent;
      A.knopf(d, /Beim Einsatz ablegen/).click(); await A.bis(() => !document.body.contains(d), 4000); await A.warte(300);
      await x("Promise.all([abrechnungLaden(), belegeAlleLaden()])"); return vgl;
    };
    await ablegen("ar_a", erg("900901"));
    const vorher = !!x("abrechnung")["ar_a"];
    await ablegen("ar_b", erg("900901"));                        /* dieselbe Rechnung gehört zu Einsatz B – umhängen (Rückfrage: ja) */
    const nachher = { a: !!x("abrechnung")["ar_a"], b: !!x("abrechnung")["ar_b"], beleg: (db.belege.filter((b) => b.nummer === "900901")[0] || {}).protokoll_id,
      meldung: document.getElementById("toast").textContent };
    /* C hat noch eine zweite Rechnung: bleibt abgerechnet */
    await ablegen("ar_c", erg("900902")); await ablegen("ar_c", erg("900903")); await ablegen("ar_d", erg("900903"));
    const c = !!x("abrechnung")["ar_c"];
    /* Lernen (Markt in Zone 2): der Chef streicht die Fahrtpauschale und schreibt Kleinmaterial dazu – nach 2 Rechnungen
       schlägt die App die Pauschale noch vor, nach 3 nicht mehr (mit Grund); eine andere Einsatzart lernt davon nichts */
    db.protokolle.push(st("ar_l1", "2026-06-01", { standort_id: "TS2" }), st("ar_l2", "2026-06-02", { standort_id: "TS2" }), st("ar_l3", "2026-06-03", { standort_id: "TS2" }),
      st("ar_l4", "2026-06-04", { standort_id: "TS2" }), st("ar_r", "2026-06-05", { standort_id: "TS2", wartungsart: "Reparatur", stoerung: null }));
    await x("ladeProtokolle()");
    const mitKlein = (nr) => erg(nr, [{ typ: "pos", nr: "1", menge: 1, eh: "Std", preis: 70, betragPdf: 70, text: "Regiestundensatz Test" },
      { typ: "pos", nr: "2", menge: 1, eh: "psh", preis: 30, betragPdf: 30, text: "Kleinmaterial pauschal" }]);
    const fahrt = (id) => x("einsatzVorschlag")(pk(id), "lidl").pos.some((q) => q.typ === "pos" && /Fahrtpauschale/.test(q.text));
    await ablegen("ar_l1", mitKlein("900911")); await ablegen("ar_l2", mitKlein("900912"));
    const nachZwei = fahrt("ar_l4");
    const vgl3 = await ablegen("ar_l3", mitKlein("900913"));
    x("belegNeu")(x("kontextProtokoll")(pk("ar_l4")), "rechnung", null, function () {});
    const d = await A.bis(() => { const d = A.dlgs().pop(); return d && d.querySelector(".bpos") && d; });
    const ed = { text: d.textContent, pos: [...d.querySelectorAll(".bpos")].map((z) => z.querySelector('[data-f="text"]').value.split("\n")[0]) };
    x("ansichtenSchliessen()");
    return { vorher, nachher, c, nachZwei, nachDrei: fahrt("ar_l4"), reparatur: fahrt("ar_r"), ed, vgl3: /Kleinmaterial/.test(vgl3) };
  });
  pruefe(r.vorher, "Einsatz A nach der KPlus-Rechnung nicht als abgerechnet vermerkt");
  pruefe(r.nachher.beleg === "ar_b" && r.nachher.b && !r.nachher.a && /wieder „noch nicht abgerechnet“/.test(r.nachher.meldung), "Umgehängt: A bleibt abgerechnet bzw. B nicht – " + JSON.stringify(r.nachher));
  pruefe(r.c, "Einsatz mit einer weiteren Rechnung verlor den Vermerk „abgerechnet“");
  pruefe(r.nachZwei, "Fahrtpauschale schon nach 2 gestrichenen KPlus-Rechnungen nicht mehr vorgeschlagen");
  pruefe(!r.nachDrei && !r.ed.pos.some((t) => /Fahrtpauschale/.test(t)), "Fahrtpauschale nach 3 gestrichenen KPlus-Rechnungen noch im Vorschlag: " + JSON.stringify(r.ed.pos));
  pruefe(/Fahrtpauschale Zone 2[^]*nicht mehr vor[^]*gelernt aus 3 KPlus-Rechnungen/.test(r.ed.text), "Grund für die fehlende Fahrtpauschale im Editor nicht sichtbar");
  pruefe(r.ed.pos.some((t) => /Kleinmaterial/.test(t)) && /gelernt aus 3 KPlus-Rechnungen/.test(r.ed.text.replace(/Fahrtpauschale[^]*?gestrichen war\./, "")), "Dazugeschriebenes ohne Grund „gelernt aus 3 KPlus-Rechnungen“: " + JSON.stringify(r.ed.pos));
  pruefe(r.reparatur, "Reparatur lernt von Störungen (andere Einsatzart): Fahrtpauschale fehlt");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Störung aus dem Kalender: schon eingelesener Auftrag zeigt „QR-Code zeigen“, Einlesen erst auf Wunsch", async () => {
  const a = await oeffnen(KONTEN.admin);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms));
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const sicht = (d, s) => { const e = d.querySelector(s); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
    await x("stoerungSpeichern({_id:'sqr1', standortId:'TS1', auftragsnummer:'612345', status:'offen'}, 'Test')");
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(OFFENE.filter(function(o){ return o._id==='sqr1'; })[0])"); await w(300);
    let d = dlg(); const erg = {};
    erg.qrSichtbar = sicht(d, "#st_qrzeigen"); erg.pdfVorher = sicht(d, 'label[for="st_pdf"]'); erg.scanVorher = sicht(d, "#st_qr"); erg.infoVorher = sicht(d, "#st_info");
    d.querySelector("#st_qrzeigen").click(); await w(400);
    erg.qrAnsicht = /QR-Code aus der Auftragsnummer/.test(document.body.innerText) && /612345/.test(document.body.innerText);
    x("ansichtenSchliessen(); document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(OFFENE.filter(function(o){ return o._id==='sqr1'; })[0])"); await w(300);
    d = dlg(); d.querySelector("#st_einlesenAuf").click(); await w(100);
    erg.pdfNachher = sicht(d, 'label[for="st_pdf"]'); erg.scanNachher = sicht(d, "#st_qr");
    /* neuer Auftrag ohne Nummer: Einlesen wie bisher gleich sichtbar, kein „QR-Code zeigen“ */
    x("document.querySelectorAll('.assistent').forEach(function(d){ d.remove(); }); stoerungDialog(null, null, {standortId:'TS1'})"); await w(300);
    d = dlg(); erg.neuPdf = sicht(d, 'label[for="st_pdf"]'); erg.neuQr = !!d.querySelector("#st_qrzeigen");
    return erg;
  });
  pruefe(r.qrSichtbar && !r.pdfVorher && !r.scanVorher && !r.infoVorher, "eingelesener Auftrag: QR-Knopf fehlt oder Einlese-Knöpfe stehen da: " + JSON.stringify(r));
  pruefe(r.qrAnsicht, "„QR-Code zeigen“ öffnet keinen QR-Code: " + JSON.stringify(r));
  pruefe(r.pdfNachher && r.scanNachher, "„Anderen Auftrag einlesen …“ zeigt die Einlese-Knöpfe nicht: " + JSON.stringify(r));
  pruefe(r.neuPdf && !r.neuQr, "neuer Auftrag: Einlesen nicht gleich sichtbar oder QR-Knopf ohne Nummer: " + JSON.stringify(r));
  await a.zu();
});

test("Karte: Auswahl „fällig in 31–60 Tagen“ – Märkte mit einem Termin im übernächsten Monat lassen sich dazunehmen", async () => {
  const a = await oeffnen(KONTEN.admin);
  const r = await a.seite.evaluate(() => {
    const x = window.__t.x;
    const heute = new Date(), g30 = x("isoLokal(new Date(Date.now()+VORLAUF_TAGE*86400000))"), g60 = x("isoLokal(new Date(Date.now()+KARTE_BALD_TAGE*86400000))");
    const maerkte = x("ST.filter(function(s){ return !marktPausiert(s) && (s.status==='erledigt'||s.status==='geplant'); }).map(function(s){ return {id:s.id, kat:karteKat(s), n:s.pos.map(function(p){ return p.naechste; }).filter(Boolean).sort()[0]||''}; })");
    const falsch = maerkte.filter((m) => (m.kat === "bald") !== (m.n && m.n >= g30 && m.n < g60) && !(m.kat === "plan" && (!m.n || m.n >= g60)));
    return { kat: x("KARTE_KAT.map(function(k){ return k[0]+'|'+k[1]; })"), falsch, bald: maerkte.filter((m) => m.kat === "bald").length, faelligUnveraendert: x("VORLAUF_TAGE") };
  });
  pruefe(r.kat.some((k) => /^bald\|fällig in 31–60 Tagen$/.test(k)), "keine Auswahl „fällig in 31–60 Tagen“: " + JSON.stringify(r.kat));
  pruefe(!r.falsch.length, "Märkte falsch eingeteilt: " + JSON.stringify(r.falsch));
  pruefe(r.faelligUnveraendert === 30, "Fälligkeit selbst verändert: " + r.faelligUnveraendert);
  /* dieselbe Auswahl in der Fällig-Liste */
  const l = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms));
    x("ansichtenSchliessen(); S.view='faellig'; S.faelligListe=''; S.faelligBald=false; render()"); await w(300);
    const zeilen = () => document.querySelectorAll("#dulist > *").length;
    const knopf = document.querySelector('#du_karte [data-a="bald"]'), vorher = zeilen();
    const n = x("ALLE_POS.filter(function(p){ return POS.indexOf(p)>=0 && (p.status==='erledigt'||p.status==='geplant') && p.naechste && p.naechste<isoLokal(new Date(Date.now()+KARTE_BALD_TAGE*86400000)); }).length");
    if (knopf) knopf.click(); await w(300);
    const nachher = zeilen(), titel = document.querySelector("#du_karte h2").textContent;
    x("S.faelligBald=false; render()");
    return { knopf: !!knopf, n, vorher, nachher, titel };
  });
  /* und in der Tourenplanung: „bis Ende übernächsten Monats“ nimmt mehr Termine mit als „nächsten Monats“ */
  const t = await a.seite.evaluate(() => {
    const x = window.__t.x;
    x("S.tour.status=['ueberfaellig','faellig']; S.tour.naechsterMonat=true; S.tour.uebernaechster=false");
    const n1 = x("tourKandidaten().reduce(function(a,k){ return a+k.positionen.length; },0)");
    x("S.tour.uebernaechster=true");
    const n2 = x("tourKandidaten().reduce(function(a,k){ return a+k.positionen.length; },0)");
    const bis = x("endeFolgemonat(1)"); x("S.tour.uebernaechster=false; S.tour.naechsterMonat=false");
    return { n1, n2, bis };
  });
  pruefe(t.n2 >= t.n1 && /^\d{4}-\d\d-\d\d$/.test(t.bis), "Tour: „übernächsten Monats“ nimmt weniger mit: " + JSON.stringify(t));
  pruefe(!l.n || (l.knopf && l.nachher > l.vorher && /bis 60 Tage/.test(l.titel)), "Fällig-Liste: „+ fällig in 31–60 Tagen“ fehlt oder wirkt nicht: " + JSON.stringify(l));
  await a.zu();
});

async function afHilfen(a) {
  await a.seite.evaluate(() => {
    const x = window.__t.x;
    const af = window.__af = {
      warte: (ms) => new Promise((f) => setTimeout(f, ms)),
      /* das oberste Fenster und ein Knopf darin (Text als Regex) */
      oben: () => [...document.querySelectorAll(".assistent")].sort((p, q) => (+p.style.zIndex || 0) - (+q.style.zIndex || 0)).pop(),
      knopf: async (re, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const o = af.oben();
          const b = o && [...o.querySelectorAll("button")].find((k) => re.test(k.textContent) && !k.disabled);
          if (b) { b.click(); await af.warte(30); return true; } await af.warte(50); } return false; },
      titel: () => [...document.querySelectorAll(".assistent .as-titel")].map((t) => t.textContent),
      /* n kleine Fotos (unterschiedlicher Inhalt) */
      fotos: (n, farbe) => Promise.all(Array.from({ length: n }, (_, i) => new Promise((f) => {
        const c = document.createElement("canvas"); c.width = 30; c.height = 40; const g = c.getContext("2d");
        g.fillStyle = "rgb(" + (farbe || 10) + "," + (i * 40 % 255) + ",90)"; g.fillRect(0, 0, 30, 40);
        c.toBlob((b) => f(new File([b], "s" + i + ".jpg", { type: "image/jpeg" })), "image/jpeg"); }))),
      /* Prüfbuch-Antwort: je Buch {sn, daten:[…]} */
      antwort: (buecher, bilder) => { window.__kiAntwort = (name, body) => ({ data: { art: "pruefbuch", modell: "test", daten: {
        pruefbuecher: buecher.map((b) => ({ anlage: { bezeichnung: "Testanlage " + b.sn, seriennummer: b.sn, hersteller: "Testwerk", kaeltemittelKg: "12" },
          pruefungen: (b.daten || []).map((d) => ({ datum: d, techniker: "T", firma: "Testfirma" })), unsicher: [], hinweise: "" })),
        bilder: bilder || [], hinweise: "" } }, error: null }); },
      /* Prüfbuch über den KI-Knopf im Anlagen-Dialog lesen und Angehaktes übernehmen */
      lesen: async (n, farbe) => {
        x("(function(){ kiFotosWaehlen=function(){ return window.__af.fotos(" + n + "," + (farbe || 10) + "); }; return 1; })()");
        if (!await af.knopf(/Aus Fotos lesen \(KI\)/)) return "kein KI-Knopf";
        if (!await af.knopf(/^Prüfbuch/)) return "keine Wahl Prüfbuch";
        if (!await af.knopf(/Direkt in der App/)) return "kein Weg direkt";
        return "";
      },
      fotosDb: () => window.__db.tabellen.anlagenfotos.slice(),
    };
  });
}

/* Inhaber 06.10.2026: „Die Fotos von Prüfbüchern … sollten auch in den Anlagedaten und im Anlagenbuch zu finden sein.“ –
   in der Datenbank lag kein einziges Foto. Alle Wege der KI-Prüfbuch-Erkennung: bekannte Anlage, mehrere Bücher, neue Anlage
   (Verwaltung und Protokoll), dazu Anlagenbuch und Historie */
test("Anlagenfotos: KI-Prüfbuch – Fotos landen an der Anlage (bekannt, mehrere Bücher, neu in Verwaltung und Protokoll), Anlagenbuch und Historie zeigen sie", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await afHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const af = window.__af, x = window.__t.x, db = window.__db.tabellen, erg = {};
    const anAnlage = (id) => db.anlagenfotos.filter((f) => f.anlage_id === id).length;
    const warteAuf = async (f) => { for (let i = 0; i < 60 && !f(); i++) await af.warte(100); return f(); };
    /* Anlagen-Dialog zu Ende führen (fehlenden Soll-Monat setzen, Übernehmen) */
    const fertigKlicken = async () => {
      for (let i = 0; i < 12; i++) {
        const o = af.oben(); if (!o || !o.querySelector("[data-as]")) break;
        o.querySelectorAll("[data-monat]").forEach((s) => { if (s.value === "0") { s.value = "3"; s.dispatchEvent(new Event("change")); } });
        if (!(await af.knopf(/^(Übernehmen|Weiter|Zur Übersicht)$/, 500))) break;
        await af.warte(250);
      }
    };
    const pruefansicht = () => { const o = af.oben(), k = o && [...o.querySelectorAll(".as-fuss button")].pop(), f = o ? [...o.querySelectorAll("[data-kifotos] [data-fotowahl]")] : [];
      return { fotos: f.length, an: f.map((b) => b.getAttribute("aria-pressed") === "true"), knopf: k ? k.textContent : "" }; };
    /* 1) Verwaltung › bekannte Anlage, ein Buch, zwei Seiten: Auswahl gleich in der Prüfansicht, kein eigener Dialog danach */
    af.antwort([{ sn: "SN-A1", daten: ["10.03.2024"] }], [{ nr: "1", pruefungsdaten: ["10.03.2024"] }, { nr: "2", pruefungsdaten: [] }]);
    x("anlageDatenErgaenzen(posById.TP1); 1");
    erg.a_lesen = await af.lesen(2, 20);
    await warteAuf(() => /Angehakte/.test(pruefansicht().knopf));
    erg.a_ansicht = pruefansicht();
    /* das erste Hochladen scheitert (keine Verbindung): Rückfrage statt still verwerfen, „Nochmals versuchen“ klappt */
    const E = Object.getPrototypeOf(x("Store.sb.storage.from('protokollfotos')")), hoch = E.upload; let fehlschlag = 1;
    E.upload = function () { if (fehlschlag-- > 0) return Promise.resolve({ data: null, error: { message: "Failed to fetch" } }); return hoch.apply(this, arguments); };
    await af.knopf(/Angehakte übernehmen/, 3000);
    erg.a_frage = await warteAuf(() => af.titel().indexOf("Fotos nicht gespeichert") >= 0);
    await af.knopf(/Nochmals versuchen/, 2000); E.upload = hoch;
    await warteAuf(() => anAnlage("TP1") >= 2); await af.warte(400);
    erg.a_rows = anAnlage("TP1"); erg.a_titel = af.titel();
    x("ansichtenSchliessen(); kiRest=null; 1");
    /* 2) mehrere Bücher: Buch 1 gehört zu TP3 – vorgewählt nur seine Seite */
    af.antwort([{ sn: "SN-B1", daten: ["01.02.2025"] }, { sn: "SN-B2", daten: ["05.06.2025"] }],
      [{ nr: "1", pruefungsdaten: ["01.02.2025"] }, { nr: "2", pruefungsdaten: ["05.06.2025"] }]);
    x("anlageDatenErgaenzen(posById.TP3); 1");
    erg.b_lesen = await af.lesen(2, 60);
    erg.b_buch = await af.knopf(/^Buch 1/, 8000);
    await warteAuf(() => /Angehakte/.test(pruefansicht().knopf));
    erg.b_ansicht = pruefansicht();
    await af.knopf(/Angehakte übernehmen/, 3000);
    await warteAuf(() => anAnlage("TP3") >= 1); await af.warte(200);
    erg.b_rows = anAnlage("TP3");
    x("ansichtenSchliessen(); kiRest=null; 1");
    /* 3) Verwaltung › neue Anlage: vorgemerkt, nach dem Speichern an der neuen Anlage */
    af.antwort([{ sn: "SN-N1", daten: ["10.03.2024"] }], [{ nr: "1", pruefungsdaten: ["10.03.2024"] }]);
    const ts5 = () => JSON.parse(x("JSON.stringify(ALLE_POS.filter(function(p){ return p.standortId==='TS5'; }).map(function(p){ return p.id; }))"));
    const vorTS5 = ts5();
    x("anlageNeuAnlegen(byId.TS5); 1"); await af.warte(300);
    erg.c_lesen = await af.lesen(1, 100);
    await af.knopf(/Angehakte übernehmen/, 8000);
    await af.warte(400);
    await fertigKlicken();
    erg.c_neu = ts5().filter((id) => vorTS5.indexOf(id) < 0);
    erg.c_rows = erg.c_neu.length ? (await warteAuf(() => anAnlage(erg.c_neu[0]) >= 1), anAnlage(erg.c_neu[0])) : -1;
    x("ansichtenSchliessen(); 1");
    /* 4) Protokoll › „+ Anlage fehlt“ › neue Anlage per KI: nach dem Speichern des Protokolls an der Anlage */
    af.antwort([{ sn: "SN-P1", daten: ["10.03.2024"] }], [{ nr: "1", pruefungsdaten: ["10.03.2024"] }]);
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos=null; S.view='protokoll'; render(); 1"); await af.warte(500);
    const form = document.getElementById("proto");
    form.querySelector("#addAnlage").click();
    await af.knopf(/zusätzliche Anlage erfassen/); await af.warte(300);
    erg.d_lesen = await af.lesen(1, 140);
    await af.knopf(/Angehakte übernehmen/, 8000);
    await af.warte(400);
    await fertigKlicken();
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    document.getElementById("f_allesok").click();
    erg.d_fehlt = form._fehltNoch();
    if (!erg.d_fehlt.length) document.getElementById("save").click();
    for (let i = 0; i < 40 && !db.protokolle.length; i++) await af.warte(250);
    const npId = ((db.protokolle[0] || {}).position_ids || []).filter((id) => /^NP/.test(id))[0];
    erg.d_np = npId || "";
    erg.d_rows = npId ? (await warteAuf(() => anAnlage(npId) >= 1), anAnlage(npId)) : -1;
    erg.ohneAnlage = db.anlagenfotos.filter((f) => !f.anlage_id).length;
    erg.von = db.anlagenfotos.every((f) => f.von === "u_tech_test_at" && f.erstellt);
    erg.dateien = db.anlagenfotos.every((f) => !!window.__db.dateien["protokollfotos/" + f.pfad]);
    /* 5) Anlagenbuch: Abschnitt mit den Bildern; ein fehlendes Bild gibt einen Hinweis statt Absturz */
    erg.buchHtml = /data-rolle='anlagenfotos'/.test(x("anlagenbuchHtml(posById.TP1)"));
    const einsetzen = x("typeof anlagenbuchFotosEinsetzen=='function' ? anlagenbuchFotosEinsetzen : function(){ return Promise.resolve(); }");
    const h = document.createElement("div");
    await einsetzen(h, x("posById.TP1"));
    erg.buchBilder = h.querySelectorAll("img").length; erg.buchText = h.textContent;
    const weg = db.anlagenfotos.find((f) => f.anlage_id === "TP1"); if (weg) delete window.__db.dateien["protokollfotos/" + weg.pfad];
    const h2 = document.createElement("div");
    await einsetzen(h2, x("posById.TP1"));
    erg.buchFehlt = h2.textContent;
    /* 6) Historie der Anlage (auch für Techniker): Knopf mit Zahl */
    x("ansichtenSchliessen(); anlageHistorieAnsicht(posById.TP1); 1"); await af.warte(400);
    erg.historie = [...af.oben().querySelectorAll("button")].map((b) => b.textContent).filter((t) => /Fotos der Anlage/.test(t));
    erg.fehler = window.__fehler.slice();
    return erg;
  });
  pruefe(!r.a_lesen && !r.b_lesen && !r.c_lesen && !r.d_lesen, "Ablauf hakt: " + JSON.stringify(r));
  pruefe(r.a_ansicht.fotos === 2 && /2 Fotos speichern/.test(r.a_ansicht.knopf), "Prüfansicht ohne Fotoauswahl: " + JSON.stringify(r.a_ansicht));
  pruefe(r.a_frage, "Hochladen gescheitert: keine Rückfrage „Fotos nicht gespeichert“");
  pruefe(r.a_rows === 2 && !r.a_titel.some((t) => /Fotos speichern/.test(t)), "bekannte Anlage: " + r.a_rows + " Fotos gespeichert, Fenster " + JSON.stringify(r.a_titel));
  pruefe(r.b_buch && r.b_ansicht.fotos === 2 && JSON.stringify(r.b_ansicht.an) === "[true,false]" && /1 Foto speichern/.test(r.b_ansicht.knopf) && r.b_rows === 1,
    "mehrere Bücher: Fotos gehen beim Wählen des Buchs verloren oder falsch vorgewählt: " + JSON.stringify({ b: r.b_ansicht, rows: r.b_rows }));
  pruefe(r.c_neu.length === 1 && r.c_rows === 1, "neue Anlage (Verwaltung): Fotos nicht an der neuen Anlage: " + JSON.stringify({ neu: r.c_neu, rows: r.c_rows }));
  pruefe(!r.d_fehlt.length && r.d_np && r.d_rows === 1, "neue Anlage im Protokoll: Fotos nicht an der Anlage: " + JSON.stringify({ np: r.d_np, rows: r.d_rows, fehlt: r.d_fehlt }));
  pruefe(r.ohneAnlage === 0 && r.von && r.dateien, "Fotos ohne Anlage, ohne Datei oder fremdes Konto: " + JSON.stringify({ ohne: r.ohneAnlage, von: r.von, dateien: r.dateien }));
  pruefe(r.buchHtml && r.buchBilder === 2 && /Fotos: Prüfbuch, Typenschild, Anlage/.test(r.buchText) && /Prüfbuch · \d\d\.\d\d\.\d{4}/.test(r.buchText), "Anlagenbuch ohne Fotos: " + r.buchText);
  pruefe(/1 Foto gerade nicht abrufbar/.test(r.buchFehlt) && /Bild nicht abrufbar/.test(r.buchFehlt), "Anlagenbuch: fehlendes Bild ohne Hinweis: " + r.buchFehlt);
  pruefe(r.historie.length === 1 && /\(2\)/.test(r.historie[0]), "Historie der Anlage ohne „📷 Fotos der Anlage (2)“: " + JSON.stringify(r.historie));
  pruefe(!r.fehler.length && !a.fehler.length, "Laufzeitfehler: " + r.fehler.concat(a.fehler).join("; "));
  await a.zu();
  /* Präsentation und Kunde: kein Foto-Speichern, kein Abschnitt im Anlagenbuch */
  for (const k of [KONTEN.praesentation, KONTEN.kunde]) {
    const b = await oeffnen(k);
    const z = await b.x("JSON.stringify([anlagenFotosAn(), /anlagenfotos/.test(anlagenbuchHtml(posById.TP1))])");
    pruefe(z === "[false,false]", k + ": Fotos an der Anlage nicht gesperrt: " + z);
    await b.zu();
  }
});

/* Inhaber 06.10.2026: Anlagen-Karten im Markt einklappbar, am Handy zu („sonst muss man so weit scrollen“); „Beim Zurückspringen
   sollte es aber offen bleiben. Erst nachdem man lange nicht reingeschaut hat, wieder schließen.“ */

test("Anlagen-Karten: im Markt – am Handy eingeklappt mit Kurzinfo, bleiben offen beim Zurückkommen, nach langer Zeit wieder zu, Sprünge klappen auf", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), erg = {};
    const oben = () => [...document.querySelectorAll(".assistent")].pop();
    const karten = () => [...oben().querySelectorAll(".akarte")];
    const zu = (k) => k.classList.contains("ak-zu");
    x("ansichtenSchliessen(); marktAnsicht('TS1'); 1"); await w(500);
    const k0 = karten();
    erg.anzahl = k0.length; erg.zuAmHandy = k0.map(zu);
    erg.kopf = k0[0] ? k0[0].querySelector(".ak-kopf").textContent : "";
    erg.koerperVersteckt = k0[0] ? getComputedStyle(k0[0].querySelector(".ak-koerper")).display === "none" : false;
    /* antippen klappt auf; zurück aus einem Unterfenster (Markt neu geöffnet): bleibt offen */
    k0[0].querySelector(".ak-kopf").click(); await w(100);
    erg.aufNachTippen = !zu(k0[0]);
    x("ansichtenSchliessen(); marktAnsicht('TS1'); 1"); await w(400);
    erg.offenNachZurueck = karten().map(zu);
    /* lange nicht hineingeschaut (über ANLAGEN_KARTE_FRIST_MS): wieder zu */
    const m = JSON.parse(localStorage.getItem("ukt_anlagen_karten") || "{}");
    Object.keys(m).forEach((k) => { m[k].t = Date.now() - x("ANLAGEN_KARTE_FRIST_MS") - 1000; });
    localStorage.setItem("ukt_anlagen_karten", JSON.stringify(m));
    x("ansichtenSchliessen(); marktAnsicht('TS1'); 1"); await w(400);
    erg.zuNachFrist = karten().map(zu);
    /* Sprung zu einem Termin in einer zugeklappten Karte klappt sie auf */
    const ziel = karten()[0].querySelector(".posbox[data-pid]");
    x("sprungHervorheben")(ziel); await w(100);
    erg.aufNachSprung = !zu(karten()[0]);
    return erg;
  });
  pruefe(r.anzahl >= 1 && r.zuAmHandy.every(Boolean), "Handy: Anlagen-Karten nicht eingeklappt: " + JSON.stringify(r));
  pruefe(r.koerperVersteckt && /VRV Anlage/.test(r.kopf) && /fällig|überfällig|Zeitplan|in \d+ Tagen/.test(r.kopf) && /▸/.test(r.kopf), "eingeklappt fehlt Name/Status/▸: " + r.kopf);
  pruefe(r.aufNachTippen, "Antippen klappt nicht auf");
  pruefe(r.offenNachZurueck[0] === false, "beim Zurückkommen nicht mehr offen: " + JSON.stringify(r.offenNachZurueck));
  pruefe(r.zuNachFrist.every(Boolean), "nach langer Zeit nicht wieder zu: " + JSON.stringify(r.zuNachFrist));
  pruefe(r.aufNachSprung, "Sprung in eine zugeklappte Karte klappt sie nicht auf");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* am PC wie bisher aufgeklappt */
  const b = await oeffnen(KONTEN.techniker);
  const pc = await b.seite.evaluate(async () => { window.__t.x("marktAnsicht('TS1'); 1"); await new Promise((f) => setTimeout(f, 500));
    return [...[...document.querySelectorAll(".assistent")].pop().querySelectorAll(".akarte")].map((k) => k.classList.contains("ak-zu")); });
  pruefe(pc.length >= 1 && pc.every((z) => !z), "PC: Anlagen-Karten nicht aufgeklappt: " + JSON.stringify(pc));
  await b.zu();
});

test("Projektdateien: bis 50 MB je Datei – zu Große werden ausgelassen, der Rest des Ordners kommt hoch", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, jetzt = new Date().toISOString();
    db.projekte.push({ id: "pgross", nummer: "P-T-50", titel: "Große Pläne", kunde_id: "lidl", standort_id: "TS1", status: "baustelle", daten: {}, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()"); await w(300);
    window.__toasts = []; x("(function(){ var alt=toast; toast=function(m){ window.__toasts.push(String(m)); return alt.apply(this, arguments); }; return 1; })()");
    const gross = new File(["x"], "Riesenplan.pdf", { type: "application/pdf" }); Object.defineProperty(gross, "size", { value: 60 * 1048576 });
    const mittel = new File(["y"], "Plan 30MB.pdf", { type: "application/pdf" }); Object.defineProperty(mittel, "size", { value: 30 * 1048576 });
    const klein = new File(["%PDF-1.4"], "Plan klein.pdf", { type: "application/pdf" });
    window.__d = [gross, mittel, klein];
    const neu = await x("projektDateienHochladen(PROJEKTE.filter(function(q){ return q.id==='pgross'; })[0], 'plan', window.__d)");
    const namen = ((db.projekte.find((q) => q.id === "pgross") || {}).daten.dateien || []).map((f) => f.name);
    return { max: x("PROJEKT_DATEI_MAX"), neu: (neu || []).length, namen, toasts: window.__toasts };
  });
  pruefe(r.max === 50 * 1048576, "Grenze nicht 50 MB: " + r.max);
  pruefe(r.namen.indexOf("Plan klein.pdf") >= 0 && r.namen.indexOf("Plan 30MB.pdf") >= 0 && r.namen.indexOf("Riesenplan.pdf") < 0, "falsch hochgeladen: " + JSON.stringify(r));
  pruefe(r.toasts.some((t) => /zu groß.*Riesenplan\.pdf \(60 MB\)/.test(t)), "kein Hinweis auf die zu große Datei: " + JSON.stringify(r.toasts));
  await a.zu();
});

test("Projektdateien: doppelte am Inhalt erkannt – „Plan (1).pdf“ und Kopien unter anderem Namen werden nicht nochmals hochgeladen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, jetzt = new Date().toISOString();
    /* ein älterer Eintrag ohne Prüfsumme */
    db.projekte.push({ id: "pdop", nummer: "P-T-DOP", titel: "Doppelte", kunde_id: "lidl", standort_id: "TS1", status: "baustelle",
      daten: { dateien: [{ pfad: "pdop/plan-alt-Plan_alt.pdf", name: "Plan alt.pdf", art: "plan", groesse: 11, typ: "application/pdf", zeit: jetzt }] }, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    await x("projekteLaden()"); await w(300);
    window.__toasts = []; x("(function(){ var alt=toast; toast=function(m){ window.__toasts.push(String(m)); return alt.apply(this, arguments); }; return 1; })()");
    const pdf = (name, inhalt) => new File([inhalt], name, { type: "application/pdf" });
    const p = () => x("PROJEKTE").filter((q) => q.id === "pdop")[0];
    window.__d = [pdf("Plan A.pdf", "%PDF Inhalt A"), pdf("Plan A (1).pdf", "%PDF Inhalt A"), pdf("Plan B.pdf", "%PDF Inhalt B"), pdf("Plan alt (1).pdf", "%PDF alt 11")];
    const erst = await x("projektDateienHochladen")(p(), "plan", window.__d);
    const nach1 = (p().daten.dateien || []).map((f) => f.name + (f.hash ? "#" : ""));
    const toast1 = window.__toasts.join(" | ");
    window.__toasts.length = 0;
    const zweit = await x("projektDateienHochladen")(p(), "plan", [pdf("Kopie von B.pdf", "%PDF Inhalt B"), pdf("Plan C.pdf", "%PDF Inhalt C")]);
    const nach2 = (p().daten.dateien || []).map((f) => f.name);
    return { erst: erst.map((f) => f.name), nach1, toast1, zweit: zweit.map((f) => f.name), nach2, toast2: window.__toasts.join(" | ") };
  });
  pruefe(JSON.stringify(r.nach1) === JSON.stringify(["Plan alt.pdf", "Plan A.pdf#", "Plan B.pdf#"]), "erste Auswahl: " + JSON.stringify(r));
  pruefe(/2 doppelte Dateien/.test(r.toast1) && /Plan A \(1\)\.pdf“ = „Plan A\.pdf/.test(r.toast1) && /Plan alt \(1\)\.pdf“ = „Plan alt\.pdf“ \(schon am Projekt\)/.test(r.toast1), "Meldung 1: " + r.toast1);
  pruefe(JSON.stringify(r.nach2) === JSON.stringify(["Plan alt.pdf", "Plan A.pdf", "Plan B.pdf", "Plan C.pdf"]) && r.zweit.indexOf("Plan B.pdf") >= 0 && r.zweit.indexOf("Plan C.pdf") >= 0,
    "Kopie unter anderem Namen: " + JSON.stringify(r));
  pruefe(/Kopie von B\.pdf“ = „Plan B\.pdf“ \(schon am Projekt\)/.test(r.toast2), "Meldung 2: " + r.toast2);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Textfelder wachsen mit dem Text – im Projekt kein Scrollen im Feld (PC und Handy), beim Tippen und Aufklappen", async () => {
  for (const handy of [false, true]) {
    const a = await oeffnen(KONTEN.inhaber, { handy });
    const r = await a.seite.evaluate(async () => {
      const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, jetzt = new Date().toISOString();
      const lang = Array.from({ length: 14 }, (_, i) => "Zeile " + (i + 1) + ": Rückkühler am Dach, Schallschutzwand 2,20 m, Fundierung mit Betriebsgewicht.").join("\n");
      db.projekte.push({ id: "ptf", nummer: "P-T-TF", titel: "Lange Texte", kunde_id: "lidl", standort_id: "TS1", status: "baustelle",
        daten: { beschreibung: lang, bestand: lang, vorgaben: lang }, verlauf: [], erstellt: jetzt, geaendert: jetzt });
      await x("projekteLaden()"); x("projektAnsicht('ptf')"); await w(700);
      /* alles aufklappen, was zugeklappt ist */
      for (let i = 0; i < 3; i++) { document.querySelectorAll(".assistent details:not([open])").forEach((d) => d.setAttribute("open", ""));
        [...document.querySelectorAll(".assistent [aria-expanded='false']")].forEach((b) => b.click()); await w(250); }
      const sichtbar = () => [...document.querySelectorAll(".assistent textarea")].filter((t) => t.offsetParent && t.value.length > 200);
      const zuKnapp = () => sichtbar().filter((t) => t.scrollHeight > t.clientHeight + 2).map((t) => (t.dataset.k || t.dataset.s || t.name || "?") + " " + t.clientHeight + "/" + t.scrollHeight);
      const n = sichtbar().length, vorher = zuKnapp();
      /* beim Tippen: ein kurzes Feld wird lang */
      const kurz = [...document.querySelectorAll(".assistent textarea")].filter((t) => t.offsetParent && !t.value)[0];
      let tippen = "kein leeres Feld";
      if (kurz) { const h0 = kurz.clientHeight; kurz.value = lang; kurz.dispatchEvent(new Event("input", { bubbles: true })); await w(50);
        tippen = kurz.scrollHeight <= kurz.clientHeight + 2 && kurz.clientHeight > h0 ? "ok" : h0 + "→" + kurz.clientHeight + "/" + kurz.scrollHeight; }
      return { n, vorher, tippen };
    });
    pruefe(r.n >= 1, (handy ? "Handy" : "PC") + ": keine langen Textfelder im Projekt gefunden: " + JSON.stringify(r));
    pruefe(!r.vorher.length, (handy ? "Handy" : "PC") + ": Textfelder zu knapp (Scrollen im Feld): " + JSON.stringify(r.vorher));
    pruefe(r.tippen === "ok", (handy ? "Handy" : "PC") + ": Feld wächst beim Tippen nicht: " + r.tippen);
    pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
    await a.zu();
  }
});

test("Pläne finden: Geschoss/Gewerk erkannt, Suche, Stände beisammen, 📌 anheften, beschreiben, PDF-Titel beim Hochladen, Sprungleiste oben", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, j = new Date().toISOString(), e = {};
    const f = (pfad, name, art, extra) => Object.assign({ pfad: "ppl/" + pfad, name, art, groesse: 100, typ: "application/pdf", zeit: j, von: "Test" }, extra || {});
    db.projekte.push({ id: "ppl", nummer: "P-T-PL", titel: "Pläne", kunde_id: "lidl", standort_id: "TS1", status: "baustelle", verlauf: [], erstellt: j, geaendert: j,
      daten: { dateien: [f("a", "620_NB_AP_CrashGRDD_20250903_VA.pdf", "plan"), f("b", "620_NB_AP_CrashGRDD_20250912.pdf", "plan"), f("c", "Siebenbrunnengasse-Klima-EG-UKT.pdf", "plan"),
        f("d", "Elektroplan_1OG.pdf", "plan"), f("e", "Rückkühler_Klima_78kW.pdf", "dokument"), f("g", "Einreichung.pdf", "plan", { pdfTitel: "Lidl HKLS_Einreichung_HT-UG" })] } });
    await x("projekteLaden()"); x("projektAnsicht('ppl')"); await w(700);
    const dlg = () => [...document.querySelectorAll(".assistent")].pop();
    const karte = () => [...dlg().querySelectorAll(".card")].find((c) => /^Dateien/.test((c.querySelector("h2") || {}).textContent || ""));
    const k = karte(); if (k.classList.contains("zu") && k._klapp) k._klapp(false);
    const reihe = (n) => [...karte().querySelectorAll('[data-filter="' + n + '"] .chip')].map((c) => c.textContent);
    e.geschoss = reihe("geschoss"); e.gewerk = reihe("gewerk");
    const zeilen = () => [...karte().querySelectorAll("[data-datei-zeile]")].map((z) => z.querySelector("[data-oeffnen]").textContent);
    e.alle = zeilen();
    [...karte().querySelectorAll('[data-filter="geschoss"] .chip')].find((c) => /^Dach/.test(c.textContent)).click(); await w(50);
    e.dach = zeilen(); e.aelterKnopf = (karte().querySelector("[data-aeltere]") || {}).textContent || "";
    karte().querySelector("[data-aeltere]").click(); await w(50); e.dachAuf = zeilen();
    [...karte().querySelectorAll('[data-filter="geschoss"] .chip')].find((c) => /^Dach/.test(c.textContent)).click(); await w(50);
    const sf = karte().querySelector("[data-dateisuche]"); sf.value = "elektro og"; sf.dispatchEvent(new Event("input")); await w(50); e.suche = zeilen();
    sf.value = "UG"; sf.dispatchEvent(new Event("input")); await w(50); e.sucheUG = zeilen();
    sf.value = ""; sf.dispatchEvent(new Event("input")); await w(50);
    /* anheften */
    const zeileVon = (n) => [...karte().querySelectorAll("[data-datei-zeile]")].find((z) => z.querySelector("[data-oeffnen]").textContent === n);
    zeileVon("Elektroplan_1OG.pdf").querySelector("[data-pin]").click(); await w(600);
    const pd = () => db.projekte.find((q) => q.id === "ppl").daten.dateien;
    e.pin = (pd().find((q) => q.name === "Elektroplan_1OG.pdf") || {}).wichtig === true;
    e.wichtigOben = /Wichtige Pläne/.test(karte().textContent) && zeilen()[0] === "Elektroplan_1OG.pdf";
    /* beschreiben: lesbarer Name, Geschoss geändert */
    zeileVon("620_NB_AP_CrashGRDD_20250912.pdf").querySelector("[data-bearb]").click(); await w(200);
    const bd = dlg(); bd.querySelector("[data-titel]").value = "Dachdraufsicht mit Rückkühlern";
    [...bd.querySelectorAll("[data-gw] .chip")].find((c) => c.textContent === "Klima").click();
    [...bd.querySelectorAll(".as-fuss button")].find((b) => /Speichern/.test(b.textContent)).click(); await w(700);
    const geb = pd().find((q) => q.name === "620_NB_AP_CrashGRDD_20250912.pdf") || {};
    e.titel = geb.titel; e.gewerkGesetzt = JSON.stringify(geb.gewerk); e.geschossAuto = geb.geschoss === undefined;
    e.lesbar = zeilen().indexOf("Dachdraufsicht mit Rückkühlern") >= 0;
    /* Sprungleiste */
    const bar = dlg().querySelector(".projekt-sprung");
    e.sprung = bar ? [...bar.querySelectorAll(".chip")].map((c) => c.textContent) : [];
    const pl = bar && [...bar.querySelectorAll(".chip")].find((c) => /Pläne/.test(c.textContent));
    if (pl) { const dk = karte(); if (dk._klapp) dk._klapp(true); pl.click(); await w(400); e.sprungAuf = !karte().classList.contains("zu"); }
    e.sticky = bar ? getComputedStyle(bar).position : "";
    /* beim Hochladen: Titel aus der PDF */
    const L = await x("(window.PDFLib ? Promise.resolve() : ladeSkript(PDF_LIB)).then(function(){ return window.PDFLib; })");
    const doc = await L.PDFDocument.create(); doc.addPage(); doc.setTitle("Montageplan GR_EG Lüftung");
    window.__pf = [new File([await doc.save()], "x123.pdf", { type: "application/pdf" })];
    await x("projektDateienHochladen(PROJEKTE.filter(function(q){ return q.id==='ppl'; })[0], 'plan', window.__pf)");
    const neu = pd().find((q) => q.name === "x123.pdf") || {};
    e.pdfTitel = neu.pdfTitel || ""; const m = x("dateiMerkmale")(neu); e.neuMerk = m.geschoss.join() + "|" + m.gewerk.join();
    return e;
  });
  pruefe(JSON.stringify(r.geschoss) === JSON.stringify(["Alle", "UG / Keller / Garage (1)", "EG (1)", "OG (1)", "Dach (2)"]), "Geschoss-Knöpfe: " + JSON.stringify(r.geschoss));
  pruefe(r.gewerk.some((t) => /^Klima \(2\)/.test(t)) && r.gewerk.some((t) => /^Elektro/.test(t)) && r.gewerk.some((t) => /^Kälte/.test(t)) && r.gewerk.some((t) => /^Haustechnik/.test(t)), "Gewerk-Knöpfe: " + JSON.stringify(r.gewerk));
  pruefe(r.alle.length === 5 && r.alle.indexOf("620_NB_AP_CrashGRDD_20250903_VA.pdf") < 0, "Stände nicht beisammen: " + JSON.stringify(r.alle));
  pruefe(JSON.stringify(r.dach) === JSON.stringify(["620_NB_AP_CrashGRDD_20250912.pdf"]) && /1 älterer Stand/.test(r.aelterKnopf) && r.dachAuf.length === 2, "Dach-Filter/ältere Stände: " + JSON.stringify([r.dach, r.aelterKnopf, r.dachAuf]));
  pruefe(JSON.stringify(r.suche) === JSON.stringify(["Elektroplan_1OG.pdf"]) && JSON.stringify(r.sucheUG) === JSON.stringify(["Einreichung.pdf"]), "Suche: " + JSON.stringify([r.suche, r.sucheUG]));
  pruefe(r.pin && r.wichtigOben, "Anheften: " + JSON.stringify([r.pin, r.wichtigOben]));
  pruefe(r.titel === "Dachdraufsicht mit Rückkühlern" && r.gewerkGesetzt === '["klima"]' && r.geschossAuto && r.lesbar, "Beschreiben: " + JSON.stringify(r));
  pruefe(r.sprung.length >= 3 && r.sprung.some((t) => /Pläne/.test(t)) && r.sprungAuf && r.sticky === "sticky", "Sprungleiste: " + JSON.stringify([r.sprung, r.sprungAuf, r.sticky]));
  pruefe(r.pdfTitel === "Montageplan GR_EG Lüftung" && r.neuMerk === "EG|lueftung", "PDF-Titel beim Hochladen: " + JSON.stringify([r.pdfTitel, r.neuMerk]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Tagesrückblick: teilen mit Uhrzeit und Bereich, „Wo?“ mit Baustellen/Projekten (auch ohne Markt), Stempeluhr ebenso", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, j = new Date().toISOString(), e = {};
    db.projekte.push({ id: "pwo", nummer: "P-T-WO", titel: "Baustelle ohne Markt", kunde_id: "lidl", standort_id: null, status: "baustelle", daten: {}, verlauf: [], erstellt: j, geaendert: j });
    await x("projekteLaden()");
    const T = x("plusTage(isoLokal(new Date()), -1)"), ich = x("meineKennung()");
    db.arbeitszeiten.push({ id: "zwo1", user_id: ich, name: "T", datum: T, beginn: "07:00", ende: "15:00", pause_min: 30, minuten: 450, art: "arbeit", quelle: "stempel", bereich: "werkstatt" });
    await x("zeitenLaden()");
    x("abgleichDialog('" + T + "', false)"); await w(300);
    const d = () => [...document.querySelectorAll(".assistent")].pop();
    d().querySelector("[data-abschnitt] [data-abteilen]").click(); await w(50);
    const tp = d().querySelector("[data-teilen]"); e.panel = !!tp;
    tp.querySelector("[data-tz]").value = "10:30"; tp.querySelector("[data-tz]").dispatchEvent(new Event("change"));
    tp.querySelector("[data-tb]").value = "baustelle"; tp.querySelector("[data-tb]").dispatchEvent(new Event("change"));
    tp.querySelector("[data-tok]").click(); await w(50);
    e.abschnitte = [...d().querySelectorAll("[data-abschnitt]")].map((z) => z.dataset.abschnitt);
    /* der neue Teil ist aufgeklappt: Wo? – die Baustelle ohne Markt ist wählbar */
    const zwei = d().querySelectorAll("[data-abschnitt]")[1], wo = zwei.querySelector("[data-abst]");
    e.woOptionen = [...wo.querySelectorAll("optgroup")].map((g) => g.label).join("|");
    wo.value = "p:pwo"; wo.dispatchEvent(new Event("change")); await w(50);
    e.woGewaehlt = d().querySelectorAll("[data-abschnitt]")[1].querySelector("[data-abst]").value;
    [...d().querySelectorAll(".as-fuss button")].pop().click(); await w(700);
    const l = db.arbeitszeiten.filter((z) => z.datum === T).sort((p, q) => p.beginn < q.beginn ? -1 : 1);
    e.gespeichert = l.map((z) => z.beginn.slice(0, 5) + "-" + z.ende.slice(0, 5) + " " + z.bereich + " " + (z.projekt_id || "-")).join(" | ");
    /* Stempeluhr: Wo? enthält die Baustelle, gewählt setzt sie Projekt (Standort leer) */
    x("ansichtenSchliessen(); S.view='stunden'; render(); 1"); await w(400);
    const st = document.querySelector("[data-st]");
    e.stempelWo = st ? [...st.options].some((o) => o.value === "p:pwo") : "kein Feld";
    if (st) { st.value = "p:pwo"; st.dispatchEvent(new Event("change")); e.stempelOrt = JSON.stringify(x("ortLesen")(st.closest(".stack") || document)); }
    return e;
  });
  pruefe(r.panel && JSON.stringify(r.abschnitte) === JSON.stringify(["07:00-10:30 werkstatt", "10:30-15:00 baustelle"]), "Teilen: " + JSON.stringify(r));
  pruefe(r.woOptionen === "Baustellen / Projekte|Märkte / Standorte" && r.woGewaehlt === "p:pwo", "Wo?: " + JSON.stringify(r));
  pruefe(/10:30-15:00 baustelle pwo/.test(r.gespeichert) && /07:00-10:30 werkstatt -/.test(r.gespeichert), "gespeichert: " + r.gespeichert);
  pruefe(r.stempelWo === true && r.stempelOrt === '{"standort_id":null,"projekt_id":"pwo"}', "Stempeluhr Wo?: " + JSON.stringify([r.stempelWo, r.stempelOrt]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Vergessen / abholen: vom Markt aus eintragen, 🧰 auf der Karte, im Popup, beim Tour-Stopp und „Unterwegs abholen“", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, e = {};
    db.bedarf.push({ id: "bab1", art: "werkzeug", text: "Leiter", notiz: "von Tobias vergessen", standort_id: "TS1", beschaffung: "abholen", bezugsquelle: "im Markt", status: "offen", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString() },
      { id: "bab2", art: "werkzeug", text: "Bohrmaschine", standort_id: "TS3", beschaffung: "abholen", status: "offen", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString() },
      { id: "bab3", art: "werkzeug", text: "Alte Sache", standort_id: "TS1", beschaffung: "abholen", status: "erledigt", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString() });
    await x("wzLaden(true)");
    /* Markt-Fenster: Knopf oben, Zahl der offenen */
    x("marktAnsicht('TS1')"); await w(500);
    const mf = [...document.querySelectorAll(".assistent")].pop();
    e.knopf = !!mf.querySelector("[data-abholen]"); e.zahl = (mf.querySelector("[data-abholzahl]") || {}).textContent || "";
    e.karteTitel = /Mitnehmen \/ abholen an diesem Markt/.test(mf.textContent);
    mf.querySelector("[data-abholen]").click(); await w(300);
    const ed = [...document.querySelectorAll(".assistent")].pop();
    e.editor = (ed.querySelector('[data-f="bezugsquelle"]') || {}).value + " | " + [...ed.querySelectorAll("[data-weg] .chip")].filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.textContent.trim()).join();
    x("ansichtenSchliessen()");
    /* Karte: Zeichen und Popup */
    x("S.view='karte'; render(); 1"); await w(1200);
    e.pins = [...document.querySelectorAll("[data-abholpin]")].map((p) => p.dataset.abholpin).sort().join();
    const pop = x("popupInhalt")(x("byId.TS1"));
    e.popup = [...pop.querySelectorAll("[data-abholeintrag]")].map((z) => z.textContent).join(" | ") + " | knopf:" + !!pop.querySelector('[data-akt="abholen"]');
    /* Tour: am Stopp und unterwegs */
    const T = { tage: [{ nr: 1, stunden: 2, startPunkt: x("BETRIEB"), stopps: [{ standort: x("byId.TS1"), positionen: [x("posById.TP1")], fahrtH: 0.5, arbeitH: 1, km: 10 }] }], anzahlStopps: 1, anzahlPositionen: 1, kmGesamt: 10, stundenProTag: 8 };
    const te = x("tourErgebnis")(T);
    e.stopp = [...te.querySelectorAll("[data-tourabholen]")].map((s) => s.textContent).join(" | ");
    const uw = te.querySelector("[data-unterwegs]"); e.unterwegs = uw ? uw.textContent : "";
    return e;
  });
  pruefe(r.knopf && /1 offen/.test(r.zahl) && r.karteTitel, "Markt-Fenster: " + JSON.stringify(r));
  pruefe(/^im Markt .* \| .*abholen/.test(r.editor), "Editor vom Markt aus nicht vorbelegt: " + r.editor);
  pruefe(r.pins === "TS1,TS3", "Karte: 🧰-Zeichen " + r.pins);
  pruefe(/Leiter – von Tobias vergessen/.test(r.popup) && !/Alte Sache/.test(r.popup) && /knopf:true/.test(r.popup), "Popup: " + r.popup);
  pruefe(/abholen: Leiter/.test(r.stopp) && /Bohrmaschine/.test(r.unterwegs) && !/Leiter/.test(r.unterwegs), "Tour: " + JSON.stringify([r.stopp, r.unterwegs]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Vergessen / abholen geht nicht unter: gleich geladen, Fällig-Karte, 🧰 neben dem Marktnamen, Marktinfo, oben im Protokoll; abgehakt verschwindet es", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, e = {};
    await w(800);
    e.geladenOhneKarte = x("wzGeladen");
    db.bedarf.push({ id: "bvg1", art: "werkzeug", text: "Leiter", notiz: "von Tobias vergessen", standort_id: "TS1", beschaffung: "abholen", status: "offen", erstellt_von: "u_inhaber_test_at", erstellt: new Date().toISOString() });
    await x("wzLaden(true)");
    x("S.view='faellig'; render()"); await w(500);
    const k = document.querySelector("[data-abholkarte]");
    e.karte = k ? k.textContent : "";
    e.zeichen = [...document.querySelectorAll('[data-abholmini="TS1"]')].length;
    if (k) { k.querySelector("button.row").click(); await w(500); }
    const mf = [...document.querySelectorAll(".assistent")].pop();
    e.marktinfo = mf ? ((mf.querySelector("[data-abholhinweis]") || {}).textContent || "") : "";
    x("ansichtenSchliessen()");
    /* Protokoll: Markt wählen → Hinweis oben */
    x("S.view='protokoll'; S.protoStandort='TS1'; render()"); await w(700);
    e.protokoll = ((document.querySelector("[data-abholoben]") || {}).textContent || "");
    x("S.protoStandort=''; formDirty=false; S.view='faellig'; render()"); await w(300);
    /* abgehakt → weg */
    db.bedarf.find((b) => b.id === "bvg1").status = "erledigt";
    await x("wzLaden(true)"); x("render()"); await w(400);
    e.nachher = !!document.querySelector("[data-abholkarte]") + "|" + document.querySelectorAll('[data-abholmini="TS1"]').length;
    return e;
  });
  pruefe(r.geladenOhneKarte, "Werkzeug/Material nicht gleich geladen: " + JSON.stringify(r));
  pruefe(/An Märkten abholen/.test(r.karte) && /Leiter – von Tobias vergessen/.test(r.karte), "Fällig-Karte fehlt: " + JSON.stringify(r));
  pruefe(r.zeichen > 0, "🧰 neben dem Marktnamen fehlt: " + JSON.stringify(r));
  pruefe(/Hier abholen/.test(r.marktinfo) && /Leiter/.test(r.marktinfo), "Marktinfo ohne Hinweis: " + JSON.stringify(r));
  pruefe(/Hier abholen/.test(r.protokoll) && /Leiter/.test(r.protokoll), "Protokoll ohne Hinweis: " + JSON.stringify(r));
  pruefe(r.nachher === "false|0", "nach dem Abhaken noch da: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Projekt-Termin: „Was wurde gemacht?“ ins Baustellenbuch (Termin + Schritt), ✓ dokumentiert/erledigt, beim Schritt sichtbar, im Arbeitsnachweis vorgeschlagen", async () => {
  const a = await oeffnen(KONTEN.inhaber);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), db = window.__db.tabellen, j = new Date().toISOString(), e = {};
    const heute = x("isoLokal(new Date())"), ich = x("meineKennung()");
    db.projekte.push({ id: "pkal", nummer: "P-T-KAL", titel: "Montage Test", kunde_id: "lidl", standort_id: "TS1", status: "baustelle", daten: {}, verlauf: [], erstellt: j, geaendert: j });
    db.planung.push({ id: "tkal1", art: "termin", kategorie: "baustelle", titel: "Innengeräte montieren", datum: heute, beginn: "07:00", ende: "15:00", wer: [ich], wer_namen: ["T"],
      projekt_id: "pkal", projekt_schritt: "baustelle", status: "offen", erstellt_von: ich, erstellt: j },
      { id: "tkal2", art: "termin", kategorie: "buero", titel: "Besprechung", datum: heute, beginn: "16:00", ende: "17:00", wer: [ich], wer_namen: ["T"], status: "offen", erstellt_von: ich, erstellt: j });
    await x("Promise.all([projekteLaden(), planungLaden()])"); await w(200);
    /* Termin öffnen: „📝 Was wurde gemacht?“ */
    x("planEditor(PLANUNG.filter(function(p){ return p.id==='tkal1'; })[0])"); await w(300);
    let d = [...document.querySelectorAll(".assistent")].pop();
    const knoepfe = [...d.querySelectorAll(".as-fuss button")].map((b) => b.textContent);
    e.knoepfe = knoepfe.join("|");
    [...d.querySelectorAll(".as-fuss button")].find((b) => /Was wurde gemacht/.test(b.textContent)).click(); await w(300);
    d = [...document.querySelectorAll(".assistent")].pop();
    e.titel = d.querySelector(".as-titel").textContent; e.schritt = d.querySelector('[data-f="schritt"]').value;
    d.querySelector('[data-f="text"]').value = "6 Innengeräte montiert, Kondensat angeschlossen";
    [...d.querySelectorAll(".as-fuss button")].find((b) => /Speichern/.test(b.textContent)).click(); await w(800);
    const bb = (db.projekte.find((p) => p.id === "pkal").daten.baubuch || [])[0] || {};
    e.eintrag = bb.planung_id + "|" + bb.schritt + "|" + bb.datum + "|" + (bb.datum === heute);
    e.dokumentiert = x("planTerminErledigt(PLANUNG.filter(function(p){ return p.id==='tkal1'; })[0])");
    e.kalTitel = ((x("kalenderEintraege")(heute, heute, "ich")[heute] || []).find((z) => z.e && z.e.id === "tkal1") || {}).titel || "";
    /* ohne Bericht abhaken */
    x("ansichtenSchliessen(); planEditor(PLANUNG.filter(function(p){ return p.id==='tkal2'; })[0])"); await w(300);
    d = [...document.querySelectorAll(".assistent")].pop();
    e.ohneProjekt = ![...d.querySelectorAll(".as-fuss button")].some((b) => /Was wurde gemacht/.test(b.textContent));
    [...d.querySelectorAll(".as-fuss button")].find((b) => /✓ Erledigt/.test(b.textContent)).click(); await w(500);
    const t2 = db.planung.find((p) => p.id === "tkal2"); e.abgehakt = !!t2.erledigt + "|" + t2.status;
    /* Projekt-Schritt zeigt Termin und Bericht */
    x("ansichtenSchliessen(); projektAnsicht('pkal')"); await w(700);
    const pd = [...document.querySelectorAll(".assistent")].pop();
    e.schrittTermin = [...pd.querySelectorAll("[data-schritttermin]")].map((z) => z.textContent).join(" | ");
    e.schrittBericht = [...pd.querySelectorAll("[data-schrittbaubuch]")].map((z) => z.textContent).join(" | ");
    /* Arbeitsnachweis: Baustellenbuch-Text als Vorschlag */
    x("ansichtenSchliessen()");
    const p = x("PROJEKTE").filter((q) => q.id === "pkal")[0];
    x("anEditor")(p, null, function () {}); await w(400);
    const ad = [...document.querySelectorAll(".assistent")].pop();
    const z = [...ad.querySelectorAll(".as-fuss button")].find((b) => /^Weiter: Stunden/.test(b.textContent)); z.click(); await w(400);
    if (!ad.querySelectorAll(".an-zeile").length) { [...ad.querySelectorAll("button")].find((b) => /^\+ Zeile$/.test(b.textContent)).click(); await w(100); }
    [...ad.querySelectorAll(".as-fuss button")].find((b) => /^Weiter: Arbeiten/.test(b.textContent)).click(); await w(200);
    e.anVorschlag = [...ad.querySelectorAll("button")].some((b) => /6 Innengeräte montiert/.test(b.textContent) && /Baustellenbuch/.test(b.textContent));
    /* Tagesrückblick: beim gemachten Projekt-Termin der Knopf zum Bericht */
    x("ansichtenSchliessen()");
    db.arbeitszeiten.push({ id: "zkal1", user_id: ich, name: "T", datum: heute, beginn: "06:30", ende: "15:30", pause_min: 30, minuten: 510, art: "arbeit", quelle: "stempel", bereich: "baustelle" });
    await x("zeitenLaden()"); x("abgleichDialog('" + heute + "', false)"); await w(400);
    const rd = [...document.querySelectorAll(".assistent")].pop(), bk = rd.querySelector("[data-bericht]");
    e.rueckblick = bk ? bk.textContent : "kein Knopf";
    return e;
  });
  pruefe(/Was wurde gemacht/.test(r.knoepfe) && /✓ Erledigt/.test(r.knoepfe), "Termin-Knöpfe: " + r.knoepfe);
  pruefe(r.titel === "Was wurde gemacht?" && r.schritt === "baustelle", "Baustellenbuch vorbelegt: " + JSON.stringify([r.titel, r.schritt]));
  pruefe(/^tkal1\|baustelle\|.*\|true$/.test(r.eintrag) && r.dokumentiert === true && /^✓ dokumentiert/.test(r.kalTitel), "Bericht/Termin: " + JSON.stringify([r.eintrag, r.dokumentiert, r.kalTitel]));
  pruefe(r.ohneProjekt && r.abgehakt === "true|offen", "Ohne Bericht abhaken: " + JSON.stringify([r.ohneProjekt, r.abgehakt]));
  pruefe(/Innengeräte montieren/.test(r.schrittTermin) && /dokumentiert/.test(r.schrittTermin) && /6 Innengeräte montiert/.test(r.schrittBericht), "Projekt-Schritt: " + JSON.stringify([r.schrittTermin, r.schrittBericht]));
  pruefe(r.anVorschlag, "Arbeitsnachweis schlägt den Baustellenbuch-Text nicht vor");
  pruefe(/Bericht ✓/.test(r.rueckblick), "Tagesrückblick ohne Bericht-Knopf: " + r.rueckblick);
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Schriftgröße je Gerät: ☰ → Aa Schriftgröße – am Handy Sehr klein/Klein/Groß (Text bricht neu um, nichts ragt hinaus), bleibt nach Neuladen; am PC Hinweis Strg +/−", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const waehle = async (re) => {
    await a.seite.evaluate(async (q) => {
      const w = (ms) => new Promise((f) => setTimeout(f, ms));
      document.querySelector(".tab-menue").click(); await w(150);
      const mk = [...document.querySelectorAll("#reiter_menue button")].find((b) => /Schriftgröße/.test(b.textContent));
      if (!mk) throw new Error("kein Menüeintrag bei " + q + ", Breite " + document.documentElement.clientWidth + ", ☰ " + getComputedStyle(document.querySelector(".tab-menue")).display);
      mk.click(); await w(200);
      const d = [...document.querySelectorAll(".assistent")].pop();
      const kb = [...d.querySelectorAll("[data-schrift]")].find((b) => new RegExp(q).test(b.textContent));
      if (!kb) throw new Error("kein Knopf " + q + ": " + [...d.querySelectorAll("[data-schrift]")].map((b) => b.textContent).join("|"));
      kb.click(); await w(400);
    }, re);
    await a.seite.waitForTimeout(400);
    return a.seite.evaluate(() => ({ vp: document.querySelector('meta[name="viewport"]').content, breite: document.documentElement.clientWidth,
      raus: document.documentElement.scrollWidth - document.documentElement.clientWidth, gespeichert: localStorage.getItem("ukt_schrift") }));
  };
  const gross = await waehle("^Groß");
  const sehrKlein = await waehle("^Sehr klein");
  const klein = await waehle("^Klein");
  await a.seite.reload({ waitUntil: "load" }); await a.seite.waitForTimeout(1500);
  const nachLaden = await a.seite.evaluate(() => document.querySelector('meta[name="viewport"]').content);
  const fein = await a.seite.evaluate(async () => {
    const w = (ms) => new Promise((f) => setTimeout(f, ms));
    document.querySelector(".tab-menue").click(); await w(150);
    [...document.querySelectorAll("#reiter_menue button")].find((b) => /Schriftgröße/.test(b.textContent)).click(); await w(200);
    const d = [...document.querySelectorAll(".assistent")].pop();
    d.querySelector('[data-schriftfein="-5"]').click(); await w(300);
    const r = { prozent: d.querySelector("[data-schriftprozent]").textContent, vp: document.querySelector('meta[name="viewport"]').content,
      offen: document.body.contains(d), gewaehlt: d.querySelectorAll('[data-schrift][aria-pressed="true"]').length };
    d.querySelector('[data-schriftfein="5"]').click(); await w(300);
    r.zurueck = d.querySelector('[data-schrift="klein"]').getAttribute("aria-pressed");
    d.querySelector(".x, [data-zu], button[aria-label='Schließen']")?.click(); await w(200);
    return r;
  });
  pruefe(fein.prozent === "80 %" && /width=488, initial-scale=0\.8/.test(fein.vp) && fein.offen && fein.gewaehlt === 0 && fein.zurueck === "true", "Feineinstellung: " + JSON.stringify(fein));
  /* ganz klein: Seite breiter als 700 px – „Aa“ oben bleibt sichtbar und führt zurück */
  await a.seite.evaluate(() => localStorage.setItem("ukt_schrift", "0.5"));
  await a.seite.setViewportSize({ width: 430, height: 900 });
  await a.seite.reload({ waitUntil: "load" }); await a.seite.waitForTimeout(1500);
  const aa = await a.seite.evaluate(async () => {
    const w = (ms) => new Promise((f) => setTimeout(f, ms));
    const b = document.getElementById("schriftbtn"), r = b.getBoundingClientRect();
    const sichtbar = !b.hidden && r.width > 0 && r.right <= document.documentElement.clientWidth + 1 && !b.closest("header");
    const breite = document.documentElement.clientWidth;
    b.click(); await w(250);
    const d = [...document.querySelectorAll(".assistent")].pop();
    if (!d) return { sichtbar, breite, fehlt: "kein Fenster", vp: "" };
    const n = [...d.querySelectorAll("[data-schrift]")].find((x) => /^Normal/.test(x.textContent));
    if (!n) return { sichtbar, breite, fehlt: d.textContent.slice(0, 200), vp: "" };
    n.click(); await w(400);
    return { sichtbar, breite, vp: document.querySelector('meta[name="viewport"]').content };
  });
  pruefe(aa.sichtbar && aa.breite > 700 && /width=device-width/.test(aa.vp), "Aa Schriftgröße (unten, nicht im Kopf) bei ganz klein: " + JSON.stringify(aa));
  const normal = await waehle("^(✓ )?Normal");
  pruefe(/width=520, initial-scale=0\.75/.test(sehrKlein.vp) && Math.abs(sehrKlein.breite - 520) <= 2 && sehrKlein.raus <= 2, "Sehr klein: " + JSON.stringify(sehrKlein));
  pruefe(/width=339, initial-scale=1\.15/.test(gross.vp) && Math.abs(gross.breite - 339) <= 2 && gross.raus <= 2, "Groß: " + JSON.stringify(gross));
  pruefe(/width=459, initial-scale=0\.85/.test(klein.vp) && Math.abs(klein.breite - 459) <= 2 && klein.raus <= 2, "Klein: " + JSON.stringify(klein));
  pruefe(/width=459/.test(nachLaden), "nach dem Neuladen nicht gemerkt: " + nachLaden);
  pruefe(/width=device-width, initial-scale=1/.test(normal.vp) && normal.gespeichert === '"normal"', "Normal: " + JSON.stringify(normal));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  const b = await oeffnen(KONTEN.techniker);
  const pc = await b.seite.evaluate(async () => {
    const w = (ms) => new Promise((f) => setTimeout(f, ms));
    document.querySelector(".tab-menue").click(); await w(150);
    [...document.querySelectorAll("#reiter_menue button")].find((x) => /Schriftgröße/.test(x.textContent)).click(); await w(200);
    const d = [...document.querySelectorAll(".assistent")].pop(); return { text: d.textContent, knoepfe: d.querySelectorAll("[data-schrift]").length };
  });
  pruefe(/Strg und \+/.test(pc.text) && pc.knoepfe === 0, "PC: " + JSON.stringify(pc));
  await b.zu();
});

const AN_HILFEN = `window.__an = {
  warte: (ms) => new Promise((f) => setTimeout(f, ms)),
  bis: async (f, max = 4000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = f(); } catch (e) {} if (v || Date.now() - t0 > max) return v; await window.__an.warte(30); } },
  dlg: () => [...document.querySelectorAll(".assistent")].pop(),
  knopf: (wo, re) => [...(wo || document).querySelectorAll("button")].find((b) => re.test(b.textContent.trim())),
  karte: (re) => [...document.querySelectorAll(".card")].find((c) => { const h = c.querySelector("h2"); return h && re.test(h.textContent); }),
  toastSpion: () => { window.__toasts = []; window.__t.x("(function(){ if(window.__toastSpion) return 1; window.__toastSpion=1; var alt=toast; toast=function(m){ window.__toasts.push(String(m)); return alt.apply(this, arguments); }; return 1; })()"); },
  unterschreiben: (cv) => { const r = cv.getBoundingClientRect(), ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1 }));
    ev("pointerdown", 20, 40); for (let i = 1; i < 12; i++) ev("pointermove", 20 + i * 15, 40 + (i % 2) * 20); ev("pointerup", 200, 40); },
  anmelden: async (mail, rolle) => {
    const x = window.__t.x;
    await x("Store.sb.auth.signOut()"); await window.__an.warte(300);
    await x("Store.sb.auth.signInWithPassword({email:'" + mail + "',password:'test123'})");
    for (let i = 0; i < 80 && !x("Rolle.da && Rolle.name==='" + rolle + "'"); i++) await window.__an.warte(100);
    await window.__an.warte(300);
  },
  daten: () => {
    const db = window.__db.tabellen, jetzt = new Date().toISOString();
    db.projekte.push({ id: "pan1", nummer: "P-TEST-AN", titel: "Arbeitsnachweis: Umbau Klima Testfiliale", kunde_id: "lidl", standort_id: "TS1", status: "baustelle",
      daten: { termine: [{ id: "tan1", datum: "2026-09-16", zeit: "08:00", was: "Abnahme mit Bauleitung", wer: "Testtechniker" }] }, verlauf: [], erstellt: jetzt, geaendert: jetzt });
    const az = (id, u, name, datum, b, e, min) => ({ id, user_id: u, name, datum, beginn: b, ende: e, pause_min: 30, minuten: min, art: "arbeit", bereich: "baustelle", projekt_id: "pan1", quelle: "hand", notiz: "geheime Notiz " + id, erstellt: jetzt });
    db.arbeitszeiten.push(az("azn1", "u_tech_test_at", "Testtechniker", "2026-09-12", "15:00", "23:30", 480), az("azn2", "u_admin_test_at", "Testadmin", "2026-09-12", "15:00", "23:30", 480),
      az("azn3", "u_tech_test_at", "Testtechniker", "2026-09-14", "07:00", "15:30", 480));
    db.planung.push({ id: "plan_an1", art: "termin", kategorie: "baustelle", titel: "Inbetriebnahme VRV", datum: "2026-09-15", beginn: "07:00", ende: "12:00", wer: ["u_tech_test_at"], wer_namen: ["Testtechniker"],
      projekt_id: "pan1", erstellt_von: "u_inhaber_test_at", erstellt: jetzt });
    db.planung.push({ id: "plan_an2", art: "aufgabe", titel: "3 × CVP außer Betrieb nehmen, demontieren, entsorgen", projekt_id: "pan1", status: "erledigt", wer: ["u_tech_test_at"], wer_namen: ["Testtechniker"], erstellt_von: "u_inhaber_test_at", erstellt: jetzt });
  },
}; 1`;
test("Arbeitsnachweis: Monteur erstellt aus Stunden und Kalender, unterschreibt unter eigenem Namen, PDF im Projekt; Rechnung übernimmt die Stunden mit passender Menge", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await a.seite.evaluate((h) => eval(h), AN_HILFEN);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, A = window.__an, e = {};
    A.toastSpion(); A.daten();
    await x("Promise.all([projekteLaden(), planungLaden()])");
    /* Rechte: Techniker liest in den Stunden nur die eigenen – für den Arbeitsnachweis (projekt_stunden) alle des Projekts, ohne Notiz */
    e.eigeneStunden = ((await x("Store.sb.from('arbeitszeiten').select('*').eq('projekt_id','pan1')")).data || []).length;
    const st = await x("anStundenLaden(PROJEKTE.filter(function(p){ return p.id==='pan1'; })[0])");
    e.projektStunden = st.l.length; e.mitNotiz = st.l.some((z) => "notiz" in z); e.stEigene = st.eigene;
    window.__ohneProjektStunden = true;
    const st2 = await x("anStundenLaden(PROJEKTE.filter(function(p){ return p.id==='pan1'; })[0])");
    e.ohneFunktion = st2.l.length + "/" + st2.eigene; window.__ohneProjektStunden = false;
    /* im Projekt: „+ Arbeitsnachweis“ – geführt Schritt für Schritt */
    x("projektAnsicht('pan1')");
    const karte = await A.bis(() => A.karte(/^Arbeitsnachweise/));
    e.karte = !!karte;
    karte.querySelector("[data-an-neu]").click();
    let d = await A.bis(() => { const d = A.dlg(); return d && /Neuer Arbeitsnachweis/.test(d.querySelector(".as-titel").textContent) && d; });
    e.auftraggeber = d.querySelector('[data-k="auftraggeber"]').value;
    A.knopf(d, /^Weiter: Stunden/).click();
    await A.bis(() => d.querySelectorAll(".an-zeile").length >= 3 && /Testadmin/.test(d.textContent));
    e.zeilen = [...d.querySelectorAll(".an-zeile")].map((z) => z.querySelector('[data-z="datum"]').value + "|" + z.querySelector('[data-z="personen"]').value + "|" + z.querySelector("[data-std]").textContent);
    e.vorschlagFremd = /Testadmin/.test(d.textContent) && /noch in keinem Nachweis/.test(d.textContent);
    A.knopf(d, /^Weiter: Arbeiten/).click(); await A.warte(100);
    const ub = A.knopf(d, /^\+ 3 × CVP/); e.aufgabeVorschlag = !!ub; if (ub) ub.click();
    const ta = d.querySelector('[data-t="arbeiten"]'); ta.value += "\n3 × VRV montieren, Verrohrung, Inbetriebnahme\n11 × Blenden tauschen"; ta.dispatchEvent(new Event("input"));
    A.knopf(d, /^ja$/).click();
    A.knopf(d, /^Weiter: Material/).click(); await A.warte(50);
    /* Materialaufwand als Liste: Menge, Einheit, Bezeichnung – leere Zeile fällt beim Speichern weg */
    for (const [m, eh, t] of [["12,5", "m", "Kupferrohr 12 mm"], ["3", "Stk", "Wandkonsole"]]) {
      A.knopf(d, /^\+ Material$/).click(); await A.warte(30);
      const zz = [...d.querySelectorAll(".an-mat")].pop(), s2 = (k, v) => { const i = zz.querySelector('[data-m="' + k + '"]'); i.value = v; i.dispatchEvent(new Event("input")); };
      s2("menge", m); s2("eh", eh); s2("text", t);
    }
    A.knopf(d, /^\+ Material$/).click(); await A.warte(30);
    e.matZeilen = d.querySelectorAll(".an-mat").length;
    /* Rapportberichte: PDF wählen und ein Bild aus der Zwischenablage einfügen – beides zu den Projektdateien, hinten ans PDF */
    A.knopf(d, /^Weiter: Rapporte und Fotos/).click(); await A.warte(50);
    const rpdf = await (async () => { const L = await x("(window.PDFLib ? Promise.resolve() : ladeSkript(PDF_LIB)).then(function(){ return window.PDFLib; })");
      const doc = await L.PDFDocument.create(); doc.addPage(); doc.addPage(); return new File([await doc.save()], "Regiebericht_Firma_X.pdf", { type: "application/pdf" }); })();
    const dtA = new DataTransfer(); dtA.items.add(rpdf);
    const inp = d.querySelector("[data-datei]"); inp.files = dtA.files; inp.dispatchEvent(new Event("change"));
    await A.bis(() => d.querySelectorAll("[data-anhang]").length === 1);
    const cv0 = document.createElement("canvas"); cv0.width = 60; cv0.height = 40; cv0.getContext("2d").fillRect(5, 5, 20, 20);
    const png = await new Promise((ok) => cv0.toBlob((b) => ok(new File([b], "image.png", { type: "image/png" })), "image/png"));
    const dtB = new DataTransfer(); dtB.items.add(png);
    d.querySelector("[data-einfuegen]").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dtB, bubbles: true, cancelable: true }));
    await A.bis(() => d.querySelectorAll("[data-anhang]").length === 2);
    e.rapporte = [...d.querySelectorAll("[data-anhang]")].map((z) => z.querySelector("[data-name]").textContent);
    /* Foto: verkleinert (JPEG), Vorschau, beschriften, in der App ansehen */
    const fz = d.querySelectorAll("[data-anhang]")[1];
    await A.bis(() => /^blob:|^https:/.test(fz.querySelector("[data-vorschau] img").getAttribute("src") || ""));
    e.vorschau = !!fz.querySelector("[data-vorschau] img").getAttribute("src");
    const no = fz.querySelector("[data-notiz]"); no.value = "Außeneinheit nach der Montage"; no.dispatchEvent(new Event("input"));
    fz.querySelector("[data-ansehen]").click();
    const bildDlg = await A.bis(() => { const q = A.dlg(); return q && q !== d && q.querySelector("img") && q; });
    e.ansehen = !!bildDlg; if (bildDlg) bildDlg.querySelector('[data-a="zu"]').click(); await A.warte(100);
    A.knopf(d, /^Weiter: Abschluss/).click(); await A.warte(50);
    e.rapportZusammen = /2 Rapporte\/Fotos angehängt/.test(d.textContent);
    /* ohne Unterschrift geht „Unterschreiben“ nicht */
    A.knopf(d, /^Unterschreiben und abschließen/).click(); await A.warte(200);
    e.ohneSig = db.arbeitsnachweise.length + "|" + /Unterschrift/.test(window.__toasts.join(" "));
    e.monteurAnzeige = (d.textContent.match(/Verantwortlicher Monteur: ([^–]+)–/) || [])[1];
    A.unterschreiben(d.querySelector("[data-sig]")); await A.warte(50);
    A.knopf(d, /^Unterschreiben und abschließen/).click();
    await A.bis(() => db.arbeitsnachweise.length && db.arbeitsnachweise[0].pdf_pfad, 30000);
    const an = db.arbeitsnachweise[0] || {};
    e.an = { monteur: an.monteur, von: an.erstellt_von, unterschrieben: !!an.unterschrieben, sig: /^data:image\/png/.test(an.unterschrift || ""), nummer: an.nummer, pdf: an.pdf_pfad || "",
      summe: x("anSumme")(an), arbeiten: (an.daten || {}).arbeiten, beendet: (an.daten || {}).beendet };
    const pr = db.projekte.filter((p) => p.id === "pan1")[0];
    e.datei = ((pr.daten || {}).dateien || []).filter((f) => f.art === "protokoll" && /^Arbeitsnachweis_P-TEST-AN_Nr1/.test(f.name)).length;
    /* das PDF-Blatt: Kopf mit Logo und Firmenangaben, Zeilen mit Stunden, Feld für den Auftraggebervertreter */
    const blatt = x("anBlattHtml")(pr, an);
    { const L = window.PDFLib, mitA = await L.PDFDocument.load(await (await x("anPdfErzeugen")(pr, an)).arrayBuffer()),
        ohneA = await L.PDFDocument.load(await (await x("anPdfErzeugen")(pr, Object.assign({}, an, { daten: Object.assign({}, an.daten, { anhaenge: [] }) }))).arrayBuffer());
      e.rapportSeiten = mitA.getPageCount() - ohneA.getPageCount();
      e.fotoFehlt = window.__toasts.filter((t) => /nicht abrufbar|nicht lesbar/.test(t)); e.fotoBlatt = x("anFotosHtml")(an.daten, null); e.notiz = ((an.daten.anhaenge || [])[1] || {}).notiz || ""; e.rapportDb = ((an.daten || {}).anhaenge || []).map((q) => q.name + (q._url ? "+url" : "")).join("|");
      e.rapportDateien = ((pr.daten || {}).dateien || []).filter((f) => /^Regiebericht_Firma_X|^Bild_P-TEST-AN_/.test(f.name)).length; e.rapportBlatt = /Anlagen \(hinten angehängt\)/.test(blatt); }
    e.mat = JSON.stringify((an.daten || {}).materialListe); e.matBlatt = /<th[^>]*>Einheit<\/th>/.test(blatt) && /12,5/.test(blatt) && /Kupferrohr 12 mm/.test(blatt) && /Wandkonsole/.test(blatt);
    e.mann = [x("anMonteureText")({ monteure: "Darko", personen: 2 }), x("anMonteureText")({ monteure: "4 Mann", personen: 4 }), x("anMonteureText")({ monteure: "Huber, Maier", personen: 2 })].join("|") + "|" + />2 Mann</.test(blatt);
    e.blatt = /ARBEITSNACHWEIS/.test(blatt) && /logo\.png/.test(blatt) && /Speckbacherstraße 92/.test(blatt) && /16,00/.test(blatt) && /Auftraggebervertreter/.test(blatt);
    /* nochmals: schon Verwendetes wird nicht wieder vorgeschlagen */
    x("ansichtenSchliessen()"); x("anEditor")(pr, null, function () {});
    d = await A.bis(() => { const d = A.dlg(); return d && /Neuer Arbeitsnachweis/.test(d.querySelector(".as-titel").textContent) && d; });
    A.knopf(d, /^Weiter: Stunden/).click();
    await A.bis(() => /schon in einem Arbeitsnachweis/.test(d.textContent));
    e.zweiter = d.querySelectorAll(".an-zeile").length + "|" + /schon in einem Arbeitsnachweis/.test(d.textContent) + "|" + /Abnahme mit Bauleitung/.test(d.textContent);
    x("ansichtenSchliessen()");
    /* Datenbank: fremder Name wird zum eigenen, Unterschriebenes nur mit Grund, löschen nur der Inhaber */
    const sb = x("Store.sb");
    const ins = await sb.from("arbeitsnachweise").insert({ projekt_id: "pan1", nummer: 7, datum: "2026-09-20", monteur: "Testinhaber", erstellt_von: "u_inhaber_test_at", daten: { zeilen: [] } }).select("*");
    e.fremdName = ins.data && ins.data[0].monteur + "|" + ins.data[0].erstellt_von;
    const upd = await sb.from("arbeitsnachweise").update({ daten: { zeilen: [] } }).eq("id", an.id).select("*");
    e.ohneGrund = !!upd.error;
    const upd2 = await sb.from("arbeitsnachweise").update({ daten: Object.assign({}, an.daten, { material: "Kupferrohr" }), korrekturen: [{ zeit: new Date().toISOString(), von: "Testtechniker", grund: "Material nachgetragen" }] }).eq("id", an.id).select("*");
    e.mitGrund = !upd2.error && upd2.data[0].daten.material === "Kupferrohr" && upd2.data[0].unterschrift === an.unterschrift;
    const del = await sb.from("arbeitsnachweise").delete().eq("id", an.id).select("id");
    e.techLoescht = !del.error;
    /* Inhaber: unterschreibt keinen fremden Entwurf, schreibt die Rechnung mit den Stunden */
    await A.anmelden("inhaber@test.at", "inhaber");
    const sig2 = await sb.from("arbeitsnachweise").update({ unterschrift: "data:image/png;base64,AAAA" }).eq("id", ins.data[0].id).select("*");
    e.inhaberSigniertFremd = !sig2.error;
    db.katalog.push({ id: "kan1", text: "Regiestunden Facharbeiter (3 Mann a 10 Std)", eh: "Std", preis: 65, kunde_id: null, aktiv: true, quelle: "Test" },
      { id: "kan2", text: "Zuschlag 50 % Samstag", eh: "Std", preis: 32.5, kunde_id: null, aktiv: true, quelle: "Test" });
    await x("Promise.all([projekteLaden(), katalogLaden()])");
    const p2 = x("PROJEKTE").filter((p) => p.id === "pan1")[0];
    x("belegNeu")(x("kontextProjekt")(p2), "rechnung", null, function () {});
    d = await A.bis(() => { const d = A.dlg(); return d && d.querySelector("[data-an-std]") && d; });
    d.querySelector("[data-an-std]").click();
    const w = await A.bis(() => { const w = A.dlg(); return w !== d && /Stunden aus Arbeitsnachweisen/.test(w.querySelector(".as-titel").textContent) && w; });
    e.auswahl = w ? w.querySelectorAll("[data-id]:checked").length : -1;
    A.knopf(w, /^Positionen übernehmen/).click();
    await A.bis(() => d.querySelectorAll(".bpos").length >= 2);
    const n0 = db.belege.length; A.knopf(d, /^Speichern$/).click();
    await A.bis(() => db.belege.length > n0);
    const b = db.belege[db.belege.length - 1] || { positionen: [], kopf: {} };
    e.pos = b.positionen.filter((q) => q.typ === "pos").map((q) => ({ menge: q.menge, eh: q.eh, preis: q.preis, text: q.text, pruef: x("positionPruefen")(q) }));
    e.kopf = { anh: (b.kopf.anhaenge || []).length, ids: (b.kopf.arbeitsnachweise || []).length };
    x("ansichtenSchliessen()");
    /* Rechnungs-PDF mit dem Arbeitsnachweis hinten dran */
    const kx = x("kontextProjekt")(p2);
    const mit = await x("belegPdfErzeugen")(b, kx), ohne = await x("belegPdfErzeugen")(Object.assign({}, b, { kopf: Object.assign({}, b.kopf, { anhaenge: [] }) }), kx);
    e.pdfMit = mit.size > ohne.size + 2000;
    /* Kunde liest keine Arbeitsnachweise */
    await A.anmelden("kunde@test.at", "kunde");
    e.kundeLiest = ((await sb.from("arbeitsnachweise").select("*")).data || []).length;
    return e;
  });
  pruefe(r.eigeneStunden === 2, "Techniker liest fremde Stunden direkt: " + r.eigeneStunden);
  pruefe(r.projektStunden === 3 && !r.mitNotiz && !r.stEigene, "projekt_stunden: alle Projektstunden ohne Notiz erwartet: " + JSON.stringify(r));
  pruefe(r.ohneFunktion === "2/true", "Ohne Datenbank-Funktion nicht auf die eigenen zurück: " + r.ohneFunktion);
  pruefe(r.karte && r.auftraggeber === "Lidl", "Karte/Kopf: " + r.karte + " " + r.auftraggeber);
  pruefe(r.zeilen.length === 3 && r.zeilen[0] === "2026-09-12|2|16,00" && /^2026-09-15\|1\|5,00/.test(r.zeilen[2]), "Vorgeschlagene Zeilen: " + JSON.stringify(r.zeilen));
  pruefe(r.vorschlagFremd && r.aufgabeVorschlag, "Vorschläge ohne fremde Stunden bzw. ohne Aufgabe");
  pruefe(r.ohneSig === "0|true", "Ohne Unterschrift gespeichert: " + r.ohneSig);
  pruefe(r.an.monteur === "Testtechniker" && r.an.von === "u_tech_test_at" && r.an.unterschrieben && r.an.sig && r.an.nummer === 1, "Gespeichert: " + JSON.stringify(r.an));
  pruefe(r.an.summe === 29 && /CVP/.test(r.an.arbeiten) && /Blenden/.test(r.an.arbeiten) && r.an.beendet === true, "Inhalt: " + JSON.stringify(r.an));
  pruefe(r.an.pdf && r.datei === 1 && r.blatt, "PDF nicht als Projektdatei abgelegt bzw. Blatt unvollständig: " + JSON.stringify([r.an.pdf, r.datei, r.blatt]));
  pruefe(r.mann === "Darko + 1 weitere Person|4 Mann|Huber, Maier|true", "Monteure/Personen im PDF: " + r.mann);
  pruefe(r.matZeilen === 3 && r.mat === JSON.stringify([{ menge: 12.5, eh: "m", text: "Kupferrohr 12 mm" }, { menge: 3, eh: "Stk", text: "Wandkonsole" }]) && r.matBlatt,
    "Materialliste: " + JSON.stringify([r.matZeilen, r.mat, r.matBlatt]));
  pruefe(r.rapporte.length === 2 && r.rapporte[0] === "Regiebericht_Firma_X.pdf" && /^Bild_P-TEST-AN_\d{4}-\d\d-\d\d_2\.jpg$/.test(r.rapporte[1]) && r.rapportZusammen,
    "Rapportberichte wählen/einfügen: " + JSON.stringify([r.rapporte, r.rapportZusammen]));
  pruefe(!r.fotoFehlt.length, "Foto nicht ins PDF eingebettet: " + JSON.stringify(r.fotoFehlt));
  pruefe(r.vorschau && r.ansehen && r.notiz === "Außeneinheit nach der Montage" && /<h2>Fotos<\/h2><div class='fotos'><figure>/.test(r.fotoBlatt) && /Außeneinheit nach der Montage/.test(r.fotoBlatt),
    "Foto: Vorschau/ansehen/Beschriftung/Blatt: " + JSON.stringify([r.vorschau, r.ansehen, r.notiz, r.fotoBlatt]));
  pruefe(r.rapportSeiten >= 2 && r.rapportSeiten <= 3 && /^Regiebericht_Firma_X\.pdf\|Bild_P-TEST-AN_.*_2\.jpg$/.test(r.rapportDb) && r.rapportDateien === 2 && r.rapportBlatt,
    "Rapportberichte im PDF/in der Datenbank: " + JSON.stringify([r.rapportSeiten, r.rapportDb, r.rapportDateien, r.rapportBlatt]));
  pruefe(r.zweiter === "0|true|true", "Zweiter Nachweis schlägt Verwendetes wieder vor: " + r.zweiter);
  pruefe(r.fremdName === "Testtechniker|u_tech_test_at", "Fremder Name gespeichert: " + r.fremdName);
  pruefe(r.ohneGrund && r.mitGrund && !r.techLoescht, "Unterschriebenes geändert ohne Grund / löschen: " + JSON.stringify([r.ohneGrund, r.mitGrund, r.techLoescht]));
  pruefe(!r.inhaberSigniertFremd, "Inhaber hat einen fremden Entwurf unterschrieben");
  pruefe(r.auswahl === 1, "Auswahl der unterschriebenen Arbeitsnachweise: " + r.auswahl);
  const regie = r.pos.filter((q) => /^Regiestunden Facharbeiter/.test(q.text))[0] || {}, sa = r.pos.filter((q) => /^Zuschlag 50 % Samstag/.test(q.text))[0] || {};
  pruefe(regie.menge === 29 && regie.preis === 65 && regie.eh === "Std" && /\(29 Std\)/.test(regie.text) && !/3 Mann a 10/.test(regie.text), "Regiestunden: " + JSON.stringify(regie));
  pruefe(sa.menge === 16 && sa.preis === 32.5 && /\(2 Mann à 8 Std\)/.test(sa.text), "Zuschlag Samstag: " + JSON.stringify(sa));
  pruefe(r.pos.length === 2 && r.pos.every((q) => !q.pruef.length), "Positionsprüfung meldet: " + JSON.stringify(r.pos.map((q) => q.pruef)));
  pruefe(r.kopf.anh === 1 && r.kopf.ids === 1 && r.pdfMit, "PDF des Arbeitsnachweises nicht an der Rechnung: " + JSON.stringify([r.kopf, r.pdfMit]));
  pruefe(r.kundeLiest === 0, "Kunde liest Arbeitsnachweise");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Arbeitsnachweis: Präsentation füllt aus, speichert aber nichts; am Handy bedienbar", async () => {
  const a = await oeffnen(KONTEN.praesentation, { handy: true });
  await a.seite.evaluate((h) => eval(h), AN_HILFEN);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, db = window.__db.tabellen, A = window.__an, e = {};
    A.toastSpion();
    const p = { id: "pan9", nummer: "P-TEST-AN9", titel: "Arbeitsnachweis: Vorführung", kunde_id: "lidl", standort_id: "TS1", status: "baustelle", daten: {}, verlauf: [], geaendert: new Date().toISOString() };
    x("PROJEKTE").push(p);
    x("anEditor")(p, null, function () {});
    const d = await A.bis(() => A.dlg());
    A.knopf(d, /^Weiter: Stunden/).click(); await A.warte(200);
    A.knopf(d, /^\+ Zeile$/).click(); await A.warte(50);
    const z = d.querySelector(".an-zeile");
    const setz = (k, v) => { const i = z.querySelector('[data-z="' + k + '"]'); i.value = v; i.dispatchEvent(new Event("input")); };
    setz("monteure", "4 Mann"); setz("von", "15:00"); setz("bis", "23:30"); setz("pause", "0,5");
    e.std = z.querySelector("[data-std]").textContent;
    e.breiter = document.documentElement.scrollWidth - window.innerWidth;
    /* Materialliste und Rapporte/Fotos am Handy: nichts ragt über den Rand */
    const raus = () => [...d.querySelectorAll("*")].filter((q) => { const b = q.getBoundingClientRect(); return b.width && b.right > window.innerWidth + 1; }).map((q) => q.tagName + "." + q.className);
    A.knopf(d, /^Weiter: Arbeiten/).click(); await A.warte(50);
    A.knopf(d, /^Weiter: Material/).click(); await A.warte(50);
    A.knopf(d, /^\+ Material$/).click(); await A.warte(50);
    e.matRaus = raus();
    A.knopf(d, /^Weiter: Rapporte und Fotos/).click(); await A.warte(50);
    e.rapRaus = raus();
    A.knopf(d, /^Als Entwurf speichern/).click(); await A.warte(300);
    e.db = db.arbeitsnachweise.length; e.toast = window.__toasts.join(" | "); e.abgelehnt = window.__abgelehnt.length;
    return e;
  });
  pruefe(r.std === "32,00", "4 Mann 15:00–23:30, Pause 0,5 ergibt nicht 32,00 h: " + r.std);
  pruefe(r.db === 0 && /Präsentation/.test(r.toast), "Präsentation hat gespeichert bzw. keine Meldung: " + JSON.stringify(r));
  pruefe(r.breiter <= 4, "Handy: Seite " + r.breiter + "px breiter als der Bildschirm");
  pruefe(!r.matRaus.length && !r.rapRaus.length, "Handy: Material/Rapporte ragen über den Rand " + JSON.stringify([r.matRaus.slice(0, 4), r.rapRaus.slice(0, 4)]));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Kältekreise: HJW ab 30 kg je Kältekreis – 3 Kreise je unter 30 kg → HJI, 1 Kreis ab 30 kg → HJW, ohne Kreise wie bisher", async () => {
  const a = await oeffnen(KONTEN.admin, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), e = {};
    /* zentrale Hilfe: maßgeblich ist der größte Kreis (erfundenes Beispiel 20,5 / 19 / 18 = 57,5 kg) */
    const hk = x("hjwKg");
    e.hk = [hk({ kreislaeufe: 3, kgKreise: [20.5, 19, 18], kaeltemittelKg: 57.5 }), hk({ kreislaeufe: 1, kgKreise: [35], kaeltemittelKg: 35 }),
      hk({ kaeltemittelKg: 57.5 }), hk({ kreislaeufe: 3, kgKreise: [20.5, 19], kaeltemittelKg: 75 })];
    e.lesen = JSON.stringify(x("kgKreiseLesen")("20,5 / 19 / 18"));
    /* Nachbessern: Anlage TS1 (TP1 JW + TP2 HJI), zusammen 57,5 kg */
    const befund = () => { x("indexNeuAufbauen(); 1"); return x("auffaelligkeiten(byId.TS1).fehler").filter((t) => /ab 30 kg/.test(t)).length + "/" + x("anlagenOhneHJW(byId.TS1).length"); };
    x("posById.TP1.kaeltemittelKg=57.5; posById.TP2.kaeltemittelKg=57.5; posById.TP1.ueber30kg=true; posById.TP2.ueber30kg=true; 1");
    e.ohneKreise = befund();
    x("posById.TP1.kreislaeufe=3; posById.TP1.kgKreise=[20.5,19,18]; 1");
    e.dreiKreise = befund();
    x("posById.TP1.kreislaeufe=1; posById.TP1.kgKreise=[57.5]; 1");
    e.einKreis = befund();
    x("posById.TP1.kreislaeufe=3; posById.TP1.kgKreise=[20.5,19,18]; 1"); befund();
    /* Anlagenbuch und Anlagendaten zeigen die Kreise */
    e.buch = /20,5 \/ 19 \/ 18 kg/.test(x("anlagenbuchHtml")(x("posById.TP1")));
    e.kurz = x("anlageKurz")(x("anlageDaten")(x("posById.TP1")));
    /* Standardregel im Termine-Schritt: 3 Kreise → HJI; ohne Kreise (57,5 kg gesamt) → HJW; 1 Kreis 35 kg → HJW */
    const regel = async (an) => {
      const box = document.createElement("div"); document.body.appendChild(box);
      an = Object.assign({ inbetriebnahme: "2020-03-15", _termine: [{ id: "X1", intervallCode: "JW", monat: 3 }, { id: "X2", intervallCode: "", monat: 9 }] }, an);
      x("termineSchritt")(box, an); box.querySelector("[data-regelall]").click(); await w(150);
      const ergebnis = an._termine.map((t) => t.intervallCode).join(","); box.remove(); return ergebnis;
    };
    e.regel = [await regel({ kaeltemittelKg: 57.5, kgKreise: [20.5, 19, 18], kreislaeufe: 3 }), await regel({ kaeltemittelKg: 57.5 }),
      await regel({ kaeltemittelKg: 35, kgKreise: [35], kreislaeufe: 1 })];
    /* KI-Prüfbuch: Füllgewicht je Kältekreislauf → kgKreise, Summe als Gesamtfüllmenge, wenn sie fehlt */
    const ki = x("kiAnlage")({ kgKreise: ["20,5", "19", "18"] });
    e.ki = JSON.stringify([ki.kgKreise, ki.kaeltemittelKg, ki.kreislaeufe]);
    /* Anlagendialog am Handy: je Kreis ein Feld (Anzahl aus „Kältekreisläufe“), Hinweis zum größten Kreis */
    x("posById.TP1.kgKreise=null; 1"); befund();
    x("anlageDatenErgaenzen")(x("posById.TP1"), null, "kgKreise"); await w(300);
    const ov = document.querySelector(".assistent");
    const felder = ov ? [...ov.querySelectorAll("[data-kreis]")] : [];
    e.felder = felder.length;
    ["20,5", "19", "18"].forEach((v, i) => { if (felder[i]) { felder[i].value = v; felder[i].dispatchEvent(new Event("input", { bubbles: true })); } });
    e.hinweis = ov ? (ov.querySelector('[data-hinweis="kgKreise"]') || {}).textContent || "" : "";
    e.breiter = document.documentElement.scrollWidth - window.innerWidth;
    return e;
  });
  pruefe(JSON.stringify(r.hk) === "[20.5,35,57.5,35.5]", "hjwKg falsch (größter Kreis / 1 Kreis / ohne Kreise / Rest der Gesamtfüllmenge): " + JSON.stringify(r.hk));
  pruefe(r.lesen === "[20.5,19,18]", "„20,5 / 19 / 18“ nicht gelesen: " + r.lesen);
  pruefe(r.ohneKreise === "1/1", "ohne Kreise (57,5 kg gesamt, nur HJI) kein Nachbessern-Befund wie bisher: " + r.ohneKreise);
  pruefe(r.dreiKreise === "0/0", "3 Kreise je unter 30 kg: trotzdem „ab 30 kg aber keine HJW“: " + r.dreiKreise);
  pruefe(r.einKreis === "1/1", "1 Kreis ab 30 kg ohne HJW: kein Befund: " + r.einKreis);
  pruefe(r.buch && /je Kreis 20,5 \/ 19 \/ 18 kg/.test(r.kurz), "Kreise nicht im Anlagenbuch bzw. in den Anlagendaten: " + JSON.stringify([r.buch, r.kurz]));
  pruefe(JSON.stringify(r.regel) === '["JW,HJI","JW,HJW","JW,HJW"]', "Standardregel: " + JSON.stringify(r.regel));
  pruefe(r.ki === "[[20.5,19,18],57.5,3]", "KI-Prüfbuch Kreise: " + r.ki);
  pruefe(r.felder === 3 && /Größter Kreis 20,5 kg → Halbjahresinspektion \(HJI\)/.test(r.hinweis), "Anlagendialog: Felder je Kreis / Hinweis: " + JSON.stringify([r.felder, r.hinweis]));
  pruefe(r.breiter <= 4, "Handy: Seite " + r.breiter + "px breiter als der Bildschirm");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Karte bleibt erhalten: Reiter weg und zurück, Neuzeichnen – geladene Kacheln und Ausschnitt bleiben, Zeichen neu, neue Auswahl richtet neu aus", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), e = {};
    x("S.view='karte'; render()"); await w(1500);
    const host = document.getElementById("osmkarte");
    if (!host || !host.classList.contains("leaflet-container")) return { keineKarte: true, modus: x("KARTE_MODUS") };
    const k = x("leafletKarte");
    k.setView([48.2, 16.37], 12, { animate: false }); await w(300);
    e.punkte1 = document.querySelectorAll("#osmkarte path.leaflet-interactive").length;
    x("S.view='faellig'; render()"); await w(400);
    x("S.view='karte'; render()"); await w(50);
    const host2 = document.getElementById("osmkarte");
    e.gleich = host2 === host && x("leafletKarte") === k;
    e.kachelnSofort = host2.querySelectorAll(".leaflet-tile").length;
    await w(500);
    const c = x("leafletKarte").getCenter();
    e.ausschnitt = [Math.round(c.lat * 10) / 10, Math.round(c.lng * 100) / 100, x("leafletKarte").getZoom()];
    e.punkte2 = document.querySelectorAll("#osmkarte path.leaflet-interactive").length;
    e.ebenen = 0; x("leafletKarte").eachLayer(() => e.ebenen++);
    x("render()"); await w(700);
    let n = 0; x("leafletKarte").eachLayer(() => n++); e.ebenenNachRender = n;
    e.punkte3 = document.querySelectorAll("#osmkarte path.leaflet-interactive").length;
    /* neue Auswahl (Region): neu ausgerichtet */
    x("S.region='Laakirchen'; render()"); await w(700);
    e.zoomNeu = x("leafletKarte").getZoom() !== 12 || Math.abs(x("leafletKarte").getCenter().lng - 16.37) > 0.2;
    x("S.region='alle'; render()"); await w(300);
    return e;
  });
  pruefe(!r.keineKarte, "keine Straßenkarte im Test: " + JSON.stringify(r));
  pruefe(r.gleich && r.kachelnSofort > 0, "Karte neu aufgebaut statt behalten: " + JSON.stringify(r));
  pruefe(r.ausschnitt && r.ausschnitt[0] === 48.2 && r.ausschnitt[1] === 16.37 && r.ausschnitt[2] === 12, "Ausschnitt nicht behalten: " + JSON.stringify(r));
  pruefe(r.punkte1 > 0 && r.punkte2 === r.punkte1 && r.punkte3 === r.punkte1 && r.ebenenNachRender === r.ebenen, "Zeichen doppelt oder fehlen: " + JSON.stringify(r));
  pruefe(r.zoomNeu, "neue Auswahl nicht neu ausgerichtet: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Kartenbilder auf dem Gerät: angesehene Kacheln gespeichert, ohne Netz von dort gezeigt, Anzahl und Leeren mit Rückfrage", async () => {
  const a = await oeffnen(KONTEN.techniker, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), e = {};
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const echt = window.fetch; let netz = true; e.geholt = 0;
    window.fetch = (u, o) => /tile\.openstreetmap\.org/.test(String(u)) ? (e.geholt++, netz ? Promise.resolve(new Response(png, { status: 200, headers: { "Content-Type": "image/png" } })) : Promise.reject(new TypeError("offline"))) : echt(u, o);
    x("S.view='karte'; render()"); await w(2500);
    if (!document.querySelector("#osmkarte.leaflet-container")) return { keineKarte: true };
    e.zahl1 = await x("kachelZahl")();
    e.blob1 = [...document.querySelectorAll("#osmkarte .leaflet-tile")].filter((i) => /^blob:/.test(i.src) || i.complete).length;
    /* ohne Netz, ganz neue Karte */
    netz = false; e.geholt = 0;
    x("leafletKarte.remove(); leafletKarte=null; render()"); await w(2500);
    const kacheln = [...document.querySelectorAll("#osmkarte .leaflet-tile")];
    e.kacheln = kacheln.length;
    e.ausSpeicher = kacheln.filter((i) => i.classList.contains("leaflet-tile-loaded")).length;
    e.info = (document.querySelector("[data-kachelinfo]") || {}).textContent || "";
    const echtC = window.confirm; e.fragen = 0; window.confirm = () => { e.fragen++; return true; };
    document.querySelector("[data-kachelleeren]").click(); await w(600); window.confirm = echtC;
    e.zahlNachLeeren = await x("kachelZahl")();
    e.infoNach = (document.querySelector("[data-kachelinfo]") || {}).textContent || "";
    window.fetch = echt;
    return e;
  });
  pruefe(!r.keineKarte, "keine Straßenkarte im Test: " + JSON.stringify(r));
  pruefe(r.zahl1 > 0, "keine Kartenbilder gespeichert: " + JSON.stringify(r));
  pruefe(r.kacheln > 0 && r.ausSpeicher >= Math.min(r.kacheln, r.zahl1) * 0.8, "ohne Netz nicht aus dem Speicher gezeigt: " + JSON.stringify(r));
  pruefe(/Kartenbilder auf diesem Gerät gespeichert/.test(r.info) && r.fragen === 1 && r.zahlNachLeeren === 0 && /werden auf diesem Gerät gespeichert/.test(r.infoNach), "Anzahl/Leeren: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Karte: „📍 Mein Standort“ zeigt die eigene Position (nur auf dem Gerät, nichts gespeichert)", async () => {
  const a = await oeffnen(KONTEN.techniker);
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms));
    navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: { latitude: 48.21, longitude: 16.37, accuracy: 25 } }), 50);
    const vorher = JSON.stringify(window.__db.tabellen);
    x("S.view='karte'; render()"); await w(800);
    const k = document.getElementById("karteich");
    if (!k) return { knopf: false, leaflet: typeof window.L };
    k.click(); await w(600);
    const ort = x("S.meinOrt");
    /* eigenes Zeichen in eigener Farbe – nicht wie ein Markt (Inhaber 06.10.2026) */
    const ich = document.querySelector("[data-ich] i"), farbeIch = ich ? getComputedStyle(ich).backgroundColor : "";
    const maerkte = [...document.querySelectorAll("path.leaflet-interactive")].filter((p) => p.getAttribute("fill-opacity") !== "0.1").map((p) => p.getAttribute("fill")).filter(Boolean);
    const ichSchild = !!document.querySelector("[data-ich] em") && /Ich/.test(document.querySelector("[data-ich] em").textContent);
    return { knopf: true, ort, text: k.textContent, farbeIch, maerkte: [...new Set(maerkte)], ichSchild, gespeichert: /48.21|16.37/.test(JSON.stringify(window.__db.tabellen)) && !/48.21|16.37/.test(vorher), ls: Object.keys(localStorage).filter((s) => /ort|standort|gps/i.test(s)) };
  });
  pruefe(r.knopf, "kein Knopf „Mein Standort“ auf der Karte: " + JSON.stringify(r));
  pruefe(r.ort && Math.abs(r.ort.lat - 48.21) < 1e-6 && /Mein Standort/.test(r.text), "Position nicht übernommen: " + JSON.stringify(r));
  pruefe(r.farbeIch === "rgb(26, 109, 255)" && r.ichSchild && !r.maerkte.some((c) => /1a6dff|26, 109, 255/i.test(c)), "Eigener Standort nicht eigenständig sichtbar: " + JSON.stringify([r.farbeIch, r.ichSchild, r.maerkte]));
  pruefe(!r.gespeichert && !r.ls.length, "Position wurde gespeichert: " + JSON.stringify(r));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
});

test("Zugänge: mehrere Benutzer je Regelung – anlegen, entfernen mit Rückfrage, speichern, neu laden; Verlauf ohne Werte; Kunde/Präsentation sehen nichts; altes Paar bleibt", async () => {
  const a = await oeffnen(KONTEN.admin, { handy: true });
  const r = await a.seite.evaluate(async () => {
    const x = window.__t.x, w = (ms) => new Promise((f) => setTimeout(f, ms)), e = {};
    /* erfundene Anlage TP1 mit Fernzugriff und dem bisherigen einzelnen Paar */
    x("posById.TP1.regelung='Testregler'; posById.TP1.fernzugriff='ja'; posById.TP1.zugangLink='10.0.0.9'; posById.TP1.zugangBenutzer='erster-test'; posById.TP1.zugangPasswort='Alt-Pw-111'; 1");
    e.geheim = x("GEHEIME_FELDER").indexOf("zugangWeitere") >= 0;
    x("anlageDatenErgaenzen")(x("posById.TP1"), null, "zugangWeitere"); await w(300);
    const ov = () => [...document.querySelectorAll(".assistent")].pop();
    const tippe = (i, v) => { i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
    e.altDa = (ov().querySelector('[data-in="zugangBenutzer"]') || {}).value;
    const dazu = () => ov().querySelector("[data-zwdazu]");
    e.knopf = dazu() ? dazu().textContent : "";
    const fuelle = (n, werte) => Object.keys(werte).forEach((k) => tippe(ov().querySelector('[data-zw="' + n + "|" + k + '"]'), werte[k]));
    dazu().click(); await w(50); fuelle(0, { bez: "Service", benutzer: "svc-test", passwort: "Weit-Pw-222" });
    dazu().click(); await w(50); fuelle(1, { bez: "Installateur", benutzer: "inst-test", passwort: "Weit-Pw-333", link: "10.0.0.10" });
    dazu().click(); await w(50); fuelle(2, { bez: "Wegdamit", benutzer: "weg-test" });
    const echt = window.confirm; e.fragen = 0; window.confirm = () => { e.fragen++; return true; };
    ov().querySelector('[data-zwweg="2"]').click(); await w(50); window.confirm = echt;
    e.zeilen = ov().querySelectorAll("[data-zwzeile]").length;
    [...ov().querySelectorAll(".as-fuss button")].find((b) => /Übersicht/.test(b.textContent)).click(); await w(100);
    const ueb = ov().querySelector(".as-inhalt").innerText;
    e.uebersicht = /Service: svc-test/.test(ueb) && /Installateur: inst-test/.test(ueb);
    e.uebersichtPw = /Weit-Pw-/.test(ueb);
    [...ov().querySelectorAll(".as-fuss button")].find((b) => /Übernehmen/.test(b.textContent)).click(); await w(1200);
    const zeile = (window.__db.tabellen.stammdaten || []).find((z) => z.id === "position:TP1") || {};
    e.db = JSON.stringify((zeile.felder || {}).zugangWeitere || null);
    e.dbAlt = [(zeile.felder || {}).zugangBenutzer, (zeile.felder || {}).zugangPasswort];
    const verlauf = JSON.stringify(window.__db.tabellen.aenderungen || []);
    e.verlaufDa = /Weitere Benutzer/.test(verlauf);
    e.verlaufWerte = ["Weit-Pw-222", "Weit-Pw-333", "svc-test", "inst-test", "Alt-Pw-111", "weg-test"].filter((s) => verlauf.indexOf(s) >= 0);
    /* neu laden: die Liste kommt wieder, das alte Paar bleibt */
    await x("ladeStammdaten()"); await w(200);
    const d = x("anlageDaten")(x("posById.TP1"));
    e.geladen = [(d.zugangWeitere || []).map((z) => z.bez).join(","), d.zugangBenutzer, d.zugangPasswort];
    /* Anzeige in den Anlagendaten: je Zugang mit Bezeichnung, Passwort verdeckt, aufdeckbar */
    const box = x("zugangBox")(d); document.body.appendChild(box);
    e.anzeige = [box.querySelectorAll("[data-zugang]").length, /Service/.test(box.innerText) && /Installateur/.test(box.innerText), /Weit-Pw-/.test(box.innerText)];
    box.querySelector('[data-zugang="1"] [data-zeigen]').click();
    e.aufgedeckt = /Weit-Pw-222/.test(box.innerText) && !/Weit-Pw-333/.test(box.innerText);
    box.remove();
    /* nie im Anlagenbuch, nie in der Sicht für Kunde/Präsentation */
    e.buch = /Weit-Pw-|svc-test/.test(x("anlagenbuchHtml")(x("posById.TP1")));
    const sicht = await window.__t.x("Store.sb.from('stammdaten_lesen').select('*')");
    e.sicht = JSON.stringify(sicht.data || []).indexOf("Weit-Pw-") >= 0;
    e.verlaufWert = x("verlaufWert")({ k: "zugangWeitere" }, [{ passwort: "Weit-Pw-222" }]);
    /* Verwaltung: Zeilen da, Passwort verdeckt, bleiben beim Neuaufbau des Blocks */
    const ed = x("verwaltungEditor")(x("byId.TS1")); document.body.appendChild(ed); await w(200);
    const zl = ed.querySelector("[data-zwliste]");
    e.verw = zl ? [zl.querySelectorAll("[data-zwzeile]").length, (zl.querySelector('[data-zw="passwort"]') || {}).type, /object Object/.test(ed.innerHTML)] : null;
    if (zl) { zl.querySelector("[data-zwdazu]").click(); await w(50); }
    e.verwDazu = zl ? zl.querySelectorAll("[data-zwzeile]").length : 0;
    ed.remove();
    e.breiter = document.documentElement.scrollWidth - window.innerWidth;
    return e;
  });
  pruefe(r.geheim, "zugangWeitere gilt nicht als geheim");
  pruefe(r.altDa === "erster-test" && /\+ weiterer Benutzer/.test(r.knopf), "Dialog: altes Paar bzw. Knopf fehlt: " + JSON.stringify([r.altDa, r.knopf]));
  pruefe(r.zeilen === 2 && r.fragen === 1, "Entfernen: Zeilen " + r.zeilen + ", Rückfragen " + r.fragen);
  pruefe(r.uebersicht && !r.uebersichtPw, "Übersicht: " + JSON.stringify([r.uebersicht, r.uebersichtPw]));
  pruefe(/"bez":"Service".*"passwort":"Weit-Pw-222"/.test(r.db) && /"link":"10.0.0.10"/.test(r.db) && !/Wegdamit/.test(r.db), "nicht gespeichert: " + r.db);
  pruefe(!r.dbAlt[0] || r.dbAlt[0] === "erster-test", "altes Paar überschrieben: " + JSON.stringify(r.dbAlt));
  pruefe(r.verlaufDa && !r.verlaufWerte.length, "Verlauf: vermerkt " + r.verlaufDa + ", Werte darin: " + r.verlaufWerte.join(","));
  pruefe(JSON.stringify(r.geladen) === '["Service,Installateur","erster-test","Alt-Pw-111"]', "nach dem Laden: " + JSON.stringify(r.geladen));
  pruefe(JSON.stringify(r.anzeige) === "[3,true,false]" && r.aufgedeckt, "Anzeige: " + JSON.stringify([r.anzeige, r.aufgedeckt]));
  pruefe(!r.buch && !r.sicht && !/Weit-Pw/.test(r.verlaufWert), "geheim durchgesickert: " + JSON.stringify([r.buch, r.sicht, r.verlaufWert]));
  pruefe(r.verw && r.verw[0] === 2 && r.verw[1] === "password" && !r.verw[2] && r.verwDazu === 3, "Verwaltung: " + JSON.stringify([r.verw, r.verwDazu]));
  pruefe(r.breiter <= 4, "Handy: Seite " + r.breiter + "px breiter als der Bildschirm");
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  /* Kunde und Präsentation: das Feld wird ausgeblendet, keine Anzeige */
  for (const konto of [KONTEN.kunde, KONTEN.praesentation]) {
    const b = await oeffnen(konto);
    const k = await b.seite.evaluate(() => {
      const x = window.__t.x;
      return { box: x("zugangBox")({ fernzugriff: "ja", zugangWeitere: [{ bez: "S", benutzer: "u", passwort: "p" }] }) === null,
        aus: x("geheimesAusgeblendet()"), geheim: x("istGeheim")("zugangWeitere") };
    });
    pruefe(k.box && k.aus && k.geheim, konto + ": " + JSON.stringify(k));
    await b.zu();
  }
});

test("Tagesrückblick: nach jedem Ausstempeln – Grenze verschieben, teilen, „Passt so“, „Später“, ohne Netz sichtbar", async () => {
  const a = await oeffnen(KONTEN.techniker);
  await ttHilfen(a);
  const fehl = [];
  /* (1) ausgestempelt OHNE Kalendertermin, untertags richtig umgestempelt: der Rückblick kommt, „Passt so“ schreibt nichts und merkt den Tag */
  const r1 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    const um = (hm) => new Date(T + "T" + hm + ":00");
    db.stempel.push({ id: "trs1", user_id: tt.ich(), name: "T", art: "ein", zeit: um("07:00").toISOString(), bereich: "werkstatt" });
    db.stempel.push({ id: "trs2", user_id: tt.ich(), name: "T", art: "wechsel", zeit: um("10:00").toISOString(), bereich: "fahrt" });
    window.__stempelVersatz = um("13:00").getTime() - Date.now();
    x("stempelStand=0"); await x("stempelNachladen(true)"); await x("zeitenLaden()");
    await x("stempelDruecken('aus', {taetigkeit:'Material geholt'})"); window.__stempelVersatz = 0;
    await tt.warte(1700);
    const d = tt.dialog();
    if (!d) return { kein: true, toasts: tt.toasts };
    const titel = d.querySelector(".as-titel").textContent, abschnitte = [...d.querySelectorAll("[data-abschnitt]")].map((e) => e.dataset.abschnitt);
    const okText = tt.ok(d).textContent, vorher = JSON.stringify(db.arbeitszeiten);
    tt.ok(d).click(); await tt.warte(300);
    return { T, titel, abschnitte, okText, gleich: vorher === JSON.stringify(db.arbeitszeiten), offen: document.body.contains(d), geprueft: x("tagGeprueft('" + T + "')"), toast: tt.toasts.slice(-1)[0] || "" };
  });
  if (r1.kein || r1.titel !== "Tagesrückblick" || JSON.stringify(r1.abschnitte) !== '["07:00-10:00 werkstatt","10:00-13:00 fahrt"]' || !/Passt so/.test(r1.okText) || !r1.gleich || r1.offen || !r1.geprueft || !/geprüft/.test(r1.toast))
    fehl.push("(1) Rückblick nach dem Ausstempeln / Passt so: " + JSON.stringify(r1));
  /* (2) beim Tag „⇆ Tag prüfen“: Grenze ±15 und per Uhrzeit, Abschnitt teilen, Bereich ändern → lückenlos, Summe und Pause gleich */
  const r2 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "16:00", minuten: 510, pause_min: 30, bereich: "wartung" });
    await tt.termin({ kategorie: "wartung", titel: "Wartung Eins", datum: T, beginn: "08:00", ende: "10:00", standort_id: "TS1" });
    await tt.laden();
    x("S.view='stunden'; S.stWoche=montagVon('" + T + "'); render()"); await tt.warte(300);
    const knopf = [...document.querySelectorAll("button")].find((b) => /Tag prüfen/.test(b.textContent));
    if (!knopf) return { knopf: false };
    const knopfText = knopf.textContent; knopf.click(); await tt.warte(200);
    const abs = () => [...tt.dialog().querySelectorAll("[data-abschnitt]")], gr = () => [...tt.dialog().querySelectorAll("[data-grenze]")];
    const vorschlag = abs().map((e) => e.dataset.abschnitt);
    gr()[1].querySelector("[data-gp]").click(); gr()[1].querySelector("[data-gp]").click();
    const g0 = gr()[0].querySelector("input[data-g]"); g0.value = "07:45"; g0.dispatchEvent(new Event("change"));
    abs()[2].querySelector("[data-abteilen]").click(); [...document.querySelectorAll(".assistent [data-tok]")].pop().click();
    const sel = abs()[3].querySelector("select[data-abb]"); sel.value = "werkstatt"; sel.dispatchEvent(new Event("change"));
    const summe = tt.dialog().querySelector("[data-summe]").textContent, okText = tt.ok(tt.dialog()).textContent;
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    const l = db.arbeitszeiten.filter((z) => z.datum === T);
    x("render()"); await tt.warte(200);
    return { knopf: true, knopfText, vorschlag, summe, okText, teile: tt.teile(T), min: l.reduce((s, z) => s + z.minuten, 0), pause: l.reduce((s, z) => s + (z.pause_min || 0), 0),
      quellen: [...new Set(l.map((z) => z.quelle))].join(), hinweis: !![...document.querySelectorAll("button")].find((b) => /Tag prüfen/.test(b.textContent)) };
  });
  if (!r2.knopf || !/1 Termin/.test(r2.knopfText) || JSON.stringify(r2.vorschlag) !== '["07:00-08:00 fahrt","08:00-10:00 wartung","10:00-16:00 wartung"]')
    fehl.push("(2) Vorschlag / Knopf beim Tag: " + JSON.stringify(r2));
  else if (JSON.stringify(r2.teile) !== JSON.stringify(["07:00-07:45 fahrt - - 45", "07:45-10:30 wartung TS1 - 135", "10:30-13:15 wartung - - 165", "13:15-16:00 werkstatt - - 165"])
    || r2.min !== 510 || r2.pause !== 30 || r2.quellen !== "stempel_abgeglichen" || !/8:30/.test(r2.summe) || !/Speichern/.test(r2.okText) || r2.hinweis)
    fehl.push("(2) Grenze/teilen gespeichert: " + JSON.stringify(r2));
  /* (3) „Später“: nichts gespeichert, beim Tag bleibt „⇆ Tag prüfen“; entfernen gibt die Zeit dem Nachbarn */
  const r3 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "09:00", minuten: 120, bereich: "fahrt" });
    tt.gestempelt({ datum: T, beginn: "09:00", ende: "12:00", minuten: 180, bereich: "werkstatt" });
    await tt.laden(); const vorher = JSON.stringify(db.arbeitszeiten);
    x("abgleichDialog('" + T + "', true)"); await tt.warte(200);
    const d = tt.dialog(), sp = [...d.querySelectorAll(".as-fuss button")].find((b) => /Später/.test(b.textContent));
    d.querySelector("[data-abschnitt] [data-abweg]").click();
    const nachWeg = [...tt.dialog().querySelectorAll("[data-abschnitt]")].map((e) => e.dataset.abschnitt);
    [...tt.dialog().querySelectorAll(".as-fuss button")].find((b) => /Später/.test(b.textContent)).click(); await tt.warte(200);
    x("S.view='stunden'; S.stWoche=montagVon('" + T + "'); render()"); await tt.warte(300);
    return { spaeter: !!sp, nachWeg, gleich: vorher === JSON.stringify(db.arbeitszeiten), zu: !tt.dialog(), toast: tt.toasts.slice(-1)[0] || "",
      hinweis: !![...document.querySelectorAll("button")].find((b) => /Tag prüfen/.test(b.textContent)) };
  });
  if (!r3.spaeter || JSON.stringify(r3.nachWeg) !== '["07:00-12:00 werkstatt"]' || !r3.gleich || !r3.zu || !r3.hinweis || !/Tag prüfen/.test(r3.toast)) fehl.push("(3) Später / entfernen: " + JSON.stringify(r3));
  /* (4) keine Verbindung: sichtbare Meldung, Dialog bleibt, Knopf wieder frei, nichts geändert */
  const r4 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    await tt.laden(); const vorher = JSON.stringify(db.arbeitszeiten);
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    tt.dialog().querySelector("[data-abschnitt] [data-abteilen]").click(); [...document.querySelectorAll(".assistent [data-tok]")].pop().click();
    window.__netzWeg = "antwort"; const ok = tt.ok(tt.dialog()); ok.click(); await tt.warte(500); window.__netzWeg = false;
    const d = tt.dialog(), e = d && d.querySelector(".warnbox:not([hidden])");
    return { offen: !!d, meldung: e ? e.textContent : "", frei: !ok.disabled, gleich: vorher === JSON.stringify(db.arbeitszeiten), geprueft: x("tagGeprueft('" + T + "')") };
  });
  if (!r4.offen || !r4.meldung || !r4.frei || !r4.gleich || r4.geprueft) fehl.push("(4) ohne Netz: " + JSON.stringify(r4));
  /* (5) „geprüft“ steht in der Datenbank (Tabelle tag_geprueft) – gilt auch auf einem anderen Gerät; fehlt die Tabelle: Rückfall aufs Gerät */
  const r5 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1), T2 = tt.werktag(2), T3 = tt.werktag(3);
    db.tag_geprueft.length = 0;
    tt.gestempelt({ datum: T3, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    tt.gestempelt({ datum: T2, beginn: "07:00", ende: "12:00", minuten: 300, bereich: "werkstatt" });
    await tt.laden();
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200); tt.ok(tt.dialog()).click(); await tt.warte(400);
    const zeile = db.tag_geprueft.filter((g) => g.datum === T).map((g) => (g.user_id === tt.ich()) + " " + !!g.stand + " " + !!g.geprueft_am).join();
    /* anderes Gerät: nichts auf dem Gerät gemerkt, frisch aus der Datenbank geladen */
    localStorage.removeItem("ukt_tag_geprueft"); x("TAG_GEPRUEFT_DB={}; tagGeprueftKonto=''; 1");
    const vorLaden = x("tagGeprueft('" + T + "')"); await x("zeitenLaden()");
    const andersGeraet = x("tagGeprueft('" + T + "')");
    /* fremde Zeile schreiben geht nicht (auch nicht über die Datenbank) */
    const fremd = await x("Store.sb.from('tag_geprueft').upsert({user_id:'u_fremd', datum:'" + T + "', stand:'x'}, {onConflict:'user_id,datum'})");
    /* ohne Netz geprüft: auf dem Gerät gemerkt, beim nächsten Laden in die Datenbank nachgetragen */
    window.__netzWeg = true; x("abgleichDialog('" + T3 + "', false)"); await tt.warte(200); tt.ok(tt.dialog()).click(); await tt.warte(400); window.__netzWeg = false;
    const ohneNetz = db.tag_geprueft.some((g) => g.datum === T3); await x("zeitenLaden()"); await tt.warte(300);
    const nachgetragen = db.tag_geprueft.some((g) => g.datum === T3);
    /* Tabelle fehlt: „Passt so“ merkt es auf dem Gerät, ohne Warnung */
    window.__ohneTagGeprueft = true; x("TAG_GEPRUEFT_DB={}; tagGeprueftKonto=''; 1"); await x("zeitenLaden()"); tt.toasts.length = 0;
    x("abgleichDialog('" + T2 + "', false)"); await tt.warte(200); tt.ok(tt.dialog()).click(); await tt.warte(400);
    const rueckfall = x("tagGeprueft('" + T2 + "')"), warnung = tt.toasts.filter((t) => /⚠/.test(t));
    window.__ohneTagGeprueft = false;
    return { zeile, ohneNetz, nachgetragen, vorLaden, andersGeraet, fremd: !!(fremd && fremd.error), rueckfall, warnung, ohneDb: db.tag_geprueft.some((g) => g.datum === T2) };
  });
  if (r5.zeile !== "true true true" || r5.ohneNetz || !r5.nachgetragen || r5.vorLaden || !r5.andersGeraet || !r5.fremd || !r5.rueckfall || r5.warnung.length || r5.ohneDb) fehl.push("(5) geprüft in der Datenbank: " + JSON.stringify(r5));
  /* (6) „+ Weiterer Bereich“: mehrere Bereiche zu verschiedenen Zeiten – ohne Bereich nichts, über das Ende hinaus gekürzt, Summe und Pause gleich */
  const r6 = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, db = window.__db.tabellen; tt.leeren(); const T = tt.werktag(1);
    tt.gestempelt({ datum: T, beginn: "07:00", ende: "16:00", minuten: 510, pause_min: 30, bereich: "werkstatt" });
    await tt.laden();
    x("abgleichDialog('" + T + "', true)"); await tt.warte(200);
    const neu = (bi, s, e, b) => { const n = tt.dialog().querySelectorAll("[data-neu]")[bi]; n.querySelector("[data-ns]").value = s; n.querySelector("[data-ne]").value = e;
      n.querySelector("[data-nb]").value = b; n.querySelector("[data-nok]").click(); };
    const abs = () => [...tt.dialog().querySelectorAll("[data-abschnitt]")].map((e) => e.dataset.abschnitt);
    neu(0, "09:00", "10:00", ""); const ohneBereich = abs(), toastOhne = tt.toasts.slice(-1)[0] || "";
    neu(0, "09:00", "10:00", "fahrt"); neu(0, "12:00", "17:00", "wartung"); neu(0, "11:00", "11:30", "fahrt");
    const danach = abs(), toastGekuerzt = tt.toasts.some((t) => /gekürzt/.test(t)), okText = tt.ok(tt.dialog()).textContent;
    tt.ok(tt.dialog()).click(); await tt.warte(600);
    const l = db.arbeitszeiten.filter((z) => z.datum === T).sort((p, q) => p.beginn < q.beginn ? -1 : 1);
    return { ohneBereich, toastOhne, danach, toastGekuerzt, okText, bereiche: l.map((z) => z.beginn.slice(0, 5) + "-" + z.ende.slice(0, 5) + " " + z.bereich),
      min: l.reduce((s, z) => s + z.minuten, 0), pause: l.reduce((s, z) => s + (z.pause_min || 0), 0), zu: !tt.dialog() };
  });
  if (JSON.stringify(r6.ohneBereich) !== '["07:00-16:00 werkstatt"]' || !/Bereich wählen/.test(r6.toastOhne)
    || JSON.stringify(r6.danach) !== '["07:00-09:00 werkstatt","09:00-10:00 fahrt","10:00-11:00 werkstatt","11:00-11:30 fahrt","11:30-12:00 werkstatt","12:00-16:00 wartung"]'
    || !r6.toastGekuerzt || !/Speichern/.test(r6.okText) || r6.min !== 510 || r6.pause !== 30 || r6.bereiche.length !== 6 || !r6.zu)
    fehl.push("(6) weiterer Bereich: " + JSON.stringify(r6));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

test("Tagesrückblick: Präsentation speichert nie, am Handy (390 px) ragt nichts über den Rand", async () => {
  const a = await oeffnen(KONTEN.praesentation, { handy: true });
  await ttHilfen(a);
  const r = await a.seite.evaluate(async () => {
    const tt = window.__tt, x = window.__t.x, ich = tt.ich(), sb = x("Store.sb"), altFrom = sb.from, altRpc = sb.rpc;
    window.__schreib = [];
    sb.from = function (t) { const q = altFrom.call(this, t); ["insert", "update", "upsert", "delete"].forEach((m) => { const o = q[m]; q[m] = function () { window.__schreib.push(t + "." + m); return o.apply(q, arguments); }; }); return q; };
    sb.rpc = function (n) { if (n !== "team_liste" && n !== "bereiche_eigene") window.__schreib.push("rpc." + n); return altRpc.apply(this, arguments); };
    const T = tt.werktag(1);
    x("ZEITEN").push({ id: "trp1", user_id: ich, name: "P", datum: T, beginn: "07:00", ende: "16:00", pause_min: 30, minuten: 510, art: "arbeit", quelle: "stempel", bereich: "wartung" });
    x("PLANUNG").push({ id: "trp1p", art: "termin", kategorie: "wartung", titel: "Wartung mit einem sehr langen Titel für den schmalen Bildschirm", datum: T, beginn: "08:00", ende: "10:00", wer: [ich], wer_namen: ["P"], standort_id: "TS1", status: "offen", erstellt_von: ich });
    x("abgleichDialog('" + T + "', false)"); await tt.warte(200);
    let d = tt.dialog();
    d.querySelector("[data-abschnitt] [data-abmehr]").click(); await tt.warte(50); d = tt.dialog();
    const breit = window.innerWidth, raus = [...d.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > breit + 1; })
      .map((e) => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().right)).slice(0, 5);
    const inhalt = d.querySelector(".as-inhalt"), quer = inhalt.scrollWidth - inhalt.clientWidth;
    d.querySelectorAll("[data-abschnitt]")[2].querySelector("[data-abteilen]").click(); [...document.querySelectorAll(".assistent [data-tok]")].pop().click();
    tt.ok(tt.dialog()).click(); await tt.warte(400);
    const l = x("ZEITEN").filter((z) => z.datum === T);
    /* Ausstempeln in der Präsentation: der Rückblick kommt auch hier – „Passt so“ schickt nichts */
    const ein = new Date(Math.max(Date.now() - 3600000, new Date(new Date().setHours(0, 2, 0, 0)).getTime()));
    x("STEMPEL").unshift({ id: "trpst", user_id: ich, art: "ein", zeit: ein.toISOString(), bereich: "werkstatt" });
    await x("stempelDruecken('aus', {taetigkeit:'Werkstatt'})"); await tt.warte(1700);
    const d2 = tt.dialog(), titel2 = d2 ? d2.querySelector(".as-titel").textContent : "";
    if (d2) { tt.ok(d2).click(); await tt.warte(300); }
    sb.from = altFrom; sb.rpc = altRpc;
    return { raus, quer, teile: l.length, min: l.reduce((s, z) => s + z.minuten, 0), pause: l.reduce((s, z) => s + (z.pause_min || 0), 0), schreib: window.__schreib.slice(), titel2 };
  });
  const fehl = [];
  if (r.raus.length || r.quer > 1) fehl.push("Handy: ragt über den Rand " + JSON.stringify([r.raus, r.quer]));
  if (r.teile !== 4 || r.min !== 510 || r.pause !== 30) fehl.push("Präsentation: Aufteilung im Speicher " + JSON.stringify(r));
  if (r.schreib.length) fehl.push("Präsentation schickt " + JSON.stringify(r.schreib) + " an die Datenbank");
  if (r.titel2 !== "Tagesrückblick") fehl.push("Präsentation: kein Rückblick nach dem Ausstempeln " + JSON.stringify(r));
  if (a.fehler.length) fehl.push("Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
  pruefe(!fehl.length, fehl.join(" | "));
});

/* ================================================================ Ablauf ================================================================ */
const filterText = process.argv.slice(2).find((x) => !x.startsWith("--"));
const filter = filterText ? new RegExp(filterText, "i") : null;
const seite = testfassung();
const srv = server(seite).listen(0);
PORT = srv.address().port;
BROWSER = await browserStarten();
let ok = 0, schlecht = 0;
for (const t of TESTS_LISTE) {
  if (filter && !filter.test(t.name)) continue;
  const start = Date.now();
  try { await t.fn(); ok++; console.log(`  ✓ ${t.name} (${Math.round((Date.now() - start) / 100) / 10} s)`); }
  catch (e) { schlecht++; console.log(`  ✗ ${t.name}\n      ${String(e.message || e).split("\n")[0]}`); }
}
await BROWSER.close();
srv.close();
console.log(`\n${ok} bestanden, ${schlecht} fehlgeschlagen`);
process.exit(schlecht ? 1 : 0);
