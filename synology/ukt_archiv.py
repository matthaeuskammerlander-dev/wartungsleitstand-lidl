#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wartungsprotokolle aus dem Wartungsleitstand auf die Synology holen.

Die App legt jedes Protokoll als PDF in Supabase ab. Dieses Skript läuft auf
der Synology (Systemsteuerung -> Aufgabenplaner, alle 15 Minuten), meldet sich
mit einem eigenen Konto an und legt alles in der Ordnerstruktur ab, die das
Büro schon kennt (Inhaber 29.10.2026: „gewohnte Synology-Ordnerstruktur“):

    <basis>/<jahr>/Lidl/Wartungen/Seekirchen,2026-09-21,JW.pdf
    <basis>/<jahr>/Lidl/Störungen/Innsbruck,2026-09-21.pdf     (+ Lidl-Rapport daneben)
    <basis>/<jahr>/Lidl/Störungen/Beauftragungen/…              (Lidl-Auftrag)
    <basis>/<jahr>/Wartungen/Auto Aicher,Kössen,2026-06-05,JW.pdf   (weitere Kunden)
    <basis>/<jahr>/Störungen/…
    <basis>/<jahr>/Lidl/Baustellen/Amstetten/                   (Baustellen, Lidl)
    <basis>/<jahr>/Baustellen/Hotel Kunzmann Würzburg/          (Baustellen, weitere Kunden)

Verschiebt das Büro eine Datei (z. B. nach „3.Quartal abgerechnet“), findet das
Skript sie dort wieder und legt sie nicht ein zweites Mal ab; eine Korrektur
ersetzt sie an ihrem neuen Platz. Projekte aus dem Synology-Archiv bleiben in
ihrem Ordner, ihre Dateien werden nie zurückgeschrieben.

Angebote und Rechnungen NIE dorthin (den Ordner sehen auch Techniker), sondern
in den Büro-Ordner, den nur der Chef sieht (Einstellung "buero_basis", gleiche
Gliederung darunter). Dafür braucht das Archivkonto die Rolle "archiv"
(tools/archiv-rolle.sql). Ohne "buero_basis" werden sie gar nicht abgelegt.

Einmal am Tag holt es außerdem die wöchentliche Sicherung der App (ganzer
Datenbestand, Kopien der Dateien) nach <buero_basis>/Sicherung (seit 29.10.2026,
Einstellung "sicherung_basis" für einen anderen Ordner; tools/sicherung.sql).

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


def buero_an(k):
    """Büro-Ordner (nur Chef) eingerichtet? Erst dann werden Angebote/Rechnungen abgelegt."""
    b = str(k.get("buero_basis") or "")
    return bool(b) and "HIER" not in b


def buero_ordner(k, ordner):
    """derselbe Ordner wie im Archiv, aber unter dem Büro-Ordner"""
    return os.path.join(k["buero_basis"], os.path.relpath(ordner, k["basis"]))


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

    def liste(self, eimer, ordner=""):
        """alle Dateien eines Speicherbereichs samt Unterordnern: [{pfad, groesse}]"""
        alle, start = [], 0
        while True:
            teil = anfrage("POST", self.url + "/storage/v1/object/list/" + eimer, self.kopf(),
                           {"prefix": ordner, "limit": 1000, "offset": start,
                            "sortBy": {"column": "name", "order": "asc"}}) or []
            for x in teil:
                pfad = (ordner + "/" if ordner else "") + x["name"]
                if x.get("id") is None and not x.get("metadata"):
                    alle.extend(self.liste(eimer, pfad))     # Unterordner
                else:
                    alle.append({"pfad": pfad, "groesse": int((x.get("metadata") or {}).get("size") or -1)})
            if len(teil) < 1000:
                return alle
            start += 1000


# ---------------------------------------------------------------- Dateien

def sauber(text):
    """für Dateinamen: keine Pfadzeichen, Leerzeichen als Bindestrich"""
    t = re.sub(r"[\\/]+", "-", str(text or ""))           # Bruck/Leitha -> Bruck-Leitha
    t = re.sub(r'[:*?"<>|\x00-\x1f]', "", t).strip()
    t = re.sub(r"\s+", "-", t)
    return t[:60]


def ungleich(p):
    """Name im Abschluss weicht von der Techniker/in oben ab – dann gibt es kein PDF
    (Büro 01.10.2026: Protokolle immer nur unter eigenem Namen)"""
    t = re.sub(r"[^a-z0-9äöüß]", "", str(p.get("techniker") or "").lower())
    n = re.sub(r"[^a-z0-9äöüß]", "", str(p.get("name_techniker") or "").lower())
    return bool(t and n and t != n)


