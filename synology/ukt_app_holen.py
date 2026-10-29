#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Die App (Leitstand) von GitHub auf die Synology holen.

Seit 29.10.2026 (Inhaber mit Georg): Die App läuft über die Synology
(Web Station, Adresse leitstand.ukt.at) – geändert wird sie weiter mit Claude
auf GitHub. GitHub bleibt die Quelle; dieses Skript läuft auf der Synology
(Aufgabenplaner, alle 5 Minuten) und holt jede neue Fassung in den Web-Ordner.
Die Synology holt selbst ab – niemand muss von außen auf sie zugreifen.

Ablauf je Lauf:
  1. Neuester Stand des Zweigs (eine kleine Anfrage). Unverändert: fertig.
  2. Nur geprüfte Fassungen (Einstellung "nur_gepruefte", Vorgabe ja): die
     automatische Prüfung „App prüfen“ muss für diesen Stand bestanden sein.
     Läuft sie noch, wartet das Skript bis zum nächsten Lauf; ist sie
     gescheitert, bleibt die bisherige Fassung online.
  3. Nur die Dateien der App aus dem Hauptordner (index.html, config.js,
     daten.enc.js, sw.js, manifest.json, Bilder) – keine Beschreibungen,
     Werkzeuge, Tests oder Datenbank-Skripte. Geholt wird nur, was sich
     geändert hat; erst wenn alles da ist, wird umgeschaltet (index.html zuletzt).
  4. Dateien, die das Skript selbst abgelegt hat und die es nicht mehr gibt,
     werden entfernt. Fremde Dateien im Web-Ordner fasst es nie an.

Privates Repository: "token" in ukt_app_holen.json – ein GitHub-Schlüssel, der
nur lesen darf (fein abgestuft: Contents read, Checks read, nur dieses
Repository). Er liegt nur auf der Synology.

Benötigt nur Python 3 (bei DSM 7 vorhanden), keine Zusatzpakete.

Aufruf:
    python3 ukt_app_holen.py              # holen
    python3 ukt_app_holen.py --pruefen    # nur anzeigen, was passieren würde
