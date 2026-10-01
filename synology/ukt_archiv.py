#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wartungsprotokolle aus dem Wartungsleitstand auf die Synology holen.

Die App legt jedes Protokoll als PDF in Supabase ab. Dieses Skript läuft auf
der Synology (Systemsteuerung -> Aufgabenplaner, alle 15 Minuten), meldet sich
mit einem eigenen Konto an und legt neue und korrigierte PDFs ab unter

    <basis>/<jahr>/Lidl/Wartungen/2026-09-21_Seekirchen_Darko.pdf

Protokolle weiterer Kunden (nicht Lidl) kommen nach <basis>/<jahr>/Kunden/<Kunde>/
(änderbar mit "unterordner_kunde" in den Einstellungen).

Baustellen (Projekte) bekommen je einen Ordner mit Angebot, Rechnung, Plänen,
Fotos, Unterlagen und einer Projektmappe (HTML + JSON), nach Jahr und Kunde:

    <basis>/<jahr>/Kunden/Lidl/Baustellen/123-Musterort_P-2026-001/

(Einstellung "unterordner_projekt"; Angebote/Rechnungen nur mit Rolle "archiv",
siehe tools/archiv-rolle.sql).

Gelöschte Protokolle wandern in den Unterordner "_geloescht". Das Skript
schreibt nur in diese Ordner und fasst sonst nichts an.

Benötigt nur Python 3 (bei DSM 7 vorhanden), keine Zusatzpakete.

Aufruf:
    python3 ukt_archiv.py              # abholen
    python3 ukt_archiv.py --pruefen    # nur anzeigen, was passieren würde
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
KONFIG = os.path.join(HIER, "ukt_archiv.json")
STAND = os.path.join(HIER, "ukt_archiv_stand.json")
LOG = os.path.join(HIER, "ukt_archiv.log")
SPERRE = os.path.join(HIER, "ukt_archiv.sperre")

PRUEFEN = "--pruefen" in sys.argv


# ---------------------------------------------------------------- Protokoll

