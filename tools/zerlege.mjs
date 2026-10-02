// Zerlegt eine große Funktion maschinell in Teile, ohne das Verhalten zu ändern.
//   npm install --no-save --no-package-lock playwright@1 acorn acorn-walk   (einmal; alle drei zusammen)
//   node tools/zerlege.mjs <plan.json>
// Danach immer: node tools/pruefen.mjs, node tools/ab-vergleich.mjs, node tests/app-tests.mjs
// plan: { funktion, kopfBis (letzte Zeile der Präambel), vorziehen:[Zeilen einzelner Anweisungen, die in die
//         Präambel wandern], teile:[{name, von, bis, kommentar}], kontext:"P" }
// Ablauf in der neuen Funktion: Präambel → alle Teile melden ihre Funktionen an (Phase 1) → Aufbau
// der Teile in der alten Reihenfolge (Phase 2) → Rest. So bleibt das Hochziehen (hoisting) erhalten:
// jede Funktion existiert vor jedem Aufbau, jede Variable ist bis zu ihrer Zuweisung undefined.
import { createRequire } from "module";
import fs from "fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const acorn = require("acorn"), walk = require("acorn-walk");
const DATEI = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const html = fs.readFileSync(plan.quelle || DATEI, "utf8");
const K = plan.kontext || "P";
const fehler = [], warnung = [];

const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, code, off;
while ((m = re.exec(html))) if (m[1].includes("function " + plan.funktion + "(")) { code = m[1]; off = m.index + m[0].indexOf(m[1]); }
const ast = acorn.parse(code, { ecmaVersion: 2022, locations: true, ranges: true });
let fn; walk.simple(ast, { FunctionDeclaration(n) { if (n.id.name === plan.funktion) fn = n; } });
const zl0 = html.slice(0, off).split("\n").length - 1;
const Z = (n) => n.loc.start.line + zl0, ZE = (n) => n.loc.end.line + zl0;
const body = fn.body.body;

// Anweisungen den Bereichen zuordnen
const bereichVon = (st) => {
  if (Z(st) <= plan.kopfBis || (plan.vorziehen || []).includes(Z(st))) return "kopf";
  for (const t of plan.teile) if (Z(st) >= t.von && ZE(st) <= t.bis) return t.name;
  for (const t of plan.teile) if (Z(st) <= t.bis && ZE(st) >= t.von) fehler.push(`Anweisung ${Z(st)}-${ZE(st)} ragt über die Grenze von ${t.name}`);
  const letzt = plan.teile[plan.teile.length - 1];
  if (Z(st) > letzt.bis) return "rest";
  return "LUECKE";
};
const stBereich = new Map(body.map((st) => [st, bereichVon(st)]));
body.forEach((st) => { if (stBereich.get(st) === "LUECKE") fehler.push(`Anweisung ${Z(st)} liegt zwischen den Teilen`); });

// Deklarationen der Funktion (var auf jeder Tiefe außer in inneren Funktionen, Funktionsdeklarationen auf oberster Ebene)
const decl = new Map(); // name -> {bereich, art:'function'|'var', node, stmt}
const stmtVon = (pos) => body.find((st) => st.start <= pos && pos < st.end);
walk.recursive(fn.body, null, {
  Function(n, st, c) { if (n.type === "FunctionDeclaration") {
      const s = stmtVon(n.start);
      if (s !== n) fehler.push(`Funktionsdeklaration ${n.id.name} (Zeile ${Z(n)}) steckt in einem Block`);
      decl.set(n.id.name, { bereich: stBereich.get(s), art: "function", node: n, stmt: s }); } },
  VariableDeclaration(n, st, c) {
    if (n.kind !== "var") fehler.push(`let/const in Zeile ${Z(n)}`);
    n.declarations.forEach((d) => { const s = stmtVon(d.start);
      if (decl.has(d.id.name) && decl.get(d.id.name).bereich !== stBereich.get(s)) fehler.push(`${d.id.name} in zwei Bereichen deklariert`);
      if (!decl.has(d.id.name)) decl.set(d.id.name, { bereich: stBereich.get(s), art: "var", node: d, stmt: s });
      if (d.init) c(d.init, st); }); },
});
fn.params.forEach((p) => decl.set(p.name, { bereich: "kopf", art: "param" }));

