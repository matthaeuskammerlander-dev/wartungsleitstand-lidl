// Änderungswünsche an Claude (GitHub) weiterreichen – nur für Inhaber.
//
// Die App ruft diese Funktion mit der Anmeldung des Inhabers auf. Sie legt
// für einen freigegebenen Wunsch ein GitHub-Issue an („@claude …“); die
// GitHub-Automatik (.github/workflows/claude.yml) setzt ihn auf einem eigenen
// Zweig um. Diese Funktion macht daraus einen Pull Request, holt Prüfergebnis
// und Rückmeldung ab und übernimmt ihn erst auf ausdrücklichen Knopfdruck
// des Inhabers in die echte App (main).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GITHUB_TOKEN_WUENSCHE  fein abgestufter GitHub-Token nur für dieses Repository
//                          (Contents, Issues, Pull requests: lesen+schreiben;
//                           Actions: lesen; Metadata kommt automatisch)
//   GITHUB_REPO            optional, Vorgabe matthaeuskammerlander-dev/wartungsleitstand-lidl
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const REPO = Deno.env.get("GITHUB_REPO") ?? "matthaeuskammerlander-dev/wartungsleitstand-lidl";
const TOKEN = Deno.env.get("GITHUB_TOKEN_WUENSCHE") ?? "";

