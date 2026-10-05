#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test für synology/ukt_posteingang.py (eintraege) – ohne Postfach und ohne
Supabase, nur ausgedachte Mails. Läuft in der automatischen Prüfung."""
import os
import sys
from email.message import EmailMessage

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "synology"))
import ukt_posteingang as P  # noqa: E402


def mail(betreff, anhaenge, logo=False):
    m = EmailMessage()
    m["Subject"], m["From"], m["Message-ID"] = betreff, "a@b.at", "<1@b>"
    m.set_content("Hallo, bitte um Angebot.")
    for name, typ, inhalt in anhaenge:
        haupt, unter = typ.split("/")
        m.add_attachment(inhalt, maintype=haupt, subtype=unter, filename=name)
    if logo:
        m.add_attachment(b"\x89PNG", maintype="image", subtype="png", filename="logo.png", disposition="inline")
    return m, m.as_bytes()


def main():
    # weitergeleitete Anfrage: Word, Plan (PDF), DWG und die Mail selbst – Logo nicht
    m, roh = mail("Fwd: Anfrage Klima Muster", [("RFQ.docx", "application/octet-stream", b"PK.."),
                                                  ("Plan M01.pdf", "application/pdf", b"%PDF-1.4"),
                                                  ("Plan.dwg", "application/octet-stream", b"AC1027")], logo=True)
    e = P.eintraege(m, roh, "Fwd: Anfrage Klima Muster")
    namen = [x[0] for x in e]
    assert namen == ["RFQ.docx", "Plan M01.pdf", "Plan.dwg", "Fwd Anfrage Klima Muster.eml"], namen
    assert e[-1][2] == "message/rfc822" and e[-1][3] == "mail" and e[-1][1] == roh
    assert e[0][2] == P.ARTEN[".docx"] and e[2][2] == P.ARTEN[".dwg"]
    # Mail ganz ohne Anhang: nur die .eml
    m, roh = mail("Klimaanlage Reinigung", [])
    e = P.eintraege(m, roh, "Klimaanlage Reinigung")
    assert [x[3] for x in e] == ["mail"], e
    # Lidl-Rapport: wie bisher nur die PDF, keine .eml
    m, roh = mail("Rapport 4711", [("4711_rapport.pdf", "application/pdf", b"%PDF-1.4")])
    e = P.eintraege(m, roh, "Rapport 4711")
    assert [(x[0], x[3]) for x in e] == [("4711_rapport.pdf", "rapport")], e
    # zu groß: weggelassen
    alt = P.GROESSTE
    P.GROESSTE = 3
    m, roh = mail("Gross", [("a.pdf", "application/pdf", b"%PDF-1.4")])
    assert P.eintraege(m, roh, "Gross") == []
    P.GROESSTE = alt
    ohne_leserecht()
    print("posteingang_test: alles in Ordnung")


class Netz:
    """nachgebautes Supabase für ein Konto OHNE Leserecht im Posteingang (Inhaber 05.10.2026: lesen nur
    Inhaber und Admins): GET liefert nichts, eine schon vorhandene Datei meldet der Speicher als „Duplicate“,
    eine schon vorhandene Zeile übergeht die Datenbank (on conflict do nothing)"""
    def __init__(self, scheitern=None):
        self.dateien, self.zeilen, self.scheitern = {}, {}, scheitern

    def __call__(self, methode, url, kopf=None, daten=None, roh_daten=None, typ=None):
        if "/auth/v1/token" in url:
            return {"access_token": "t"}
        if methode == "GET":
            return []
        if "/storage/v1/object/posteingang/" in url:
            pfad = url.split("/storage/v1/object/posteingang/")[1]
            if self.scheitern and self.scheitern in pfad:
                self.scheitern = None
                raise P.HttpFehler(503, url, "Zeitüberschreitung")
            if pfad in self.dateien:
                raise P.HttpFehler(400, url, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}')
            self.dateien[pfad] = roh_daten
            return {"Key": pfad}
        assert methode == "POST" and "/rest/v1/posteingang?on_conflict=nachricht_id,dateiname" in url, url
        assert "return=minimal" in kopf["Prefer"] and "resolution=ignore-duplicates" in kopf["Prefer"], kopf
        self.zeilen.setdefault((daten["nachricht_id"], daten["dateiname"]), daten)
        return None


def ohne_leserecht():
    netz = Netz(scheitern="Plan_EG")
    alt, P.anfrage = P.anfrage, netz
    P.PRUEFEN = True          # nur anzeigen – keine Protokolldatei neben dem Skript
    try:
        db = P.Supabase({"supabase_url": "https://x.test", "supabase_key": "k", "email": "e", "passwort": "p"})
        gefunden = [("Anfrage.eml", b"From: a@b.at", "message/rfc822", "mail"), ("Plan EG.pdf", b"%PDF-1.4", "application/pdf", "unbekannt")]
        # erster Lauf: die zweite Datei scheitert – die Mail bleibt liegen
        n1, ok1 = P.ablegen_mail(db, "<1@b>", "a@b.at", "Anfrage", gefunden, "2026/10")
        assert (n1, ok1) == (1, False) and len(netz.dateien) == 1 and len(netz.zeilen) == 1, (n1, ok1, netz.dateien, netz.zeilen)
        # zweiter Lauf: die erste ist schon da („Duplicate“ ist kein Fehler), nichts doppelt
        n2, ok2 = P.ablegen_mail(db, "<1@b>", "a@b.at", "Anfrage", gefunden, "2026/10")
        assert ok2 and len(netz.dateien) == 2 and len(netz.zeilen) == 2, (n2, ok2, netz.dateien, netz.zeilen)
        # dritter Lauf (Mail ließ sich nicht verschieben): immer noch nichts doppelt, kein Fehler
        assert P.ablegen_mail(db, "<1@b>", "a@b.at", "Anfrage", gefunden, "2026/10")[1] and len(netz.dateien) == 2 and len(netz.zeilen) == 2
        # fester Pfad: gleiche Mail und Datei → gleicher Pfad, andere Mail → anderer
        assert P.ablage_pfad("<1@b>", "a.pdf", "2026/10") == P.ablage_pfad("<1@b>", "a.pdf", "2026/10") != P.ablage_pfad("<2@b>", "a.pdf", "2026/10")
        assert all(p.startswith("2026/10/") for p in netz.dateien)
        # ein anderer Fehler des Speichers bleibt ein Fehler
        try:
            P.anfrage = lambda *a, **k: (_ for _ in ()).throw(P.HttpFehler(403, "u", "new row violates row-level security policy"))
            db.ablegen("x/y.pdf", b"", "application/pdf")
            raise AssertionError("403 nicht gemeldet")
        except P.HttpFehler:
            pass
    finally:
        P.anfrage, P.PRUEFEN = alt, False


if __name__ == "__main__":
    main()
