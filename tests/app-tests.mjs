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

test("Tiefentest stunden: Abgleich mit dem Kalender – Lücken behalten Markt und Projekt, Termin im Termin, Vorschau wie gestempelt, Verschieben sicher, Störung einmal", async () => {
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
    const knopf = [...document.querySelectorAll("button")].find((b) => /Mit Kalender abgleichen \(1\)/.test(b.textContent));
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
