#!/bin/sh
# Plancia showcase site (plancia-anteprima on Vercel): the pages here plus the office program (/trasporti/)
# and the driver app (/trasporti/autista/) in demo mode, data in the browser.
set -e
cd "$(dirname "$0")"
rm -rf public && mkdir -p public/lib
cp index.html accedi.html favicon.svg robots.txt public/
cp -r img public/img
cp -r ../../trasporti public/trasporti
cp -r ../../lib/trasporti public/lib/trasporti
