// Vergleichslauf für Umbauten ohne Verhaltensänderung (Zerlegen großer Funktionen):
// spielt dieselben Abläufe auf dem alten Stand (git, Standard HEAD) und dem Arbeitsstand durch –
// mit fester Uhrzeit, erfundenen Testdaten und der nachgebauten Datenbank – und vergleicht
// Formular, Feldwerte, gespeicherte Datensätze, Entwürfe und Meldungen. Jede Abweichung wird gezeigt.
//
//   node tools/ab-vergleich.mjs            alter Stand = HEAD
//   node tools/ab-vergleich.mjs abc1234    alter Stand = dieser Commit
//   node tools/ab-vergleich.mjs - protokoll   nur Abläufe mit „protokoll“ im Namen
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = join(WURZEL, "tests");
const altRef = process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : "HEAD";
const filter = (process.argv[3] || "").toLowerCase();

function testfassung(h) {
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
    const datei = pfad === "seed.json" ? join(TESTS, "seed.json") : join(WURZEL, pfad);
    if (!datei.startsWith(WURZEL) || !existsSync(datei)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream" });
    res.end(readFileSync(datei));
  });
}
const lauschen = (srv) => new Promise((r) => srv.listen(0, () => r(srv.address().port)));

const KONTEN = { inhaber: "inhaber@test.at", admin: "admin@test.at", techniker: "tech@test.at" };
const ZEIT = new Date("2026-06-15T09:30:00");

/* ---- Abläufe: jeder läuft in einer frischen Seite und gibt ein JSON-Ergebnis zurück ---- */
/* Hilfen in der Seite: Formular erfassen, ausfüllen, speichern */
const SEITENHILFEN = `
window.__ab = {
  warte: function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); },
  /* Formular ohne Zufälliges: Ids aus Zufall/Zeit, data-URLs */
  html: function(n){ return n ? n.outerHTML.replace(/data:[^"')]+/g, "data:…") : null; },
  werte: function(form){ return [].map.call(form.querySelectorAll("input,select,textarea"), function(e){
    return [e.id||e.name||"?", e.type, e.type==="file"?"":e.value, !!e.checked, !!e.disabled, !!e.hidden || !!e.closest("[hidden]")]; }); },
  sichtbar: function(form){ return [].map.call(form.querySelectorAll(".warnbox:not([hidden]), .note:not([hidden])"), function(e){ return e.textContent.trim().slice(0,300); }); },
  setze: function(form, sel, w){ var e=form.querySelector(sel); if(!e) return "fehlt:"+sel; if(e.type==="checkbox"||e.type==="radio"){ if(e.checked!==w) e.click(); } else { e.value=w; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); } return "ok"; },
  unterschreiben: function(form){ var cv=form.querySelector("#sig"); if(!cv) return; var r=cv.getBoundingClientRect();
    var ev=function(t,x,y){ cv.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:1,clientX:r.left+x,clientY:r.top+y,isPrimary:true})); };
    try{ ev("pointerdown",20,20); ev("pointermove",60,40); ev("pointermove",120,30); ev("pointerup",120,30); }catch(e){} },
  db: function(t){ return JSON.parse(JSON.stringify((window.__db.tabellen[t]||[]))); },
  toasts: [],
  /* geführten Dialog Schritt für Schritt durchgehen: je Schritt etwas eintragen, dann weiter; am Ende speichern */
  durchklicken: async function(max){
    var A=window.__ab, schritte=[];
    for (var i=0; i<(max||30); i++) {
      var d=[].slice.call(document.querySelectorAll(".assistent")).pop(); if(!d) break;
      schritte.push(A.html(d.querySelector(".as-karte")||d));
      [].forEach.call(d.querySelectorAll("textarea"), function(ta, j){ if(!ta.value && ta.offsetParent){ ta.value="Schritt "+i+"."+j; ta.dispatchEvent(new Event("input",{bubbles:true})); } });
      [].forEach.call(d.querySelectorAll(".as-karte input[type=text]"), function(e){ if(!e.value && !e.readOnly && e.offsetParent){
        e.value=(e.inputMode==="decimal" || e.inputMode==="numeric" || /km|kg|menge/i.test(e.id+" "+(e.getAttribute("data-k")||"")+" "+(e.placeholder||""))) ? "0,5" : "T"+i; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); } });
      var cb=d.querySelector("input[type=checkbox]:not(:checked)"); if(cb) cb.click();
      var weiter=[].filter.call(d.querySelectorAll("button"), function(b){ return !b.disabled && b.offsetParent && /Stimmt – weiter/.test(b.textContent); })[0] ||
        [].filter.call(d.querySelectorAll(".as-fuss button"), function(b){ return !b.disabled && /weiter|fertig|übernehmen|speichern/i.test(b.textContent); }).pop();
      if(!weiter) break;
      weiter.click(); await A.warte(450);
    }
    await A.warte(1500);
    return schritte;
  },
  /* Datenbank-Stand je Tabelle; dbNeu gibt nur die seitdem geänderten Tabellen zurück */
  dbStand: function(){ var o={}; Object.keys(window.__db.tabellen).forEach(function(t){ o[t]=JSON.stringify(window.__db.tabellen[t]); }); return o; },
  dbNeu: function(st){ var o={}; Object.keys(window.__db.tabellen).forEach(function(t){ var j=JSON.stringify(window.__db.tabellen[t]); if(j!==st[t]) o[t]=JSON.parse(j); }); return o; },
};
(function(){ var t=document.getElementById("toast"); if(!t) return; new MutationObserver(function(){ var x=t.textContent.trim(); if(x && window.__ab.toasts[window.__ab.toasts.length-1]!==x) window.__ab.toasts.push(x); }).observe(t,{childList:true,subtree:true,characterData:true}); })();
`;

