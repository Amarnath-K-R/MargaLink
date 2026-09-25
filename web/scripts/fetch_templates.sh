#!/usr/bin/env bash
# Refreshes the bundled /write template classes from TeX Live's built package
# archives (the same files `tlmgr install` puts on disk; CTAN's package zips
# ship only .dtx sources for several of these). Only .cls/.bst are replaced:
# each template's main.tex/refs.bib are MargaLink-adapted samples (placeholder
# figure, lmodern for elsarticle's T1 fonts, "Your title") and are re-checked
# by hand after an upgrade — compile each one in /write.
# Licence: LPPL 1.3 for every class below (see public/templates/SOURCES.md).
set -euo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)/public/templates"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
fetch() { curl -sSfL -o "$TMP/$1.tar.xz" "https://mirrors.ctan.org/systems/texlive/tlnet/archive/$1.tar.xz" && mkdir -p "$TMP/$1" && tar -xJf "$TMP/$1.tar.xz" -C "$TMP/$1"; }
fetch elsarticle && cp "$TMP/elsarticle/tex/latex/elsarticle/elsarticle.cls" "$TMP/elsarticle/bibtex/bst/elsarticle/elsarticle-num.bst" "$T/elsarticle/"
fetch ieeetran && cp "$TMP/ieeetran/tex/latex/ieeetran/IEEEtran.cls" "$TMP/ieeetran/bibtex/bst/ieeetran/IEEEtran.bst" "$T/ieeetran/"
fetch acmart && cp "$TMP/acmart/tex/latex/acmart/acmart.cls" "$TMP/acmart/bibtex/bst/acmart/ACM-Reference-Format.bst" "$T/acmart/"
echo "refreshed classes in $T — now compile each template in /write"