"""
import calendar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
KONFIG = os.path.join(HIER, "ukt_app_holen.json")
STAND = os.path.join(HIER, "ukt_app_holen_stand.json")
LOG = os.path.join(HIER, "ukt_app_holen.log")
SPERRE = os.path.join(HIER, "ukt_app_holen.sperre")

PRUEFEN = "--pruefen" in sys.argv
API = "https://api.github.com"
# Dateien der App: im Hauptordner, mit diesen Endungen (neue Bilder kommen so von selbst mit)
ENDUNGEN = (".html", ".js", ".json", ".png", ".jpg", ".svg", ".ico", ".webmanifest", ".css")
NIE = {"daten.js", "package.json", "package-lock.json"}      # unverschlüsselter Anlagenstamm, Werkzeug
ZULETZT = ("sw.js", "index.html")                           # umschalten erst, wenn alles andere da ist
WARTEN_OHNE_PRUEFUNG = 3600   # startet die Prüfung gar nicht (Sekunden nach dem Stand): trotzdem nehmen


# ---------------------------------------------------------------- Protokoll

def log(text):
    zeile = time.strftime("%Y-%m-%d %H:%M:%S") + "  " + text
    print(zeile)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 2 * 1024 * 1024:
            os.replace(LOG, LOG + ".alt")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(zeile + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- Einstellungen

def lade_konfig():
    if not os.path.exists(KONFIG):
        raise SystemExit("Einstellungen fehlen: " + KONFIG +
                         " (Vorlage ukt_app_holen.beispiel.json kopieren und ausfüllen)")
    with open(KONFIG, encoding="utf-8") as f:
        k = json.load(f)
    for feld in ("repo", "ziel"):
        if not k.get(feld) or "HIER" in str(k.get(feld)):
            raise SystemExit("In " + KONFIG + " ist '" + feld + "' nicht ausgefüllt.")
    if "HIER" in str(k.get("token") or ""):
        k["token"] = ""
    k.setdefault("zweig", "main")
    k.setdefault("nur_gepruefte", True)
    k.setdefault("pruefung", "App prüfen")
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


# ---------------------------------------------------------------- GitHub

def anfrage(url, kopf=None, roh=False):
    """GET; liefert JSON bzw. Bytes. Im Test wird diese Funktion ersetzt."""
    req = urllib.request.Request(url, headers=kopf or {})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            inhalt = r.read()
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError("HTTP %s bei %s: %s" % (e.code, url.split("?")[0], text))
    return inhalt if roh else json.loads(inhalt.decode("utf-8") or "null")


class GitHub:
    def __init__(self, k):
        self.repo = k["repo"].strip("/")
        self.token = k.get("token") or ""

    def kopf(self, art="application/vnd.github+json"):
        h = {"Accept": art, "User-Agent": "ukt-app-holen", "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        return h

    def stand(self, zweig):
        """Kennung (SHA) des neuesten Stands – eine kleine Anfrage"""
        sha = anfrage("%s/repos/%s/commits/%s" % (API, self.repo, urllib.parse.quote(zweig)),
                      self.kopf("application/vnd.github.sha"), roh=True)
        return sha.decode("ascii", "replace").strip()

    def stand_zeit(self, sha):
        c = anfrage("%s/repos/%s/commits/%s" % (API, self.repo, sha), self.kopf())
        return ((c.get("commit") or {}).get("committer") or {}).get("date") or ""

    def pruefung(self, sha, name):
        """Ergebnis der automatischen Prüfung: 'ok', 'laeuft', 'gescheitert', 'keine' oder 'unbekannt'"""
        try:
            r = anfrage("%s/repos/%s/commits/%s/check-runs?check_name=%s" % (
                API, self.repo, sha, urllib.parse.quote(name)), self.kopf())
        except RuntimeError as e:
            log("Prüfung nicht lesbar (%s)" % str(e)[:120])
            return "unbekannt"
        laeufe = r.get("check_runs") or []
        if not laeufe:
            return "keine"
        if any(x.get("status") != "completed" for x in laeufe):
            return "laeuft"
        return "ok" if all(x.get("conclusion") in ("success", "neutral", "skipped") for x in laeufe) else "gescheitert"

    def dateien(self, sha):
        """Dateien im Hauptordner: [{name, sha (des Inhalts), groesse}]"""
        liste = anfrage("%s/repos/%s/contents/?ref=%s" % (API, self.repo, sha), self.kopf())
        return [{"name": x["name"], "sha": x["sha"], "groesse": x.get("size")} for x in liste if x.get("type") == "file"]

    def inhalt(self, name, sha):
        return anfrage("%s/repos/%s/contents/%s?ref=%s" % (API, self.repo, urllib.parse.quote(name), sha),
                       self.kopf("application/vnd.github.raw"), roh=True)


def gehoert_zur_app(name):
    return (not name.startswith(".") and name not in NIE and name.lower().endswith(ENDUNGEN)
            and "/" not in name and "\\" not in name)


# ---------------------------------------------------------------- Ablauf

def index_ok(inhalt):
    """eine kaputte oder leere Seite nie online stellen"""
    kopf = inhalt[:4000].lower()
    return len(inhalt) > 20000 and (b"<!doctype html" in kopf or b"<html" in kopf) and b"</html>" in inhalt[-4000:].lower()


def holen(k, gh, stand):
    ziel = k["ziel"]
    sha = gh.stand(k["zweig"])
    eigene = stand.get("dateien") or {}
    fehlt = [n for n in eigene if not os.path.exists(os.path.join(ziel, n))]
    if sha == stand.get("sha") and not fehlt:
        return "unverändert"

    if k.get("nur_gepruefte") and sha != stand.get("sha"):
        ergebnis = gh.pruefung(sha, k["pruefung"])
        if ergebnis == "gescheitert":
            if stand.get("abgelehnt") != sha:
                log("Stand %s: Prüfung „%s“ gescheitert – die bisherige Fassung bleibt online" % (sha[:7], k["pruefung"]))
                if not PRUEFEN:
                    stand["abgelehnt"] = sha
            return "gescheitert"
        if ergebnis == "laeuft":
            if stand.get("wartet") != sha:
                log("Stand %s: Prüfung läuft noch – nächster Versuch beim nächsten Lauf" % sha[:7])
                if not PRUEFEN:
                    stand["wartet"] = sha
            return "wartet"
        if ergebnis == "keine":
            # die Prüfung hat (noch) nicht begonnen – eine Stunde warten, dann trotzdem nehmen
            try:
                alter = time.time() - calendar.timegm(time.strptime(gh.stand_zeit(sha)[:19], "%Y-%m-%dT%H:%M:%S"))
            except (ValueError, RuntimeError):
                alter = WARTEN_OHNE_PRUEFUNG + 1
            if alter < WARTEN_OHNE_PRUEFUNG:
                return "wartet"
            log("Stand %s: keine Prüfung gefunden – wird trotzdem übernommen" % sha[:7])

    dateien = [d for d in gh.dateien(sha) if gehoert_zur_app(d["name"])]
    namen = {d["name"] for d in dateien}
    if "index.html" not in namen:
        raise RuntimeError("Stand %s hat keine index.html – nichts geändert" % sha[:7])
    neu = [d for d in dateien if eigene.get(d["name"]) != d["sha"] or not os.path.exists(os.path.join(ziel, d["name"]))]
    weg = [n for n in eigene if n not in namen]
    if PRUEFEN:
        log("PRÜFMODUS – Stand %s: würde holen %s%s" % (
            sha[:7], ", ".join(d["name"] for d in neu) or "nichts", (" – entfernen " + ", ".join(weg)) if weg else ""))
        return "geprüft"

    # erst alles laden (als .teil), dann umschalten – nie eine halbe Fassung online
    os.makedirs(ziel, exist_ok=True)
    geladen = []
    try:
        for d in neu:
            inhalt = gh.inhalt(d["name"], sha)
            if d["name"] == "index.html" and not index_ok(inhalt):
                raise RuntimeError("index.html von Stand %s sieht unvollständig aus (%d Bytes) – nichts geändert" % (sha[:7], len(inhalt)))
            if isinstance(d.get("groesse"), int) and d["groesse"] != len(inhalt):
                raise RuntimeError("%s unvollständig geladen (%d statt %d Bytes) – nichts geändert" % (d["name"], len(inhalt), d["groesse"]))
            teil = os.path.join(ziel, d["name"] + ".teil")
            with open(teil, "wb") as f:
                f.write(inhalt)
            os.chmod(teil, 0o644)     # die Web Station liest als eigener Benutzer
            geladen.append(d)
    except Exception:
        for d in geladen:
            try:
                os.remove(os.path.join(ziel, d["name"] + ".teil"))
            except OSError:
                pass
        raise
    for d in sorted(geladen, key=lambda d: ZULETZT.index(d["name"]) + 1 if d["name"] in ZULETZT else 0):
        os.replace(os.path.join(ziel, d["name"] + ".teil"), os.path.join(ziel, d["name"]))
        eigene[d["name"]] = d["sha"]
    for n in weg:
        try:
            os.remove(os.path.join(ziel, n))
        except OSError:
            pass
        eigene.pop(n, None)
    stand.update({"sha": sha, "dateien": eigene, "zeit": time.strftime("%Y-%m-%d %H:%M:%S")})
    stand.pop("wartet", None)
    log("Stand %s online: %s%s" % (sha[:7], ", ".join(d["name"] for d in geladen) or "nichts geändert",
                                   (" – entfernt " + ", ".join(weg)) if weg else ""))
    return "neu"


def sperren():
    """verhindert, dass sich zwei Läufe überholen"""
    try:
        if os.path.exists(SPERRE) and time.time() - os.path.getmtime(SPERRE) < 1800:
            return False
        with open(SPERRE, "w") as f:
            f.write(str(os.getpid()))
        return True
    except OSError:
        return True


def main():
    k = lade_konfig()
    if PRUEFEN:
        log("PRÜFMODUS – es wird nichts geschrieben")
    elif not sperren():
        log("vorheriger Lauf ist noch aktiv, übersprungen")
        return
    try:
        stand = lade_stand()
        try:
            holen(k, GitHub(k), stand)
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