def name_ordner(text, laenge=60):
    """Ordner- und Dateinamen wie auf der Synology üblich („Hotel Kunzmann Würzburg“,
    „Graz,Wiener.str,2026-07-07,HJI.pdf“): Leerzeichen und Kommas bleiben,
    nur Zeichen, die Windows/DSM nicht erlauben, fallen weg"""
    t = re.sub(r"[\\/]+", "-", str(text or ""))
    t = re.sub(r'[:*?"<>|\x00-\x1f]', "", t)
    return re.sub(r"\s+", " ", t).strip(" .")[:laenge]


def ist_stoerung(p):
    return str(p.get("wartungsart") or "").strip().lower().startswith("stör")


TERMIN_KUERZEL = (("halbjahresinspektion", "HJI"), ("halbjahreswartung", "HJW"), ("jahreswartung", "JW"))


def termin_kuerzel(p):
    """JW / HJI / HJW der gewarteten Anlagen („zählt als“ im Protokoll), mehrere mit +"""
    ks = []
    for a in p.get("anlagen") or []:
        t = str((a or {}).get("termin") or "").strip()
        k = next((v for w, v in TERMIN_KUERZEL if w in t.lower()), "")
        if not k and re.match(r"^(JW|HJI|HJW|HI|HW|HJ)$", t.upper()):
            k = t.upper()
        if k and k not in ks:
            ks.append(k)
    return "+".join(ks)


def dateiname(p, kunde=None):
    """wie bisher auf der Synology (Inhaber 29.10.2026: „gewohnte Ordnerstruktur“):
    Markt, Datum, Termin – „Seekirchen,2026-09-21,JW.pdf“; Störungen ohne Termin
    („Innsbruck,2026-09-21.pdf“, sie liegen ohnehin im Ordner Störungen);
    weitere Kunden mit dem Kunden vorne („Auto Aicher,Kössen,2026-06-05,JW.pdf“).
    Gleicher Markt am gleichen Tag: _2, _3 … (freier_name)."""
    markt = name_ordner(p.get("standort_name")) or (("Filiale " + name_ordner(p["filiale"])) if p.get("filiale") else "")
    teile = []
    if kunde and name_norm(kunde) not in name_norm(markt):
        teile.append(name_ordner(kunde))
    teile += [markt, str(p.get("datum") or "ohne-Datum")[:10]]
    if not ist_stoerung(p):
        teile.append(termin_kuerzel(p))
    return ",".join(t for t in teile if t) + ".pdf"


def wiederfinden(wurzel, name, groesse=None):
    """Hat das Büro die Datei verschoben (z. B. nach „3.Quartal abgerechnet“ oder
    „ABGERECHNET“)? Dieselbe Datei irgendwo unter dem Ordner suchen – sonst legte
    das Skript sie beim nächsten Lauf ein zweites Mal ab."""
    if not name or not os.path.isdir(wurzel):
        return None
    for r, _, fs in os.walk(wurzel):
        if name in fs:
            voll = os.path.join(r, name)
            if groesse is None or groesse < 0 or os.path.getsize(voll) == groesse:
                return voll
    return None


def im_ordner(datei, ordner):
    """liegt die Datei im Ordner oder in einem Unterordner davon?"""
    return bool(datei) and (os.path.dirname(datei) == ordner or datei.startswith(ordner + os.sep))


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
    # Wartungen und Störungen getrennt (Büro 02.10.2026): …/Wartungen bzw. …/Störungen
    art = "Störungen" if ist_stoerung(p) else "Wartungen"
    if kunde:
        # weiterer Kunde: wie auf der Synology üblich direkt unter dem Jahr –
        # 2026/Wartungen, 2026/Störungen, der Kunde steht im Dateinamen
        muster = k.get("unterordner_kunde", "{jahr}")
    else:
        muster = k["unterordner"]
    teile = [t for t in muster.format(jahr=jahr, kunde=sauber(kunde) if kunde else "", art=art).replace("\\", "/").split("/") if t]
    if "{art}" not in muster:
        if teile and teile[-1] in ("Wartungen", "Störungen"):
            teile[-1] = art
        else:
            teile.append(art)
    return os.path.join(k["basis"], *teile)


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