const ABLAEUFE = [
  { name: "protokoll-wartung-leer", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto");
    return { html: A.html(form), werte: A.werte(form), sichtbar: A.sichtbar(form), fehlt: form._fehltNoch ? form._fehltNoch() : null };
  } },
  { name: "protokoll-stoerung-leer", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='stoerung'; S.bearbeiten=null; S.protoStandort='TS2'; S.protoPos=null; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto");
    return { html: A.html(form), werte: A.werte(form), sichtbar: A.sichtbar(form), fehlt: form._fehltNoch ? form._fehltNoch() : null };
  } },
  { name: "protokoll-wartung-ausfuellen-speichern", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto"); const schritte = [];
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    document.getElementById("f_allesok").click(); await A.warte(100);
    schritte.push(A.setze(form, "#f_auftrag", "W-4711"));
    schritte.push(A.setze(form, "#f_bem", "Filter getauscht, alles sauber."));
    schritte.push(A.setze(form, "#f_kmArt", "R410A")); schritte.push(A.setze(form, "#f_kmNach", "1,5")); schritte.push(A.setze(form, "#f_kmEnt", "abc"));
    form.querySelector("#f_kmEnt").dispatchEvent(new Event("blur")); await A.warte(100);
    const nachKm = A.sichtbar(form);
    schritte.push(A.setze(form, "#f_kmEnt", "0,2"));
    form.querySelector("#addMangel").click(); await A.warte(150);
    const m = form.querySelector("#maengel textarea, #maengel input[type=text]"); if (m) { m.value = "Kondensatwanne verschmutzt"; m.dispatchEvent(new Event("input", { bubbles: true })); }
    schritte.push(A.setze(form, "#f_tech2", "Zweiter Techniker"));
    A.unterschreiben(form); await A.warte(100);
    const vorSpeichern = { werte: A.werte(form), fehlt: form._fehltNoch ? form._fehltNoch() : null, html: A.html(form) };
    const vorher = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === vorher; i++) await A.warte(250);
    await A.warte(1200);
    return { schritte, nachKm, vorSpeichern, protokolle: A.db("protokolle"), stammdaten: A.db("stammdaten"), toasts: A.toasts, gespeichert: !!x("S.gespeichert"),
      ansicht: A.html(document.getElementById("app")) };
  } },
  { name: "protokoll-stoerung-ausfuellen-speichern", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='stoerung'; S.bearbeiten=null; S.protoStandort='TS2'; S.protoPos=null; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto"); const schritte = [];
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    schritte.push(A.setze(form, "#f_auftrag", "ST-123456"));
    await A.warte(200);
    const ids = [].map.call(form.querySelectorAll("[id^=s_]"), (e) => e.id);
    ids.forEach((id) => { const e = form.querySelector("#" + id); if (e.tagName === "TEXTAREA" || (e.tagName === "INPUT" && e.type === "text")) { if (!e.value) schritte.push(A.setze(form, "#" + id, /^s_km/.test(id) && id !== "s_kmArt" ? "0,5" : "Test " + id)); } });
    form.querySelector("#s_addmat") && form.querySelector("#s_addmat").click(); await A.warte(150);
    [].forEach.call(form.querySelectorAll("#s_material input"), (e, i) => { e.value = "M" + i; e.dispatchEvent(new Event("input", { bubbles: true })); });
    const pos = form.querySelector('input[name="posw"]'); if (pos && !pos.checked) pos.click();
    A.unterschreiben(form); await A.warte(100);
    const vorSpeichern = { werte: A.werte(form), fehlt: form._fehltNoch ? form._fehltNoch() : null, html: A.html(form) };
    const vorher = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === vorher; i++) await A.warte(250);
    await A.warte(1200);
    return { schritte, vorSpeichern, protokolle: A.db("protokolle"), stoerungen: A.db("stoerungen"), toasts: A.toasts, sichtbar: A.sichtbar(document.getElementById("proto") || document.body) };
  } },
  { name: "protokoll-pflicht-leer-speichern", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort=null; S.protoPos=null; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto");
    document.getElementById("save").click(); await A.warte(600);
    return { fehlt: form._fehltNoch ? form._fehltNoch() : null, sichtbar: A.sichtbar(form), protokolle: A.db("protokolle").length, toasts: A.toasts,
      fokus: document.activeElement ? (document.activeElement.id || document.activeElement.name || document.activeElement.tagName) : null };
  } },
  { name: "protokoll-entwurf-merken-wiederholen", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    let form = document.getElementById("proto");
    A.setze(form, "#f_bem", "Halb fertig"); A.setze(form, "#f_auftrag", "E-1");
    form.querySelector("#addMangel").click(); await A.warte(150);
    A.unterschreiben(form);
    await A.warte(2500);
    const speicher = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/entwurf/i.test(k)) speicher[k] = localStorage.getItem(k).replace(/data:[^"]+/g, "data:…"); }
    /* weg und wieder hin: Hinweis auf den Entwurf und Wiederherstellen */
    x("formDirty=false; S.view='faellig'; render(); 1"); await A.warte(300);
    x("S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort=null; S.protoPos=null; S.view='protokoll'; render(); 1"); await A.warte(600);
    form = document.getElementById("proto");
    const hinweis = A.sichtbar(form);
    const knopf = [].filter.call(document.querySelectorAll("#proto button, .entwurf button, button"), (b) => /fortsetzen|weitermachen|übernehmen|wiederherstellen/i.test(b.textContent) && b.offsetParent)[0];
    if (knopf) { knopf.click(); await A.warte(800); }
    form = document.getElementById("proto");
    return { speicher, hinweis, knopf: knopf ? knopf.textContent.trim() : null, werte: form ? A.werte(form) : null, toasts: A.toasts };
  } },
  { name: "protokoll-korrektur", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    let form = document.getElementById("proto");
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    document.getElementById("f_allesok").click(); A.setze(form, "#f_bem", "Erste Fassung"); A.unterschreiben(form);
    const vorher = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === vorher; i++) await A.warte(250);
    await A.warte(1000);
    const gesp = x("alleProtokolle()").filter((p) => p.bemerkungen === "Erste Fassung" || (p.daten && p.daten.bemerkungen === "Erste Fassung"))[0] || x("alleProtokolle()")[0];
    if (!gesp) return { fehler: "nichts gespeichert", toasts: A.toasts };
    window.__gesp = gesp;
    x("formDirty=false; S.bearbeiten={x:window.__gesp}; S.view='protokoll'; render(); 1"); await A.warte(800);
    form = document.getElementById("proto");
    const geladen = A.werte(form);
    A.setze(form, "#f_bem", "Zweite Fassung"); A.setze(form, "#f_grund", "Tippfehler");
    const vor = window.__db.tabellen.protokolle.map((p) => JSON.stringify(p)).join();
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.map((p) => JSON.stringify(p)).join() === vor; i++) await A.warte(250);
    await A.warte(1200);
    return { geladen, html: null, protokolle: A.db("protokolle"), korrekturen: A.db("korrekturen"), aenderungen: A.db("aenderungen"), toasts: A.toasts };
  } },
  { name: "protokoll-aus-offener-stoerung", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("stoerungSpeichern({_id:'stab1', standortId:'TS2', auftragsnummer:'ST-777', problemtyp:'Kühlung', beschreibung:'Raum zu warm', ansprechpartner:'Marktleitung', erfasstAm:'2026-06-14T08:00:00.000Z', status:'offen'}, 'Test')");
    await A.warte(500);
    x("protokollBeginnen('TS2', null, 'stoerung', 'stab1')"); await A.warte(800);
    const form = document.getElementById("proto");
    const vorher = { werte: A.werte(form), html: A.html(form), fehlt: form._fehltNoch ? form._fehltNoch() : null };
    form.querySelectorAll("fieldset.fs-zu").forEach((f) => f.classList.remove("fs-zu"));
    A.setze(form, "#s_massnahmen", "Lüfter getauscht");
    const pos = form.querySelector('input[name="posw"]'); if (pos && !pos.checked) pos.click();
    A.unterschreiben(form);
    const n = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === n; i++) await A.warte(250);
    await A.warte(1500);
    return { vorher, protokolle: A.db("protokolle"), stoerungen: A.db("stoerungen"), offene: x("OFFENE").map((o) => [o._id, !!o.erledigt]), toasts: A.toasts };
  } },
  { name: "protokoll-fotos", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto");
    const bild = (farbe) => new Promise((r) => { const c = document.createElement("canvas"); c.width = 1600; c.height = 1200; const g = c.getContext("2d");
      g.fillStyle = farbe; g.fillRect(0, 0, 1600, 1200); g.fillStyle = "#fff"; g.fillRect(100, 100, 400, 300); c.toBlob((b) => r(new File([b], farbe.slice(1) + ".png", { type: "image/png" })), "image/png"); });
    const dt = new DataTransfer(); dt.items.add(await bild("#aa3355")); dt.items.add(await bild("#3355aa"));
    const inp = form.querySelector("#f_galerie"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 40 && form._fotos.liste().length < 2; i++) await A.warte(200);
    await A.warte(300);
    const liste = form._fotos.liste().map((f) => [f.name, f.bytes > 0, f.hinweis, f.datenUrl.slice(0, 22)]);
    const unterschrift = form.querySelector("#fotoliste input"); if (unterschrift) { unterschrift.value = "Typenschild"; unterschrift.dispatchEvent(new Event("input", { bubbles: true })); }
    const knopf = form.querySelectorAll("#fotoliste button")[1]; if (knopf) knopf.click(); await A.warte(200);
    const nachEntfernen = form._fotos.liste().map((f) => [f.name, f.hinweis]);
    document.getElementById("f_allesok").click(); A.unterschreiben(form);
    const n = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === n; i++) await A.warte(250);
    await A.warte(1500);
    const p = A.db("protokolle")[0] || {};
    return { liste, nachEntfernen, info: form.querySelector("#f_fotoinfo") ? form.querySelector("#f_fotoinfo").textContent : null,
      fotosGespeichert: (p.fotos || []).map((f) => [f.name, f.hinweis, !!(f.pfad || f.datenUrl || f.url)]), fotoTabelle: A.db("fotos").length, toasts: A.toasts };
  } },
  { name: "protokoll-formular-leeren", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    let form = document.getElementById("proto");
    A.setze(form, "#f_bem", "weg damit"); form.querySelector("#addMangel").click(); A.unterschreiben(form); await A.warte(200);
    document.getElementById("reset").click(); await A.warte(800);
    form = document.getElementById("proto");
    return { werte: A.werte(form), html: A.html(form), toasts: A.toasts };
  } },
  { name: "protokoll-anlage-fehlt-dialog", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    const form = document.getElementById("proto");
    const anl = A.html(form.querySelector("#anlagen"));
    form.querySelector("#addAnlage").click(); await A.warte(600);
    const d = [...document.querySelectorAll(".assistent")].pop();
    return { anl, dialog: d ? A.html(d) : null, toasts: A.toasts };
  } },
  { name: "protokoll-schritt-fuer-schritt", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    document.getElementById("p_gefuehrt").click(); await A.warte(500);
    const schritte = await A.durchklicken();
    const form = document.getElementById("proto");
    return { schritte, werte: form ? A.werte(form) : null, toasts: A.toasts, protokolle: A.db("protokolle") };
  } },
  { name: "protokoll-schritt-stoerung", konto: "techniker", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='stoerung'; S.bearbeiten=null; S.protoStandort='TS2'; S.protoPos=null; S.view='protokoll'; render(); 1");
    await A.warte(500);
    document.getElementById("p_gefuehrt").click(); await A.warte(500);
    const schritte = await A.durchklicken();
    const form = document.getElementById("proto");
    return { schritte, werte: form ? A.werte(form) : null, toasts: A.toasts, protokolle: A.db("protokolle") };
  } },
  { name: "protokoll-schritt-korrektur", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS1'; S.protoPos='TP1'; S.view='protokoll'; render(); 1");
    await A.warte(500);
    let form = document.getElementById("proto");
    document.getElementById("f_allesok").click(); A.setze(form, "#f_bem", "Erste Fassung"); A.unterschreiben(form);
    const n = window.__db.tabellen.protokolle.length;
    document.getElementById("save").click();
    for (let i = 0; i < 40 && window.__db.tabellen.protokolle.length === n; i++) await A.warte(250);
    await A.warte(1000);
    window.__gesp = x("alleProtokolle()")[0];
    x("formDirty=false; S.bearbeiten={x:window.__gesp}; S.view='protokoll'; render(); 1"); await A.warte(800);
    A.setze(document.getElementById("proto"), "#f_grund", "Ergänzt");
    document.getElementById("p_gefuehrt").click(); await A.warte(500);
    const schritte = await A.durchklicken();
    return { schritte, toasts: A.toasts, protokolle: A.db("protokolle"), aenderungen: A.db("aenderungen") };
  } },
  /* ---- Verwaltung: Markt- und Anlagen-Editor ---- */
  { name: "verwaltung-editor-anzeigen", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:'TS1', entwurf:null}; render(); 1"); await A.warte(600);
    const c = document.getElementById("adm_editor");
    return { html: A.html(c), werte: c ? A.werte(c) : null };
  } },
  { name: "verwaltung-markt-bearbeiten-speichern", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:'TS2', entwurf:null}; render(); 1"); await A.warte(600);
    const c = document.getElementById("adm_editor"), stand = A.dbStand();
    A.setze(c, "#a_name", "Testfiliale 902 Neu"); A.setze(c, "#a_notiz", "Schlüssel beim Marktleiter");
    c.querySelector("#a_speichern").click(); await A.warte(500);
    const ohneGrund = A.sichtbar(c);
    A.setze(c, "#a_grund", "Name korrigiert");
    c.querySelector("#a_speichern").click(); await A.warte(1500);
    return { ohneGrund, db: A.dbNeu(stand), toasts: A.toasts, nachher: A.html(document.getElementById("adm_editor")) };
  } },
  { name: "verwaltung-anlage-dazu-speichern", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:'TS3', entwurf:null}; render(); 1"); await A.warte(600);
    const c = document.getElementById("adm_editor"), stand = A.dbStand();
    c.querySelector("#a_plus").click(); await A.warte(400);
    const karten = c.querySelectorAll("#a_anlagen > *"), neu = karten[karten.length - 1];
    const vorher = A.html(neu);
    [].forEach.call(neu ? neu.querySelectorAll("input[type=text]") : [], (e, i) => { if (!e.value) { e.value = i === 0 ? "Split Büro" : (/kg|kW|zahl/i.test(e.id + e.className) ? "2" : "T" + i); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } });
    [].forEach.call(neu ? neu.querySelectorAll("select") : [], (e) => { if (e.options.length > 1 && !e.value) { e.selectedIndex = 1; e.dispatchEvent(new Event("change", { bubbles: true })); } });
    A.setze(c, "#a_grund", "Anlage vor Ort gefunden");
    c.querySelector("#a_speichern").click(); await A.warte(1500);
    return { vorher, db: A.dbNeu(stand), toasts: A.toasts, fehler: A.sichtbar(document.getElementById("adm_editor") || document.body) };
  } },
  { name: "verwaltung-termin-und-status", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:'TS4', entwurf:null}; render(); 1"); await A.warte(600);
    const c = document.getElementById("adm_editor"), stand = A.dbStand();
    const sel = [].filter.call(c.querySelectorAll("#a_anlagen select"), (s) => s.options.length > 3)[0];
    if (sel) { sel.selectedIndex = (sel.selectedIndex + 2) % sel.options.length; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    const st = c.querySelector("#a_status"); const opts = st ? [].map.call(st.options, (o) => o.value) : [];
    if (st) { st.value = opts.filter((v) => v !== st.value)[0]; st.dispatchEvent(new Event("change", { bubbles: true })); }
    await A.warte(200);
    const mitStatus = A.html(c);
    A.setze(c, "#a_grund", "Termin verschoben");
    const pg = c.querySelector("#a_pausiertGrund"); if (pg) A.setze(c, "#a_pausiertGrund", "Umbau");
    c.querySelector("#a_speichern").click(); await A.warte(1500);
    return { opts, mitStatus, db: A.dbNeu(stand), toasts: A.toasts };
  } },
  { name: "verwaltung-entfernen-und-zurueck", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:'TS5', entwurf:null}; render(); 1"); await A.warte(600);
    let c = document.getElementById("adm_editor"); const stand = A.dbStand();
    A.setze(c, "#a_grund", "Markt geschlossen"); c.querySelector("#a_weg").click(); await A.warte(1500);
    const nachWeg = { db: A.dbNeu(stand), sel: x("S.adm.sel"), toasts: A.toasts.slice() };
    x("S.adm.sel='TS5'; render(); 1"); await A.warte(600);
    c = document.getElementById("adm_editor");
    const zur = c && c.querySelector("#a_zurueck");
    if (zur) { A.setze(c, "#a_grund", "doch wieder offen"); zur.click(); await A.warte(1500); }
    const c2 = document.getElementById("adm_editor"), reset = c2 && c2.querySelector("#a_reset");
    let nachReset = null;
    if (reset) { A.setze(c2, "#a_grund", "alles zurück"); reset.click(); await A.warte(1500); nachReset = A.dbNeu(stand); }
    return { nachWeg, zurueckDa: !!zur, db: A.dbNeu(stand), resetDa: !!reset, nachReset, toasts: A.toasts };
  } },
  { name: "verwaltung-neuer-markt", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("S.view='verwaltung'; S.adm={tab:'maerkte', suche:'', filter:'alle', sort:'filiale', auf:true, sel:null, entwurf:null}; render(); 1"); await A.warte(600);
    const stand = A.dbStand();
    document.getElementById("adm_neu").click(); await A.warte(600);
    const c = document.getElementById("adm_editor");
    const leer = A.html(c);
    const werte = { a_filiale: "999", a_name: "Neuer Testmarkt", a_adresse: "1010 Testhausen, Neugasse 9", a_plz: "1010", a_ort: "Testhausen" };
    Object.keys(werte).forEach((k) => { if (c.querySelector("#" + k)) A.setze(c, "#" + k, werte[k]); });
    [].forEach.call(c.querySelectorAll("#a_anlagen select"), (e) => { if (e.options.length > 1 && !e.value) { e.selectedIndex = 1; e.dispatchEvent(new Event("change", { bubbles: true })); } });
    [].forEach.call(c.querySelectorAll("#a_anlagen input[type=text]"), (e, i) => { if (!e.value && i === 0) { e.value = "Split Kasse"; e.dispatchEvent(new Event("input", { bubbles: true })); } });
    A.setze(c, "#a_grund", "neu übernommen");
    c.querySelector("#a_speichern").click(); await A.warte(1500);
    return { leer, db: A.dbNeu(stand), toasts: A.toasts, fehler: A.sichtbar(document.getElementById("adm_editor") || document.body) };
  } },
  { name: "protokoll-ausgefuellt-fuer", konto: "admin", code: async () => {
    const x = window.__t.x, A = window.__ab;
    x("formDirty=false; S.protoArt='wartung'; S.bearbeiten=null; S.protoStandort='TS3'; S.protoPos=null; S.view='protokoll'; render(); 1");
    await A.warte(600);
    const form = document.getElementById("proto");
    return { html: A.html(form), werte: A.werte(form) };
  } },
];