def log(text):
    zeile = time.strftime("%Y-%m-%d %H:%M:%S") + "  " + text
    print(zeile)
    if PRUEFEN:
        return
    try:
        # nicht endlos wachsen lassen
        if os.path.exists(LOG) and os.path.getsize(LOG) > 1024 * 1024:
            os.replace(LOG, LOG + ".alt")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(zeile + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- Einstellungen

def lade_konfig():
    if not os.path.exists(KONFIG):
        raise SystemExit("Einstellungen fehlen: " + KONFIG +
                         " (Vorlage ukt_archiv.beispiel.json kopieren und ausfüllen)")
    with open(KONFIG, encoding="utf-8") as f:
        k = json.load(f)
    for feld in ("supabase_url", "supabase_key", "email", "passwort", "basis"):
        if not k.get(feld) or "HIER" in str(k.get(feld)):
            raise SystemExit("In " + KONFIG + " ist '" + feld + "' nicht ausgefüllt.")
    k["supabase_url"] = k["supabase_url"].rstrip("/")
    k.setdefault("unterordner", "{jahr}/Lidl/Wartungen")
    return k


def lade_stand():
    try:
        with open(STAND, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def speichere_stand(stand):
    if PRUEFEN:
        return
    tmp = STAND + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(stand, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, STAND)


# ---------------------------------------------------------------- Supabase

def anfrage(methode, url, kopf=None, daten=None, roh=False):
    """HTTP-Anfrage; liefert JSON bzw. Bytes. Im Test wird diese Funktion ersetzt."""
    body = json.dumps(daten).encode("utf-8") if daten is not None else None
    req = urllib.request.Request(url, data=body, method=methode, headers=kopf or {})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            inhalt = r.read()
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError("HTTP %s bei %s: %s" % (e.code, url.split("?")[0], text))
    return inhalt if roh else json.loads(inhalt.decode("utf-8") or "null")


class Supabase:
    def __init__(self, k):
        self.url = k["supabase_url"]
        self.key = k["supabase_key"]
        r = anfrage("POST", self.url + "/auth/v1/token?grant_type=password",
                    {"apikey": self.key},
                    {"email": k["email"], "password": k["passwort"]})
        self.token = r["access_token"]

    def kopf(self):
        return {"apikey": self.key, "Authorization": "Bearer " + self.token}

    def tabelle(self, name, spalten, ordnung="client_id.asc", filter=None):
        """alle Zeilen, seitenweise zu je 1000"""
        alle, start = [], 0
        while True:
            werte = {"select": spalten, "order": ordnung, "limit": 1000, "offset": start}
            werte.update(filter or {})
            q = urllib.parse.urlencode(werte)
            teil = anfrage("GET", self.url + "/rest/v1/" + name + "?" + q, self.kopf())
            alle.extend(teil)
            if len(teil) < 1000:
                return alle
            start += 1000

    def pdf(self, pfad):
        return self.datei("berichte", pfad)

    def datei(self, eimer, pfad):
        return anfrage("GET", self.url + "/storage/v1/object/" + eimer + "/" +
                       urllib.parse.quote(pfad), self.kopf(), roh=True)


# ---------------------------------------------------------------- Dateien

def sauber(text):
    """für Dateinamen: keine Pfadzeichen, Leerzeichen als Bindestrich"""
    t = re.sub(r"[\\/]+", "-", str(text or ""))           # Bruck/Leitha -> Bruck-Leitha
    t = re.sub(r'[:*?"<>|\x00-\x1f]', "", t).strip()
    t = re.sub(r"\s+", "-", t)
    return t[:60]


def dateiname(p):
    """2026-09-21_Seekirchen_Darko.pdf – der Markt so, wie UKT ihn nennt
    (Ort bzw. Ort + Straße, vergibt die App); Störungen sind gekennzeichnet:
    2026-09-21_Innsbruck_Stoerung_Darko.pdf"""
    teile = [str(p.get("datum") or "ohne-Datum")[:10]]
    if p.get("standort_name"):
        teile.append(sauber(p["standort_name"]))
    elif p.get("filiale"):
        teile.append("Filiale-" + sauber(p["filiale"]))
    if p.get("wartungsart") == "Störung":
        teile.append("Stoerung")
    tech = p.get("name_techniker") or p.get("techniker")
    if tech:
        teile.append(sauber(tech))
    return "_".join(t for t in teile if t) + ".pdf"


def kunden_je_standort(sb):
    """Weitere Kunden außer Lidl (seit 01.10.2026): Standort -> Name des Kunden.
    Lidl-Märkte fehlen in der Liste – sie bleiben im Lidl-Ordner."""
    try:
        zeilen = sb.tabelle("stammdaten", "id,typ,ziel,felder", "id.asc", {"typ": "in.(standort,kunde)"})
    except RuntimeError as e:
        log("Kunden nicht lesbar (%s) – alle Protokolle in den Lidl-Ordner" % e)
        return {}
    namen = {z["ziel"]: (z.get("felder") or {}).get("name") or "Kunde"
             for z in zeilen if z.get("typ") == "kunde"}
    return {z["ziel"]: namen.get((z.get("felder") or {}).get("kundeId"), "Kunde")
            for z in zeilen if z.get("typ") == "standort" and (z.get("felder") or {}).get("kundeId")}


def zielordner(k, p, kunden=None):
    jahr = str(p.get("datum") or "")[:4]
    if not re.match(r"^\d{4}$", jahr):
        jahr = "ohne-Datum"
    kunde = (kunden or {}).get(p.get("standort_id"))
    if kunde:
        # weiterer Kunde: eigener Ordner je Kunde, z. B. 2026/Kunden/Muster-GmbH
        muster = k.get("unterordner_kunde", "{jahr}/Kunden/{kunde}")
        return os.path.join(k["basis"], muster.format(jahr=jahr, kunde=sauber(kunde)))
    return os.path.join(k["basis"], k["unterordner"].format(jahr=jahr))


def freier_name(ordner, name, eigene):
    """gleicher Tag, gleicher Markt, gleicher Techniker: _2, _3 … anhängen"""
    kandidat, n = name, 1
    while True:
        voll = os.path.join(ordner, kandidat)
        if not os.path.exists(voll) or voll in eigene:
            return voll
        n += 1
        kandidat = name[:-4] + "_" + str(n) + ".pdf"


def schreibe(pfad, inhalt):
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    tmp = pfad + ".teil"
    with open(tmp, "wb") as f:
        f.write(inhalt)
    os.replace(tmp, pfad)


# ---------------------------------------------------------------- Ablauf

def abgleich(k, sb, stand):
    protokolle = sb.tabelle("protokolle", "client_id,datum,filiale,standort_name,standort_id,"
                                          "techniker,name_techniker,wartungsart,version,geloescht")
    berichte = {b["client_id"]: b for b in sb.tabelle("berichte", "client_id,version,pfad")}
    kunden = kunden_je_standort(sb)
    log("%d Protokolle, %d PDFs in der Datenbank" % (len(protokolle), len(berichte)))

    neu = erneuert = verschoben = ohne_pdf = 0
    for p in protokolle:
        cid = p.get("client_id")
        if not cid:
            continue
        s = stand.get(cid)
        # Dateien, die dieses Skript selbst angelegt hat – nur die darf es ersetzen
        eigene = {v["datei"] for v in stand.values() if v.get("datei")}

        if p.get("geloescht"):
            if s and s.get("datei") and not s.get("geloescht"):
                alt = s["datei"]
                ziel = os.path.join(os.path.dirname(alt), "_geloescht", os.path.basename(alt))
                log("gelöscht, verschiebe: " + os.path.basename(alt))
                if not PRUEFEN and os.path.exists(alt):
                    os.makedirs(os.path.dirname(ziel), exist_ok=True)
                    os.replace(alt, ziel)
                s["datei"], s["geloescht"] = ziel, True
                verschoben += 1
            continue

        b = berichte.get(cid)
        if not b:
            ohne_pdf += 1
            continue
        version = int(b.get("version") or 1)
        ordner = zielordner(k, p, kunden)
        gewuenscht = os.path.join(ordner, dateiname(p))
        vorhanden = s and s.get("datei") and os.path.exists(s["datei"])

        aktuell = (vorhanden and not s.get("geloescht") and int(s.get("version") or 0) >= version
                   and os.path.dirname(s["datei"]) == ordner
                   and os.path.basename(s["datei"]).startswith(dateiname(p)[:-4]))
        if aktuell:
            continue

        # Name bleibt, wenn er noch passt (auch mit _2); sonst neu vergeben
        if vorhanden and os.path.dirname(s["datei"]) == ordner and \
                os.path.basename(s["datei"]).startswith(dateiname(p)[:-4]):
            ziel = s["datei"]
        else:
            ziel = freier_name(ordner, dateiname(p), {s["datei"]} if vorhanden else set())

        art = "erneuert (Fassung %d)" % version if s else "neu"
        log("%s: %s" % (art, os.path.relpath(ziel, k["basis"])))
        if not PRUEFEN:
            inhalt = sb.pdf(b["pfad"])
            if not inhalt.startswith(b"%PDF"):
                raise RuntimeError("Antwort für %s ist kein PDF" % b["pfad"])
            schreibe(ziel, inhalt)
            # alter Name nach Korrektur (anderes Datum, anderer Techniker): alte Datei weg
            if vorhanden and s["datei"] != ziel and s["datei"] in eigene:
                os.remove(s["datei"])
                log("  ersetzt: " + os.path.relpath(s["datei"], k["basis"]))
        stand[cid] = {"version": version, "datei": ziel}
        if s:
            erneuert += 1
        else:
            neu += 1

    log("fertig: %d neu, %d erneuert, %d nach _geloescht, %d noch ohne PDF"
        % (neu, erneuert, verschoben, ohne_pdf))


# ---------------------------------------------------------------- Baustellen (Projekte)
#
# Seit 01.10.2026: jedes Projekt bekommt einen eigenen Ordner, nach Jahr und
# Kunde (Einstellung „unterordner_projekt“):
#
#     <basis>/2026/Kunden/Lidl/Baustellen/123-Musterort_P-2026-001/
#         Angebot/  Rechnung/  Plaene/  Fotos/  Unterlagen/  Lieferscheine/  Protokolle/
#         Projekt_P-2026-001.html   (Mappe: Angaben, Beteiligte, Termine,
#                                    Bestellungen, Baustellenbuch, Tagebuch, Belege)
#         Projekt_P-2026-001.json   (dasselbe maschinenlesbar)
#
# Die App ist nur Zwischenlösung und Organisation für unterwegs – die
# endgültige Ablage ist hier. Angebote/Rechnungen und ihre Positionen liest
# nur ein Konto mit der Rolle „archiv“ (tools/archiv-rolle.sql); sonst fehlen
# sie in der Mappe, alles andere kommt trotzdem.

PROJEKT_UNTERORDNER = {"angebot": "Angebot", "rechnung": "Rechnung", "plan": "Plaene", "foto": "Fotos",
                       "dokument": "Unterlagen", "besprechung": "Besprechungen", "mail": "Mails",
                       "lieferschein": "Lieferscheine", "protokoll": "Protokolle"}
PROJEKT_SCHRITTE = [("anfrage", "Anfrage"), ("begehung", "Bestand / Begehung"), ("konzept", "Konzept"),
                    ("angebot", "Angebot"), ("auftrag", "Auftrag"), ("vorbereitung", "Vorbereitung"),
                    ("baustelle", "Baustelle"), ("inbetriebnahme", "Inbetriebnahme"),
                    ("abgeschlossen", "Dokumentation"), ("abgerechnet", "Abgerechnet"), ("verloren", "Nicht beauftragt")]
PROJEKT_ANGABEN = [("anfrageDatum", "Anfrage vom"), ("anfrageVon", "Angefragt von"), ("ansprechpartner", "Ansprechpartner"),
                   ("telefon", "Telefon"), ("beschreibung", "Was wird gebraucht?"), ("begehungDatum", "Begehung am"),
                   ("bestand", "Bestand"), ("vorgaben", "Bauliche Vorgaben"), ("konzeptDatum", "Konzept an den Planer am"),
                   ("konzept", "Konzept"), ("angebotNr", "Angebotsnummer"), ("angebotDatum", "Angebot vom"),
                   ("gueltigBis", "gültig bis"), ("auftragNr", "Bestellung des Kunden"), ("auftragDatum", "Auftrag vom"),
                   ("auftragZusatz", "Weitere Bestellungen"), ("beginn", "Montage ab"), ("ende", "Montage bis"),
                   ("monteure", "Monteure"), ("baustelleBeginn", "Baustelle begonnen"), ("baustelleEnde", "Baustelle fertig"),
                   ("ibDatum", "Inbetriebnahme am"), ("uebergabe", "Übergabe an"), ("abschlussDatum", "Dokumentation vollständig am"),
                   ("rechnungNr", "Rechnungsnummer(n)"), ("rechnungDatum", "Rechnung vom")]
BAUBUCH_ARTEN = {"arbeit": "Arbeit / Fortschritt", "foto": "Fotos", "plan": "Planänderung", "zusatz": "Zusatzleistung / zusätzliche Anlage",
                 "kran": "Kran / Hebegerät", "werkzeug": "Spezialwerkzeug", "material": "Material verbraucht",
                 "geholt": "Material geholt", "bestand": "Umbau / Demontage Bestand", "kaeltemittel": "Kältemittel",
                 "wochenende": "Samstag / Sonntag / Nacht", "erschwernis": "Erschwernis", "sonst": "Sonstiges"}


def sauber_datei(name):
    """Dateiname mit Endung: die Endung bleibt, der Rest wie sauber()"""
    stamm, endung = os.path.splitext(str(name or "datei"))
    endung = re.sub(r"[^A-Za-z0-9.]", "", endung)[:10]
    return (sauber(stamm)[:80] or "datei") + endung.lower()


def freie_datei(ordner, name, eigene):
    """wie freier_name, für jede Endung: name_2.pdf, name_3.pdf …"""
    stamm, endung = os.path.splitext(name)
    kandidat, n = name, 1
    while True:
        voll = os.path.join(ordner, kandidat)
        if not os.path.exists(voll) or voll in eigene:
            return voll
        n += 1
        kandidat = "%s_%d%s" % (stamm, n, endung)


def datum_de(t):
    m = re.match(r"^(\d{4})-(\d\d)-(\d\d)", str(t or ""))
    return "%s.%s.%s" % (m.group(3), m.group(2), m.group(1)) if m else str(t or "")


def geld(n):
    try:
        s = "{:,.2f}".format(float(n or 0))
    except (TypeError, ValueError):
        return ""
    return s.replace(",", " ").replace(".", ",").replace(" ", ".")


def stammdaten_fuer_projekte(sb):
    """Kundennamen, Märkte (Filiale, Ort) und Anlagennamen für die Projektordner"""
    try:
        zeilen = sb.tabelle("stammdaten", "id,typ,ziel,felder", "id.asc", {"typ": "in.(standort,kunde,position)"})
    except RuntimeError as e:
        log("Stammdaten nicht lesbar (%s) – Projektordner nur mit Titel" % e)
        zeilen = []
    kunden = {"lidl": "Lidl"}
    standorte, anlagen = {}, {}
    for z in zeilen:
        f = z.get("felder") or {}
        if z.get("typ") == "kunde":
            kunden[z["ziel"]] = f.get("name") or "Kunde"
        elif z.get("typ") == "standort":
            standorte[z["ziel"]] = f
        elif z.get("typ") == "position" and f.get("anlagentyp"):
            anlagen[z["ziel"]] = f
    return kunden, standorte, anlagen


def projekt_ordner(k, p, kunden, standorte):
    jahr = str(p.get("erstellt") or "")[:4]
    if not re.match(r"^\d{4}$", jahr):
        jahr = "ohne-Datum"
    kunde = kunden.get(p.get("kunde_id") or "lidl") or "Kunde"
    st = standorte.get(p.get("standort_id")) or {}
    markt = " ".join(str(x) for x in (st.get("filiale"), st.get("ort")) if x)
    name = sauber(markt or p.get("titel") or "Projekt")[:50] + "_" + sauber(p.get("nummer") or p.get("id", "")[:8])
    muster = k.get("unterordner_projekt", "{jahr}/Kunden/{kunde}/Baustellen/{projekt}")
    return os.path.join(k["basis"], muster.format(jahr=jahr, kunde=sauber(kunde), projekt=name))


def html_text(t):
    t = str(t if t is not None else "")
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
             .replace("\n", "<br>"))


SCHRITT_FELDER = {"anfrage": ["anfrageDatum", "anfrageVon", "ansprechpartner", "telefon", "beschreibung"],
                  "begehung": ["begehungDatum", "bestand", "vorgaben"], "konzept": ["konzeptDatum", "konzept"],
                  "angebot": ["angebotNr", "angebotDatum", "gueltigBis"], "auftrag": ["auftragNr", "auftragDatum", "auftragZusatz"],
                  "vorbereitung": ["beginn", "ende", "monteure"], "baustelle": ["baustelleBeginn", "baustelleEnde"],
                  "inbetriebnahme": ["ibDatum", "uebergabe"], "abgeschlossen": ["abschlussDatum"], "abgerechnet": ["rechnungNr", "rechnungDatum"]}


def name_norm(n):
    import unicodedata
    t = unicodedata.normalize("NFD", str(n or "").lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if unicodedata.category(c) != "Mn"))


