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
  let h = readFileSync(join(WURZEL, "index.html"), "utf8");
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
    kunde: { sieht: ["faellig", "karte", "anlagen", "verlauf"], nicht: ["protokoll", "belege", "verwaltung", "stunden", "fahrzeuge"] },
    techniker: { sieht: ["faellig", "kalender", "protokoll", "stunden", "fahrzeuge"], nicht: ["belege"] },
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
