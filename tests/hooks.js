/* Nur für den Testlauf: gibt die Innereien der App nach außen, damit sich
   Abläufe von der Konsole aus durchspielen lassen. Wird vom Sync-Skript an
   das Ende von starteWartungsleitstand() eingefügt. Nichts davon steht in
   der ausgelieferten App. */
window.__t = {
  get S(){ return S; },
  get Store(){ return Store; },
  get Admin(){ return Admin; },
  get ST(){ return ST; },
  get POS(){ return POS; },
  get ALLE_ST(){ return ALLE_ST; },
  get ALLE_POS(){ return ALLE_POS; },
  get OFFENE(){ return OFFENE; },
  get byId(){ return byId; },
  get formDirty(){ return formDirty; },
  render: render,
  /* beliebige interne Funktion oder Variable: __t.x("stoerungDialog") */
  x: function(n){ return eval(n); },
  pdfErzeugen: pdfErzeugen, druckansichtZeigen: druckansichtZeigen, protokollPdfErzeugen: protokollPdfErzeugen, rapportVon: rapportVon, stoerungenDerAnlage: stoerungenDerAnlage, pruefListe: pruefListe,
  berechneFaelligkeiten: berechneFaelligkeiten,
  wendeStammdatenAn: wendeStammdatenAn,
  alleProtokolle: alleProtokolle,
  offeneStoerungen: offeneStoerungen,
  istStoerung: istStoerung,
  anlageDaten: anlageDaten,
  anlageLeader: anlageLeader,
  anlageLuecken: anlageLuecken,
  anlageVon: anlageVon,
  anlagenDesMarkts: anlagenDesMarkts,
  anlagenName: anlagenName,
  anzahlAnlagen: anzahlAnlagen,
  auffaelligkeiten: auffaelligkeiten,
  stName: stName,
  dfmt: dfmt,
  isoLokal: isoLokal,
  entwurfHolen: entwurfHolen,
  entwurfWeg: entwurfWeg,
  ladeAuftragPdf: ladeAuftragPdf,
  speichereAuftragPdf: speichereAuftragPdf,
  datenUrlBytes: datenUrlBytes
};
/* Hilfen, die jeder Test braucht */
window.__warte = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
window.__fehler = [];
window.addEventListener("error", function(e){ window.__fehler.push(String(e.message)); });
window.addEventListener("unhandledrejection", function(e){ window.__fehler.push("promise: "+String(e.reason)); });
(function(){
  var alt = console.error;
  console.error = function(){ window.__fehler.push([].join.call(arguments, " ")); alt.apply(console, arguments); };
})();
/* Browser-Dialoge blockieren den Tab und damit jeden Test: abfangen und
   mitschreiben. Antworten lassen sich vorgeben (__antwort.confirm = false). */
window.__dialoge = [];
window.__antwort = { confirm: true, prompt: "Testgrund" };
window.confirm = function(m){ window.__dialoge.push(["confirm", String(m)]); return window.__antwort.confirm; };
window.alert = function(m){ window.__dialoge.push(["alert", String(m)]); };
window.prompt = function(m, v){ window.__dialoge.push(["prompt", String(m)]); return window.__antwort.prompt; };
window.print = function(){ window.__dialoge.push(["print", ""]); };
window.__fenster = [];
window.open = function(u){ var f = { closed: false, close: function(){ f.closed = true; }, location: { href: u || "" } };
  window.__fenster.push(f); return f; };
