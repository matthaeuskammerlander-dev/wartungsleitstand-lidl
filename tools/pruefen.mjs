// Grundprüfung der App – läuft bei jedem Änderungswunsch automatisch (GitHub)
// und vorher bei Claude. Bricht mit Fehler ab, wenn die App so nicht starten
// würde. Braucht nur Node (ab 18); mit --browser zusätzlich Playwright.
//
//   node tools/pruefen.mjs            Syntax und Aufbau von index.html
//   node tools/pruefen.mjs --browser  dazu: App im echten Browser laden
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(WURZEL, "index.html"), "utf8");
const fehler = [];
const melde = (t) => { fehler.push(t); console.error("FEHLER: " + t); };

// 1. Konfliktreste und versehentlich eingefügte Klartextdaten
if (/^(<<<<<<<|=======|>>>>>>>)( |$)/m.test(html)) melde("Konfliktmarkierung (<<<<<<< / >>>>>>>) in index.html");
if (/<script[^>]+src=["']daten\.js["']/.test(html)) melde("index.html lädt daten.js (Klartextdaten) statt daten.enc.js");
for (const pflicht of ["daten.enc.js", "config.js", "function starteWartungsleitstand(", 'id="app"']) {
  if (!html.includes(pflicht)) melde("Pflichtteil fehlt in index.html: " + pflicht);
}

// 2. jedes eingebettete Skript muss sich übersetzen lassen
const skripte = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!skripte.length) melde("Keine eingebetteten Skripte gefunden");
skripte.forEach((code, i) => {
  try { new vm.Script(code, { filename: `index.html (Skript ${i + 1})` }); }
  catch (e) { melde(`Skript ${i + 1} hat einen Syntaxfehler: ${e.message}`); }
});

// 3. Die Terminregeln stehen noch (vom Büro festgelegt – nicht versehentlich entfernen)
for (const regel of ["var BESUCH_TAGE", "function standardRegel(", "function sollMonatVorschlag(", "function altlastenFaelle("]) {
  if (!html.includes(regel)) melde("Regel-Funktion fehlt: " + regel);
}

// 4. optional: im echten Browser laden, Laufzeitfehler beim Start sammeln
if (process.argv.includes("--browser") && !fehler.length) {
  const { chromium } = await import("playwright");
  const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css" };
  const server = createServer((req, res) => {
    const pfad = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([\\/])+/, "");
    const datei = join(WURZEL, pfad || "index.html");
    if (!datei.startsWith(WURZEL) || !existsSync(datei)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream" });
    res.end(readFileSync(datei));
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  for (const geraet of [{ name: "PC", viewport: { width: 1280, height: 900 } }, { name: "Handy", viewport: { width: 390, height: 844 }, isMobile: true }]) {
    const seite = await browser.newPage({ viewport: geraet.viewport, isMobile: !!geraet.isMobile });
    seite.on("pageerror", (e) => melde(`${geraet.name}: Laufzeitfehler beim Start: ${e.message}`));
    seite.on("dialog", (d) => d.dismiss());
    await seite.goto(`http://localhost:${port}/index.html`, { waitUntil: "load", timeout: 60000 });
    await seite.waitForTimeout(4000);
    const inhalt = await seite.evaluate(() => (document.getElementById("app")?.innerText || "").trim().length);
    if (!inhalt) melde(`${geraet.name}: Die App zeigt nach dem Laden nichts an`);
    const breit = await seite.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (breit > 4) console.warn(`HINWEIS ${geraet.name}: Seite ist ${breit}px breiter als der Bildschirm`);
    await seite.close();
  }
  await browser.close();
  server.close();
}

if (fehler.length) { console.error(`\n${fehler.length} Fehler – so nicht übernehmen.`); process.exit(1); }
console.log(`OK: ${skripte.length} Skripte übersetzbar, Regeln vorhanden` + (process.argv.includes("--browser") ? ", App startet im Browser (PC und Handy)." : "."));
