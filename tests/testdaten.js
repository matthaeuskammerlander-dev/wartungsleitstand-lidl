/* Erfundene Testdaten für die automatischen Tests (tests/app-tests.mjs).
   KEINE echten Märkte, Adressen oder Personen – das Repository ist öffentlich.
   Die Daten werden relativ zu heute gebaut, damit Fälligkeiten immer gleich ausfallen. */
(function(){
  var heute=new Date(), iso=function(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  var vorTagen=function(n){ var d=new Date(heute); d.setDate(d.getDate()-n); return iso(d); };
  var monatPlus=function(n){ return ((heute.getMonth()+n)%12+12)%12+1; };
  var MONATE=["","Jänner","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  var standorte=[
    {id:"TS1", filiale:"901", name:"Testfiliale 901", adresse:"1100 Musterstadt, Probegasse 1", plz:"1100", ort:"Musterstadt", region:"Wien", lat:48.17, lon:16.38},
    {id:"TS2", filiale:"902", name:"Testfiliale 902", adresse:"8020 Beispielort, Teststraße 2", plz:"8020", ort:"Beispielort", region:"Wundschuh", lat:47.07, lon:15.42},
    {id:"TS3", filiale:"903", name:"Testfiliale 903", adresse:"6020 Probedorf, Feldweg 3", plz:"6020", ort:"Probedorf", region:"Laakirchen", lat:47.26, lon:11.40},
    {id:"TS4", filiale:"904", name:"Testfiliale 904", adresse:"6460 Weststadt, Hauptplatz 4", plz:"6460", ort:"Weststadt", region:"Laakirchen", lat:47.24, lon:10.74},
    {id:"TS5", filiale:"905", name:"Testfiliale 905", adresse:"4020 Flussstadt, Uferweg 5", plz:"4020", ort:"Flussstadt", region:"Laakirchen", lat:48.30, lon:14.29},
    {id:"TS6", filiale:"",    name:"Testlager",       adresse:"Testlager",                    plz:null,   ort:null,         region:"",       lat:null,  lon:null}
  ].map(function(s){ return Object.assign({genauigkeit:s.lat?"adresse":"keine", anzahlPositionen:0, baujahrVon:2018, baujahrBis:2018, ueber30kg:false, typen:["VRV Anlage"], unklar:false, adresseUnvollstaendig:!s.plz}, s); });
  var pos=function(id, sid, code, monat, kg, ib, historie){
    return {id:id, standortId:sid, monat:monat, monatName:MONATE[monat], intervallCode:code, anlagentyp:"VRV Anlage", rueckkuehler:"",
      kaeltemittelText:kg?String(kg)+" kg":"", kaeltemittelKg:kg, ueber30kg:kg>=30, inbetriebnahme:ib, baujahr:ib?+ib.slice(0,4):null,
      plan2026:null, historie:historie, wartungenRaw:{}, techniker:{}};
  };
  var positionen=[
    /* fällig jetzt: Jahreswartung im laufenden Monat, zuletzt vor einem Jahr */
    pos("TP1","TS1","JW", monatPlus(0), 12, "2018-"+String(monatPlus(0)).padStart(2,"0")+"-10", [vorTagen(370)]),
    pos("TP2","TS1","HJI",monatPlus(6), 12, "2018-"+String(monatPlus(0)).padStart(2,"0")+"-10", [vorTagen(190)]),
    /* gerade gewartet – nicht fällig */
    pos("TP3","TS2","JW", monatPlus(0), 8,  "2019-"+String(monatPlus(0)).padStart(2,"0")+"-05", [vorTagen(10)]),
    /* seit drei Jahren nichts – überfällig */
    pos("TP4","TS3","JW", monatPlus(-2), 5, "2017-"+String(monatPlus(-2)).padStart(2,"0")+"-01", [vorTagen(1100)]),
    /* Zone 2 */
    pos("TP5","TS4","JW", monatPlus(1), 20, "2020-"+String(monatPlus(1)).padStart(2,"0")+"-15", [vorTagen(330)]),
    /* ab 30 kg: HJW */
    pos("TP6","TS5","JW", monatPlus(3), 35, "2016-"+String(monatPlus(3)).padStart(2,"0")+"-20", [vorTagen(270)]),
    pos("TP7","TS5","HJW",monatPlus(9), 35, "2016-"+String(monatPlus(3)).padStart(2,"0")+"-20", [vorTagen(90)]),
    /* ohne Adresse, ohne Daten */
    pos("TP8","TS6","JW", monatPlus(5), null, null, [])
  ];
  standorte.forEach(function(s){ s.anzahlPositionen=positionen.filter(function(p){ return p.standortId===s.id; }).length; });
  window.LIDL_DB={meta:{quelle:"Testdaten", erstellt:iso(heute), firma:"Testfirma", standorte:standorte.length, positionen:positionen.length}, standorte:standorte, positionen:positionen};
})();
