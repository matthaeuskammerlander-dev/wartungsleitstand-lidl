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
    print("posteingang_test: alles in Ordnung")


if __name__ == "__main__":
    main()