def anhaenge_ablegen(k, sb, p, s, ordner):
    """Lidl-Rapport und Lidl-Auftrag eines Protokolls (Speicher „protokollfotos“,
    <Protokoll>/rapport.pdf bzw. auftrag.pdf) wie auf der Synology üblich mit
    ihrem Originalnamen: der Rapport neben das Protokoll, der Auftrag eines
    Lidl-Markts nach …/Störungen/Beauftragungen (Inhaber 29.10.2026)."""
    if PRUEFEN or not s.get("datei") or s.get("geloescht") or s.get("gesperrt"):
        return
    cid = p["client_id"]
    st = p.get("stoerung") or {}
    lidl = os.path.basename(os.path.dirname(ordner)) == "Lidl"
    fertig = s.setdefault("anhaenge", {})
    for art, ref in (("rapport", p.get("rapport") or st.get("rapportDatei")), ("auftrag", st.get("auftragDatei"))):
        if not isinstance(ref, dict):
            continue
        pfad = ref.get("pfad") or "%s/%s.pdf" % (cid, art)
        alt = fertig.get(pfad)
        if alt and os.path.exists(alt):
            continue
        name = sauber_datei(ref.get("name") or art + ".pdf")
        if not name.lower().endswith(".pdf"):
            name += ".pdf"
        unter = os.path.join(ordner, "Beauftragungen") if art == "auftrag" and lidl else os.path.dirname(s["datei"])
        # vom Büro verschoben oder schon von Hand abgelegt: nicht doppelt
        gefunden = wiederfinden(ordner, os.path.basename(alt)) if alt else None
        if not gefunden and os.path.exists(os.path.join(unter, name)):
            gefunden = os.path.join(unter, name)
        if gefunden:
            fertig[pfad] = gefunden
            continue
        try:
            inhalt = sb.datei("protokollfotos", pfad)
        except RuntimeError as e:
            log("  %s nicht geholt (%s)" % (art, str(e)[:120]))
            continue
        if not inhalt.startswith(b"%PDF"):
            continue
        ziel = freie_datei(unter, name, set())
        schreibe(ziel, inhalt)
        log("  %s: %s" % ("Lidl-Rapport" if art == "rapport" else "Auftrag", os.path.relpath(ziel, k["basis"])))
        fertig[pfad] = ziel


def abgleich(k, sb, stand):
    protokolle = sb.tabelle("protokolle", "client_id,datum,filiale,standort_name,standort_id,"
                                          "techniker,name_techniker,wartungsart,version,geloescht,anlagen,rapport,stoerung")
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

        # ungleiche Angaben (Name im Abschluss ≠ Techniker/in oben): kein gültiges
        # Protokoll – nicht archivieren, eine schon abgelegte Datei nach _gesperrt
        # (Büro 01.10.2026). Nach der Berichtigung („Korrigieren“) geht es normal weiter.
        if ungleich(p):
            if s and s.get("datei") and not s.get("gesperrt") and not s.get("geloescht"):
                alt = s["datei"]
                ziel = os.path.join(os.path.dirname(alt), "_gesperrt", os.path.basename(alt))
                log("ungleiche Angaben, verschiebe: " + os.path.basename(alt))
                if not PRUEFEN and os.path.exists(alt):
                    os.makedirs(os.path.dirname(ziel), exist_ok=True)
                    os.replace(alt, ziel)
                s["datei"], s["gesperrt"] = ziel, True
                verschoben += 1
            elif not s:
                log("ungleiche Angaben, nicht archiviert: %s vom %s" % (p.get("standort_name") or cid, p.get("datum")))
                stand[cid] = {"version": 0, "gesperrt": True}
            continue

        b = berichte.get(cid)
        if not b:
            ohne_pdf += 1
            continue
        version = int(b.get("version") or 1)
        ordner = zielordner(k, p, kunden)
        name = dateiname(p, kunden.get(p.get("standort_id")))
        # vom Büro weggeräumt (abgerechnet)? dort weiterführen statt neu ablegen
        if s and s.get("datei") and not os.path.exists(s["datei"]) and not s.get("geloescht") and not s.get("gesperrt"):
            gefunden = wiederfinden(ordner, os.path.basename(s["datei"]))
            if gefunden:
                log("verschoben gefunden: " + os.path.relpath(gefunden, k["basis"]))
                s["datei"] = gefunden
        vorhanden = s and s.get("datei") and os.path.exists(s["datei"])
        # Name bleibt, wenn er noch passt (auch mit _2, auch in einem Unterordner); sonst neu vergeben
        passt = vorhanden and im_ordner(s["datei"], ordner) and os.path.basename(s["datei"]).startswith(name[:-4])

        aktuell = passt and not s.get("geloescht") and not s.get("gesperrt") and int(s.get("version") or 0) >= version
        if aktuell:
            anhaenge_ablegen(k, sb, p, s, ordner)
            continue

        ziel = s["datei"] if passt else freier_name(ordner, name, {s["datei"]} if vorhanden else set())

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
        stand[cid] = {"version": version, "datei": ziel, "anhaenge": (s or {}).get("anhaenge") or {}}
        anhaenge_ablegen(k, sb, p, stand[cid], ordner)
        if s:
            erneuert += 1
        else:
            neu += 1

    log("fertig: %d neu, %d erneuert, %d nach _geloescht, %d noch ohne PDF"
        % (neu, erneuert, verschoben, ohne_pdf))


