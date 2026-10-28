#!/bin/bash
# Installa la raccolta dati automatica su macOS (launchd).
#   - ogni ora: crypto Kraken e notizie GDELT, poi un giro di paper trading simulato
#   - ogni giorno alle 23:30: ETF Stooq e macro FRED
# Dati e log in ~/RadixTrading. Nessun ordine, nessuna chiave broker.
# Disinstallare: bash scripts/install_mac.sh --uninstall
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$HOME/RadixTrading"
VENV="$HOME_DIR/venv"
AGENTS="$HOME/Library/LaunchAgents"
FAST=com.radix.trading.collect-fast
SLOW=com.radix.trading.collect-slow

if [[ "${1:-}" == "--uninstall" ]]; then
  for job in $FAST $SLOW; do
    launchctl bootout "gui/$(id -u)/$job" 2>/dev/null || true
    rm -f "$AGENTS/$job.plist"
  done
  echo "Raccolta automatica rimossa. I dati restano in $HOME_DIR/data."
  exit 0
fi

# Serve Python 3.10 o piu' recente: quello di sistema su macOS e' spesso 3.9.
PY=""
# Prima le versioni stabili esplicite, poi il python3 generico. Si scarta un Python che non
# riesce a importare pyexpat (serve a pip): succede con alcune build Homebrew su macOS recenti.
for cand in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.13 /usr/local/bin/python3.12 \
            /usr/local/bin/python3.13 /opt/homebrew/bin/python3 /usr/local/bin/python3 \
            "$(command -v python3 || true)" /usr/bin/python3; do
  if [[ -x "$cand" ]] && "$cand" -c 'import sys, pyexpat; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PY="$cand"; break
  fi
done
if [[ -z "$PY" ]]; then
  echo "Serve un Python 3.10+ funzionante (es. brew install python@3.12)." >&2
  exit 1
fi
echo "Uso $PY ($("$PY" --version))"

mkdir -p "$HOME_DIR/data" "$HOME_DIR/logs" "$AGENTS"
if [[ -x "$VENV/bin/python" ]] && ! "$VENV/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  rm -rf "$VENV"
fi
"$PY" -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$HERE/requirements.txt"

write_plist() {  # $1 = label, $2 = nome log, $3 = pianificazione, $4 = argomenti
  cat > "$AGENTS/$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array>
    <string>$VENV/bin/python</string><string>-m</string><string>radix_trading</string>
    $4
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key><dict>
    <key>RADIX_TRADING_DATA</key><string>$HOME_DIR/data</string>
    <key>RADIX_TRADING_MODE</key><string>research</string>
  </dict>
  $3
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME_DIR/logs/$2.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/logs/$2.err</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$1.plist"
}

# Ogni ora: raccolta veloce + un giro di paper trading su conto simulato (nessun broker).
write_plist $FAST fast "<key>StartInterval</key><integer>3600</integer>" "<string>hourly</string>"
write_plist $SLOW slow "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>30</integer></dict>" \
  "<string>collect</string><string>--tier</string><string>slow</string>"

echo "Raccolta automatica attiva. Dati: $HOME_DIR/data, log: $HOME_DIR/logs"