// Ist ein Bezeichner an dieser Stelle von einer inneren Funktion neu gebunden?
function bindetSelbst(F, name) {
  if (F.params.some((p) => p.type === "Identifier" && p.name === name)) return true;
  if (F.type === "FunctionExpression" && F.id && F.id.name === name) return true;
  let ja = false;
  walk.recursive(F.body, null, {
    Function(n) { if (n.type === "FunctionDeclaration" && n.id.name === name) ja = true; },
    VariableDeclaration(n, st, c) { n.declarations.forEach((d) => { if (d.id.name === name) ja = true; }); },
    CatchClause(n, st, c) { if (n.param && n.param.name === name) ja = true; c(n.body, st); },
  });
  return ja;
}
// alle Bezüge auf Funktions-Locals sammeln: {node, name, bereich (wo der Bezug steht), schreibend}
const bezuege = [];
walk.fullAncestor(fn.body, (n, st, anc) => {
  if (n.type !== "Identifier" || !decl.has(n.name)) return;
  const p = anc[anc.length - 2];
  if (p && p.type === "MemberExpression" && p.property === n && !p.computed) return;
  if (p && p.type === "Property" && p.key === n && !p.computed) { if (p.shorthand) fehler.push("Kurzschreibweise {" + n.name + "}"); return; }
  if (p && (p.type === "LabeledStatement" || p.type === "BreakStatement" || p.type === "ContinueStatement")) return;
  if (p && p.type === "FunctionDeclaration" && p.id === n) return; // die Deklaration selbst
  for (let i = anc.length - 2; i >= 0; i--) { const F = anc[i];
    if (F === fn) break;
    if (/Function/.test(F.type) && bindetSelbst(F, n.name)) return; }
  if (p && p.type === "CatchClause" && p.param === n) return;
  const s = stmtVon(n.start);
  const schreibend = p && ((p.type === "AssignmentExpression" && p.left === n) || p.type === "UpdateExpression");
  const inFunktion = anc.slice(0, -1).some((F) => F !== fn && /Function/.test(F.type) && anc.indexOf(F) > anc.indexOf(fn));
  bezuege.push({ node: n, name: n.name, bereich: stBereich.get(s), schreibend, inFunktion, istDeklId: p && p.type === "VariableDeclarator" && p.id === n });
});

// geteilt = Bezug außerhalb des eigenen Bereichs (Präambel ist nie „geteilt“, sie wird durchgereicht)
const geteilt = new Set();
for (const b of bezuege) { const d = decl.get(b.name); if (d.bereich !== "kopf" && b.bereich !== d.bereich) geteilt.add(b.name); }
const lebendig = new Set();
for (const b of bezuege) { const d = decl.get(b.name);
  /* Präambel-Variable, die in einer inneren Funktion der Präambel neu zugewiesen wird (später, beim Aufruf):
     die Kopie im Teil wäre dann veraltet */
  if (d.bereich === "kopf" && b.bereich === "kopf" && b.schreibend && b.inFunktion && bezuege.some((x) => x.name === b.name && x.bereich !== "kopf"))
    lebendig.add(b.name);   /* im Teil nicht kopieren, sondern über einen Getter frisch lesen */
  if (d.bereich === "kopf" && b.bereich !== "kopf" && (b.schreibend || b.istDeklId)) fehler.push(`Präambel-Variable ${b.name} wird in ${b.bereich} verändert (Zeile ${Z(b.node)})`);
  if (d.art === "function" && b.schreibend) fehler.push(`Funktion ${b.name} wird neu zugewiesen (Zeile ${Z(b.node)})`); }
// Funktionen mit this, die über den Kontext aufgerufen würden
for (const name of geteilt) { const d = decl.get(name); if (d.art !== "function") continue;
  let mitThis = false; walk.recursive(d.node.body, null, { Function() {}, ThisExpression() { mitThis = true; } });
  if (mitThis) fehler.push(`geteilte Funktion ${name} benutzt this`); }

