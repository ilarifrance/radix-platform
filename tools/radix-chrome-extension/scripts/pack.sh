#!/bin/sh
# Builds radix-chrome-extension.zip (extension files only, no tests or scripts).
# Usage from the repo root: sh tools/radix-chrome-extension/scripts/pack.sh
set -eu
cd "$(dirname "$0")/.."
out="${1:-$HOME/radix-chrome-extension.zip}"
rm -f "$out"
zip -r -q "$out" manifest.json popup.html popup.css popup.js options.html options.js README.md src icons
echo "Creato $out"