/* Zufällige/zeitabhängige Teile vereinheitlichen, damit nur echte Unterschiede auffallen */
function glatt(o) {
  /* Zeichenketten: Zeitstempel, Millisekunden, Bilddaten und zufällige Kennungen vereinheitlichen */
  const text = (v) => v.replace(/\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\b/g, "ZEIT").replace(/\b1[78]\d{11}\b/g, "MS").replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, "data:…")
    .replace(/\b(p|c|e|n|N|t|NP|st|m|f|k|z|a|w)_?(?=[0-9a-z]*\d)[0-9a-z]{7,}\b/g, "$1_ID");
  const geh = (v, k) => {
    /* vergebene Kennungen und Zeitstempel (die Uhr läuft ab der festen Startzeit weiter) */
    if (typeof v === "string" && /^(id|_id|client_id|protokoll_id|zeit|erstellt|geaendert|created_at|updated_at|gespeichert|am)$/.test(k)) return v ? "·" : v;
    if (typeof v === "string") return text(v);
    if (Array.isArray(v)) return v.map((x) => geh(x, ""));
    if (v && typeof v === "object") { const o = {}; for (const kk of Object.keys(v)) o[text(kk)] = geh(v[kk], kk); return o; }
    return v;
  };
  return geh(JSON.parse(JSON.stringify(o)), "");
}

