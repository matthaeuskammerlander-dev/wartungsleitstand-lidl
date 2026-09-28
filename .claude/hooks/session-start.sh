#!/bin/bash
# Startvorbereitung für Claude Code im Web (Cloud-Sitzung).
# Stellt Playwright bereit, damit die Prüfung auch im Browser laufen kann:
#   node tools/pruefen.mjs --browser
# Ohne --browser braucht die Prüfung nur Node – dafür ist nichts zu tun.
set -euo pipefail

# Nur in der Cloud-Sitzung ausführen, nicht am eigenen Rechner.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# In der Cloud-Sitzung sind Chromium und ein dazu passendes Playwright schon
# vorinstalliert (global). Eine eigene Installation über npm holt eine neuere
# Fassung, die den vorinstallierten Browser nicht findet – darum wird die
# globale Fassung nur verknüpft (node_modules steht in .gitignore).
if [ ! -e node_modules/playwright ]; then
  global="$(npm root -g)/playwright"
  if [ -d "$global" ]; then
    mkdir -p node_modules
    ln -s "$global" node_modules/playwright
  else
    # Ersatzweg ohne vorinstalliertes Playwright: wie in .github/workflows/pruefen.yml
    npm install --no-save --no-package-lock --no-audit --no-fund playwright@1
    npx playwright install chromium
  fi
fi

echo "Startvorbereitung fertig: Playwright bereit für 'node tools/pruefen.mjs --browser'."
