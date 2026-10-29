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

# Speicherbereich „sicherungen“: Ordner haben id None und keine metadata
SICHER = {"": [{"name": "datenbank", "id": None, "metadata": None}, {"name": "dateien", "id": None, "metadata": None}],
          "datenbank": [{"name": "2026-10-29.json.gz", "id": "1", "metadata": {"size": 5}}],
          "dateien": [{"name": "berichte", "id": None, "metadata": None}],
          "dateien/berichte": [{"name": "p_1.pdf", "id": "2", "metadata": {"size": 5}},
                               {"name": "..", "id": "3", "metadata": {"size": 5}}]}

zustand = {"gelistet": 0, "sicherung_geholt": [], "anhang_geholt": [], "projekte_extra": [],
           "belege_erlaubt": True, "geholt": [], "belege_gefragt": False, "protokolle": [], "berichte": [], "berichte_geholt": []}


def falsche_anfrage(methode, url, kopf=None, daten=None, roh=False):
    if "/auth/v1/token" in url:
        return {"access_token": "t"}
    if "/storage/v1/object/projektdateien/" in url:
        zustand["geholt"].append(url.split("/projektdateien/")[1])
        return PDF
    if "/storage/v1/object/protokollfotos/" in url:
        zustand["anhang_geholt"].append(url.split("/protokollfotos/")[1])
        return PDF
    if "/storage/v1/object/berichte/" in url:
        zustand["berichte_geholt"].append(url.split("/berichte/")[1])
        return PDF
    if "/rest/v1/protokolle" in url:
        return zustand["protokolle"] if "offset=0" in url else []
    if "/rest/v1/berichte" in url:
        return zustand["berichte"] if "offset=0" in url else []
    if "/rest/v1/projekte" in url:
        return [PROJEKT] + zustand["projekte_extra"] if "offset=0" in url else []
    if "/rest/v1/belege" in url:
        zustand["belege_gefragt"] = True
        if not zustand["belege_erlaubt"]:
            raise RuntimeError("HTTP 401 bei belege: permission denied")
        return [BELEG, BELEG2, BELEG3] if "offset=0" in url else []
    if "/storage/v1/object/list/sicherungen" in url:
        zustand["gelistet"] += 1
        return SICHER.get(daten["prefix"], []) if daten["offset"] == 0 else []
    if "/storage/v1/object/sicherungen/" in url:
        zustand["sicherung_geholt"].append(url.split("/sicherungen/")[1])
        return b"x" * 5
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
        ordner = os.path.join(basis, "2026", "Lidl", "Baustellen", "Musterort")
        erwartet = [os.path.join(ordner, "Plaene", "Grundriss EG.pdf"),
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
                  'href="Plaene/Grundriss%20EG.pdf"', "(Seite 2)", "Angebot 900001.pdf (nur Büro)",
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
        neu = os.path.join(basis, "2026", "Lidl", "Baustellen", "Neuort")
        assert os.path.exists(os.path.join(neu, "Plaene", "Grundriss EG.pdf")) and not os.path.exists(ordner), "Umbenennen"

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
        # Störungsprotokoll: eigener Ordner …/Lidl/Störungen (Büro 02.10.2026)
        assert os.path.dirname(st2["p_x"]["datei"]) == os.path.join(basis, "2026", "Lidl", "Störungen"), st2
        # Name wie auf der Synology üblich: Markt,Datum (Störung ohne Termin)
        assert os.path.basename(st2["p_x"]["datei"]) == "Musterort,2026-09-30.pdf", st2
        # schon archiviert und dann ungleich: Datei wandert nach _gesperrt
        PR.update(name_techniker="Jemand Anderer", version=3)
        A.abgleich(k, sb, st2)
        assert "_gesperrt" in st2["p_x"]["datei"] and os.path.exists(st2["p_x"]["datei"]), st2

        # weitere Kunden wie bisher auf der Synology: 2026/Wartungen, 2026/Störungen, Kunde im Dateinamen
        assert A.zielordner(k, {"datum": "2026-09-01", "standort_id": "N9", "wartungsart": "Störung"}, {"N9": "Muster"}) ==             os.path.join(basis, "2026", "Störungen")
        assert A.zielordner(k, {"datum": "2026-09-01", "standort_id": "N9", "wartungsart": "Wartung"}, {"N9": "Muster"}) ==             os.path.join(basis, "2026", "Wartungen")
        assert A.dateiname({"datum": "2026-06-05", "standort_name": "Kössen", "wartungsart": "planmäßig",
                            "anlagen": [{"termin": "Jahreswartung"}, {"termin": "Halbjahresinspektion"}]}, "Auto Aicher") ==             "Auto Aicher,Kössen,2026-06-05,JW+HJI.pdf"
        po = A.projekt_ordner(k, {"erstellt": "2026-10-02", "kunde_id": "K1", "nummer": "P-2026-009", "titel": "Hotel Muster Wien – Lüftung"},
                              {"lidl": "Lidl", "K1": "Hotel Muster GmbH"}, {})
        assert po == os.path.join(basis, "2026", "Baustellen", "Hotel Muster Wien"), po
        # Lidl in Wien: Ordner aus dem Titel (nicht nur „Wien“, nicht „Filiale 444“)
        pw = A.projekt_ordner(k, {"erstellt": "2026-10-28", "kunde_id": "lidl", "standort_id": "N4", "titel": "Fil. 444 Wien Quellenstraße 80 – CVP in VRV"},
                              {"lidl": "Lidl"}, {"N4": {"name": "Filiale 444", "ort": "Wien"}})
        assert pw == os.path.join(basis, "2026", "Lidl", "Baustellen", "Wien Quellenstraße 80"), pw
        # aus dem Synology-Archiv nachgetragen: bleibt in seinem Ordner
        pa = A.projekt_ordner(k, {"erstellt": "2026-10-27", "daten": {"archiv": {"ordner": ["2026/Lidl/Baustellen/CVP in VRV/Hoßplatz"]}}}, {}, {})
        assert pa == os.path.join(basis, "2026", "Lidl", "Baustellen", "CVP in VRV", "Hoßplatz"), pa

        # Büro-Ordner (nur Chef): Angebote, Rechnungen und Büro-PDF NUR dort, nie im Archiv
        buero = tempfile.mkdtemp(prefix="ukt-buero-test-")
        try:
            kb = dict(k, buero_basis=buero)
            zustand["belege_erlaubt"], zustand["geholt"] = True, []
            stb = {}
            A.projekte_abgleich(kb, sb, stb)
            bo = os.path.join(buero, "2026", "Lidl", "Baustellen", "Neuort")
            b_alle = [os.path.join(r, f) for r, _, fs in os.walk(buero) for f in fs]
            for e in (os.path.join(bo, "Angebot", "Angebot 900001.pdf"),
                      os.path.join(bo, "Projekt_P-2026-001_mit_Angeboten_Rechnungen.pdf")):
                assert os.path.exists(e), "Büro fehlt: %s\nvorhanden: %s" % (e, b_alle)
            assert [f for f in b_alle if f.startswith(os.path.join(bo, "Rechnung", "_Test"))], "Test-Rechnung fehlt: %s" % b_alle
            assert [f for f in b_alle if f.startswith(os.path.join(buero, "2026", "Lidl", "Rechnungen"))], "Rechnung ohne Projekt fehlt: %s" % b_alle
            a_alle = [os.path.join(r, f) for r, _, fs in os.walk(basis) for f in fs]
            assert not [f for f in a_alle if os.sep + "Angebot" in f or os.sep + "Rechnung" in f or "mit_Angeboten" in f], "Beleg im Archiv: %s" % a_alle
            roh = open(os.path.join(basis, "2026", "Lidl", "Baustellen", "Neuort", "Projekt_P-2026-001.json"), encoding="utf-8").read()
            assert "buero/" not in roh and json.loads(roh)["belege"] == [], "Büro-Daten in der Archiv-Mappe"
        finally:
            shutil.rmtree(buero, ignore_errors=True)

        # Sicherung (Inhaber 29.10.2026): nur mit Büro-Ordner, einmal am Tag, nie aus dem Ordner heraus
        buero = tempfile.mkdtemp(prefix="ukt-buero-test-")
        try:
            sts = {}
            A.sicherungen_abgleich(k, sb, sts)
            assert zustand["gelistet"] == 0 and not sts, "ohne Büro-Ordner darf nichts geholt werden"
            kb = dict(k, buero_basis=buero)
            A.sicherungen_abgleich(kb, sb, sts)
            assert sorted(zustand["sicherung_geholt"]) == ["dateien/berichte/p_1.pdf", "datenbank/2026-10-29.json.gz"], zustand["sicherung_geholt"]
            assert os.path.exists(os.path.join(buero, "Sicherung", "datenbank", "2026-10-29.json.gz"))
            assert os.path.exists(os.path.join(buero, "Sicherung", "dateien", "berichte", "p_1.pdf"))
            assert sts["sicherung:"]["offen"] == 0
            # gleich danach: nicht nochmals nachsehen
            n = zustand["gelistet"]
            A.sicherungen_abgleich(kb, sb, sts)
            assert zustand["gelistet"] == n, "innerhalb von 20 Stunden nochmals nachgesehen"
            # einen Tag später: nachsehen, aber Vorhandenes nicht nochmals holen
            sts["sicherung:"]["zuletzt"] -= 21 * 3600
            zustand["sicherung_geholt"] = []
            A.sicherungen_abgleich(kb, sb, sts)
            assert zustand["gelistet"] > n and zustand["sicherung_geholt"] == [], zustand["sicherung_geholt"]
            # die Sicherung liegt NIE im Archiv (das sehen auch Techniker)
            a_alle = [os.path.join(r, f) for r, _, fs in os.walk(basis) for f in fs]
            assert not [f for f in a_alle if "Sicherung" in f or f.endswith(".json.gz")], a_alle
        finally:
            shutil.rmtree(buero, ignore_errors=True)

        # Vom Büro nach „3.Quartal abgerechnet“ verschoben: nicht nochmals ablegen, Korrektur dort ersetzen
        PR.update(name_techniker="Max Muster", version=4)
        zustand["berichte"][0]["version"] = 4
        st3 = {}
        A.abgleich(k, sb, st3)
        erst = st3["p_x"]["datei"]
        abger = os.path.join(os.path.dirname(erst), "3.Quartal abgerechnet")
        os.makedirs(abger)
        os.replace(erst, os.path.join(abger, os.path.basename(erst)))
        zustand["berichte_geholt"] = []
        A.abgleich(k, sb, st3)
        assert zustand["berichte_geholt"] == [] and st3["p_x"]["datei"].startswith(abger), st3
        PR["version"] = 5
        zustand["berichte"][0]["version"] = 5
        A.abgleich(k, sb, st3)
        assert zustand["berichte_geholt"] == ["2026/p_x.pdf"] and st3["p_x"]["datei"].startswith(abger), st3
        assert not os.path.exists(erst), "Korrektur wieder in der Wurzel abgelegt"

        # Lidl-Rapport neben das Protokoll, Lidl-Auftrag nach Störungen/Beauftragungen (Originalnamen)
        PR2 = dict(PR, client_id="p_y", datum="2026-10-02", version=1,
                   rapport={"name": "624589446_AT0405_32288533_rapport.pdf", "pfad": "p_y/rapport-abc.pdf"},
                   stoerung={"auftragDatei": {"name": "Display piepst 32288533_AT0405.pdf"}})
        zustand["protokolle"] = [PR2]
        zustand["berichte"] = [{"client_id": "p_y", "version": 1, "pfad": "2026/p_y.pdf"}]
        st4 = {}
        A.abgleich(k, sb, st4)
        sto = os.path.join(basis, "2026", "Lidl", "Störungen")
        assert os.path.exists(os.path.join(sto, "624589446_AT0405_32288533_rapport.pdf")), os.listdir(sto)
        assert os.path.exists(os.path.join(sto, "Beauftragungen", "Display piepst 32288533_AT0405.pdf")), os.listdir(sto)
        assert sorted(zustand["anhang_geholt"]) == ["p_y/auftrag.pdf", "p_y/rapport-abc.pdf"], zustand["anhang_geholt"]
        zustand["anhang_geholt"] = []
        A.abgleich(k, sb, st4)
        assert zustand["anhang_geholt"] == [], "Anhänge zweimal geholt"

        # Projekt aus dem Archiv: Dateien von der Synology nie zurückschreiben; Ordner-Weg aus dem Hochladen;
        # schon vorhandene Datei (gleicher Name, gleiche Größe) nicht doppelt
        ao = os.path.join(basis, "2026", "Lidl", "Baustellen", "Altort")
        os.makedirs(os.path.join(ao, "AHT"))
        with open(os.path.join(ao, "AHT", "Grundriss alt.pdf"), "wb") as f:
            f.write(PDF)
        with open(os.path.join(ao, "AHT", "Schema.pdf"), "wb") as f:
            f.write(PDF)
        zustand["projekte_extra"] = [{
            "id": "22222222-2222-3333-4444-555555555555", "nummer": "P-2026-020", "titel": "Altort", "kunde_id": "lidl",
            "status": "baustelle", "erstellt": "2026-10-27T10:00:00+00:00", "geaendert": "2026-10-27T10:00:00+00:00",
            "daten": {"archiv": {"ordner": ["2026/Lidl/Baustellen/Altort"]}, "dateien": [
                {"pfad": "y/1.pdf", "name": "Grundriss alt.pdf", "art": "plan", "herkunft": "Synology 2026/Lidl/Baustellen/Altort/AHT"},
                {"pfad": "y/2.pdf", "name": "Schema.pdf", "art": "plan", "groesse": len(PDF), "herkunft": "AHT"},
                {"pfad": "y/3.pdf", "name": "Elektro.pdf", "art": "plan", "groesse": len(PDF), "herkunft": "Kika Altort/UKT"}]},
            "verlauf": []}]
        zustand["geholt"] = []
        st5 = stand   # Stand des ersten Projekts weiterführen (sonst holt es dessen Dateien erneut)
        A.projekte_abgleich(k, sb, st5)
        assert zustand["geholt"] == ["y/3.pdf"], zustand["geholt"]
        assert os.path.exists(os.path.join(ao, "Kika Altort", "UKT", "Elektro.pdf")), [os.path.join(r, f) for r, _, fs in os.walk(ao) for f in fs]
        assert not os.path.exists(os.path.join(ao, "Plaene")), "Archivdatei doppelt abgelegt"
        assert st5["projekt:22222222-2222-3333-4444-555555555555"]["eigen"] is False
        # vom Büro verschoben: nicht nochmals holen
        os.replace(os.path.join(ao, "Kika Altort", "UKT", "Elektro.pdf"), os.path.join(ao, "Elektro.pdf"))
        zustand["geholt"] = []
        A.projekte_abgleich(k, sb, st5)
        assert zustand["geholt"] == [], zustand["geholt"]
        zustand["projekte_extra"] = []

        # Dateinamen
        assert A.sauber_datei("Plan/EG: neu?.PDF") == "Plan-EG neu.pdf", A.sauber_datei("Plan/EG: neu?.PDF")
        print("archiv_test: alles in Ordnung")
    finally:
        shutil.rmtree(basis, ignore_errors=True)


if __name__ == "__main__":
    main()
