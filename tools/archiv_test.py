#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test für synology/ukt_archiv.py – läuft in der automatischen Prüfung
(GitHub), ohne Synology und ohne Supabase: die Anfragen werden nachgestellt,
geschrieben wird in einen Testordner. Nur ausgedachte Daten."""
import json
import os
import shutil
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "..", "synology"))
import ukt_archiv as A  # noqa: E402

PDF = b"%PDF-1.4 Test"

PROJEKT = {
    "id": "11111111-2222-3333-4444-555555555555", "nummer": "P-2026-001", "titel": "Muster – Klima neu",
    "kunde_id": "lidl", "standort_id": "Ntest1", "status": "abgerechnet",
    "erstellt": "2026-05-28T10:00:00+00:00", "geaendert": "2026-10-01T10:00:00+00:00",
    "daten": {
        "angebotNr": "900001", "begehungDatum": "2026-05-28", "anlagen": ["NPtest1"],
        "beteiligte": [{"id": "a", "rolle": "Planer HKLS", "firma": "Planer GmbH", "name": "M. Muster"}],
        "termine": [{"id": "b", "datum": "2026-09-12", "was": "Montage <Samstag>", "erledigt": True,
                     "quellen": [{"name": "Grundriss EG.pdf", "hinweis": "Seite 2"}]}],
        "quellen": {"begehung": [{"name": "Begehungsprotokoll fehlt.pdf"}], "angebot": ["buero/x/angebot-1-Angebot_900001.pdf"]},
        "typ": "Anlagentausch / Umbau",
        "mappePdf": {"pfad": "x/mappe/Projekt_P-2026-001-a.pdf"}, "mappePdfBuero": {"pfad": "buero/x/mappe/Projekt_mit-a.pdf"},
        "baubuch": [{"id": "c", "datum": "2026-09-12", "art": "kran", "text": "Autokran", "menge": 1.5, "eh": "Std"}],
        "dateien": [
            {"pfad": "buero/x/angebot-1-Angebot_900001.pdf", "name": "Angebot 900001.pdf", "art": "angebot", "zeit": "2026-10-01T10:00:00Z"},
            {"pfad": "x/plan-2-Grundriss.pdf", "name": "Grundriss EG.pdf", "art": "plan", "zeit": "2026-10-01T10:00:00Z"},
            {"pfad": "x/foto-3-dach.jpg", "name": "Dach.JPG", "art": "foto", "zeit": "2026-10-01T10:00:00Z"}]},
    "verlauf": [{"zeit": "2026-05-28T10:00:00Z", "wer": "Büro", "text": "Projekt angelegt"}]}
BELEG = {"id": "b1", "projekt_id": PROJEKT["id"], "art": "angebot", "nummer": "900001", "test": False, "extern": True,
         "datum": "2026-05-29", "status": "angenommen", "bezug_id": None, "kopf": {}, "positionen": [],
         "summen": {"netto": 1234.5}}
BELEG2 = dict(BELEG, id="b2", art="rechnung", nummer="T-R-2026-001", test=True, extern=False, status="entwurf",
              pdf_pfad="buero/belege/2026/b2.pdf", standort_id="Ntest1", kunde_id="lidl")
# Rechnung zu einem Einsatz (ohne Projekt) – mit Rapportbericht im PDF
BELEG3 = dict(BELEG, id="b3", projekt_id=None, art="rechnung", nummer="420001", test=False, extern=False,
              pdf_pfad="buero/belege/2026/b3.pdf", standort_id="Ntest1", kunde_id="lidl", protokoll_id="p_1")
STAMM = [{"id": "standort:Ntest1", "typ": "standort", "ziel": "Ntest1", "felder": {"filiale": "123", "ort": "Musterort"}},
         {"id": "position:NPtest1", "typ": "position", "ziel": "NPtest1",
          "felder": {"anlagentyp": "VRV 1", "hersteller": "DAIKIN", "modell": "X1", "seriennummer": "S1",
                     "kaeltemittelArt": "R410A", "kaeltemittelKg": 20.6, "inbetriebnahme": "2026-09-14"}}]

zustand = {"belege_erlaubt": True, "geholt": [], "belege_gefragt": False, "protokolle": [], "berichte": [], "berichte_geholt": []}


def falsche_anfrage(methode, url, kopf=None, daten=None, roh=False):
    if "/auth/v1/token" in url:
        return {"access_token": "t"}
    if "/storage/v1/object/projektdateien/" in url:
        zustand["geholt"].append(url.split("/projektdateien/")[1])
        return PDF
    if "/storage/v1/object/berichte/" in url:
        zustand["berichte_geholt"].append(url.split("/berichte/")[1])
        return PDF
    if "/rest/v1/protokolle" in url:
        return zustand["protokolle"] if "offset=0" in url else []
    if "/rest/v1/berichte" in url:
        return zustand["berichte"] if "offset=0" in url else []
    if "/rest/v1/projekte" in url:
        return [PROJEKT] if "offset=0" in url else []
    if "/rest/v1/belege" in url:
        zustand["belege_gefragt"] = True
        if not zustand["belege_erlaubt"]:
            raise RuntimeError("HTTP 401 bei belege: permission denied")
        return [BELEG, BELEG2, BELEG3] if "offset=0" in url else []
    if "/rest/v1/stammdaten" in url:
        return STAMM if "offset=0" in url else []
    raise RuntimeError("unerwartet: " + url)


def main():
    A.anfrage = falsche_anfrage
    A.LOG = os.path.join(tempfile.gettempdir(), "ukt-archiv-test.log")
    basis = tempfile.mkdtemp(prefix="ukt-archiv-test-")
    try:
        k = {"supabase_url": "https://x", "supabase_key": "k", "email": "e", "passwort": "p", "basis": basis,
             "unterordner": "{jahr}/Lidl/Wartungen"}
        sb = A.Supabase(k)
        stand = {}
        A.projekte_abgleich(k, sb, stand)
        ordner = os.path.join(basis, "2026", "Kunden", "Lidl", "Baustellen", "123-Musterort_P-2026-001")
        erwartet = [os.path.join(ordner, "Plaene", "Grundriss-EG.pdf"),
                    os.path.join(ordner, "Fotos", "Dach.jpg"), os.path.join(ordner, "Projekt_P-2026-001.html"),
                    os.path.join(ordner, "Projekt_P-2026-001.json"), os.path.join(ordner, "Projekt_P-2026-001.pdf")]
        fehlt = [e for e in erwartet if not os.path.exists(e)]
        alle = [os.path.join(r, f) for r, _, fs in os.walk(basis) for f in fs]
        assert not fehlt, "fehlt: %s\nvorhanden: %s" % (fehlt, alle)
        # Angebote/Rechnungen NICHT auf die Synology (Projektordner sehen auch Techniker; Büro 01.10.2026)
        assert not zustand["belege_gefragt"], "Belege wurden abgefragt"
        assert not [g for g in zustand["geholt"] if g.startswith("buero/")], "Büro-Datei geholt: %s" % zustand["geholt"]
        assert not [f for f in alle if "Angebot" in f or "Rechnung" in f], "Beleg im Archiv: %s" % alle
        html = open(os.path.join(ordner, "Projekt_P-2026-001.html"), encoding="utf-8").read()
        for t in ("Planer GmbH", "Montage &lt;Samstag&gt;", "Kran / Hebegerät", "1,5 Std", "VRV 1", "Begehung am",
                  # Quellen: Verweise in den Projektordner, Fehlendes mit Namen, Rückweg bei der Datei
                  'href="Plaene/Grundriss-EG.pdf"', "(Seite 2)", "Angebot 900001.pdf (nur Büro)",
                  "Begehungsprotokoll fehlt.pdf – noch nicht hochgeladen", "Termin: Montage &lt;Samstag&gt;", "Anlagentausch / Umbau"):
            assert t in html, "nicht in der Mappe: " + t
        for t in ("1.234,50", 'href="Angebot/', "buero/"):
            assert t not in html, "darf nicht in die Mappe: " + t
        roh = open(os.path.join(ordner, "Projekt_P-2026-001.json"), encoding="utf-8").read()
        daten = json.loads(roh)
        assert daten["projekt"]["nummer"] == "P-2026-001" and daten["belege"] == []
        assert "buero/" not in roh, "Büro-Datei in der JSON"

        # zweiter Lauf: nichts Neues holen, Mappe nicht neu
        zustand["geholt"] = []
        A.projekte_abgleich(k, sb, stand)
        assert zustand["geholt"] == [], "zweiter Lauf hat wieder geholt: %s" % zustand["geholt"]

        # neue Datei dazu und Projekt geändert: nur die neue holen, Mappe neu
        PROJEKT["daten"]["dateien"].append({"pfad": "x/foto-4-dach.jpg", "name": "Dach.JPG", "art": "foto"})
        PROJEKT["geaendert"] = "2026-10-02T10:00:00+00:00"
        A.projekte_abgleich(k, sb, stand)
        assert zustand["geholt"] == ["x/foto-4-dach.jpg"], zustand["geholt"]
        assert os.path.exists(os.path.join(ordner, "Fotos", "Dach_2.jpg")), "gleicher Name: _2 erwartet"

        # ohne Archivrolle (Belege gesperrt): läuft trotzdem
        zustand["belege_erlaubt"] = False
        PROJEKT["geaendert"] = "2026-10-03T10:00:00+00:00"
        A.projekte_abgleich(k, sb, stand)
        daten = json.load(open(os.path.join(ordner, "Projekt_P-2026-001.json"), encoding="utf-8"))
        assert daten["belege"] == []

        # Markt umbenannt: Ordner wandert mit, Dateien bleiben
        STAMM[0]["felder"]["ort"] = "Neuort"
        A.projekte_abgleich(k, sb, stand)
        neu = os.path.join(basis, "2026", "Kunden", "Lidl", "Baustellen", "123-Neuort_P-2026-001")
        assert os.path.exists(os.path.join(neu, "Plaene", "Grundriss-EG.pdf")) and not os.path.exists(ordner), "Umbenennen"

        # Protokolle: ungleiche Angaben (Name im Abschluss ≠ Techniker/in) – kein PDF ins Archiv (Büro 01.10.2026)
        assert A.ungleich({"techniker": "Darko Jekic", "name_techniker": "Tobias K<"})
        assert not A.ungleich({"techniker": "Darko Jekic", "name_techniker": "Darko Jekic"})
        assert not A.ungleich({"techniker": "Darko Jekic", "name_techniker": ""})
        PR = {"client_id": "p_x", "datum": "2026-09-30", "standort_name": "Musterort", "standort_id": "Ntest1",
              "techniker": "Max Muster", "name_techniker": "Spass Name", "wartungsart": "Störung", "version": 1, "geloescht": None}
        zustand["protokolle"] = [PR]
        zustand["berichte"] = [{"client_id": "p_x", "version": 1, "pfad": "2026/p_x.pdf"}]
        st2 = {}
        A.abgleich(k, sb, st2)
        assert zustand["berichte_geholt"] == [] and st2["p_x"].get("gesperrt"), st2
        # berichtigt (Fassung 2, gleiche Namen): jetzt ins Archiv
        PR.update(name_techniker="Max Muster", version=2)
        zustand["berichte"][0]["version"] = 2
        A.abgleich(k, sb, st2)
        assert zustand["berichte_geholt"] == ["2026/p_x.pdf"] and os.path.exists(st2["p_x"]["datei"]), st2
        # schon archiviert und dann ungleich: Datei wandert nach _gesperrt
        PR.update(name_techniker="Jemand Anderer", version=3)
        A.abgleich(k, sb, st2)
        assert "_gesperrt" in st2["p_x"]["datei"] and os.path.exists(st2["p_x"]["datei"]), st2

        # Dateinamen
        assert A.sauber_datei("Plan/EG: neu?.PDF") == "Plan-EG-neu.pdf", A.sauber_datei("Plan/EG: neu?.PDF")
        print("archiv_test: alles in Ordnung")
    finally:
        shutil.rmtree(basis, ignore_errors=True)


if __name__ == "__main__":
    main()