def quellen_html(quellen, dateien, lokal, ordner):
    """Quellen einer Angabe als Verweise auf die Datei im Projektordner (relativ) –
    noch nicht hochgeladene nur mit Namen"""
    teile = []
    for q in quellen or []:
        name = q if isinstance(q, str) else (q or {}).get("name", "")
        hinweis = "" if isinstance(q, str) else (q or {}).get("hinweis", "")
        f = next((x for x in dateien if x.get("pfad") == name), None) or \
            next((x for x in dateien if name_norm(x.get("name")) == name_norm(name)), None)
        zusatz = (" (%s)" % html_text(hinweis)) if hinweis else ""
        if f and lokal.get(f.get("pfad")):
            rel = os.path.relpath(lokal[f["pfad"]], ordner).replace(os.sep, "/")
            teile.append('<a href="%s">%s</a>%s' % (html_text(urllib.parse.quote(rel)), html_text(f.get("name")), zusatz))
        else:
            teile.append('<span class="m">%s%s%s</span>' % (html_text(f.get("name") if f else name.split("/")[-1]), zusatz,
                                                            "" if f else " – noch nicht hochgeladen"))
    return " · ".join(teile)


def projekt_mappe(p, belege, kunden, standorte, anlagen, lokal=None, ordner=""):
    """HTML-Mappe eines Projekts – zum Lesen und Drucken auf der Synology.
    Bei jeder Angabe steht ihre Quelle als Verweis auf die Datei im Projektordner,
    bei jeder Datei, wozu sie gehört – man findet alles von beiden Seiten."""
    lokal = lokal or {}
    d = p.get("daten") or {}
    dateien_p = d.get("dateien") or []
    ql = lambda q: quellen_html(q, dateien_p, lokal, ordner)   # noqa: E731
    st = standorte.get(p.get("standort_id")) or {}
    status = dict(PROJEKT_SCHRITTE).get(p.get("status"), p.get("status") or "")
    h = ['<!doctype html><html lang="de"><head><meta charset="utf-8"><title>%s</title>' % html_text(p.get("nummer")),
         "<style>body{font:13px/1.45 Arial,sans-serif;max-width:900px;margin:24px auto;color:#111}"
         "h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:2px solid #0c8a8a}"
         "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px 6px;vertical-align:top;text-align:left}"
         "th{background:#eef2f4}.r{text-align:right}.m{color:#666}</style></head><body>",
         "<h1>%s · %s</h1>" % (html_text(p.get("nummer")), html_text(p.get("titel"))),
         '<p class="m">Kunde: %s · Standort: %s · Stand: <strong>%s</strong> · aus dem Leitstand, %s</p>' % (
             html_text(kunden.get(p.get("kunde_id") or "lidl", "")),
             html_text(" ".join(str(x) for x in (st.get("filiale") and "Filiale " + str(st.get("filiale")), st.get("adresse")) if x) or "–"),
             html_text(status), time.strftime("%d.%m.%Y %H:%M"))]
    if d.get("typ"):
        h.append('<p class="m">Projekttyp: <strong>%s</strong></p>' % html_text(d.get("typ")))
    labels = dict(PROJEKT_ANGABEN)
    qs = d.get("quellen") or {}
    teil = []
    for sk, sname in PROJEKT_SCHRITTE:
        felder = [(labels.get(f, f), d.get(f)) for f in SCHRITT_FELDER.get(sk, []) if d.get(f)]
        if not felder and not qs.get(sk):
            continue
        teil.append("<tr><th colspan='2' style='background:#dfe9ec'>%s</th></tr>" % html_text(sname))
        teil.extend("<tr><th style='width:30%%'>%s</th><td>%s</td></tr>" % (
            html_text(l), html_text(datum_de(w) if re.match(r"^\d{4}-\d\d-\d\d$", str(w)) else w)) for l, w in felder)
        if qs.get(sk):
            teil.append("<tr><th>Quelle</th><td>%s</td></tr>" % ql(qs.get(sk)))
    if teil:
        h.append("<h2>Angaben</h2><table>" + "".join(teil) + "</table>")

    def liste(titel, eintraege, spalten):
        if not eintraege:
            return
        h.append("<h2>%s</h2><table><tr>%s<th>Quelle</th></tr>" % (html_text(titel), "".join("<th>%s</th>" % html_text(s[1]) for s in spalten)))
        for e in eintraege:
            h.append("<tr>%s<td>%s</td></tr>" % ("".join("<td>%s</td>" % html_text(
                ("ja" if e.get(s[0]) is True else datum_de(e.get(s[0])) if s[0] in ("datum", "bestellt", "liefertermin") else e.get(s[0]) or ""))
                for s in spalten), ql(e.get("quellen"))))
        h.append("</table>")

    liste("Beteiligte", d.get("beteiligte"), [("rolle", "Rolle"), ("firma", "Firma"), ("name", "Name"), ("telefon", "Telefon"), ("mail", "E-Mail"), ("notiz", "Notiz")])
    liste("Termine", sorted(d.get("termine") or [], key=lambda e: str(e.get("datum") or "9")),
          [("datum", "Datum"), ("zeit", "Zeit"), ("was", "Was"), ("wer", "Wer"), ("erledigt", "erledigt")])
    liste("Bestellungen", d.get("bestellungen"), [("was", "Was"), ("menge", "Menge"), ("lieferant", "Lieferant"),
                                                  ("bestellt", "bestellt"), ("liefertermin", "Liefertermin"), ("geliefert", "geliefert"), ("notiz", "Notiz")])
    bb = sorted(d.get("baubuch") or [], key=lambda e: (str(e.get("datum") or ""), str(e.get("zeit") or "")))
    if bb:
        h.append("<h2>Baustellenbuch</h2><table><tr><th>Datum</th><th>Art</th><th>Beschreibung</th><th class='r'>Menge</th><th>von</th><th>Quelle</th></tr>")
        for e in bb:
            menge = "" if e.get("menge") is None else (str(e.get("menge")).replace(".", ",") + " " + str(e.get("eh") or ""))
            h.append("<tr><td>%s %s</td><td>%s</td><td>%s</td><td class='r'>%s</td><td>%s</td><td>%s</td></tr>" % (
                datum_de(e.get("datum")), html_text(e.get("zeit") or ""), html_text(BAUBUCH_ARTEN.get(e.get("art"), e.get("art"))),
                html_text(e.get("text")), html_text(menge), html_text(e.get("von") or ""), ql((e.get("dateien") or []) + (e.get("quellen") or []))))
        h.append("</table>")
    an = [anlagen.get(i) for i in (d.get("anlagen") or []) if anlagen.get(i)]
    if an:
        h.append("<h2>Anlagen aus diesem Projekt</h2><table><tr><th>Anlage</th><th>Gerät</th><th>Seriennummer</th><th>Kältemittel</th><th>Inbetriebnahme</th></tr>")
        for a in an:
            h.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (
                html_text(a.get("anlagentyp")), html_text(" ".join(str(x) for x in (a.get("hersteller"), a.get("modell")) if x)),
                html_text(a.get("seriennummer") or ""), html_text(" ".join(str(x) for x in (a.get("kaeltemittelArt"), a.get("kaeltemittelKg") and str(a.get("kaeltemittelKg")).replace(".", ",") + " kg") if x)),
                datum_de(a.get("inbetriebnahme"))))
        h.append("</table>")
    if belege:
        h.append("<h2>Angebote und Rechnungen</h2><table><tr><th>Beleg</th><th>Datum</th><th>Herkunft</th><th class='r'>netto €</th></tr>")
        for b in belege:
            h.append("<tr><td>%s %s</td><td>%s</td><td>%s</td><td class='r'>%s</td></tr>" % (
                "Rechnung" if b.get("art") == "rechnung" else "Angebot", html_text(b.get("nummer")), datum_de(b.get("datum")),
                "KPlus" if b.get("extern") else ("TEST (App)" if b.get("test") else "App"), geld((b.get("summen") or {}).get("netto"))))
        h.append("</table>")
    if dateien_p:
        # wozu gehört jede Datei? (Rückweg von der Datei zur Angabe)
        stellen = [(dict(PROJEKT_SCHRITTE).get(sk, sk), q) for sk, q in qs.items()]
        for k2, t2 in (("beteiligte", "Beteiligte"), ("termine", "Termin"), ("bestellungen", "Bestellung")):
            stellen += [("%s: %s" % (t2, e.get("was") or e.get("firma") or e.get("name") or ""), e.get("quellen") or []) for e in d.get(k2) or []]
        stellen += [("Baustellenbuch %s" % datum_de(e.get("datum")), (e.get("dateien") or []) + (e.get("quellen") or [])) for e in bb]

        def gehoert(x):
            return [t for t, q in stellen if any((isinstance(y, str) and y == x.get("pfad")) or
                                                  name_norm(y if isinstance(y, str) else (y or {}).get("name")) == name_norm(x.get("name")) for y in q)]
        h.append("<h2>Dateien</h2><table><tr><th>Datei</th><th>Art</th><th>gehört zu</th></tr>")
        for x in dateien_p:
            h.append("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % (
                ql([x.get("pfad")]), html_text(PROJEKT_UNTERORDNER.get(x.get("art"), x.get("art"))),
                html_text(" · ".join(gehoert(x))) or '<span class="m">–</span>'))
        h.append("</table>")
    vl = p.get("verlauf") or []
    if vl:
        h.append("<h2>Tagebuch</h2><table>" + "".join("<tr><td style='width:18%%'>%s</td><td style='width:18%%'>%s</td><td>%s</td></tr>" % (
            datum_de(str(e.get("zeit") or "")[:10]), html_text(e.get("wer") or ""), html_text(e.get("text"))) for e in vl) + "</table>")
    h.append("</body></html>")
    return "\n".join(h)


