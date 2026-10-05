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

Das Konto des Skripts muss den Posteingang NICHT lesen können (Inhaber
05.10.2026: lesen dürfen nur Inhaber und – Lidl-Aufträge/Rapporte – Admins).
Deshalb liegt jede Datei unter einem festen Pfad (aus Message-ID und
Dateiname): ein zweiter Lauf nach einem Teilfehler legt nichts doppelt ab
(„schon vorhanden“ gilt als erledigt), und die Zeile wird mit „on conflict do
nothing“ und ohne Rückgabe (return=minimal) eingetragen.

Benötigt nur Python 3 (bei DSM 7 vorhanden), keine Zusatzpakete.

Aufruf:
    python3 ukt_posteingang.py              # abholen
    python3 ukt_posteingang.py --pruefen    # nur anzeigen, was passieren würde
"""
import email
import email.header
import email.utils
import hashlib
import imaplib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
KONFIG = os.path.join(HIER, "ukt_posteingang.json")
LOG = os.path.join(HIER, "ukt_posteingang.log")
SPERRE = os.path.join(HIER, "ukt_posteingang.sperre")

PRUEFEN = "--pruefen" in sys.argv
ARTEN = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         # weitergeleitete Mails zu Projekten (Büro 02.10.2026): auch Word, Excel, Pläne, Mails
         ".heic": "image/heic", ".webp": "image/webp", ".txt": "text/plain", ".csv": "text/csv",
         ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
         ".zip": "application/zip", ".eml": "message/rfc822", ".msg": "application/vnd.ms-outlook",
         ".dwg": "image/vnd.dwg", ".dxf": "application/octet-stream"}
GROESSTE = 20 * 1048576   # wie bei den Projektdateien


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
    # weitere Absender-Domains, deren PDFs Lidl-Aufträge sind (z. B. ein Dienstleister im Auftrag von Lidl) – frei
    k.setdefault("lidl_domains", [])
    return k


# ---------------------------------------------------------------- Supabase

class HttpFehler(RuntimeError):
    """Antwort mit Fehlercode – mit Code und Text, damit „schon vorhanden“ erkennbar ist"""
    def __init__(self, code, url, text):
        RuntimeError.__init__(self, "HTTP %s bei %s: %s" % (code, url.split("?")[0], text))
        self.code, self.text = code, text


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
        raise HttpFehler(e.code, url, text)
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
        """nur eine Abkürzung: ein Konto ohne Leserecht bekommt nie etwas zurück – dann
        sorgen fester Pfad und „on conflict do nothing“ dafür, dass nichts doppelt ankommt"""
        q = urllib.parse.urlencode({"select": "id", "nachricht_id": "eq." + nachricht_id,
                                    "dateiname": "eq." + dateiname, "limit": 1})
        return bool(anfrage("GET", self.url + "/rest/v1/posteingang?" + q, self.kopf()))

    def ablegen(self, pfad, inhalt, typ):
        """False, wenn die Datei unter diesem Pfad schon liegt (voriger Lauf) – das ist kein Fehler"""
        try:
            anfrage("POST", self.url + "/storage/v1/object/posteingang/" + urllib.parse.quote(pfad),
                    self.kopf({"x-upsert": "false"}), roh_daten=inhalt, typ=typ)
        except HttpFehler as e:
            if e.code == 409 or "Duplicate" in e.text or "already exists" in e.text:
                return False
            raise
        return True

    def eintragen(self, zeile):
        # ohne Rückgabe (das Konto braucht kein Leserecht) und ohne Fehler, wenn es die Zeile schon gibt
        anfrage("POST", self.url + "/rest/v1/posteingang?on_conflict=nachricht_id,dateiname",
                self.kopf({"Prefer": "return=minimal,resolution=ignore-duplicates"}), zeile)


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


def lidl_absender(absender, weitere=None):
    """Absender aus einer Lidl-Domain (allgemein lidl.<Endung>, auch Unterdomains) oder aus einer in den
    Einstellungen eingetragenen weiteren Domain („lidl_domains“, z. B. ein Dienstleister im Auftrag von Lidl)"""
    dom = (absender or "").rsplit("@", 1)[1].strip().lower() if "@" in (absender or "") else ""
    if not dom:
        return False
    if re.search(r"(^|\.)lidl\.[a-z.]+$", dom):
        return True
    for d in weitere or []:
        d = str(d or "").strip().lower().lstrip("@")
        if d and (dom == d or dom.endswith("." + d)):
            return True
    return False


def art_von(dateiname, betreff, lidl=False):
    """Rapporte heißen bei Lidl …_rapport.pdf; Aufträge tragen die Nummer im Betreff. Seit 05.10.2026 (Inhaber)
    auch am Dateinamen („Störung“) und am Absender: eine PDF von Lidl, die kein Rapport ist, ist ein Auftrag."""
    n, b = dateiname.lower(), betreff.lower()
    if "rapport" in n or "rapport" in b:
        return "rapport"
    if "auftrag" in n or "auftrag" in b or "störung" in b or "stoerung" in b or "störung" in n or "stoerung" in n:
        return "auftrag"
    if lidl and n.endswith(".pdf"):
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


def mb(n):
    return ("%.1f" % max(0.1, n / 1048576.0)).replace(".", ",")


def eintraege(nachricht, roh, betreff, absender="", lidl_domains=None):
    """Was aus einer Mail in den Posteingang kommt: [(name, inhalt, typ, art, hinweis)].
    Lidl-Aufträge und Rapporte wie bisher nur die Anhänge (erkannt an Betreff, Dateiname
    und Absender). Jede andere Mail – etwa eine weitergeleitete Anfrage zu einem Projekt –
    zusätzlich als .eml, damit Text und Absender mit ins Projekt gehen (auch ganz ohne Anhang).
    Zu Großes (über GROESSTE, die Grenze des Speichers) fällt nicht still weg (Inhaber
    05.10.2026): an seiner Stelle ein Eintrag ohne Datei (inhalt None, art „unbekannt“) mit
    Hinweis – der Inhaber sieht ihn im Posteingang und holt die Datei von Hand aus dem Postfach."""
    lidl = lidl_absender(absender, lidl_domains)
    liste = []
    for n, i, t in anhaenge(nachricht):
        if len(i) <= GROESSTE:
            liste.append((n, i, t, art_von(n, betreff, lidl), None))
        else:
            liste.append((n, None, None, "unbekannt", "Anhang zu groß (%s MB, der Speicher nimmt höchstens %s MB) – "
                          "bitte von Hand aus dem Postfach holen" % (mb(len(i)), mb(GROESSTE))))
    if not any(x[3] in ("rapport", "auftrag") for x in liste):
        name = (re.sub(r"\s+", " ", re.sub(r'[\\/:*?"<>|]+', " ", betreff or "")).strip()[:80] or "Mail") + ".eml"
        if len(roh) <= GROESSTE:
            liste.append((name, roh, "message/rfc822", "mail", None))
        else:
            liste.append((name, None, None, "unbekannt", "Mail zu groß (%s MB) – nur die Anhänge bis %s MB abgeholt, "
                          "den Text bitte von Hand aus dem Postfach holen" % (mb(len(roh)), mb(GROESSTE))))
    return liste


def mail_monat(nachricht):
    """Jahr/Monat aus dem Datum der Mail (für den Ablageordner) – in jedem Lauf gleich"""
    try:
        d = email.utils.parsedate_to_datetime(entschluesseln(nachricht.get("Date")))
        return d.strftime("%Y/%m") if d else None
    except Exception:                                     # noqa: BLE001
        return None


def ablage_pfad(nid, name, monat=None):
    """fester Pfad je Mail und Datei: derselbe in jedem Lauf – eine schon abgelegte Datei
    kommt nie ein zweites Mal (der Speicher meldet „schon vorhanden“)"""
    kennung = hashlib.sha1((nid + "|" + name).encode("utf-8")).hexdigest()[:12]
    return (monat or "ohne-datum") + "/" + kennung + "_" + sauber(name)


def ablegen_mail(db, nid, absender, betreff, gefunden, monat=None):
    """Was aus einer Mail kommt, in den Posteingang – mehrfach ausführbar: nach einem Teilfehler
    legt der nächste Lauf nur ab, was fehlt, auch ohne Leserecht des Kontos. (neu, alles_ok)"""
    neu, alles_ok = 0, True
    for name, inhalt, mime, art, hinweis in gefunden:
        try:
            if db.schon_da(nid, name):
                continue
            zeile = {"nachricht_id": nid, "absender": absender, "betreff": betreff, "dateiname": name, "art": art}
            if inhalt is None:
                # zu groß: nur der Hinweis, ohne Datei (pfad ist Pflicht – leer)
                zeile.update({"pfad": "", "notiz": hinweis})
            else:
                pfad = ablage_pfad(nid, name, monat)
                db.ablegen(pfad, inhalt, mime)
                zeile.update({"pfad": pfad, "bytes": len(inhalt)})
            db.eintragen(zeile)
            neu += 1
            log("Hinweis: %s – %s" % (name, hinweis) if inhalt is None else "neu: %s (%s)" % (name, art))
        except Exception as e:                           # noqa: BLE001 – nächste Datei versuchen
            alles_ok = False
            log("FEHLER bei %s: %s" % (name, e))
    return neu, alles_ok


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
            gefunden = eintraege(nachricht, teile[0][1], betreff, absender, k.get("lidl_domains"))
            if not gefunden:
                log("nichts Verwertbares, bleibt liegen: %s – %s" % (absender, betreff))
                continue
            if PRUEFEN:
                for name, inhalt, mime, art, hinweis in gefunden:
                    log("würde melden: %s – %s" % (name, hinweis) if inhalt is None else
                        "würde ablegen: %s (%s, %d KB) aus „%s“" % (name, art, len(inhalt) // 1024, betreff))
                continue
            n, alles_ok = ablegen_mail(db, nid, absender, betreff, gefunden, mail_monat(nachricht))
            neu += n
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
