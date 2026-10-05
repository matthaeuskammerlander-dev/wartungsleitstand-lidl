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
  const kontext = await BROWSER.newContext({ viewport: opt.handy ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: !!opt.handy });
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
      if (u.includes("/api/roh?")) return antw(new Blob(["From: p@planer-test.at\r\n\r\nText"], { type: "message/rfc822" }));
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
    /* Kilometer */
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
    const knopf = [...document.querySelectorAll("button")].find((b) => /Mit Kalender abgleichen \(3\)/.test(b.textContent));
    if (knopf) knopf.click(); await warte(500);
    let d = [...document.querySelectorAll(".assistent")].pop();
    const dialog = !!d && /Mit dem Kalender abgleichen/.test(d.textContent);
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
    const um = [...document.querySelectorAll("#stempelkarte button")].find((b) => /Dorthin umstempeln/.test(b.textContent));
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
    return { frage1, ausnahme: ausnahme && ausnahme.art, arbeitGespeichert, offen1, frage2, krankTeile, eingestempelt, gestern, heute, morgen };
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
    /* Speicher-Regel „auslagen fotos lesen“ (tools/reisekosten.sql): die Person liest nur ihren eigenen Ordner */
    p(String(b.foto || "").indexOf("u_tech_test_at/") === 0 && !window.__entfernt.length, "RK-05 Belegfoto liegt im Ordner des Inhabers / Original entfernt: " + JSON.stringify({ foto: b.foto, entfernt: window.__entfernt }));
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

    /* als Admin: Mail und Rechnung aus dem Mailverlauf sind nicht zu sehen; aus dem Posteingang legt er nur den Plan ab */
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
    k = x("posteingangKarte()"); document.body.appendChild(k); await tm.bis(() => k.querySelectorAll(".posbox").length >= 2);
    const box = (re) => [...k.querySelectorAll(".posbox")].find((b) => re.test(b.textContent));
    /* nur Mail + KPlus-Rechnung: gar kein Dialog, sichtbarer Hinweis */
    window.__toasts = []; tm.knopf(box(/413956/), /Zu Projekt legen/).click(); await tm.warte(300);
    p(!document.querySelector(".assistent") && window.__toasts.some((t) => /nur der Inhaber/.test(t)), "M4 Admin: Mail nur mit KPlus-Rechnung – kein Hinweis bzw. Dialog offen: " + JSON.stringify(window.__toasts));
    /* Mail + KPlus + Plan: der Plan kommt ins Projekt, Mail und KPlus bleiben für den Inhaber im Posteingang */
    tm.knopf(box(/413955/), /Zu Projekt legen/).click(); await tm.bis(() => tm.fuss(/Ins Projekt legen/));
    d = tm.dlg();
    p(/nur der Inhaber/.test(d.textContent), "M4 Admin: Dialog sagt nicht, dass Angebot/Rechnung nur der Inhaber ablegt");
    d.querySelector("[data-p]").value = "tmp_r3"; window.__toasts = [];
    tm.fuss(/Ins Projekt legen/).click(); await tm.toastBis(/abgelegt|^Nicht/);
    const da = (db.projekte.find((q) => q.id === "tmp_r3").daten.dateien || []).filter((f) => /Fwd Unterlagen|413955|Plan OG/.test(f.name)).map((f) => f.art + "|" + f.name);
    p(da.length === 1 && da[0] === "plan|Plan OG.pdf", "M4 Admin hat Angebot/Rechnung bzw. die Mail dazu abgelegt: " + JSON.stringify(da));
    p(["tm4c1", "tm4c2"].every((id) => db.posteingang.find((e) => e.id === id).status === "neu") && db.posteingang.find((e) => e.id === "tm4c3").status === "erledigt",
      "M4 Posteingang nach dem Ablegen durch den Admin: " + JSON.stringify(db.posteingang.filter((e) => /^tm4c/.test(e.id)).map((e) => e.id + ":" + e.status)));
    p(window.__toasts.some((t) => /bleiben für den Inhaber/.test(t)) && /413955/.test(k.textContent), "M4 Admin: kein Hinweis bzw. die Karte für den Inhaber fehlt: " + JSON.stringify(window.__toasts));
    k.remove();
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
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
    x("ansichtenSchliessen()"); document.querySelectorAll("#tmPe").forEach((kk) => kk.remove());
    return { fehlt };
  });
  pruefe(!r.fehlt.length, r.fehlt.join(" | "));
  pruefe(!a.fehler.length, "Laufzeitfehler: " + a.fehler.join("; "));
  await a.zu();
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
