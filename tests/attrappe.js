/* Nachgebaute Supabase-Schnittstelle für die automatischen Tests (tests/app-tests.mjs) – nur Code, Startbestand aus seed.json (erfunden). */
(function(){
  "use strict";
  var T=["gelernte_werte","fahrzeuge","fahrzeug_eintraege","fahrzeug_kosten","kontakte","protokoll_vermerke","planung","planung_privat","belege","katalog","stempel","einstellungen","projekte","arbeitszeiten","anlagenfotos","touren","kundenliste","gelesen","push_ereignisse","kennzahlen","chat","abrechnung","push_abos","protokolle","aenderungen","stammdaten","admins","berichte","protokoll_fassungen","rollen","ki_nutzung","posteingang","stammdaten_lesen","aenderungswuensche","vor_ort_fragen","werkzeug","werkzeug_verlauf","bedarf","packlisten","auslagen","auslagen_konto"];
  var DB; try{ DB=JSON.parse(localStorage.getItem("attrappe_db")||"null"); }catch(e){ DB=null; }
  /* leerer Speicher (neuer Port, nach __db.zuruecksetzen()): Startbestand aus seed.json */
  if(!DB){ DB={}; try{ var x=new XMLHttpRequest(); x.open("GET","seed.json?"+Date.now(),false); x.send();
    if(x.status===200) DB=JSON.parse(x.responseText); }catch(e){} }
  T.forEach(function(t){ if(!Array.isArray(DB[t])) DB[t]=[]; });
  function sichern(){ try{ localStorage.setItem("attrappe_db",JSON.stringify(DB)); }catch(e){} }
  var DATEIEN={}, sitzung=null, horcher=[], z=0;
  window.__abgelehnt=[];
  /* Benutzerprofil (user_metadata) je Adresse – wie in Supabase über Sitzungen hinweg */
  function meta(m){ DB._meta=DB._meta||{}; return DB._meta[m]=DB._meta[m]||{}; }
  function nutzer(m){ return {id:"u_"+String(m).replace(/[^a-z0-9]/gi,"_"), email:m, user_metadata:JSON.parse(JSON.stringify(meta(m)))}; }
  function melde(){ horcher.forEach(function(cb){ try{ cb(sitzung?"SIGNED_IN":"SIGNED_OUT",sitzung); }catch(e){} }); }
  function uid(){ return sitzung?sitzung.user.id:null; }
  function admin(){ return !!(sitzung && DB.admins.some(function(a){ return a.user_id===uid(); })); }
  function rolleJetzt(){ return (DB.rollen.filter(function(r){ return r.user_id===uid(); })[0]||{}).rolle||"techniker"; }
  function passt(r,f){ return f.every(function(x){
    if(x.a==="eq") return r[x.s]===x.w;
    if(x.a==="is") return x.w===null?(r[x.s]==null):(r[x.s]===x.w);
    if(x.a==="gte") return String(r[x.s]||"")>=String(x.w);
    if(x.a==="like"){ var re=new RegExp("^"+String(x.w).split("%").map(function(t){ return t.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"); }).join(".*")+"$"); return re.test(String(r[x.s]||"")); }
    if(x.a==="in") return (x.w||[]).indexOf(r[x.s])>=0;
    if(x.a==="lt") return String(r[x.s]||"")<String(x.w);
    /* not(spalte,"is",null) – Spalte ist gesetzt */
    if(x.a==="nichtIs") return x.w===null?(r[x.s]!=null):(r[x.s]!==x.w);
    return true; }); }
  function darf(tab,art,zeile,alt){
    if(!sitzung) return "nicht angemeldet";
    var rolle=(DB.rollen.filter(function(r){ return r.user_id===uid(); })[0]||{}).rolle||"techniker";
    if(art!=="select" && (rolle==="kunde"||rolle==="praesentation") && !(tab==="aenderungswuensche" && art==="insert" && rolle==="praesentation")) return "nur lesen ("+rolle+")";
    if(art==="select" && (rolle==="kunde"||rolle==="praesentation") && (tab==="stammdaten"||tab==="aenderungen")) return "nur lesen: "+tab;
    /* wie werkzeug.sql: lesen nur, wer mitarbeitet (darf_schreiben) – Kunde und Präsentation sehen nichts davon */
    if(art==="select" && (rolle==="kunde"||rolle==="praesentation") && ["werkzeug","werkzeug_verlauf","bedarf","packlisten"].indexOf(tab)>=0) return "nur lesen: "+tab;
    /* wie posteingang-lesen.sql: den Posteingang (weitergeleitete Mails auch anderer Kunden) liest nur, wer mitarbeitet */
    if(art==="select" && (rolle==="kunde"||rolle==="praesentation") && tab==="posteingang") return "nur lesen: posteingang gesperrt";
    if(tab==="stammdaten"){
      var typ=(zeile&&zeile.typ)||(alt&&alt.typ);
      if(art==="delete" && !admin()) return "stammdaten: Loeschen nur fuer Admins";
      if(art!=="select" && ["position","stoerung"].indexOf(typ)<0 && !admin())
        return "stammdaten: Standortdaten nur fuer Admins";
    }
    if(tab==="protokolle" && art==="update"){
      var g=zeile.korrektur_grund;
      if(g==null||!String(g).trim()) return "protokolle: Korrektur ohne Begruendung";
      if(("geloescht" in zeile) && zeile.geloescht!==(alt?alt.geloescht:null) && !admin())
        return "protokolle: Loeschen nur fuer Admins";
    }
    if(tab==="protokolle" && art==="delete") return "protokolle: gesperrt";
    /* Arbeitszeiten: bestätigt = gesperrt (außer Inhaber); fremde nur der Inhaber */
    if(tab==="arbeitszeiten" && art!=="select" && rolle!=="inhaber"){
      var zz=alt||zeile||{};
      if(alt && alt.bestaetigt) return "arbeitszeiten: bestaetigt";
      if(zz.user_id && zz.user_id!==uid()) return "arbeitszeiten: fremd";
      if(zeile && zeile.bestaetigt) return "arbeitszeiten: nur Inhaber bestaetigt";
    }
    if(tab==="projekte" && art==="delete" && rolle!=="inhaber") return "projekte: loeschen nur Inhaber";
    if(tab==="arbeitszeiten" && art==="delete" && rolle!=="inhaber" && alt && /^stempel|^kalender/.test(alt.quelle||"")) return "arbeitszeiten: gestempelt oder aus dem Kalender";
    if(tab==="arbeitszeiten" && art==="insert" && rolle!=="inhaber" && zeile && zeile.quelle && zeile.quelle!=="hand") return "arbeitszeiten: nur von Hand";
    /* wie startpunkte.sql: den Startpunkt („startpunkt:…“) dürfen alle anlegen und ändern, die schreiben dürfen – löschen nicht */
    var startpunkt=function(z){ return !!z && /^startpunkt:/.test(z.schluessel||""); };
    var startpunktOk=(art==="insert" && startpunkt(zeile)) || (art==="update" && startpunkt(alt) && (!zeile || !("schluessel" in zeile) || startpunkt(zeile)));
    if(tab==="einstellungen" && art!=="select" && rolle!=="inhaber" && !startpunktOk) return "einstellungen: nur Inhaber";
    /* wie projekte-ablauf.sql: katalog.text not null check (length(trim(text)) between 1 and 4000) */
    if(tab==="katalog" && (art==="insert"||art==="update") && zeile && (art==="insert" || ("text" in zeile)) && !String(zeile.text==null?"":zeile.text).trim()) return "katalog: text verletzt check";
    /* wie werkzeug.sql: Werkzeug und Packlisten löscht nur das Büro, Bedarf wer ihn angelegt hat oder das Büro; den Verlauf schreibt nur der Server */
    if((tab==="werkzeug"||tab==="packlisten") && art==="delete" && !(admin() || rolle==="inhaber")) return tab+": loeschen nur Buero";
    if(tab==="bedarf" && art==="delete" && !(admin() || rolle==="inhaber" || (alt && alt.erstellt_von===uid()))) return "bedarf: loeschen nur eigene";
    if(tab==="werkzeug_verlauf" && art!=="select") return "werkzeug_verlauf: nur der Server";
    /* wie reisekosten.sql: eigene (der Inhaber alle); abgegeben ändert nur der Inhaber; ausbezahlt setzt nur er */
    if((tab==="auslagen"||tab==="auslagen_konto") && art!=="select" && rolle!=="inhaber"){
      var az=alt||zeile||{};
      if(az.user_id && az.user_id!==uid()) return tab+": fremd";
      if(tab==="auslagen" && alt && alt.status!=="offen") return "auslagen: schon abgegeben";
      if(tab==="auslagen" && zeile && zeile.status==="ausbezahlt") return "auslagen: ausbezahlt nur Inhaber";
    }
    if(tab==="planung" && (art==="update"||art==="delete") && alt && alt.privat && alt.erstellt_von!==uid() && (alt.wer||[]).indexOf(uid())<0) return "planung: privat";
    if(tab==="planung" && art==="update" && alt && alt.kategorie==="urlaub" && rolle!=="inhaber" && zeile && (zeile.status==="genehmigt"||zeile.status==="abgelehnt") && zeile.status!==alt.status) return "Urlaub genehmigt nur der Inhaber";
    if(tab==="aenderungen" && art!=="insert" && art!=="select") return "aenderungen: unveraenderlich";
    /* wie vor-ort-fragen.sql: Büro stellt und erledigt, alle (die schreiben dürfen) antworten */
    if(tab==="vor_ort_fragen"){
      var buero=admin() || rolle==="inhaber";
      if((art==="insert"||art==="delete") && !buero) return "vor_ort_fragen: nur Buero";
      if(art==="update" && !buero){
        var nurAntwort=Object.keys(zeile||{}).every(function(k){ return ["antwort","beantwortet","beantwortet_von"].indexOf(k)>=0; });
        if(!nurAntwort) return "vor_ort_fragen: Frage und Erledigt nur Buero";
        if(alt && alt.erledigt) return "vor_ort_fragen: schon erledigt";
      }
    }
    return null;
  }
  /* wie der Trigger planung_pruefen (planung.sql): privat nur „Abwesend“, Urlaub genehmigt nur der Inhaber */
  function planPruefen(r, alt){
    var rl=(DB.rollen.filter(function(x){ return x.user_id===uid(); })[0]||{}).rolle||"techniker";
    if(r.privat || r.kategorie==="privat"){ r.privat=true; r.kategorie="privat"; r.titel="Abwesend"; r.details=null; r.standort_id=r.projekt_id=r.projekt_schritt=r.stoerung_id=null; }
    if(r.kategorie==="urlaub" && rl!=="inhaber"){
      if(!alt) r.status="beantragt";
      else if(r.status!==alt.status || r.datum!==alt.datum || r.datum_bis!==alt.datum_bis || JSON.stringify(r.wer)!==JSON.stringify(alt.wer)) r.status="beantragt";
    }
    if(r.kategorie==="urlaub" && (r.status==="offen"||r.status==="erledigt"||!r.status)) r.status="beantragt";
    if(!alt){ r.erstellt_von=uid(); r.erstellt=new Date().toISOString(); r.status=r.status||"offen"; r.wer=r.wer||[]; r.wer_namen=r.wer_namen||[]; r.position_ids=r.position_ids||[]; }
    else { r.erstellt_von=alt.erstellt_von; r.erstellt=alt.erstellt; }
    r.geaendert=new Date().toISOString();
  }
  /* wie der Trigger planung_stunden (stunden-kalender.sql): Urlaub (genehmigt), Krankenstand, Schule,
     Zeitausgleich je Arbeitstag mit dem Tagessoll in die Stunden – anlegen nur für sich selbst oder als Büro;
     ein bestätigter Monat (eine Person hat dort einen bestätigten Eintrag) bleibt unberührt */
  function monatBestaetigt(u, d){ return DB.arbeitszeiten.some(function(x){ return x.user_id===u && x.bestaetigt && String(x.datum).slice(0,7)===String(d).slice(0,7); }); }
  function stundenSync(id){
    var p=DB.planung.filter(function(x){ return x.id===id; })[0], zart=null, personen=[], bis=null;
    var rl=(DB.rollen.filter(function(x){ return x.user_id===uid(); })[0]||{}).rolle;
    var soll=function(d){ return typeof window.sollMinutenTag==='function' ? window.sollMinutenTag(d) : ([480,480,480,480,390,0,0])[(new Date(d+'T12:00:00').getDay()+6)%7]; };
    var plus=function(d){ var x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+1); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); };
    if(p && p.art==='termin' && p.datum && p.status!=='abgelehnt' && ['urlaub','krank','schule','zeitausgleich'].indexOf(p.kategorie)>=0 && (p.kategorie!=='urlaub' || p.status==='genehmigt')){
      zart=p.kategorie; personen=(p.wer&&p.wer.length)?p.wer:[p.erstellt_von]; bis=p.datum_bis&&p.datum_bis>p.datum?p.datum_bis:p.datum; }
    for(var i=DB.arbeitszeiten.length-1;i>=0;i--){ var az=DB.arbeitszeiten[i];
      if(az.planung_id!==id || az.quelle!=='kalender' || az.bestaetigt) continue;
      /* gelöscht (Trigger beim DELETE): entfernen außer im bestätigten Monat; sonst wie planung_stunden_sync Schritt 1 */
      if(!p ? !monatBestaetigt(az.user_id, az.datum) : (!zart || personen.indexOf(az.user_id)<0 || az.datum<p.datum || az.datum>bis || !soll(az.datum) || monatBestaetigt(az.user_id, az.datum))) DB.arbeitszeiten.splice(i,1); }
    if(!zart) return;
    personen.forEach(function(u, k){
      if(!(u===uid() || rl==='inhaber' || admin())) return;
      for(var d=p.datum, n=0; d<=bis && n<93; d=plus(d), n++){
        var sm=soll(d); if(!sm || monatBestaetigt(u, d)) continue;
        var min=sm;
        if(bis===p.datum && p.beginn && p.ende){ var sp=(+p.ende.slice(0,2)*60 + +p.ende.slice(3))-(+p.beginn.slice(0,2)*60 + +p.beginn.slice(3)); if(sp>0) min=Math.min(sp, sm); }
        var da=DB.arbeitszeiten.filter(function(x){ return x.planung_id===id && x.quelle==='kalender' && x.user_id===u && x.datum===d; })[0];
        if(da){ if(!da.bestaetigt){ da.art=zart; da.minuten=min; da.taetigkeit=p.titel; } continue; }
        if(DB.arbeitszeiten.some(function(x){ return x.user_id===u && x.datum===d && (x.art===zart || x.planung_id===id); })) continue;
        DB.arbeitszeiten.push({id:'x'+Date.now().toString(36)+(++z), user_id:u, name:(p.wer_namen||[])[k]||null, datum:d, minuten:min, art:zart, taetigkeit:p.titel,
          quelle:'kalender', planung_id:id, pause_min:0, erstellt:new Date().toISOString()});
      }
    });
  }
  /* wie werkzeug_merken und werkzeug_verlauf_schreiben (werkzeug.sql): Ort ohne passende Angabe aufräumen,
     Verlauf beim Anlegen und bei jedem Wechsel von Ort, Person, Fahrzeug, Projekt, Markt oder Zustand */
  function wzMerken(r){
    if(r.standort_art!=="fahrzeug"){ r.fahrzeug_id=null; r.fahrzeug_name=null; }
    if(r.standort_art!=="person"){ r.person_id=null; r.person_name=null; }
    if(r.standort_art!=="baustelle"){ r.projekt_id=null; r.standort_id=null; }
    r.geaendert=new Date().toISOString();
  }
  function wzVerlauf(r, alt){
    if(alt && ["standort_art","standort_text","fahrzeug_id","person_id","projekt_id","standort_id","zustand"].every(function(k){ return (r[k]==null?null:r[k])===(alt[k]==null?null:alt[k]); })) return;
    var ort={lager:"Lager", fahrzeug:"Fahrzeug "+(r.fahrzeug_name||"?"), person:"bei "+(r.person_name||"?"), baustelle:"Baustelle/Markt", reparatur:"in Reparatur"}[r.standort_art]||"sonst";
    DB.werkzeug_verlauf.push({id:"x"+(++z), werkzeug_id:r.id, zeit:new Date().toISOString(), von:uid(), von_name:r.geaendert_von||null,
      standort:ort+(r.standort_text&&String(r.standort_text).trim()?" – "+r.standort_text:""), zustand:r.zustand});
  }
  /* wie der Index stoerung_auftrag_einmal (stoerung-eindeutig.sql): eine Auftragsnummer nur einmal als
     (nicht gelöschte) Störung – sonst lehnt die Datenbank mit 23505 ab */
  function stoerNrDoppelt(tname, d){
    if(tname!=="stammdaten" || !d || d.typ!=="stoerung") return null;
    var nr=function(r){ var f=r.felder||{}; return (f.geloescht && f.geloescht!=="false") ? "" : String(f.auftragsnummer||"").trim(); };
    var n=nr(d); if(!n) return null;
    return DB.stammdaten.some(function(r){ return r.id!==d.id && r.typ==="stoerung" && nr(r)===n; })
      ? {code:"23505", message:'duplicate key value violates unique constraint "stoerung_auftrag_einmal"'} : null;
  }
  /* wie reisekosten.sql: km ist numeric(8,1) – Postgres rundet „12,35“ auf 12,4 (die kleine Zugabe gleicht
     die Gleitkomma-Darstellung von 12,35 aus); dazu die Prüfregeln (check) mit der englischen Meldung von Postgres */
  function kmSpalte(km){ return Math.round(+km*10+1e-6)/10; }
  function auslagenCheck(r){
    var weg=function(n){ return 'new row for relation "auslagen" violates check constraint "auslagen_'+n+'_check"'; };
    if(r.text!=null && String(r.text).length>300) return weg("text");
    if(r.km!=null && !(r.km>0 && r.km<=5000)) return weg("km");
    if(r.betrag!=null && !(r.betrag>=0 && r.betrag<=100000)) return weg("betrag");
    if(r.ohne_beleg!=null && String(r.ohne_beleg).length>300) return weg("ohne_beleg");
    if(r.notiz!=null && String(r.notiz).length>500) return weg("notiz");
    return null;
  }
  function Q(t){ this.t=t; this.a="select"; this.f=[]; this.d=null; this.o={}; this.ord=null; this.lim=null; this.sp=null; }
  Q.prototype.select=function(s){ if(typeof s==="string"&&s&&s!=="*") this.sp=s.split(",").map(function(x){return x.trim();}); return this; };
  Q.prototype.insert=function(d){ this.a="insert"; this.d=d; return this; };
  Q.prototype.upsert=function(d,o){ this.a="upsert"; this.d=d; this.o=o||{}; return this; };
  Q.prototype.gte=function(s,w){ this.f.push({a:"gte",s:s,w:w}); return this; };
  Q.prototype.like=function(s,w){ this.f.push({a:"like",s:s,w:w}); return this; };
  Q.prototype.lt=function(s,w){ this.f.push({a:"lt",s:s,w:w}); return this; };
  Q.prototype.update=function(d){ this.a="update"; this.d=d; return this; };
  Q.prototype["delete"]=function(){ this.a="delete"; return this; };
  Q.prototype.eq=function(s,w){ this.f.push({a:"eq",s:s,w:w}); return this; };
  Q.prototype.is=function(s,w){ this.f.push({a:"is",s:s,w:w}); return this; };
  Q.prototype["in"]=function(s,w){ this.f.push({a:"in",s:s,w:w}); return this; };
  Q.prototype.not=function(s,op,w){ if(op==="is") this.f.push({a:"nichtIs",s:s,w:w}); return this; };
  Q.prototype.order=function(s,o){ (this.ords=this.ords||[]).push({s:s,auf:!(o&&o.ascending===false)}); this.ord=this.ords[0]; return this; };
  Q.prototype.limit=function(n){ this.lim=n; return this; };
  /* seitenweises Lesen wie in Supabase (von–bis, beide einschließlich) */
  Q.prototype.range=function(a,b){ this.rng=[a,b]; return this; };
  Q.prototype.lauf=function(){
    var tab=DB[this.t], self=this, erg=[];
    if(!tab) return {data:null,error:{message:"keine Tabelle"}};
    if(!sitzung) return {data:[],error:null};
    if(this.a==="select"){
      var sv=darf(this.t,"select",null,null); if(sv && /nur lesen/.test(sv)) return {data:[],error:null};
      if(this.t==="rollen") { /* wie die Regel: eigene Zeile, Admins alle */ }
      erg=tab.filter(function(r){ return passt(r,self.f); });
      if(this.t==="admins") erg=erg.filter(function(r){ return r.user_id===uid(); });
      if(this.t==="planung_privat") erg=erg.filter(function(r){ return r.user_id===uid(); });   /* wie die Regel: nur die eigenen */
      if(this.t==="arbeitszeiten"||this.t==="auslagen"||this.t==="auslagen_konto"){ var rl=(DB.rollen.filter(function(r){ return r.user_id===uid(); })[0]||{}).rolle; if(rl!=="inhaber") erg=erg.filter(function(r){ return r.user_id===uid(); }); }
      /* wie „fahrzeuge lesen“ (fahrzeuge.sql): Büro alle, sonst nur das Fahrzeug, in dem man Fahrer ist */
      if(this.t==="fahrzeuge"){ var rf=(DB.rollen.filter(function(r){ return r.user_id===uid(); })[0]||{}).rolle; if(!(admin() || rf==="inhaber")) erg=erg.filter(function(r){ return (r.fahrer||[]).indexOf(uid())>=0; }); }
      if(this.ords) erg.sort(function(a,b){ for(var i=0;i<self.ords.length;i++){ var o=self.ords[i],x=a[o.s],y=b[o.s]; var c=(x<y?-1:x>y?1:0)*(o.auf?1:-1); if(c) return c; } return 0; });
      if(this.lim!=null) erg=erg.slice(0,this.lim);
      if(this.rng) erg=erg.slice(this.rng[0], this.rng[1]+1);
      /* wie Supabase (max-rows): höchstens 1000 Zeilen je Abfrage */
      if(erg.length>1000) erg=erg.slice(0,1000);
      return {data:erg.map(function(r){ var k=JSON.parse(JSON.stringify(r));
        if(self.sp){ var o={}; self.sp.forEach(function(s){ o[s]=k[s]; }); return o; } return k; }), error:null};
    }
    var v=null;
    /* wie supabase-js: zurück kommen Kopien, mit .select("id") nur die genannten Spalten */
    var aus=function(l){ return l.map(function(r){ var k=JSON.parse(JSON.stringify(r));
      if(self.sp){ var o={}; self.sp.forEach(function(s){ o[s]=k[s]; }); return o; } return k; }); };
    /* wie die Prüfung in planung.sql: datum_bis nie vor datum */
    var bisVorDatum=function(r){ return self.t==="planung" && r.datum && r.datum_bis && r.datum_bis<r.datum ? 'new row for relation "planung" violates check constraint "planung_check"' : null; };
    if(this.a==="insert"){
      [].concat(this.d).forEach(function(d){ v=v||darf(self.t,"insert",d,null)||bisVorDatum(d); });
      if(v){ window.__abgelehnt.push(v); return {data:null,error:{message:v}}; }
      var dpI=null; [].concat(this.d).forEach(function(d){ dpI=dpI||stoerNrDoppelt(self.t, d); });
      if(dpI) return {data:null,error:dpI};
      var neu=[].concat(this.d).map(function(d){ var r=Object.assign({},d);
        if(r.id==null) r.id="x"+Date.now().toString(36)+(++z);
        if(self.t==="aenderungswuensche"){ r.id=++z; r.von=uid(); r.erstellt=new Date().toISOString(); r.status=r.status||"neu"; r.verlauf=r.verlauf||[]; }
        if(self.t==="protokolle"){ if(r.version==null) r.version=1; if(r.erstellt==null) r.erstellt=new Date().toISOString(); }
        if(self.t==="arbeitszeiten"){ if(!r.user_id) r.user_id=uid(); if(r.pause_min==null) r.pause_min=0; r.erstellt=r.erstellt||new Date().toISOString(); }
        if(self.t==="planung") planPruefen(r, null);
        if(self.t==="vor_ort_fragen") r.angelegt=r.angelegt||new Date().toISOString();
        if(self.t==="auslagen"){ r.user_id=r.user_id||uid(); r.status=r.status||"offen"; r.erstellt=new Date().toISOString(); if(r.km!=null) r.km=kmSpalte(r.km); if(r.art==="km"){ r.km_satz=r.km_satz||0.5; r.betrag=Math.round(r.km*r.km_satz*100)/100; } }
        if(self.t==="auslagen_konto") r.user_id=r.user_id||uid();
        if(self.t==="werkzeug"||self.t==="bedarf"){ r.erstellt_von=uid(); r.erstellt=new Date().toISOString(); r.aktiv=r.aktiv==null?true:r.aktiv; if(self.t==="bedarf"){ r.status=r.status||"offen"; r.beschaffung=r.beschaffung||"mitnehmen"; if(r.status==="erledigt") r.erledigt=new Date().toISOString(); } else { r.zustand=r.zustand||"ok"; r.standort_art=r.standort_art||"lager"; } }
        if(self.t==="projekte"){ r.erstellt=r.erstellt||new Date().toISOString(); r.geaendert=r.geaendert||r.erstellt; r.daten=r.daten||{}; r.verlauf=r.verlauf||[]; }
        return r; });
      if(self.t==="auslagen"){ neu.forEach(function(r){ v=v||auslagenCheck(r); }); if(v){ window.__abgelehnt.push(v); return {data:null,error:{message:v}}; } }
      if(self.t==="werkzeug") neu.forEach(function(r){ wzMerken(r); });
      neu.forEach(function(r){ tab.push(r); }); if(self.t==="planung") neu.forEach(function(r){ stundenSync(r.id); });
      if(self.t==="werkzeug") neu.forEach(function(r){ wzVerlauf(r, null); });
      sichern(); return {data:aus(neu),error:null};
    }
    if(this.a==="upsert"){
      var sp=this.o.onConflict||"id", raus=[];
      var dpU=null; [].concat(this.d).forEach(function(d){ dpU=dpU||stoerNrDoppelt(self.t, d); });
      if(dpU) return {data:null,error:dpU};
      [].concat(this.d).forEach(function(d){
        var sps=sp.split(","); var i=null; for(var k=0;k<tab.length;k++){ if(sps.every(function(s2){ return tab[k][s2]!=null && tab[k][s2]===d[s2]; })){ i=k; break; } }
        /* wie Postgres ON CONFLICT DO NOTHING: vorhandene Zeile bleibt, keine Regelprüfung, nichts zurück */
        if(i!=null && self.o.ignoreDuplicates) return;
        v=v||darf(self.t, i==null?"insert":"update", d, i==null?null:tab[i]);
        if(v) return;
        if(i!=null){
          tab[i]=Object.assign({},tab[i],d); raus.push(tab[i]); }
        else { var r=Object.assign({},d); if(r.id==null) r.id="x"+Date.now().toString(36)+(++z);
          if(self.t==="protokolle"){ if(r.version==null) r.version=1; if(r.erstellt==null) r.erstellt=new Date().toISOString(); }
          tab.push(r); raus.push(r); }
      });
      if(v){ window.__abgelehnt.push(v); return {data:null,error:{message:v}}; }
      sichern(); return {data:aus(raus),error:null};
    }
    if(this.a==="update"){
      var b=tab.filter(function(r){ return passt(r,self.f); });
      b.forEach(function(r){ v=v||darf(self.t,"update",self.d,r)||bisVorDatum(Object.assign({}, r, self.d)); });
      /* Prüfregeln vor dem Ändern – scheitert eine Zeile, bleibt alles, wie es war */
      if(!v && self.t==="auslagen") b.forEach(function(r){ var n=Object.assign({},r,self.d); if(n.km!=null) n.km=kmSpalte(n.km);
        if(n.art==="km") n.betrag=Math.round(n.km*(n.km_satz||0.5)*100)/100; v=v||auslagenCheck(n); });
      if(v){ window.__abgelehnt.push(v); return {data:null,error:{message:v}}; }
      b.forEach(function(r){ if(self.t==="protokolle"){ var u=r.erstellt_von,g2=r.erstellt;
          DB.protokoll_fassungen.push({client_id:r.client_id,version:r.version,gesichert:new Date().toISOString(),daten:JSON.parse(JSON.stringify(r))});
          Object.assign(r,self.d); r.erstellt_von=u; r.erstellt=g2; }
        else {
          /* wie der Trigger: geänderte Zeiten eines gestempelten Eintrags kennzeichnen */
          var qv=r.quelle, zg=self.t==="arbeitszeiten" && ["datum","beginn","ende","pause_min","minuten"].some(function(k){ return (k in self.d) && self.d[k]!==r[k]; });
          var altR=JSON.parse(JSON.stringify(r));
          Object.assign(r,self.d);
          if(self.t==="planung") planPruefen(r, altR);
          if(self.t==="arbeitszeiten") r.quelle=(zg && /^stempel(_nachgetragen|_abgeglichen)?$/.test(qv||"")) ? "stempel_geaendert" : (zg||("art" in self.d && self.d.art!==altR.art)) && qv==="kalender" ? "hand" : (qv||"hand");
          if(self.t==="planung") stundenSync(r.id);
          if(self.t==="auslagen" && r.km!=null) r.km=kmSpalte(r.km);
          if(self.t==="auslagen" && r.art==="km") r.betrag=Math.round(r.km*(r.km_satz||0.5)*100)/100;
          if(self.t==="bedarf") r.erledigt = r.status==="erledigt" ? (altR.status==="erledigt" ? altR.erledigt : new Date().toISOString()) : null;
          if(self.t==="werkzeug"){ wzMerken(r); wzVerlauf(r, altR); }
        }
        erg.push(r); });
      sichern(); return {data:aus(erg),error:null};
    }
    if(this.a==="delete"){
      var w=tab.filter(function(r){ return passt(r,self.f); });
      w.forEach(function(r){ v=v||darf(self.t,"delete",null,r); });
      if(v){ window.__abgelehnt.push(v); return {data:null,error:{message:v}}; }
      for(var i=tab.length-1;i>=0;i--) if(passt(tab[i],self.f)){ erg.push(tab[i]); tab.splice(i,1); }
      if(self.t==="planung") erg.forEach(function(r){ stundenSync(r.id); });
      /* Fremdschlüssel wie in werkzeug.sql: Termin bzw. Werkzeug weg → Bedarf bleibt ohne Verknüpfung (on delete set null), Verlauf geht mit */
      var wegIds=erg.map(function(r){ return r.id; });
      if(self.t==="planung") DB.bedarf.forEach(function(b){ if(wegIds.indexOf(b.planung_id)>=0) b.planung_id=null; });
      if(self.t==="werkzeug"){ DB.bedarf.forEach(function(b){ if(wegIds.indexOf(b.werkzeug_id)>=0) b.werkzeug_id=null; });
        for(var vi=DB.werkzeug_verlauf.length-1; vi>=0; vi--) if(wegIds.indexOf(DB.werkzeug_verlauf[vi].werkzeug_id)>=0) DB.werkzeug_verlauf.splice(vi,1); }
      sichern(); return {data:aus(erg),error:null};
    }
    return {data:[],error:null};
  };
  /* window.__netzWeg=true: Schreiben in Tabellen scheitert wie ohne Netz (fetch wirft) – für Tests „keine Verbindung“;
     window.__netzWeg="antwort": wie supabase-js ohne Netz – Schreiben und Funktionen (rpc) liefern {error}, statt zu werfen */
  var NETZ_FEHLER={data:null, error:{message:"TypeError: Failed to fetch"}};
  Q.prototype.then=function(ok,nok){ var s=this;
    if(window.__netzWeg==="antwort" && s.a!=="select") return Promise.resolve(JSON.parse(JSON.stringify(NETZ_FEHLER))).then(ok,nok);
    if(window.__netzWeg && s.a!=="select") return Promise.reject(new TypeError("Failed to fetch")).then(ok,nok);
    return new Promise(function(f){ setTimeout(function(){ f(s.lauf()); },0); }).then(ok,nok); };
  function E(n){ this.n=n; }
  E.prototype.upload=function(p,b,o){ var k=this.n+"/"+p;
    if(DATEIEN[k]&&!(o&&o.upsert)) return Promise.resolve({data:null,error:{message:"exists"}});
    /* wie im echten Bucket: nur die erlaubten Typen */
    var erlaubt=this.n==="sicherungen" ? null : this.n==="auslagen" ? ["image/jpeg","image/png","application/pdf"] : this.n==="projektdateien" ? ["application/pdf","image/jpeg","image/png","image/heic","image/heif","image/webp","text/plain","text/csv","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/zip","message/rfc822","application/vnd.ms-outlook","image/vnd.dwg","application/acad","application/x-acad","application/autocad_dwg","application/dwg","application/x-dwg","application/x-autocad","application/octet-stream"] : ["image/jpeg","image/png","application/pdf"];
    if(erlaubt && b && b.type && erlaubt.indexOf(b.type)<0)
      return Promise.resolve({data:null,error:{message:"mime type "+b.type+" is not supported"}});
    /* wie reisekosten.sql und die Antworten vom 05.10.2026: Belegfotos legt jede Person in ihren Ordner <user_id>/, der Inhaber auch in fremde */
    if(this.n==="auslagen" && String(p).split("/")[0]!==uid() && rolleJetzt()!=="inhaber")
      return Promise.resolve({data:null,error:{message:"new row violates row-level security policy"}});
    DATEIEN[k]=b; return Promise.resolve({data:{path:p},error:null}); };
  /* wie posteingang-lesen.sql: Dateien im Bucket „posteingang“ nur mit darf_schreiben() (nicht Kunde, nicht Präsentation) */
  function eimerGesperrt(n){ var rl=(DB.rollen.filter(function(r){ return r.user_id===uid(); })[0]||{}).rolle; return n==="posteingang" && (!sitzung || rl==="kunde" || rl==="praesentation"); }
  E.prototype.createSignedUrl=function(p){ var b=eimerGesperrt(this.n) ? null : DATEIEN[this.n+"/"+p];
    return Promise.resolve(b?{data:{signedUrl:URL.createObjectURL(b)},error:null}:{data:null,error:{message:"weg"}}); };
  E.prototype.download=function(p){ var b=eimerGesperrt(this.n) ? null : DATEIEN[this.n+"/"+p]; return Promise.resolve(b?{data:b,error:null}:{data:null,error:{message:"weg"}}); };
  /* Speicher „auslagen“ wie die Regeln (reisekosten.sql, Antworten 05.10.2026): entfernen im eigenen Ordner – aber nicht
     das Foto eines abgegebenen oder ausbezahlten Eintrags –, der Inhaber überall; was die Regel nicht erlaubt, bleibt still
     liegen (wie Supabase: keine Fehlermeldung, nur nichts entfernt). Andere Bereiche: wie bisher (nichts entfernt). */
  E.prototype.remove=function(pfade){
    if(this.n!=="auslagen" || !sitzung) return Promise.resolve({data:[],error:null});
    var n=this.n, inh=rolleJetzt()==="inhaber", weg=[];
    (pfade||[]).forEach(function(p){
      var gesperrt=DB.auslagen.some(function(a){ return a.foto===p && a.status!=="offen"; });
      if(!DATEIEN[n+"/"+p] || !(inh || (String(p).split("/")[0]===uid() && !gesperrt))) return;
      delete DATEIEN[n+"/"+p]; weg.push({name:p});
    });
    return Promise.resolve({data:weg,error:null}); };
  E.prototype.list=function(){ return Promise.resolve({data:[],error:null}); };
  window.supabase={createClient:function(){ return {
    auth:{ getSession:function(){ return Promise.resolve({data:{session:sitzung},error:null}); },
      onAuthStateChange:function(cb){ horcher.push(cb); return {data:{subscription:{unsubscribe:function(){}}}}; },
      signInWithPassword:function(d){ if(!d.password||d.password.length<6)
          return Promise.resolve({data:{session:null},error:{message:"falsch"}});
        sitzung={user:nutzer(d.email)}; setTimeout(melde,0);
        return Promise.resolve({data:{session:sitzung,user:sitzung.user},error:null}); },
      signOut:function(){ sitzung=null; setTimeout(melde,0); return Promise.resolve({error:null}); },
      updateUser:function(d){ if(!sitzung) return Promise.resolve({data:{},error:{message:"nicht angemeldet"}});
        if(d && d.data){ Object.assign(meta(sitzung.user.email), d.data); sichern(); }
        sitzung.user=nutzer(sitzung.user.email);
        return Promise.resolve({data:{user:sitzung.user},error:null}); } },
    from:function(t){
      if(t==="stammdaten_lesen") DB.stammdaten_lesen=DB.stammdaten.map(function(r){ var f=Object.assign({},r.felder); delete f.zugangLink; delete f.zugangBenutzer; delete f.zugangPasswort; return Object.assign({},r,{felder:f}); });
      return new Q(t); },
    functions:{invoke:function(name,o){ return Promise.resolve(window.__kiAntwort ? window.__kiAntwort(name,o.body) : {data:null,error:{message:"keine KI im Test"}}); }},
    storage:{from:function(n){ return new E(n); }},
    rpc:function(name, w){
      if(window.__netzWeg==="antwort") return Promise.resolve(JSON.parse(JSON.stringify(NETZ_FEHLER)));
      /* wie public.bereiche_eigene() (bereiche-eigen.sql): eigene Bereiche, häufigste zuerst */
      /* wie public.team_liste() (chat-direkt.sql): Büro und Techniker */
      if(name==="team_liste"){ var rl={}; DB.rollen.forEach(function(r){ rl[r.user_id]=r; });
        var konten=["inhaber@test.at","admin@test.at","tech@test.at"].map(nutzer);
        return Promise.resolve({data:konten.filter(function(u){ var r=rl[u.id]; return !r || ["inhaber","admin","techniker"].indexOf(r.rolle)>=0; })
          .map(function(u){ var r=rl[u.id]||{}; return {user_id:u.id, name:r.name||(u.user_metadata.einstellungen||{}).name||u.email.split("@")[0], rolle:r.rolle||"techniker"}; }), error:null}); }
      if(name==="bereiche_eigene"){ var fest=["fahrt","baustelle","wartung","stoerung","werkstatt","buero","sonstiges"], n={};
        (DB.arbeitszeiten||[]).concat(DB.stempel||[]).forEach(function(z){ var b=String(z.bereich||"").trim(); if(b && fest.indexOf(b)<0) n[b]=(n[b]||0)+1; });
        return Promise.resolve({data:Object.keys(n).sort(function(a,b){ return n[b]-n[a]; }).map(function(b){ return {bereich:b, anzahl:n[b]}; }), error:null}); }
      /* wie public.stempel_abgleich() (stempel-abgleich.sql): gestempelte Blöcke lückenlos und genau aufteilen */
      if(name==="stempel_abgleich"){
        var fe=function(m){ return Promise.resolve({data:null,error:{message:m}}); };
        var mm=function(t){ var x=/^(\d\d):(\d\d)$/.exec(t||""); return x ? (+x[1])*60+(+x[2]) : null; };
        var hh=function(m){ return ("0"+Math.floor(m/60)).slice(-2)+":"+("0"+(m%60)).slice(-2); };
        var eig=DB.arbeitszeiten.filter(function(z){ return z.user_id===uid() && z.datum===w.p_datum && z.art==="arbeit" && /^stempel/.test(z.quelle||"") && !z.bestaetigt && mm(z.ende)>mm(z.beginn); })
          .sort(function(x,y){ return mm(x.beginn)-mm(y.beginn); });
        var bl=[]; eig.forEach(function(z){ var l2=bl[bl.length-1]; if(l2 && mm(z.beginn)===l2.e){ l2.z.push(z); l2.e=mm(z.ende); } else bl.push({b:mm(z.beginn), e:mm(z.ende), z:[z]}); });
        if(!bl.length) return fe("An diesem Tag gibt es keine gestempelte Zeit, die sich aufteilen lässt");
        var erg=[], weg=[];
        /* wie eine Ausnahme in der Datenbank: alles zurück, auch schon angelegte Teile früherer Blöcke */
        var nein=function(m){ erg.forEach(function(n){ var k=DB.arbeitszeiten.indexOf(n); if(k>=0) DB.arbeitszeiten.splice(k,1); }); return fe(m); };
        for(var bi=0; bi<bl.length; bi++){ var B=bl[bi];
          var tt=(w.p_teile||[]).filter(function(t){ return mm(t.beginn)>=B.b && mm(t.ende)<=B.e; }).sort(function(x,y){ return mm(x.beginn)-mm(y.beginn); });
          if(!tt.length) continue;
          var cur=B.b, lang=-1, li=0;
          for(var i=0;i<tt.length;i++){ if(mm(tt[i].beginn)!==cur) return nein("Die Abschnitte müssen lückenlos sein"); if(mm(tt[i].ende)<=cur) return nein("Abschnitt ohne Dauer");
            if(mm(tt[i].ende)-cur>lang){ lang=mm(tt[i].ende)-cur; li=i; } cur=mm(tt[i].ende); }
          if(cur!==B.e) return nein("Die Abschnitte müssen genau die gestempelte Zeit ergeben");
          var smin=B.z.reduce(function(x,z){ return x+(z.minuten||0); },0), sp=B.z.reduce(function(x,z){ return x+(z.pause_min||0); },0), sa=B.z.reduce(function(x,z){ return x+(z.pause_auto||0); },0);
          var andere=0; tt.forEach(function(t,i){ if(i!==li) andere+=mm(t.ende)-mm(t.beginn); });
          if(smin-andere<0) return nein("Die Pause passt in keinen Abschnitt – bitte einen Abschnitt länger machen");
          /* Quelle: nachgetragen/geändert bleibt sichtbar, sonst „abgeglichen“ */
          var qa=B.z.some(function(z0){ return z0.quelle==="stempel_geaendert" || z0.quelle==="stempel_nachgetragen"; }) ? "stempel_geaendert" : "stempel_abgeglichen";
          tt.forEach(function(t,i){ var n={id:"x"+(++z), user_id:uid(), name:B.z[0].name, datum:w.p_datum, beginn:t.beginn, ende:t.ende, pause_min:i===li?Math.min(600,sp):0, pause_auto:i===li?Math.min(600,sa):0,
            minuten:i===li?smin-andere:mm(t.ende)-mm(t.beginn), art:"arbeit", taetigkeit:t.taetigkeit||null, standort_id:t.standort_id||null, projekt_id:t.projekt_id||null,
            planung_id:t.planung_id||null, quelle:qa, bereich:t.bereich||null, erstellt:new Date().toISOString()}; DB.arbeitszeiten.push(n); erg.push(n); });
          B.z.forEach(function(z0){ weg.push(z0.id); });
        }
        for(var wi=DB.arbeitszeiten.length-1; wi>=0; wi--) if(weg.indexOf(DB.arbeitszeiten[wi].id)>=0) DB.arbeitszeiten.splice(wi,1); sichern();
        return Promise.resolve({data:{eintraege:JSON.parse(JSON.stringify(erg)), ersetzt:weg}, error:null});
      }
      if(name!=="stempeln") return Promise.resolve({data:null,error:null});
      /* wie public.stempeln() (stempeluhr-2.sql): Zeit vom „Server“, Reihenfolge prüfen,
         Umstempeln, beim Ausstempeln je Abschnitt ein Eintrag, Einträge von Hand ersetzen */
      var fehler=function(m){ return Promise.resolve({data:null,error:{message:m}}); };
      if(!sitzung) return fehler("nicht angemeldet");
      if(w.p_ort && ("lat" in w.p_ort || "lon" in w.p_ort)) return fehler("Koordinaten werden nicht gespeichert");
      var meine=DB.stempel.filter(function(s){ return s.user_id===uid(); }).sort(function(a,b){ return a.zeit<b.zeit?1:-1; });
      var l=meine[0], art=w.p_art;
      if(art==="ein" && l && l.art!=="aus") return fehler("Du bist schon eingestempelt");
      if((art==="pause"||art==="wechsel") && (!l || ["ein","weiter","wechsel"].indexOf(l.art)<0)) return fehler((art==="pause"?"Pause":"Umstempeln")+" geht nur, wenn du eingestempelt bist (nicht in der Pause)");
      if(art==="weiter" && (!l || l.art!=="pause")) return fehler("Weiter geht nur nach einer Pause");
      if(art==="aus" && (!l || l.art==="aus")) return fehler("Du bist nicht eingestempelt");
      var jetzt=new Date(Date.now()+(window.__stempelVersatz||0)).toISOString();
      var erb=art==="pause"||art==="weiter";
      if(art!=="aus"){
        var s={id:"st"+(++z), user_id:uid(), name:w.p_name, art:art, zeit:jetzt, ort:w.p_ort||null,
          standort_id:w.p_standort||(erb&&l?l.standort_id:null), projekt_id:w.p_projekt||(erb&&l?l.projekt_id:null),
          taetigkeit:w.p_taetigkeit||(erb&&l?l.taetigkeit:null), bereich:w.p_bereich||(erb&&l?l.bereich:null), erledigt:art==="wechsel"?(w.p_erledigt||null):null};
        DB.stempel.push(s); sichern();
        return Promise.resolve({data:{stempel:JSON.parse(JSON.stringify(s))}, error:null});
      }
      var ein=meine.filter(function(x){ return x.art==="ein"; })[0], ende=new Date(jetzt), q="stempel";
      if(w.p_ende_hand){ var d=new Date(ein.zeit); var t=w.p_ende_hand.split(":"); d.setHours(+t[0],+t[1],0,0); if(d<=new Date(ein.zeit)) d.setDate(d.getDate()+1); ende=d; q="stempel_nachgetragen";
        if(ende>new Date(jetzt)) return fehler("Das Ende liegt in der Zukunft"); }
      if(ende-new Date(ein.zeit)>86400000) return fehler("Länger als 24 Stunden eingestempelt – bitte das tatsächliche Ende angeben");
      var weg=[];
      if(w.p_ersetzen) for(var i=DB.arbeitszeiten.length-1;i>=0;i--){ var a=DB.arbeitszeiten[i];
        if(w.p_ersetzen.indexOf(a.id)>=0 && a.user_id===uid() && (a.quelle||"hand")==="hand" && !a.bestaetigt){ weg.push(a.id); DB.arbeitszeiten.splice(i,1); } }
      var hm=function(x){ x=new Date(x); return ("0"+x.getHours()).slice(-2)+":"+("0"+x.getMinutes()).slice(-2); };
      var tagVon=function(x){ x=new Date(x); return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2); };
      var segs=meine.filter(function(x){ return x.zeit>=ein.zeit && new Date(x.zeit)<ende && (x.art==="ein"||x.art==="wechsel"); }).sort(function(a,b){ return a.zeit<b.zeit?-1:1; });
      var ee=[];
      segs.forEach(function(g, i){
        var letzter=i===segs.length-1, bis=letzter?ende:new Date(segs[i+1].zeit), ortE=letzter?(w.p_ort||null):(segs[i+1].ort||null);
        var pause=0, ab=null;
        meine.slice().reverse().forEach(function(x){ var t2=new Date(x.zeit); if(t2<new Date(g.zeit) || t2>=bis) return;
          if(x.art==="pause") ab=t2; else if(x.art==="weiter" && ab){ pause+=t2-ab; ab=null; } });
        if(ab) pause+=Math.max(0, bis-ab);
        var min=Math.max(0, Math.floor((bis-new Date(g.zeit)-pause)/60000));
        if(!min && !(letzter && !ee.length)) return;
        var e={id:"x"+(++z), user_id:uid(), name:w.p_name||g.name, datum:tagVon(g.zeit), beginn:hm(g.zeit), ende:hm(bis), pause_min:Math.round(pause/60000),
          minuten:min, art:"arbeit", taetigkeit:[g.taetigkeit, letzter?w.p_taetigkeit:segs[i+1].erledigt].filter(Boolean).join("; ")||null,
          standort_id:g.standort_id||(letzter?w.p_standort:null), projekt_id:g.projekt_id||(letzter?w.p_projekt:null),
          quelle:q, ort:(g.ort||ortE)?{ein:g.ort||null, aus:ortE}:null, bereich:g.bereich||null, erstellt:jetzt};
        DB.arbeitszeiten.push(e); ee.push(e);
      });
      /* gesetzliche Pause wie stempeluhr-4.sql – je TAG: frühere gestempelte Einträge desselben Tages und die Lücke seit
         dem letzten Ausstempeln zählen mit; über 6 h mindestens 30 min */
      var einst=(DB.einstellungen.filter(function(e){ return e.schluessel==="arbeitszeit"; })[0]||{}).wert||{};
      var tagE=tagVon(ein.zeit), frueher=DB.arbeitszeiten.filter(function(a){ return a.user_id===uid() && a.datum===tagE && a.art==="arbeit" && /^stempel/.test(a.quelle||"") && ee.indexOf(a)<0; });
      var vorAus=meine.filter(function(x){ return x.art==="aus" && x.zeit<ein.zeit; })[0];
      var summe=ee.reduce(function(a,e){ return a+e.minuten; },0)+frueher.reduce(function(a,e){ return a+(e.minuten||0); },0),
        pz=ee.reduce(function(a,e){ return a+e.pause_min; },0)+frueher.reduce(function(a,e){ return a+(e.pause_min||0); },0)+
          (vorAus && tagVon(vorAus.zeit)===tagE ? Math.floor((new Date(ein.zeit)-new Date(vorAus.zeit))/60000) : 0);
      if(einst.autoPause!==false && summe>360 && pz<30 && ee.length){
        var lang=ee.slice().sort(function(a,b){ return b.minuten-a.minuten; })[0], f=Math.min(30-pz, lang.minuten);
        lang.minuten-=f; lang.pause_min+=f; lang.pause_auto=f;
      }
      var la=segs[segs.length-1]||ein;
      var s2={id:"st"+(++z), user_id:uid(), name:w.p_name, art:"aus", zeit:jetzt, ort:w.p_ort||null, standort_id:la.standort_id||w.p_standort||null,
        projekt_id:la.projekt_id||w.p_projekt||null, taetigkeit:la.taetigkeit, bereich:la.bereich, eintrag_id:ee.length?ee[ee.length-1].id:null};
      DB.stempel.push(s2); sichern();
      return Promise.resolve({data:{stempel:JSON.parse(JSON.stringify(s2)), eintraege:JSON.parse(JSON.stringify(ee)), ersetzt:weg}, error:null});
    } }; }};
  window.__db={ tabellen:DB, dateien:DATEIEN,
    leeren:function(){ T.forEach(function(t){ DB[t]=[]; }); window.__abgelehnt.length=0; sichern(); },
    /* zurück auf den Startbestand – danach Seite neu laden */
    zuruecksetzen:function(){ try{ localStorage.clear(); sessionStorage.clear(); }catch(e){}
      try{ indexedDB.databases().then(function(l){ l.forEach(function(d){ indexedDB.deleteDatabase(d.name); }); }); }catch(e){} },
    adminMachen:function(m){ DB.admins.push({user_id:nutzer(m).id}); sichern(); },
    abgelehnt:function(){ return window.__abgelehnt.slice(); } };
})();