// Textänderungen (absolute Positionen im Skript)
const ops = []; // {a, e, t}
for (const b of bezuege) {
  const d = decl.get(b.name);
  if (d.bereich === "kopf") { if (lebendig.has(b.name) && b.bereich !== "kopf" && b.bereich !== "rest") ops.push({ a: b.node.start, e: b.node.end, t: K + "." + b.name }); continue; }   // durchgereicht bzw. im Hauptteil
  const fremd = b.bereich !== d.bereich;
  if (d.art === "var" && geteilt.has(b.name)) ops.push({ a: b.node.start, e: b.node.end, t: K + "." + b.name });
  else if (d.art === "function" && fremd) ops.push({ a: b.node.start, e: b.node.end, t: K + "." + b.name });
  else if (fremd) fehler.push(`unerwarteter Fremdbezug ${b.name}`);
}
// var-Deklarationen außerhalb der Präambel (nicht in inneren Funktionen) → Zuweisungen
const loesch = [];
walk.recursive(fn.body, null, {
  Function() {},
  VariableDeclaration(n, st, c) {
    const s = stmtVon(n.start), bereich = stBereich.get(s);
    if (bereich === "kopf") { n.declarations.forEach((d) => d.init && c(d.init, st)); return; }
    /* im Hauptteil bleiben eigene Variablen „var“; nur geteilte werden zum Kontext */
    if (bereich === "rest") {
      const g = n.declarations.filter((d) => geteilt.has(d.id.name));
      if (g.length && g.length !== n.declarations.length) fehler.push(`gemischte Deklaration im Hauptteil, Zeile ${Z(n)}`);
      if (g.length) { ops.push({ a: n.start, e: n.start + 4, t: "" }); if (g.some((d) => !d.init)) fehler.push(`geteilte Variable ohne Wert im Hauptteil, Zeile ${Z(n)}`); }
      n.declarations.forEach((d) => d.init && c(d.init, st)); return;
    }
    ops.push({ a: n.start, e: n.start + 4, t: "" });           // „var “ weg
    const ohne = n.declarations.filter((d) => !d.init);
    if (ohne.length === n.declarations.length) {
      const imFor = s.type !== "VariableDeclaration" || s !== n;
      if (!imFor) loesch.push({ a: n.start, e: n.end, t: "" });  // „var x;“ → nichts (x bleibt undefined wie vorher)
      else if (n.declarations.length > 1) fehler.push("for mit mehreren Deklarationen ohne Wert");
    } else n.declarations.forEach((d, i) => { if (d.init) return;
      const a = i > 0 ? n.declarations[i - 1].end : d.start, e = i > 0 ? d.end : n.declarations[i + 1].start;
      loesch.push({ a, e, t: "" }); });
    n.declarations.forEach((d) => d.init && c(d.init, st));
  },
  ForInStatement(n, st, c) { c(n.left, st); c(n.right, st); c(n.body, st); },
});
// Löschungen schlucken darin liegende Änderungen
const alleOps = ops.filter((o) => !loesch.some((l) => o.a >= l.a && o.e <= l.e)).concat(loesch);
const anwenden = (a, e) => { let t = code.slice(a, e);
  alleOps.filter((o) => o.a >= a && o.e <= e).sort((x, y) => y.a - x.a).forEach((o) => { t = t.slice(0, o.a - a) + o.t + t.slice(o.e - a); });
  return t; };
const zeileEnde = (pos) => { const i = code.indexOf("\n", pos); return i < 0 ? code.length : i + 1; };
const zeileAnfang = (pos) => code.lastIndexOf("\n", pos - 1) + 1;
// Stück je Anweisung: führende Kommentare/Leerzeilen dazu, Kommentar am Zeilenende ebenfalls
function stuecke(liste) {
  return liste.map((st, i) => {
    const vor = i > 0 ? liste[i - 1] : null, nach = liste[i + 1];
    const a = !vor ? zeileAnfang(st.start) : (code.lastIndexOf("\n", st.start) >= vor.end ? zeileEnde(vor.end) : vor.end);
    const e = !nach ? zeileEnde(st.end) : (code.lastIndexOf("\n", nach.start) >= st.end ? zeileEnde(st.end) : st.end);
    return { st, a, e };
  });
}
// Bereiche bauen
const kopfSt = body.filter((st) => stBereich.get(st) === "kopf"), restSt = body.filter((st) => stBereich.get(st) === "rest");
const ausgabeTeile = [];
for (const t of plan.teile) {
  const sts = body.filter((st) => stBereich.get(st) === t.name);
  // Lücken zwischen Teilen (nur Kommentare) dem Teil zuschlagen, in dem sie stehen
  const st = stuecke(sts);
  // erster Teil: Text ab Zeile von (Kommentare vor der ersten Anweisung)
  const lineStart = (z) => { let pos = 0; for (let i = zl0 + 1; i < z; i++) pos = code.indexOf("\n", pos) + 1; return pos; };
  st[0].a = Math.min(st[0].a, lineStart(t.von));
  st[st.length - 1].e = Math.max(st[st.length - 1].e, lineStart(t.bis + 1));
  const funktionen = st.filter((x) => x.st.type === "FunctionDeclaration");
  const aufbau = st.filter((x) => x.st.type !== "FunctionDeclaration");
  funktionen.forEach((x) => { const vor = st[st.indexOf(x) - 1];
    if (vor && vor.e > zeileAnfang(x.st.start) && vor.e !== x.a) {}
    if (code.slice(x.a, x.st.start).includes("\n") === false && x.a !== zeileAnfang(x.st.start)) fehler.push(`Funktion ${x.st.id.name} teilt sich eine Zeile`); });
  const eigeneVars = [...decl].filter(([n, d]) => d.bereich === t.name && d.art === "var" && !geteilt.has(n)).map(([n]) => n);
  const eigeneFnGeteilt = [...decl].filter(([n, d]) => d.bereich === t.name && d.art === "function" && geteilt.has(n)).map(([n]) => n);
  const kopfGenutzt = [...new Set(bezuege.filter((b) => b.bereich === t.name && decl.get(b.name).bereich === "kopf" && !lebendig.has(b.name)).map((b) => b.name))];
  const kopfNamen = [...decl].filter(([n, d]) => d.bereich === "kopf").map(([n]) => n);
  let out = `/* ${t.kommentar} */\nfunction ${t.name}(${K}){\n`;
  if (kopfGenutzt.length) out += `  var ${kopfNamen.filter((n) => kopfGenutzt.includes(n)).map((n) => n + "=" + K + "." + n).join(", ")};\n`;
  if (eigeneVars.length) out += `  var ${eigeneVars.join(", ")};\n`;
  if (eigeneFnGeteilt.length) out += `  /* für die anderen Teile */\n  ${eigeneFnGeteilt.map((n) => K + "." + n + "=" + n + ";").join(" ")}\n`;
  out += funktionen.map((x) => anwenden(x.a, x.e)).join("");
  if (!out.endsWith("\n")) out += "\n";
  out += `  /* Aufbau – läuft, wenn alle Teile angemeldet sind, in der ursprünglichen Reihenfolge */\n  return function(){\n`;
  const aufbauText = aufbau.map((x) => anwenden(x.a, x.e)).join("");
  out += aufbauText.split("\n").map((z) => (z.length ? "  " + z : z)).join("\n").replace(/\s*$/, "\n");
  out += `  };\n}\n`;
  ausgabeTeile.push(out);
}
// neue Hauptfunktion
const kopfStuecke = stuecke(kopfSt);
const kopfText = (() => { // Präambel in alter Reihenfolge, vorgezogene Anweisungen hinten an
  const normal = kopfSt.filter((st) => !(plan.vorziehen || []).includes(Z(st))), vorg = kopfSt.filter((st) => (plan.vorziehen || []).includes(Z(st)));
  const a = stuecke(normal).map((x) => anwenden(x.a, x.e)).join("");
  const b = vorg.map((st) => "  " + anwenden(st.start, st.end) + "\n").join("");
  return a.replace(/\s*$/, "\n") + b; })();
