#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Das Datenbank-Postfach abholen: Aufträge und Rapportberichte von Lidl.

Lidl schickt Aufträge und Rapporte an ein eigenes Postfach (nur für die
Datenbank). Dieses Skript läuft auf der Synology (Aufgabenplaner, alle
5 Minuten), holt neue Mails per IMAP, legt jede PDF bzw. jedes Bild in
Supabase in den Posteingang und verschiebt die Mail danach in den Ordner
"Verarbeitet". In der App erscheint der Eingang unter „Fällig“ und wird dort
einem Protokoll angehängt oder als offene Störung erfasst.

Die Mail bleibt im Postfach erhalten (nur verschoben), nichts wird gelöscht.
Dieselbe Mail kommt nie doppelt an: Message-ID und Dateiname sind in der
Datenbank eindeutig.

Benötigt nur Python 3 (bei DSM 7 vorhanden), keine Zusatzpakete.

Aufruf:
    python3 ukt_posteingang.py              # abholen
    python3 ukt_posteingang.py --pruefen    # nur anzeigen, was passieren würde
"""
import email
import email.header
import email.utils
import imaplib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HIER = os.path.dirname(os.path.abspath(__file__))
KONFIG = os.path.join(HIER, "ukt_posteingang.json")
LOG = os.path.join(HIER, "ukt_posteingang.log")
SPERRE = os.path.join(HIER, "ukt_posteingang.sperre")

PRUEFEN = "--pruefen" in sys.argv
ARTEN = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def log(text):
    zeile = time.strftime("%Y-%m-%d %H:%M:%S") + "  " + text
    print(zeile)
    if PRUEFEN:
        return
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 1024 * 1024:
            os.replace(LOG, LOG + ".alt")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(zeile + "\n")
    except OSError:
        pass


def lade_konfig():
    if not os.path.exists(KONFIG):
        raise SystemExit("Einstellungen fehlen: " + KONFIG +
                         " (Vorlage ukt_posteingang.beispiel.json kopieren und ausfüllen)")
    with open(KONFIG, encoding="utf-8") as f:
        k = json.load(f)
    for feld in ("supabase_url", "supabase_key", "email", "passwort",
                 "imap_server", "imap_benutzer", "imap_passwort"):
        if not k.get(feld) or "HIER" in str(k.get(feld)):
            raise SystemExit("In " + KONFIG + " ist '" + feld + "' nicht ausgefüllt.")
    k["supabase_url"] = k["supabase_url"].rstrip("/")
    k.setdefault("imap_port", 993)
    k.setdefault("ordner", "INBOX")
    k.setdefault("ordner_erledigt", "Verarbeitet")
    return k


# ---------------------------------------------------------------- Supabase

def anfrage(methode, url, kopf=None, daten=None, roh_daten=None, typ=None):
    if roh_daten is not None:
        body = roh_daten
    else:
        body = json.dumps(daten).encode("utf-8") if daten is not None else None
    req = urllib.request.Request(url, data=body, method=methode, headers=kopf or {})
    if body is not None:
        req.add_header("Content-Type", typ or "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            inhalt = r.read()
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError("HTTP %s bei %s: %s" % (e.code, url.split("?")[0], text))
    try:
        return json.loads(inhalt.decode("utf-8") or "null")
    except ValueError:
        return None


class Supabase:
    def __init__(self, k):
        self.url = k["supabase_url"]
        self.key = k["supabase_key"]
        r = anfrage("POST", self.url + "/auth/v1/token?grant_type=password",
                    {"apikey": self.key}, {"email": k["email"], "password": k["passwort"]})
        self.token = r["access_token"]

    def kopf(self, extra=None):
        h = {"apikey": self.key, "Authorization": "Bearer " + self.token}
        h.update(extra or {})
        return h

    def schon_da(self, nachricht_id, dateiname):
        q = urllib.parse.urlencode({"select": "id", "nachricht_id": "eq." + nachricht_id,
                                    "dateiname": "eq." + dateiname, "limit": 1})
        return bool(anfrage("GET", self.url + "/rest/v1/posteingang?" + q, self.kopf()))

    def ablegen(self, pfad, inhalt, typ):
        anfrage("POST", self.url + "/storage/v1/object/posteingang/" + urllib.parse.quote(pfad),
                self.kopf({"x-upsert": "false"}), roh_daten=inhalt, typ=typ)

    def eintragen(self, zeile):
        anfrage("POST", self.url + "/rest/v1/posteingang",
                self.kopf({"Prefer": "return=minimal"}), zeile)


# ---------------------------------------------------------------- Mails

def entschluesseln(wert):
    """Kopfzeile lesbar machen – nie mit Fehler: eine Mail mit ungewöhnlich
    kodiertem Betreff darf nicht den ganzen Posteingang blockieren"""
    teile = []
    try:
        for text, zs in email.header.decode_header(str(wert) if wert is not None else ""):
            if isinstance(text, bytes):
                try:
                    text = text.decode(zs or "utf-8", "replace")
                except (LookupError, UnicodeDecodeError):
                    text = text.decode("utf-8", "replace")
            teile.append(text)
    except Exception:                                     # noqa: BLE001
        return str(wert or "").strip()
    return "".join(teile).strip()


def art_von(dateiname, betreff):
    """Rapporte heißen bei Lidl …_rapport.pdf; Aufträge tragen die Nummer im Betreff"""
    n, b = dateiname.lower(), betreff.lower()
    if "rapport" in n or "rapport" in b:
        return "rapport"
    if "auftrag" in n or "auftrag" in b or "störung" in b or "stoerung" in b:
        return "auftrag"
    return "unbekannt"


def anhaenge(nachricht):
    namen = {}
    for teil in nachricht.walk():
        if teil.get_content_maintype() == "multipart":
            continue
        name = entschluesseln(teil.get_filename() or "")
        if not name:
            continue
        endung = os.path.splitext(name)[1].lower()
        if endung not in ARTEN:
            continue
        # eingebettete Bilder (Logo in der Signatur) sind keine Anhänge
        if teil.get_content_maintype() == "image" and (teil.get("Content-Disposition") or "").lower().startswith("inline"):
            continue
        inhalt = teil.get_payload(decode=True)
        if not inhalt:
            continue
        # gleichnamige Anhänge einer Mail: durchnummerieren, sonst ginge der zweite verloren
        n = namen.get(name.lower(), 0)
        namen[name.lower()] = n + 1
        if n:
            stamm, end = os.path.splitext(name)
            name = "%s (%d)%s" % (stamm, n + 1, end)
        yield name, inhalt, ARTEN[endung]


def sauber(name):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:90]


def abholen(k):
    db = None if PRUEFEN else Supabase(k)
    imap = imaplib.IMAP4_SSL(k["imap_server"], int(k["imap_port"]))
    imap.login(k["imap_benutzer"], k["imap_passwort"])
    try:
        if not PRUEFEN:
            imap.create(k["ordner_erledigt"])        # Fehler, wenn es ihn schon gibt – egal
        imap.select(k["ordner"])
        typ, daten = imap.uid("search", None, "ALL")
        uids = (daten[0] or b"").split()
        neu = verschoben = 0
        for uid in uids:
          # eine kaputte Mail darf die übrigen nicht aufhalten
          try:
            typ, teile = imap.uid("fetch", uid, "(RFC822)")
            if typ != "OK" or not teile or not teile[0]:
                continue
            nachricht = email.message_from_bytes(teile[0][1])
            nid = entschluesseln(nachricht.get("Message-ID")) or ("ohne-id-" + uid.decode())
            betreff = entschluesseln(nachricht.get("Subject"))
            absender = email.utils.parseaddr(entschluesseln(nachricht.get("From")))[1]
            gefunden = list(anhaenge(nachricht))
            if not gefunden:
                log("ohne PDF, bleibt liegen: %s – %s" % (absender, betreff))
                continue
            alles_ok = True
            for name, inhalt, mime in gefunden:
                if PRUEFEN:
                    log("würde ablegen: %s (%s, %d KB) aus „%s“" % (name, art_von(name, betreff), len(inhalt) // 1024, betreff))
                    continue
                try:
                    if db.schon_da(nid, name):
                        continue
                    pfad = time.strftime("%Y/%m/") + uuid.uuid4().hex[:12] + "_" + sauber(name)
                    db.ablegen(pfad, inhalt, mime)
                    db.eintragen({"nachricht_id": nid, "absender": absender, "betreff": betreff,
                                  "dateiname": name, "pfad": pfad, "bytes": len(inhalt),
                                  "art": art_von(name, betreff)})
                    neu += 1
                    log("neu: %s (%s)" % (name, art_von(name, betreff)))
                except Exception as e:                   # noqa: BLE001 – nächste Datei versuchen
                    alles_ok = False
                    log("FEHLER bei %s: %s" % (name, e))
            # erst wenn alles drin ist, die Mail aus dem Eingang nehmen
            if alles_ok and not PRUEFEN:
                if imap.uid("copy", uid, k["ordner_erledigt"])[0] == "OK":
                    imap.uid("store", uid, "+FLAGS", "(\\Deleted)")
                    verschoben += 1
          except Exception as e:                         # noqa: BLE001
            log("FEHLER bei Mail %s, bleibt liegen: %s" % (uid.decode(errors="replace"), e))
        if not PRUEFEN:
            imap.expunge()
        log("fertig: %d Mails, %d Dateien neu im Posteingang, %d Mails nach %s" %
            (len(uids), neu, verschoben, k["ordner_erledigt"]))
    finally:
        try:
            imap.logout()
        except Exception:                                # noqa: BLE001
            pass


def main():
    # nicht zweimal gleichzeitig laufen (Aufgabenplaner und Hand)
    if os.path.exists(SPERRE) and time.time() - os.path.getmtime(SPERRE) < 600:
        print("läuft schon")
        return
    open(SPERRE, "w").close()
    try:
        abholen(lade_konfig())
    except SystemExit:
        raise
    except Exception as e:                               # noqa: BLE001
        log("FEHLER: %s" % e)
        sys.exit(1)
    finally:
        try:
            os.remove(SPERRE)
        except OSError:
            pass


if __name__ == "__main__":
    main()