# ---------------------------------------------------------------- Baustellen (Projekte)
#
# Seit 01.10.2026: jedes Projekt bekommt einen Ordner wie auf der Synology
# üblich (29.10.2026; Einstellungen „unterordner_projekt“ / „…_kunde“):
#
#     <basis>/2026/Lidl/Baustellen/Amstetten/        (aus dem Archiv: sein Ordner dort)
#         <Unterordner wie hochgeladen> bzw. Plaene/  Fotos/  Unterlagen/  Protokolle/
#         Projekt_P-2026-001.html   (Mappe: Angaben, Beteiligte, Termine,
#                                    Bestellungen, Baustellenbuch, Tagebuch, Belege)
#         Projekt_P-2026-001.json   (dasselbe maschinenlesbar)
#
# Die App ist nur Zwischenlösung und Organisation für unterwegs – die
# endgültige Ablage ist hier. Angebote/Rechnungen und ihre Positionen liest
# nur ein Konto mit der Rolle „archiv“ (tools/archiv-rolle.sql); sonst fehlen
# sie in der Mappe, alles andere kommt trotzdem.

# Angebote und Rechnungen (Projektdateien unter buero/, Beleg-PDFs) gehören NICHT
# in die Projektordner – die sehen auch Techniker (Büro 01.10.2026). Sie kommen in
# den Büro-Ordner, den nur der Chef sieht (Einstellung "buero_basis", Büro
# 02.10.2026: „dazu gibt es bereits einen Ordner auf der Synology, den nur der
# Chef sehen kann“). Ohne diese Einstellung legt das Skript sie gar nicht ab.

PROJEKT_UNTERORDNER = {"angebot": "Angebot", "rechnung": "Rechnung", "plan": "Plaene", "foto": "Fotos",
                       "dokument": "Unterlagen", "besprechung": "Besprechungen", "mail": "Mails",
                       "lieferschein": "Lieferscheine", "protokoll": "Protokolle", "preise": "Preise"}
PROJEKT_SCHRITTE = [("anfrage", "Anfrage"), ("begehung", "Bestand / Begehung"), ("konzept", "Konzept"),
                    ("einreichung", "Einreichung"), ("angebot", "Angebot"), ("auftrag", "Auftrag"), ("vorbereitung", "Vorbereitung"),
                    ("baustelle", "Baustelle"), ("inbetriebnahme", "Inbetriebnahme"),
                    ("abgeschlossen", "Dokumentation"), ("abgerechnet", "Abgerechnet"), ("verloren", "Nicht beauftragt")]