def projekte_abgleich(k, sb, stand):
    try:
        projekte = sb.tabelle("projekte", "id,nummer,titel,kunde_id,standort_id,status,daten,verlauf,erstellt,geaendert", "erstellt.asc")
    except RuntimeError as e:
        log("Projekte nicht lesbar (%s) – übersprungen" % e)
        return
    try:
        belege_alle = sb.tabelle("belege", "id,projekt_id,art,nummer,test,extern,datum,status,bezug_id,kopf,positionen,summen", "datum.asc")
    except RuntimeError as e:
        log("Angebote/Rechnungen nicht lesbar – dafür braucht das Archivkonto die Rolle „archiv“ (%s)" % str(e)[:80])
        belege_alle = []
    kunden, standorte, anlagen = stammdaten_fuer_projekte(sb)
    neu_dateien = mappen = 0
    for p in projekte:
        pid = p.get("id")
        if not pid:
            continue
        schl = "projekt:" + pid
        s = stand.get(schl) or {}
        ordner = projekt_ordner(k, p, kunden, standorte)
        # Ordner hat sich geändert (Titel, Markt, Kunde): einmal umbenennen
        alt = s.get("ordner")
        if alt and alt != ordner and os.path.isdir(alt) and not os.path.exists(ordner):
            log("Projektordner umbenannt: %s -> %s" % (os.path.relpath(alt, k["basis"]), os.path.relpath(ordner, k["basis"])))
            if not PRUEFEN:
                os.makedirs(os.path.dirname(ordner), exist_ok=True)
                os.replace(alt, ordner)
                s["dateien"] = {pf: v.replace(alt, ordner, 1) for pf, v in (s.get("dateien") or {}).items()}
        s["ordner"] = ordner
        dateien = s.setdefault("dateien", {})
        for x in (p.get("daten") or {}).get("dateien") or []:
            pfad = x.get("pfad")
            if not pfad or (dateien.get(pfad) and os.path.exists(dateien[pfad])):
                continue
            unter = os.path.join(ordner, PROJEKT_UNTERORDNER.get(x.get("art"), "Unterlagen"))
            # nie eine vorhandene Datei überschreiben – gleicher Name bekommt _2, _3 …
            ziel = freie_datei(unter, sauber_datei(x.get("name")), set())
            log("Projekt %s: %s" % (p.get("nummer"), os.path.relpath(ziel, k["basis"])))
            if not PRUEFEN:
                try:
                    schreibe(ziel, sb.datei("projektdateien", pfad))
                except RuntimeError as e:
                    # Büro-Datei ohne Archivrolle: nicht abbrechen, beim nächsten Lauf wieder versuchen
                    log("  nicht geholt (%s)" % str(e)[:120])
                    continue
            dateien[pfad] = ziel
            neu_dateien += 1
        # Mappe (HTML) und Daten (JSON) neu, wenn sich das Projekt oder seine Belege geändert haben
        belege = [b for b in belege_alle if b.get("projekt_id") == pid]
        kennung = str(p.get("geaendert")) + "|" + json.dumps(belege, sort_keys=True, ensure_ascii=False) + "|" + json.dumps(dateien, sort_keys=True)
        kennung = str(len(kennung)) + ":" + str(hash_text(kennung))
        if s.get("kennung") != kennung or not os.path.exists(os.path.join(ordner, "Projekt_%s.html" % sauber(p.get("nummer") or pid[:8]))):
            name = "Projekt_%s" % sauber(p.get("nummer") or pid[:8])
            log("Projekt %s: Mappe %s" % (p.get("nummer"), "neu" if not s.get("kennung") else "aktualisiert"))
            if not PRUEFEN:
                schreibe(os.path.join(ordner, name + ".html"),
                         projekt_mappe(p, belege, kunden, standorte, anlagen, dateien, ordner).encode("utf-8"))
                schreibe(os.path.join(ordner, name + ".json"),
                         json.dumps({"projekt": p, "belege": belege}, ensure_ascii=False, indent=1).encode("utf-8"))
            s["kennung"] = kennung
            mappen += 1
        stand[schl] = s
    log("Projekte: %d, %d Dateien geholt, %d Mappen geschrieben" % (len(projekte), neu_dateien, mappen))


