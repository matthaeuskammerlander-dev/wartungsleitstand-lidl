#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test für synology/ukt_app_holen.py – läuft in der automatischen Prüfung
(GitHub), ohne Synology und ohne GitHub: die Anfragen werden nachgestellt,
geschrieben wird in einen Testordner."""
import os
import shutil
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "..", "synology"))
import ukt_app_holen as A  # noqa: E402

SEITE = b"<!doctype html><html><head><title>Leitstand</title></head><body>" + b"x" * 30000 + b"</body></html>"

# Stand auf GitHub: Name -> (Inhalt-Kennung, Inhalt)
gh = {"sha": "a" * 40, "pruefung": "ok", "dateien": {}}
zustand = {"geholt": [], "anfragen": 0}


def dateien_setzen(**neu):
    gh["dateien"] = dict(neu)


def falsche_anfrage(url, kopf=None, roh=False):
    zustand["anfragen"] += 1
    if "/check-runs" in url:
        p = gh["pruefung"]
        if p == "keine":
            return {"check_runs": []}
        return {"check_runs": [{"status": "in_progress" if p == "laeuft" else "completed",
                                "conclusion": None if p == "laeuft" else ("success" if p == "ok" else "failure")}]}
    if "/commits/" in url:
        if (kopf or {}).get("Accept") == "application/vnd.github.sha":
            return gh["sha"].encode()
        return {"commit": {"committer": {"date": "2026-10-29T08:00:00Z"}}}
    if "/contents/?ref=" in url:
        return [{"name": n, "sha": s, "size": len(c), "type": "file"} for n, (s, c) in gh["dateien"].items()] + \
               [{"name": "tools", "sha": "t", "type": "dir"}]
    if "/contents/" in url:
        name = A.urllib.parse.unquote(url.split("/contents/")[1].split("?")[0])
        zustand["geholt"].append(name)
        return gh["dateien"][name][1]
    raise RuntimeError("unerwartet: " + url)


def main():
    A.anfrage = falsche_anfrage
    A.LOG = os.path.join(tempfile.gettempdir(), "ukt-app-holen-test.log")
    ziel = tempfile.mkdtemp(prefix="ukt-app-holen-test-")
    try:
        with open(os.path.join(ziel, "fremd.txt"), "w") as f:
            f.write("gehört dem Admin")
        k = {"repo": "x/y", "zweig": "main", "ziel": ziel, "token": "", "nur_gepruefte": True, "pruefung": "App prüfen"}
        g = A.GitHub(k)
        stand = {}
        dateien_setzen(**{"index.html": ("i1", SEITE), "config.js": ("c1", b"window.UKT_CONFIG={}"),
                          "sw.js": ("s1", b"// sw"), "logo.png": ("l1", b"PNG"),
                          "README.md": ("r1", b"# geheim"), "supabase-setup.sql": ("q1", b"create"),
                          "daten.js": ("d1", b"klartext"), ".nojekyll": ("n1", b"")})

        # erster Lauf: nur die Dateien der App, nie Beschreibungen, SQL oder den Klartext-Stamm
        assert A.holen(k, g, stand) == "neu"
        vorhanden = sorted(os.listdir(ziel))
        assert vorhanden == ["config.js", "fremd.txt", "index.html", "logo.png", "sw.js"], vorhanden
        assert sorted(zustand["geholt"]) == ["config.js", "index.html", "logo.png", "sw.js"], zustand["geholt"]
        # umgeschaltet wird zuletzt mit sw.js und index.html
        assert not [n for n in os.listdir(ziel) if n.endswith(".teil")]

        # zweiter Lauf ohne neuen Stand: eine einzige kleine Anfrage, nichts geholt
        zustand["geholt"], zustand["anfragen"] = [], 0
        assert A.holen(k, g, stand) == "unverändert" and zustand["anfragen"] == 1 and zustand["geholt"] == []

        # neuer Stand, Prüfung läuft noch: warten, bisherige Fassung bleibt
        gh["sha"], gh["pruefung"] = "b" * 40, "laeuft"
        gh["dateien"]["index.html"] = ("i2", SEITE.replace(b"Leitstand", b"Leitstand 2"))
        assert A.holen(k, g, stand) == "wartet" and zustand["geholt"] == []
        # Prüfung gescheitert: nicht übernehmen
        gh["pruefung"] = "gescheitert"
        assert A.holen(k, g, stand) == "gescheitert" and zustand["geholt"] == []
        assert b"Leitstand 2" not in open(os.path.join(ziel, "index.html"), "rb").read()
        # bestanden: nur die geänderte Datei holen
        gh["pruefung"] = "ok"
        assert A.holen(k, g, stand) == "neu" and zustand["geholt"] == ["index.html"], zustand["geholt"]
        assert b"Leitstand 2" in open(os.path.join(ziel, "index.html"), "rb").read()

        # kaputte index.html (abgeschnitten): nichts umschalten, auch die anderen Dateien nicht
        zustand["geholt"] = []
        gh["sha"] = "c" * 40
        gh["dateien"]["index.html"] = ("i3", b"<!doctype html><html><body>kurz")
        gh["dateien"]["config.js"] = ("c3", b"window.UKT_CONFIG={neu:1}")
        try:
            A.holen(k, g, stand)
            raise AssertionError("kaputte index.html wurde übernommen")
        except RuntimeError:
            pass
        assert stand["sha"] == "b" * 40
        assert open(os.path.join(ziel, "config.js"), "rb").read() == b"window.UKT_CONFIG={}"
        assert not [n for n in os.listdir(ziel) if n.endswith(".teil")], os.listdir(ziel)

        # Datei aus dem Repository entfernt: eigene weg, fremde bleibt
        gh["sha"] = "d" * 40
        gh["dateien"]["index.html"] = ("i4", SEITE)
        gh["dateien"]["config.js"] = ("c1", b"window.UKT_CONFIG={}")
        del gh["dateien"]["logo.png"]
        assert A.holen(k, g, stand) == "neu"
        assert sorted(os.listdir(ziel)) == ["config.js", "fremd.txt", "index.html", "sw.js"], os.listdir(ziel)

        # jemand hat eine Datei im Web-Ordner gelöscht: beim nächsten Lauf wieder da
        os.remove(os.path.join(ziel, "sw.js"))
        zustand["geholt"] = []
        assert A.holen(k, g, stand) == "neu" and zustand["geholt"] == ["sw.js"], zustand["geholt"]

        # Prüfmodus schreibt nichts
        A.PRUEFEN = True
        gh["sha"] = "e" * 40
        gh["dateien"]["config.js"] = ("c5", b"window.UKT_CONFIG={p:1}")
        zustand["geholt"] = []
        A.holen(k, g, stand)
        assert zustand["geholt"] == [] and stand["sha"] == "d" * 40
        A.PRUEFEN = False

        assert A.gehoert_zur_app("icon-512.png") and A.gehoert_zur_app("daten.enc.js")
        assert not A.gehoert_zur_app("daten.js") and not A.gehoert_zur_app("CLAUDE.md") and not A.gehoert_zur_app(".nojekyll")
        print("app_holen_test: alles in Ordnung")
    finally:
        shutil.rmtree(ziel, ignore_errors=True)


if __name__ == "__main__":
    main()