PROJEKT_ANGABEN = [("anfrageDatum", "Anfrage vom"), ("anfrageVon", "Angefragt von"), ("ansprechpartner", "Ansprechpartner"),
                   ("telefon", "Telefon"), ("beschreibung", "Was wird gebraucht?"), ("begehungDatum", "Begehung am"),
                   ("bestand", "Bestand"), ("vorgaben", "Bauliche Vorgaben"), ("konzeptDatum", "Konzept an den Planer am"),
                   ("konzept", "Konzept"), ("einreichDatum", "Eingereicht am"), ("einreichungBei", "Eingereicht bei"),
                   ("einreichung", "Eingereicht"), ("freigabeDatum", "Freigabe / Rückmeldung am"), ("freigabe", "Rückmeldung, Auflagen"),
                   ("angebotNr", "Angebotsnummer"), ("angebotDatum", "Angebot vom"),
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
    """Dateiname mit Endung: der Name bleibt wie hochgeladen (Leerzeichen auch –
    so findet das Büro seine Dateien, Inhaber 29.10.2026), nur verbotene Zeichen fallen weg"""
    stamm, endung = os.path.splitext(str(name or "datei"))
    endung = re.sub(r"[^A-Za-z0-9.]", "", endung)[:10]
    return (name_ordner(stamm, 100) or "datei") + endung.lower()


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


def pfad_teile(text):
    """„2026/Lidl/Baustellen/Amstetten“ → Teile; nie aus dem Ordner heraus"""
    return [name_ordner(t, 120) for t in str(text or "").replace("\\", "/").split("/") if t.strip() not in ("", ".", "..")]


def archiv_ordner(p):
    """Projekt aus dem Synology-Archiv nachgetragen (27.10.2026): sein Ordner dort
    (daten.archiv.ordner) – dann bleibt alles, wo das Büro es kennt"""
    o = ((p.get("daten") or {}).get("archiv") or {}).get("ordner") or []
    return o[0] if o and isinstance(o[0], str) and pfad_teile(o[0]) else None


def projekt_ordner(k, p, kunden, standorte):
    """wie bisher auf der Synology (Inhaber 29.10.2026): Lidl unter
    <Jahr>/Lidl/Baustellen/<Markt> („Amstetten“, „Krems“), andere Kunden unter
    <Jahr>/Baustellen/<Kunde Ort> („Hotel Kunzmann Würzburg“). Gibt es den Ordner
    schon, kommt das Projekt dazu – die Mappe heißt nach der Projektnummer."""
    arch = archiv_ordner(p)
    if arch:
        return os.path.join(k["basis"], *pfad_teile(arch))
    jahr = str(p.get("erstellt") or "")[:4]
    if not re.match(r"^\d{4}$", jahr):
        jahr = "ohne-Datum"
    st = standorte.get(p.get("standort_id")) or {}
    titel = str(p.get("titel") or "")
    # Titel bis zum Gedankenstrich, ohne „Fil. 444“: „Fil. 444 Wien Quellenstraße 80 – CVP in VRV“ → „Wien Quellenstraße 80“
    kurz = re.sub(r"^(Fil\.|Filiale)\s*\d+\s*", "", re.split(r"\s+[–—-]\s+", titel)[0]).strip(" ,")
    if (p.get("kunde_id") or "lidl") == "lidl":
        # Wien, Graz, Linz … haben viele Märkte – dort trägt erst der Titel die Straße;
        # „Filiale 455“ (neue Märkte) ist kein Ordnername
        ort = st.get("ort") or ""
        name = (kurz if re.match(r"^(Fil\.|Filiale)\s*\d", titel) else "") or ort or kurz or "Projekt"
        muster = k.get("unterordner_projekt", "{jahr}/Lidl/Baustellen/{projekt}")
    else:
        name = kurz or kunden.get(p.get("kunde_id")) or "Projekt"
        muster = k.get("unterordner_projekt_kunde", "{jahr}/Baustellen/{projekt}")
    teile = pfad_teile(muster.format(jahr=jahr, projekt=name_ordner(name, 50), kunde=name_ordner(kunden.get(p.get("kunde_id") or "lidl") or "Kunde")))
    return os.path.join(k["basis"], *teile)


def datei_unterordner(x):
    """Unterordner einer Projektdatei: beim Hochladen eines ganzen Ordners der
    Weg darin (herkunft, z. B. „Kika Amstetten/UKT“) – so wie das Büro ihn
    angelegt hat; sonst nach Art (Pläne, Fotos …)"""
    her = str(x.get("herkunft") or "").strip()
    if her and not re.match(r"^(E-Mail|kopiert aus|Synology )", her) and not re.search(r"[(„“]", her) and len(her) <= 120:
        teile = pfad_teile(her)
        if teile:
            return teile
    return [PROJEKT_UNTERORDNER.get(x.get("art"), "Unterlagen")]


def schon_auf_synology(k, x):
    """aus dem Synology-Archiv hochgeladen (herkunft „Synology 2026/Lidl/…“):
    liegt dort schon – nie ein zweites Mal ablegen. Liefert den Ort, falls gefunden."""
    her = str(x.get("herkunft") or "")
    if not her.startswith("Synology "):
        return None, False
    voll = os.path.join(k["basis"], *(pfad_teile(her[len("Synology "):]) + [x.get("name") or ""]))
    return (voll if os.path.isfile(voll) else None), True


def html_text(t):
    t = str(t if t is not None else "")
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
             .replace("\n", "<br>"))


