// Probe (Büro): eine echte KPlus-PDF durch kplusLesen/kplusAnTeil der App schicken – nur lesen, nichts geht ins Netz.
// Aufruf: node tools/kplus-probe.mjs <Pfad zur PDF>   (Ergebnis als JSON: Kopf, Positionen, Regie-Teil, Prüfhinweise)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
const WURZEL = normalize("C:/Users/kamme/Documents/wartungsleitstand/app"), TESTS = join(WURZEL, "tests"), PDF = process.argv[2];
let h = readFileSync(join(WURZEL, "index.html"), "utf8").replace(/\r\n/g, "\n");
h = h.replace('<script src="daten.enc.js"></script>', '<script src="tests/testdaten.js"></script>').replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="tests/attrappe.js"></script>');
const zeilen = h.split("\n"), i = zeilen.findIndex((z) => z === "kachelnPruefen();"); zeilen.splice(i + 1, 0, readFileSync(join(TESTS, "hooks.js"), "utf8")); h = zeilen.join("\n");
const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css", ".pdf": "application/pdf" };
const srv = createServer((req, res) => {
  const pfad = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([\\/])+/, "");
  if (pfad === "" || pfad === "index.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(h); return; }
  if (pfad === "probe.pdf") { res.writeHead(200, { "Content-Type": "application/pdf" }); res.end(readFileSync(PDF)); return; }
  const datei = pfad === "seed.json" ? join(TESTS, "seed.json") : join(WURZEL, pfad);
  if (!datei.startsWith(WURZEL) || !existsSync(datei)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream" }); res.end(readFileSync(datei));
});
await new Promise((ok) => srv.listen(0, ok)); const PORT = srv.address().port;
const { chromium } = await import("playwright");
let browser; try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ channel: "chrome" }); }
const k = await browser.newContext(); const s = await k.newPage();
await s.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" }); await s.waitForFunction(() => !!window.__t && window.__t.x("!!Store.sb"));
const erg = await s.evaluate(async () => {
  const x = window.__t.x;
  const buf = await fetch("probe.pdf").then((r) => r.arrayBuffer());
  const g = await x("kplusLesen")(new Uint8Array(buf));
  const teil = x("kplusAnTeil")(g.positionen);
  return { art: g.art, nummer: g.nummer, datum: g.datum, kopf: g.kopf, summen: g.summenPdf, anNummern: g.anNummern, anDaten: g.anDaten,
    positionen: g.positionen.map((p) => p.typ === "pos" ? `${p.nr} | ${p.menge} ${p.eh} | ${p.preis} → ${p.betragPdf}${p.alternativ ? " ALT" : ""} | ${p.text.replace(/\n/g, " / ").slice(0, 90)}` : `[${p.typ}] ${p.text.slice(0, 90)}`),
    nachgerechnet: x("belegSummen")(g.positionen).netto, teil: teil.an.map((p) => p.nr), rest: teil.rest, pruef: x("positionenPruefen")(g.positionen).map((q) => q.nr + ": " + q.text) };
});
console.log(JSON.stringify(erg, null, 1));
await browser.close(); srv.close();