function unterschiede(a, b, pfad = "", aus = []) {
  if (aus.length > 30) return aus;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { aus.push(pfad + ": " + kurz(a) + " ≠ " + kurz(b)); return aus; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) unterschiede(a[k], b[k], pfad + "." + k, aus);
    return aus;
  }
  if (a !== b) {
    if (typeof a === "string" && a.length > 200) { let i = 0; while (i < a.length && a[i] === b[i]) i++;
      aus.push(pfad + " ab Zeichen " + i + ":\n   alt: …" + a.slice(Math.max(0, i - 80), i + 120) + "\n   neu: …" + b.slice(Math.max(0, i - 80), i + 120)); }
    else aus.push(pfad + ": " + kurz(a) + " ≠ " + kurz(b));
  }
  return aus;
}
const kurz = (v) => { const s = JSON.stringify(v); return s && s.length > 160 ? s.slice(0, 160) + "…" : s; };

async function laufen(html, browser, port) {
  const erg = {};
  for (const ab of ABLAEUFE) {
    if (filter && !ab.name.includes(filter)) continue;
    const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const seite = await kontext.newPage();
    await seite.clock.install({ time: ZEIT });
    const fehler = [];
    seite.on("pageerror", (e) => fehler.push(e.message));
    seite.on("dialog", (d) => d.accept());
    await seite.goto(`http://localhost:${port}/index.html`, { waitUntil: "load" });
    await seite.waitForFunction(() => !!window.__t, null, { timeout: 30000 });
    await seite.evaluate((m) => window.__t.x(`Store.sb.auth.signInWithPassword({email:'${m}',password:'test123'})`), KONTEN[ab.konto]);
    await seite.waitForFunction(() => window.__t.x("Rolle.da && Store.modus==='supabase'"), null, { timeout: 15000 });
    await seite.waitForTimeout(400);
    await seite.addScriptTag({ content: SEITENHILFEN });
    let r;
    try { r = await seite.evaluate(`(${ab.code.toString()})()`); } catch (e) { r = { abbruch: e.message.split("\n")[0] }; }
    /* versehentlich entstandene globale Variablen (etwa durch ein fehlendes var) */
    const globale = await seite.evaluate(() => Object.keys(window).filter((k) => !/^__/.test(k)).sort());
    erg[ab.name] = glatt({ ...r, laufzeitfehler: fehler, globale });
    await kontext.close();
  }
  return erg;
}