SCHRITT_FELDER = {"anfrage": ["anfrageDatum", "anfrageVon", "ansprechpartner", "telefon", "beschreibung"],
                  "begehung": ["begehungDatum", "bestand", "vorgaben"], "konzept": ["konzeptDatum", "konzept"],
                  "einreichung": ["einreichDatum", "einreichungBei", "einreichung", "freigabeDatum", "freigabe"],
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
        elif f and str(f.get("pfad") or "").startswith("buero/"):
            teile.append('<span class="m">%s%s (nur Büro)</span>' % (html_text(f.get("name")), zusatz))
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
        for x in [x for x in dateien_p if not str(x.get("pfad") or "").startswith("buero/")]:
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


def ohne_buero(obj, namen):
    """Verweise auf Büro-Dateien (Angebot/Rechnung) aus den Projektdaten nehmen –
    nur der Name bleibt mit „(nur Büro)“; der Pfad kommt nicht auf die Synology"""
    if isinstance(obj, dict):
        return {a: ohne_buero(b, namen) for a, b in obj.items()}
    if isinstance(obj, list):
        return [ohne_buero(b, namen) for b in obj]
    if isinstance(obj, str) and obj.startswith("buero/"):
        return "%s (nur Büro)" % (namen.get(obj) or "Datei")
    return obj


def projekte_abgleich(k, sb, stand):
    try:
        projekte = sb.tabelle("projekte", "id,nummer,titel,kunde_id,standort_id,status,daten,verlauf,erstellt,geaendert", "erstellt.asc")
    except RuntimeError as e:
        log("Projekte nicht lesbar (%s) – übersprungen" % e)
        return
    belege_alle = []
    if buero_an(k):
        try:
            belege_alle = sb.tabelle("belege", "*", "datum.asc")
        except RuntimeError as e:
            log("Angebote/Rechnungen nicht lesbar – dafür braucht das Archivkonto die Rolle „archiv“ (%s)" % str(e)[:80])
    kunden, standorte, anlagen = stammdaten_fuer_projekte(sb)
    neu_dateien = mappen = 0
    ordner_je_projekt = {}
    for p in projekte:
        pid = p.get("id")
        if not pid:
            continue
        schl = "projekt:" + pid
        s = stand.get(schl) or {}
        ordner = projekt_ordner(k, p, kunden, standorte)
        if "eigen" not in s:
            # nur einen Ordner, den das Skript selbst angelegt hat, darf es später umbenennen
            s["eigen"] = not os.path.exists(ordner)
        # Ordner hat sich geändert (Markt, Kunde): einmal umbenennen
        alt = s.get("ordner")
        if alt and alt != ordner and s.get("eigen") and os.path.isdir(alt) and not os.path.exists(ordner):
            log("Projektordner umbenannt: %s -> %s" % (os.path.relpath(alt, k["basis"]), os.path.relpath(ordner, k["basis"])))
            if not PRUEFEN:
                os.makedirs(os.path.dirname(ordner), exist_ok=True)
                os.replace(alt, ordner)
                s["dateien"] = {pf: v.replace(alt, ordner, 1) for pf, v in (s.get("dateien") or {}).items()}
                # der Büro-Ordner des Projekts wandert mit
                if buero_an(k) and os.path.isdir(buero_ordner(k, alt)) and not os.path.exists(buero_ordner(k, ordner)):
                    os.makedirs(os.path.dirname(buero_ordner(k, ordner)), exist_ok=True)
                    os.replace(buero_ordner(k, alt), buero_ordner(k, ordner))
                    s["dateien"] = {pf: v.replace(buero_ordner(k, alt), buero_ordner(k, ordner), 1) for pf, v in s["dateien"].items()}
        s["ordner"] = ordner
        dateien = s.setdefault("dateien", {})
        for x in (p.get("daten") or {}).get("dateien") or []:
            pfad = x.get("pfad")
            if not pfad or (dateien.get(pfad) and os.path.exists(dateien[pfad])):
                continue
            # kam aus dem Synology-Archiv: liegt dort schon (nur merken, wo)
            da, archiv = schon_auf_synology(k, x)
            if archiv:
                if da:
                    dateien[pfad] = da
                continue
            groesse = x.get("groesse") if isinstance(x.get("groesse"), int) else None
            if pfad.startswith("buero/"):
                # Angebot/Rechnung: nie in den Projektordner (den sehen auch Techniker) –
                # nur in den Büro-Ordner, wenn er eingerichtet ist
                if not buero_an(k):
                    continue
                wurzel = buero_ordner(k, ordner)
                unter = os.path.join(wurzel, PROJEKT_UNTERORDNER.get(x.get("art"), "Unterlagen"))
            else:
                wurzel = ordner
                unter = os.path.join(ordner, *datei_unterordner(x))
            name = sauber_datei(x.get("name"))
            # schon da – vom Büro verschoben oder dieselbe Datei von Hand abgelegt: nicht doppelt
            gefunden = wiederfinden(wurzel, os.path.basename(dateien[pfad]), groesse) if dateien.get(pfad) else None
            if not gefunden and groesse:
                gefunden = wiederfinden(wurzel, name, groesse) or wiederfinden(wurzel, x.get("name"), groesse)
            if gefunden:
                dateien[pfad] = gefunden
                continue
            # nie eine vorhandene Datei überschreiben – gleicher Name bekommt _2, _3 …
            ziel = freie_datei(unter, name, set())
            log("Projekt %s: %s" % (p.get("nummer"), ("Büro: " + os.path.relpath(ziel, k["buero_basis"])) if pfad.startswith("buero/") else os.path.relpath(ziel, k["basis"])))
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
                         projekt_mappe(p, [], kunden, standorte, anlagen, dateien, ordner).encode("utf-8"))
                # ohne Büro-Dateien und Belege (Angebote/Rechnungen) – den Ordner sehen auch Techniker
                alle_d = (p.get("daten") or {}).get("dateien") or []
                p_aus = dict(p, daten=dict(p.get("daten") or {}, dateien=[x for x in alle_d if not str(x.get("pfad") or "").startswith("buero/")]))
                # Inhaber-Mappen (mit Angeboten/Rechnungen, Inhaber 27.10.2026) kommen gar nicht in den Projektordner
                p_aus["daten"]["mappen"] = [m for m in (p_aus["daten"].get("mappen") or []) if not (isinstance(m, dict) and m.get("nurInhaber"))]
                p_aus = ohne_buero(p_aus, {x.get("pfad"): x.get("name") for x in alle_d})
                schreibe(os.path.join(ordner, name + ".json"),
                         json.dumps({"projekt": p_aus, "belege": []}, ensure_ascii=False, indent=1).encode("utf-8"))
            s["kennung"] = kennung
            mappen += 1
        # Projekt als PDF (in der App abgelegt): die Fassung OHNE Angebote/Rechnungen
        # kommt als Projekt_<Nummer>.pdf in den Projektordner; die Büro-Fassung nicht
        # (den Ordner sehen auch Techniker – Büro 01.10.2026)
        mp = ((p.get("daten") or {}).get("mappePdf") or {})
        mpfad = str(mp.get("pfad") or "")
        if mpfad and not mpfad.startswith("buero/") and s.get("mappe_pdf") != mpfad:
            ziel = os.path.join(ordner, "Projekt_%s.pdf" % sauber(p.get("nummer") or pid[:8]))
            log("Projekt %s: PDF %s" % (p.get("nummer"), os.path.relpath(ziel, k["basis"])))
            if not PRUEFEN:
                try:
                    inhalt = sb.datei("projektdateien", mpfad)
                    if not inhalt.startswith(b"%PDF"):
                        raise RuntimeError("kein PDF")
                    schreibe(ziel, inhalt)
                    s["mappe_pdf"] = mpfad
                except RuntimeError as e:
                    log("  PDF nicht geholt (%s)" % str(e)[:120])
        # die Fassung MIT Angeboten/Rechnungen nur in den Büro-Ordner
        mb = str(((p.get("daten") or {}).get("mappePdfBuero") or {}).get("pfad") or "")
        if buero_an(k) and mb and s.get("mappe_pdf_buero") != mb:
            ziel = os.path.join(buero_ordner(k, ordner), "Projekt_%s_mit_Angeboten_Rechnungen.pdf" % sauber(p.get("nummer") or pid[:8]))
            log("Projekt %s: Büro-PDF %s" % (p.get("nummer"), os.path.relpath(ziel, k["buero_basis"])))
            if not PRUEFEN:
                try:
                    inhalt = sb.datei("projektdateien", mb)
                    if not inhalt.startswith(b"%PDF"):
                        raise RuntimeError("kein PDF")
                    schreibe(ziel, inhalt)
                    s["mappe_pdf_buero"] = mb
                except RuntimeError as e:
                    log("  Büro-PDF nicht geholt (%s)" % str(e)[:120])
        stand[schl] = s
        ordner_je_projekt[pid] = ordner
        ordner_je_projekt.setdefault("_dateien", []).extend(x.get("pfad") for x in (p.get("daten") or {}).get("dateien") or [])
    log("Projekte: %d, %d Dateien geholt, %d Mappen geschrieben" % (len(projekte), neu_dateien, mappen))
    if buero_an(k):
        belege_pdfs(k, sb, stand, belege_alle, kunden, standorte, ordner_je_projekt)