def hash_text(t):
    """stabile Prüfsumme (hash() ist je Lauf zufällig)"""
    import hashlib
    return hashlib.sha1(t.encode("utf-8")).hexdigest()


def sperren():
    """verhindert, dass sich zwei Läufe überholen"""
    try:
        if os.path.exists(SPERRE) and time.time() - os.path.getmtime(SPERRE) < 3600:
            return False
        with open(SPERRE, "w") as f:
            f.write(str(os.getpid()))
        return True
    except OSError:
        return True


def main():
    k = lade_konfig()
    if not os.path.isdir(k["basis"]):
        raise SystemExit("Zielordner nicht gefunden: " + k["basis"] +
                         " – Pfad in File Station unter Eigenschaften prüfen.")
    if PRUEFEN:
        log("PRÜFMODUS – es wird nichts geschrieben")
    elif not sperren():
        log("vorheriger Lauf ist noch aktiv, übersprungen")
        return
    try:
        stand = lade_stand()
        sb = Supabase(k)
        log("angemeldet als " + k["email"])
        try:
            abgleich(k, sb, stand)
            # Baustellen (Projekte): eigener Schritt – ein Fehler dort hält die Protokolle nicht auf
            try:
                projekte_abgleich(k, sb, stand)
            except Exception as e:
                log("FEHLER bei den Projekten: %s" % e)
        finally:
            speichere_stand(stand)
    finally:
        if not PRUEFEN and os.path.exists(SPERRE):
            os.remove(SPERRE)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if isinstance(e.code, str):
            log("FEHLER: " + e.code)
        raise
    except Exception as e:  # für den Aufgabenplaner: Fehler lesbar ins Log
        log("FEHLER: %s" % e)
        sys.exit(1)
