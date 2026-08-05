#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pc98dev-codemirror.XXXXXX")"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

# 直接・間接依存を全て固定し、範囲指定依存による将来のbundle変化を防ぐ。
npm install --prefix "$BUILD_DIR" --no-package-lock --ignore-scripts \
  codemirror@6.0.2 @codemirror/autocomplete@6.20.3 @codemirror/commands@6.10.4 \
  @codemirror/lang-cpp@6.0.3 @codemirror/language@6.12.4 @codemirror/lint@6.9.7 \
  @codemirror/search@6.7.1 @codemirror/state@6.7.1 @codemirror/view@6.43.8 \
  @lezer/common@1.5.2 @lezer/cpp@1.1.6 @lezer/highlight@1.2.3 @lezer/lr@1.4.10 \
  @marijn/find-cluster-break@1.0.3 crelt@1.0.7 style-mod@4.1.3 w3c-keyname@2.2.8 \
  esbuild@0.21.5

cp "$SCRIPT_DIR/entry.mjs" "$BUILD_DIR/entry.mjs"
"$BUILD_DIR/node_modules/.bin/esbuild" "$BUILD_DIR/entry.mjs" \
  --bundle --format=esm --target=es2020 --minify --legal-comments=none \
  --outfile="$SCRIPT_DIR/codemirror.js"
node "$SCRIPT_DIR/collect-licenses.mjs" "$BUILD_DIR/node_modules" "$SCRIPT_DIR/LICENSE.CodeMirror"
wc -c "$SCRIPT_DIR/codemirror.js" "$SCRIPT_DIR/LICENSE.CodeMirror"