def belege_pdfs(k, sb, stand, belege, kunden, standorte, ordner_je_projekt):
    """PDFs der Angebote und Rechnungen aus der App (pdf_pfad):
    zu einem Projekt in dessen Ordner (Angebot/, Rechnung/), sonst – etwa die
    Rechnung zu einem Wartungs- oder Störungseinsatz, mit dem Rapportbericht
    von Lidl darin – nach {jahr}/Kunden/{kunde}/Rechnungen bzw. Angebote.
    Test-Belege (solange KPlus führt) kommen in den Unterordner _Test."""
    neu = 0
    # schon als Projektdatei abgelegt (KPlus-PDF am Projekt): nicht noch einmal
    projekt_dateien = set(ordner_je_projekt.get("_dateien") or [])
    for b in belege:
        pfad = b.get("pdf_pfad")
        # auch KPlus-Belege (extern): ihr Original-PDF liegt sonst nirgends auf der Synology
        if not pfad or pfad in projekt_dateien:
            continue
        schl = "beleg:" + b["id"]
        s = stand.get(schl) or {}
        art = "Rechnung" if b.get("art") == "rechnung" else "Angebot"
        st = standorte.get(b.get("standort_id")) or {}
        markt = " ".join(str(x) for x in (st.get("filiale"), st.get("ort")) if x)
        kunde = kunden.get(b.get("kunde_id") or "lidl") or "Kunde"
        lidl = (b.get("kunde_id") or "lidl") == "lidl"
        name = sauber_datei(("TEST_" if b.get("test") else "") + "%s %s%s%s.pdf" % (
            art, b.get("nummer"), "" if lidl else " " + kunde, (" " + markt) if markt else ""))
        # nur in den Büro-Ordner (nur Chef) – gleiche Gliederung wie im Archiv
        if b.get("projekt_id") in ordner_je_projekt:
            ordner = os.path.join(buero_ordner(k, ordner_je_projekt[b["projekt_id"]]), art)
        else:
            jahr = str(b.get("datum") or "")[:4] or "ohne-Datum"
            # gleiche Gliederung wie das Archiv: Lidl unter Lidl/, weitere Kunden direkt unter dem Jahr
            muster = k.get("unterordner_belege", "{jahr}/Lidl/{art}" if lidl else "{jahr}/{art}")
            ordner = os.path.join(k["buero_basis"], muster.format(jahr=jahr, kunde=sauber(kunde), art=art + ("en" if art == "Rechnung" else "e")))
        if b.get("test"):
            ordner = os.path.join(ordner, "_Test")
        ziel = os.path.join(ordner, name)
        if s.get("pfad") == pfad and s.get("datei") == ziel and os.path.exists(ziel):
            continue
        log("%s %s: Büro: %s" % (art, b.get("nummer"), os.path.relpath(ziel, k["buero_basis"])))
        if not PRUEFEN:
            try:
                schreibe(ziel, sb.datei("projektdateien", pfad))
            except RuntimeError as e:
                log("  nicht geholt (%s)" % str(e)[:120])
                continue
            # neuer Name (anderer Markt, Test → echt): alte eigene Datei weg
            if s.get("datei") and s["datei"] != ziel and os.path.exists(s["datei"]):
                os.remove(s["datei"])
        stand[schl] = {"pfad": pfad, "datei": ziel}
        neu += 1
    if neu:
        log("Belege: %d PDF geholt" % neu)


