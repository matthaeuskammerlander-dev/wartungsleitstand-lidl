# Änderungswünsche aus der App – Einrichtung

Wer mitarbeitet, schickt über **„💡 Änderung vorschlagen“** (ganz unten in der
App) einen Wunsch. Der Inhaber sieht alle Wünsche unter **Verwaltung →
Änderungswünsche** und entscheidet jeden Schritt:

1. **An Claude freigeben** (Text vorher noch klarer formulieren) – Claude setzt
   den Wunsch auf GitHub auf einem eigenen Zweig um (dauert meist ein paar
   Minuten, läuft über das Claude-Abo).
2. **Ansehen:** Rückmeldung von Claude, „Änderungen ansehen“, „Vorschau
   ausprobieren“ und das Ergebnis der **automatischen Prüfung**.
3. **Übernehmen** (nur nach bestandener Prüfung) – nach 1–2 Minuten in der App.
   Oder **Nachbessern lassen** bzw. **Ablehnen**.
4. **Rückgängig machen** geht bei jeder übernommenen Änderung – wieder als
   Vorschlag mit Prüfung, wirksam erst nach „Übernehmen“.

Schon erledigt: Tabelle (`tools/aenderungswuensche.sql`), Supabase-Funktion
`wuensche`, GitHub-Abläufe (`.github/workflows/claude.yml`, `pruefen.yml`),
Regeln für Claude (`CLAUDE.md`).

## Was einmal der Inhaber selbst einrichtet (Zugänge – nie in den Chat kopieren)

### 1. Claude-App für GitHub installieren
<https://github.com/apps/claude> → **Install** → *Only select repositories* →
`wartungsleitstand-lidl` → Install.

### 2. Claude-Abo mit GitHub verbinden
Im Terminal (PowerShell):

```
claude setup-token
```

(Falls `claude` fehlt: `irm https://claude.ai/install.ps1 | iex`, danach neues
Fenster.) Im Browser mit dem Claude-Konto (Max) anmelden; angezeigt wird ein
langer Schlüssel. Auf GitHub: Repository → **Settings → Secrets and variables →
Actions → New repository secret**, Name `CLAUDE_CODE_OAUTH_TOKEN`, Schlüssel
einfügen, speichern.

### 3. GitHub-Zugang für die App (Supabase)
<https://github.com/settings/personal-access-tokens/new> (fein abgestufter Token):

- Name: `Wartungsleitstand Änderungswünsche`, Ablauf: 1 Jahr
- Repository access: **Only select repositories** → `wartungsleitstand-lidl`
- Permissions → Repository permissions:
  **Contents**, **Issues**, **Pull requests**: *Read and write*;
  **Actions**: *Read-only* (Metadata ist automatisch dabei)
- **Generate token**, Token kopieren.

Supabase → Projekt → **Edge Functions → Secrets** → Name
`GITHUB_TOKEN_WUENSCHE`, Token einfügen, speichern.

Läuft der Token ab, meldet die App beim Freigeben einen GitHub-Fehler (401) –
dann einen neuen erstellen und das Secret ersetzen.

## Sicherheit

- Auslösen kann Claude nur der Repository-Inhaber (die App gibt mit seinem
  Token weiter). Kommentare Fremder auf GitHub starten nichts.
- Claude darf nur `index.html` (und `README.md`) ändern; Änderungen an
  Automatik, Prüfung, Datenbank-Regeln, Funktionen oder Daten lehnt die
  automatische Prüfung ab.
- In die echte App kommt nichts ohne „Übernehmen“ in der App.
- Das Repository ist öffentlich: freigegebene Wünsche stehen dort lesbar –
  keine Namen, Adressen oder Passwörter in den Wunsch schreiben.
