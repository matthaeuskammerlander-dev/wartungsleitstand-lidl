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
/* Material aus dem Protokoll: „2 Stk“ und „3 m“ bleiben 2 Stk und 3 m; Unlesbares wird sichtbar markiert */
reSchritt("eingaben", "R08", async (a) => {
  const r = JSON.parse(await a.x(`JSON.stringify(einsatzPositionen({_id:'tm8',standortId:'TS1',datum:'2026-06-01',wartungsart:'Störung',stoerung:{ankunft:'08:00',ende:'09:00',
    material:[{text:'Kondensatpumpe',menge:'2 Stk'},{text:'Kupferrohr 12 mm',menge:'3 m'},{text:'Isolierband',menge:'0,5 Rolle'},{text:'Dichtung',menge:'etwas'}]}},'lidl')
    .filter(function(p){ return /Kondensatpumpe|Kupferrohr|Isolierband|Dichtung/.test(p.text); }).map(function(p){ return p.text.replace(/\\n/g,' / ')+': '+p.menge+' '+p.eh; }))`));
  return r[0] === "Kondensatpumpe: 2 Stk" && r[1] === "Kupferrohr 12 mm: 3 m" && r[2] === "Isolierband: 0.5 Rolle" && /^Dichtung .*„etwas“.*: 1 Stk$/.test(r[3] || "")
    ? "" : "Material „2 Stk“ / „3 m“ / „0,5 Rolle“ / „etwas“ im Vorschlag: " + JSON.stringify(r);
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
