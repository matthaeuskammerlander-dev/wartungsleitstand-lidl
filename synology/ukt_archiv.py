#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wartungsprotokolle aus dem Wartungsleitstand auf die Synology holen.

Die App legt jedes Protokoll als PDF in Supabase ab. Dieses Skript läuft auf
der Synology (Systemsteuerung -> Aufgabenplaner, alle 15 Minuten), meldet sich
mit einem eigenen Konto an und legt neue und korrigierte PDFs ab unter

    <basis>/<jahr>/Lidl/Wartungen/2026-09-21_Seekirchen_Darko.pdf

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

    def tabelle(self, name, spalten):
        """alle Zeilen, seitenweise zu je 1000"""
        alle, start = [], 0
        while True:
            q = urllib.parse.urlencode({"select": spalten, "order": "client_id.asc",
                                        "limit": 1000, "offset": start})
            teil = anfrage("GET", self.url + "/rest/v1/" + name + "?" + q, self.kopf())
            alle.extend(teil)
            if len(teil) < 1000:
                return alle
            start += 1000

    def pdf(self, pfad):
        return anfrage("GET", self.url + "/storage/v1/object/berichte/" +
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


def zielordner(k, p):
    jahr = str(p.get("datum") or "")[:4]
    if not re.match(r"^\d{4}$", jahr):
        jahr = "ohne-Datum"
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
    protokolle = sb.tabelle("protokolle", "client_id,datum,filiale,standort_name,"
                                          "techniker,name_techniker,wartungsart,version,geloescht")
    berichte = {b["client_id"]: b for b in sb.tabelle("berichte", "client_id,version,pfad")}
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
        ordner = zielordner(k, p)
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