const { chromium } = await import("playwright");
let browser;
try { browser = await chromium.launch(); } catch (e) { for (const channel of ["chrome", "msedge"]) { try { browser = await chromium.launch({ channel }); break; } catch (x) {} } }
const altHtml = execFileSync("git", ["show", altRef + ":index.html"], { cwd: WURZEL, maxBuffer: 1 << 28 }).toString();
const neuHtml = readFileSync(join(WURZEL, "index.html"), "utf8");
const s1 = server(testfassung(altHtml)), s2 = server(testfassung(neuHtml));
const [p1, p2] = await Promise.all([lauschen(s1), lauschen(s2)]);
const [alt, neu] = [await laufen(altHtml, browser, p1), await laufen(neuHtml, browser, p2)];
await browser.close(); s1.close(); s2.close();

let abw = 0;
for (const name of Object.keys(alt)) {
  const u = unterschiede(alt[name], neu[name]);
  const lf = (neu[name].laufzeitfehler || []).length;
  if (u.length) { abw++; console.log("✗ " + name + " – " + u.length + " Abweichung(en):\n  " + u.join("\n  ")); }
  else console.log("✓ " + name + (lf ? " (gleich, aber Laufzeitfehler in beiden: " + neu[name].laufzeitfehler.join("; ") + ")" : "") + (neu[name].abbruch ? " (Ablauf brach in beiden ab: " + neu[name].abbruch + ")" : ""));
}
if (process.env.AB_DATEI) (await import("node:fs")).writeFileSync(process.env.AB_DATEI, JSON.stringify(neu, null, 1));
console.log(abw ? `\n${abw} Ablauf/Abläufe weichen ab (alter Stand ${altRef}).` : `\nKeine Abweichung zum alten Stand ${altRef}.`);
process.exit(abw ? 1 : 0);