const kopfNamen = fn.params.map((p) => p.name).concat([...decl].filter(([n, d]) => d.bereich === "kopf" && d.art !== "param").map(([n]) => n));
const fnKopf = code.slice(fn.start, fn.body.start + 1);
let haupt = fnKopf + "\n" + kopfText;
const praefix = plan.teile[0].name.replace(/[A-Z][a-z]*$/, "");
haupt += `  /* Die Teile (je eine Funktion ${praefix}…): erst melden alle ihre Funktionen an, dann bauen sie
     in der ursprünglichen Reihenfolge auf – Gemeinsames liegt im Kontext ${K} */\n`;
haupt += `  var ${K}={${kopfNamen.map((n) => lebendig.has(n) ? "get " + n + "(){ return " + n + "; }" : n + ":" + n).join(", ")}};\n`;
/* Funktionen des Hauptteils, die Teile aufrufen: vor dem Aufbau anmelden (sie sind im Hauptteil hochgezogen) */
const restFn = [...decl].filter(([n, d]) => d.bereich === "rest" && d.art === "function" && geteilt.has(n)).map(([n]) => n);
if (restFn.length) haupt += `  /* Ablauf-Funktionen dieses Hauptteils, die die Teile aufrufen */\n  ${restFn.map((n) => K + "." + n + "=" + n + ";").join(" ")}\n`;
haupt += `  [${plan.teile.map((t) => t.name + "(" + K + ")").join(",\n   ")}].forEach(function(aufbau){ aufbau(); });\n`;
const restStuecke = stuecke(restSt);
if (restStuecke.length) { restStuecke[0].a = zeileAnfang(restSt[0].start); const vorRest = code.slice(zeileEnde(body.filter((s) => stBereich.get(s) !== "rest").pop().end), restStuecke[0].a); haupt += vorRest.replace(/^\s*\n/, "\n"); }
haupt += restStuecke.map((x) => anwenden(x.a, x.e)).join("");
haupt = haupt.replace(/\s*$/, "\n") + "}";

if (fehler.length) { console.error("ABBRUCH:\n  " + [...new Set(fehler)].join("\n  ")); process.exit(1); }
const neu = ausgabeTeile.join("") + haupt;
// in index.html ersetzen: von der Zeile der Funktion bis zu ihrem Ende
const absA = off + zeileAnfang(fn.start), absE = off + fn.end;
const out = html.slice(0, absA) + neu + html.slice(absE);
fs.writeFileSync(plan.ausgabe || DATEI, out);
console.log("Teile:", plan.teile.map((t) => t.name).join(", "));
console.log("geteilt über den Kontext:", [...geteilt].map((n) => n + (decl.get(n).art === "function" ? "()" : "")).join(" "));
console.log("Präambel durchgereicht:", kopfNamen.join(" "));
if (lebendig.size) console.log("über Getter (wird später neu zugewiesen):", [...lebendig].join(" "));