# ---------------------------------------------------------------- Sicherung

# Seit 29.10.2026 (Inhaber: „das automatische Abspeichern der Daten auf die
# Synology muss … auch aktualisiert werden“): Die App legt einmal pro Woche den
# ganzen Datenbestand im privaten Bereich „sicherungen“ ab
# (datenbank/JJJJ-MM-TT.json.gz), am PC auch Kopien der Dateien
# (dateien/<Bereich>/…). Das Skript holt beides in den Ordner, den nur der Chef
# sieht – die Sicherung enthält alles, auch Preise und Zugangsdaten. Ohne
# "buero_basis" (bzw. "sicherung_basis") holt es nichts.
# Einmal am Tag reicht; bleibt etwas offen (Zeitgrenze je Lauf), geht es beim
# nächsten Lauf weiter. Auf der Synology wird nie etwas gelöscht.

SICHERUNG_ABSTAND = 20 * 3600   # höchstens einmal in 20 Stunden nachsehen
SICHERUNG_ZEIT = 10 * 60        # je Lauf höchstens so lange Dateien holen


def sicherung_ordner(k):
    b = str(k.get("sicherung_basis") or "")
    if b and "HIER" not in b:
        return b
    if buero_an(k):
        return os.path.join(k["buero_basis"], "Sicherung")
    return None


def sicherung_ziel(ordner, pfad):
    """Pfad im Speicher → Datei auf der Synology; nie aus dem Ordner heraus"""
    teile = [t for t in pfad.split("/") if t]
    if not teile or any(t in (".", "..") for t in teile):
        return None
    return os.path.join(ordner, *teile)


def sicherungen_abgleich(k, sb, stand):
    ordner = sicherung_ordner(k)
    if not ordner:
        return
    s = stand.get("sicherung:") or {}
    if not s.get("offen") and time.time() - s.get("zuletzt", 0) < SICHERUNG_ABSTAND:
        return
    alle = sb.liste("sicherungen")
    beginn, neu, offen = time.time(), 0, 0
    for o in alle:
        ziel = sicherung_ziel(ordner, o["pfad"])
        if not ziel:
            continue
        if os.path.exists(ziel) and os.path.getsize(ziel) == o["groesse"]:
            continue
        if time.time() - beginn > SICHERUNG_ZEIT:
            offen += 1
            continue
        if PRUEFEN:
            log("Sicherung: würde holen " + o["pfad"])
        else:
            schreibe(ziel, sb.datei("sicherungen", o["pfad"]))
        neu += 1
    if not PRUEFEN:
        stand["sicherung:"] = {"zuletzt": time.time(), "offen": offen}
    datenbank = sorted(o["pfad"] for o in alle if o["pfad"].startswith("datenbank/"))
    log("Sicherung: %d Dateien im Bereich, %d geholt, %d noch offen%s" %
        (len(alle), neu, offen, (", neueste " + datenbank[-1]) if datenbank else ", noch keine Datenbank-Sicherung"))


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
            # Sicherung (Datenbestand + Dateien) in den Büro-Ordner: ebenso eigener Schritt
            try:
                sicherungen_abgleich(k, sb, stand)
            except Exception as e:
                log("FEHLER bei der Sicherung: %s" % e)
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