async function gh(methode: string, pfad: string, body?: unknown) {
  const r = await fetch("https://api.github.com" + pfad, {
    method: methode,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wartungsleitstand-wuensche",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let d: any = null;
  try { d = text ? JSON.parse(text) : null; } catch { d = text; }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(d && d.message) || text}`.slice(0, 300));
  return d;
}

const kurz = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/* Rückmeldung von Claude: der letzte Kommentar des Claude-Bots (Issue und PR) */
async function letzteAntwort(nummern: number[]) {
  let beste: { zeit: string; text: string } | null = null;
  for (const n of nummern) {
    const l = await gh("GET", `/repos/${REPO}/issues/${n}/comments?per_page=100`);
    for (const c of l || []) {
      const wer = String(c.user?.login || "");
      if (!/claude/i.test(wer)) continue;
      const zeit = c.updated_at || c.created_at;
      if (!beste || zeit > beste.zeit) beste = { zeit, text: String(c.body || "") };
    }
  }
  return beste ? kurz(beste.text, 3000) : null;
}

/* Prüfergebnis der GitHub-Automatik („App prüfen“) für den Stand des Zweigs */
/* (über die Actions-Läufe – fein abgestufte Tokens kennen keine „Checks“-Berechtigung) */
async function pruefung(sha: string) {
  const d = await gh("GET", `/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=50`);
  const l = (d?.workflow_runs || []).filter((c: any) => String(c.name || "") === "App prüfen");
  if (!l.length) return "keine";
  if (l.some((c: any) => c.status !== "completed")) return "laeuft";
  if (l.every((c: any) => ["success", "neutral", "skipped"].includes(c.conclusion))) return "ok";
  return "fehler";
}

/* Stand eines Wunsches bei GitHub holen; PR anlegen, sobald Claudes Zweig da ist */
async function abgleichen(w: any) {
  const neu: Record<string, unknown> = {};
  let branch = w.branch as string | null;
  if (!branch && w.issue_nr) {
    const refs = await gh("GET", `/repos/${REPO}/git/matching-refs/heads/claude/issue-${w.issue_nr}-`);
    if (Array.isArray(refs) && refs.length) branch = String(refs[refs.length - 1].ref).replace("refs/heads/", "");
    if (branch) neu.branch = branch;
  }
  let pr: any = null;
  if (w.pr_nr) pr = await gh("GET", `/repos/${REPO}/pulls/${w.pr_nr}`);
  else if (branch) {
    const owner = REPO.split("/")[0];
    const l = await gh("GET", `/repos/${REPO}/pulls?state=all&head=${encodeURIComponent(owner + ":" + branch)}`);
    pr = (l || [])[0] || null;
    if (!pr) {
      // Claude hat nur den Zweig angelegt: Pull Request dazu machen
      try {
        pr = await gh("POST", `/repos/${REPO}/pulls`, {
          title: `Änderungswunsch W-${w.id}: ${kurz(String(w.text_claude || w.text).replace(/\s+/g, " "), 60)}`,
          head: branch, base: "main",
          body: `Änderungswunsch W-${w.id} aus dem Wartungsleitstand.\n\nCloses #${w.issue_nr}`,
        });
      } catch (e) {
        // „No commits between main and …“: Claude arbeitet noch
        if (!/No commits|422/.test(String(e))) throw e;
      }
    }
  }
  if (pr) {
    neu.pr_nr = pr.number;
    neu.pr_url = pr.html_url;
    neu.pruefung = await pruefung(pr.head.sha);
    if (pr.merged_at) neu.status = "uebernommen";
    else if (pr.state === "closed") neu.status = "abgelehnt";
    else neu.status = "vorschau";
  }
  const a = await letzteAntwort([w.issue_nr, pr?.number].filter(Boolean));
  if (a) neu.antwort = a;
  return neu;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "Nur POST" }, 405);
  let e: { aktion?: string; id?: number; text?: string } = {};
  try { e = await req.json(); } catch { return antwort({ fehler: "Anfrage nicht lesbar." }, 400); }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return antwort({ fehler: "Bitte anmelden." }, 401);
  const { data: inhaber } = await sb.rpc("ist_inhaber");
  if (inhaber !== true) return antwort({ fehler: "Änderungswünsche weitergeben dürfen nur Inhaber." }, 403);
  if (!TOKEN) return antwort({ fehler: "GitHub-Zugang fehlt (Secret GITHUB_TOKEN_WUENSCHE)." }, 500);

  const wer = (user.user_metadata?.name as string) || user.email || "Inhaber";
  const laden = async (id: number) => {
    const { data, error } = await sb.from("aenderungswuensche").select("*").eq("id", id).single();
    if (error || !data) throw new Error("Wunsch nicht gefunden.");
    return data;
  };
  const speichern = async (w: any, felder: Record<string, unknown>, schritt?: string) => {
    const verlauf = Array.isArray(w.verlauf) ? w.verlauf.slice(-40) : [];
    if (schritt) verlauf.push({ zeit: new Date().toISOString(), wer, schritt });
    const { error } = await sb.from("aenderungswuensche")
      .update({ ...felder, verlauf, geaendert: new Date().toISOString() }).eq("id", w.id);
    if (error) throw new Error("Nicht gespeichert: " + error.message);
  };

  try {
    const aktion = String(e.aktion || "");

    if (aktion === "freigeben") {
      const w = await laden(Number(e.id));
      if (w.status !== "neu" && w.status !== "fehler") return antwort({ fehler: "Dieser Wunsch ist schon weitergegeben." }, 409);
      const auftrag = String(e.text || w.text).trim();
      if (auftrag.length < 5) return antwort({ fehler: "Der Auftrag ist zu kurz." }, 400);
      const body = [
        "@claude Bitte diesen Änderungswunsch aus dem Wartungsleitstand umsetzen. Die Regeln stehen in CLAUDE.md – bitte genau einhalten.",
        "",
        `**Wunsch W-${w.id}** (von ${w.von_name || "unbekannt"}, freigegeben von ${wer}):`,
        "",
        auftrag.split("\n").map((z) => "> " + z).join("\n"),
        "",
        w.kontext ? `Geschrieben wurde der Wunsch hier (nur zur Orientierung – bei Widerspruch gilt der Wunschtext): ${w.kontext}` : "",
        "",
        "Nur `index.html` ändern (bei Bedarf `README.md`). Vor dem Abschluss `node tools/pruefen.mjs` ausführen.",
        "Zum Schluss auf Deutsch kurz und für Nicht-Programmierer erklären, was geändert wurde und wie man es ausprobiert.",
      ].join("\n");
      const issue = await gh("POST", `/repos/${REPO}/issues`, {
        title: `Änderungswunsch W-${w.id}: ${kurz(auftrag.replace(/\s+/g, " "), 70)}`,
        body, labels: ["aenderungswunsch"],
      });
      await speichern(w, { status: "in_arbeit", text_claude: auftrag, issue_nr: issue.number, pruefung: null, antwort: null },
        `an Claude freigegeben (GitHub #${issue.number})`);
      return antwort({ ok: true, issue_nr: issue.number });
    }

    if (aktion === "abgleichen") {
      const { data: offen } = await sb.from("aenderungswuensche").select("*").in("status", ["in_arbeit", "vorschau"]);
      const fehler: string[] = [];
      for (const w of offen || []) {
        try {
          const neu = await abgleichen(w);
          const schritt = neu.status && neu.status !== w.status
            ? ({ vorschau: "Vorschau bereit", uebernommen: "in GitHub übernommen", abgelehnt: "in GitHub geschlossen" } as Record<string, string>)[String(neu.status)]
            : undefined;
          if (Object.keys(neu).length) await speichern(w, neu, schritt);
        } catch (x) { fehler.push(`W-${w.id}: ${x instanceof Error ? x.message : x}`); }
      }
      return antwort({ ok: true, fehler });
    }

    if (aktion === "uebernehmen") {
      const w = await laden(Number(e.id));
      if (!w.pr_nr) return antwort({ fehler: "Es gibt noch keine Vorschau (Pull Request)." }, 409);
      const pr = await gh("GET", `/repos/${REPO}/pulls/${w.pr_nr}`);
      const p = await pruefung(pr.head.sha);
      if (p !== "ok") return antwort({ fehler: p === "laeuft" ? "Die automatische Prüfung läuft noch – bitte kurz warten." : "Die automatische Prüfung ist nicht bestanden – so wird nichts übernommen." }, 409);
      const m = await gh("PUT", `/repos/${REPO}/pulls/${w.pr_nr}/merge`, {
        merge_method: "squash", sha: pr.head.sha,
        commit_title: `${w.rueckgaengig_von ? "Rückgängig" : "Änderungswunsch"} W-${w.id}: ${kurz(String(w.text_claude || w.text).replace(/\s+/g, " "), 60)} (#${w.pr_nr})`,
      });
      try { await gh("DELETE", `/repos/${REPO}/git/refs/heads/${pr.head.ref}`); } catch { /* Zweig bleibt eben */ }
      await speichern(w, { status: "uebernommen", pruefung: "ok", merge_sha: m?.sha || null }, "in die App übernommen");
      return antwort({ ok: true });
    }

    // Übernommene Änderung zurücknehmen – wieder als Vorschlag mit Prüfung,
    // übernommen wird erst auf Knopfdruck. Geht direkt, solange die Dateien
    // seither nicht weiter geändert wurden; sonst macht es Claude (spätere
    // Änderungen bleiben dann erhalten).
    if (aktion === "rueckgaengig") {
      const w = await laden(Number(e.id));
      if (w.status !== "uebernommen") return antwort({ fehler: "Nur übernommene Änderungen lassen sich zurücknehmen." }, 409);
      let sha = w.merge_sha as string | null;
      if (!sha && w.pr_nr) sha = (await gh("GET", `/repos/${REPO}/pulls/${w.pr_nr}`)).merge_commit_sha;
      if (!sha) return antwort({ fehler: "Zu dieser Änderung ist kein Stand bekannt." }, 409);
      const commit = await gh("GET", `/repos/${REPO}/commits/${sha}`);
      const vorher = commit.parents?.[0]?.sha;
      const dateien: any[] = commit.files || [];
      const inhaltSha = async (pfad: string, ref: string) => {
        try { return (await gh("GET", `/repos/${REPO}/contents/${encodeURI(pfad)}?ref=${ref}`)).sha as string; }
        catch { return null; }
      };
      // direkt nur, wenn jede Datei auf main noch genau so ist wie nach der Änderung
      let direkt = !!vorher && dateien.length > 0 && dateien.every((f) => ["modified", "added", "removed"].includes(f.status));
      if (direkt) {
        for (const f of dateien) {
          if ((await inhaltSha(f.filename, "main")) !== (await inhaltSha(f.filename, sha))) { direkt = false; break; }
        }
      }
      const titel = `Rückgängig: ${kurz(String(w.text_claude || w.text).replace(/\s+/g, " "), 80)}`;
      // neuer Eintrag in der Liste – damit Rücknahme und Prüfung genauso sichtbar sind
      const { data: neu, error: fe } = await sb.from("aenderungswuensche")
        .insert({ text: `Änderung W-${w.id} rückgängig machen:\n${w.text_claude || w.text}`, kontext: `Rücknahme von W-${w.id}`, von_name: wer })
        .select("*").single();
      if (fe || !neu) throw new Error("Eintrag nicht angelegt: " + (fe?.message || ""));
      if (direkt) {
        const main = await gh("GET", `/repos/${REPO}/git/ref/heads/main`);
        const mainCommit = await gh("GET", `/repos/${REPO}/git/commits/${main.object.sha}`);
        const baum: any[] = [];
        for (const f of dateien) {
          const alt = f.status === "added" ? null : await inhaltSha(f.filename, vorher);
          baum.push({ path: f.filename, mode: "100644", type: "blob", sha: alt });
        }
        const tree = await gh("POST", `/repos/${REPO}/git/trees`, { base_tree: mainCommit.tree.sha, tree: baum });
        const c = await gh("POST", `/repos/${REPO}/git/commits`, {
          message: `Rückgängig W-${w.id} (Rücknahme W-${neu.id})`, tree: tree.sha, parents: [main.object.sha] });
        const zweig = `rueckgaengig/w-${w.id}-${Date.now().toString(36)}`;
        await gh("POST", `/repos/${REPO}/git/refs`, { ref: "refs/heads/" + zweig, sha: c.sha });
        const pr = await gh("POST", `/repos/${REPO}/pulls`, {
          title: titel, head: zweig, base: "main",
          body: `Nimmt Änderungswunsch W-${w.id} zurück (Stand vor ${sha.slice(0, 7)}). Eintrag W-${neu.id} im Wartungsleitstand.` });
        await speichern(neu, { status: "vorschau", text_claude: neu.text, branch: zweig, pr_nr: pr.number, pr_url: pr.html_url,
          pruefung: "laeuft", rueckgaengig_von: w.id }, `Rücknahme von W-${w.id} vorbereitet`);
      } else {
        const issue = await gh("POST", `/repos/${REPO}/issues`, {
          title: `Änderungswunsch W-${neu.id}: ${titel}`, labels: ["aenderungswunsch"],
          body: [
            `@claude Bitte die Änderung aus Änderungswunsch W-${w.id} (Commit ${sha}) rückgängig machen. Die Regeln stehen in CLAUDE.md.`,
            "Spätere Änderungen an denselben Stellen sollen erhalten bleiben – nur das zurücknehmen, was diese Änderung eingeführt hat",
            `(\`git show ${sha}\` zeigt sie). Nur \`index.html\` ändern (bei Bedarf \`README.md\`), vor dem Abschluss \`node tools/pruefen.mjs\`.`,
            "Zum Schluss auf Deutsch kurz erklären, was zurückgenommen wurde.",
          ].join("\n") });
        await speichern(neu, { status: "in_arbeit", text_claude: neu.text, issue_nr: issue.number, rueckgaengig_von: w.id },
          `Rücknahme von W-${w.id} an Claude (seither weiter geändert, GitHub #${issue.number})`);
      }
      await speichern(w, {}, `Rücknahme beantragt → W-${neu.id}`);
      return antwort({ ok: true, id: neu.id, direkt });
    }

    if (aktion === "nachbessern") {
      const w = await laden(Number(e.id));
      const t = String(e.text || "").trim();
      if (t.length < 3) return antwort({ fehler: "Bitte beschreiben, was noch anders sein soll." }, 400);
      const nr = w.pr_nr || w.issue_nr;
      if (!nr) return antwort({ fehler: "Der Wunsch ist noch nicht weitergegeben." }, 409);
      await gh("POST", `/repos/${REPO}/issues/${nr}/comments`, { body: "@claude " + t + "\n\n(Regeln in CLAUDE.md; vor dem Abschluss `node tools/pruefen.mjs`.)" });
      await speichern(w, { status: "in_arbeit", pruefung: null }, "nachbessern: " + kurz(t, 200));
      return antwort({ ok: true });
    }

    if (aktion === "ablehnen") {
      const w = await laden(Number(e.id));
      const grund = String(e.text || "").trim();
      if (w.pr_nr) { try { await gh("PATCH", `/repos/${REPO}/pulls/${w.pr_nr}`, { state: "closed" }); } catch { /* schon zu */ } }
      if (w.issue_nr) {
        try {
          if (grund) await gh("POST", `/repos/${REPO}/issues/${w.issue_nr}/comments`, { body: "Abgelehnt: " + grund });
          await gh("PATCH", `/repos/${REPO}/issues/${w.issue_nr}`, { state: "closed", state_reason: "not_planned" });
        } catch { /* schon zu */ }
      }
      if (w.branch && w.status !== "uebernommen") { try { await gh("DELETE", `/repos/${REPO}/git/refs/heads/${w.branch}`); } catch { /* weg */ } }
      await speichern(w, { status: "abgelehnt", notiz: grund || w.notiz }, "abgelehnt" + (grund ? ": " + kurz(grund, 200) : ""));
      return antwort({ ok: true });
    }

    return antwort({ fehler: "Unbekannte Aktion." }, 400);
  } catch (x) {
    return antwort({ fehler: x instanceof Error ? x.message : String(x) }, 502);
  }
});
