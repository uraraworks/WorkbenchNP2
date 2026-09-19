#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../smallerc-src"
NASM_SOURCE_DIR="$SCRIPT_DIR/../nasm-src"
EMSDK_DIR="$ROOT_DIR/emsdk"
VERIFY_TREE="$SCRIPT_DIR/../verify-upstream-tree.sh"
LINE_INFO_PATCH="$SCRIPT_DIR/patches/0001-pc98dev-c-line-comments.patch"
IDENT_TABLE_PATCH="$SCRIPT_DIR/patches/0002-raise-ident-and-syntax-table-limits.patch"
BUILD_JOBS="${BUILD_JOBS:-3}"
REVISION="1865d79ce7a5ad3f8a9515a571437cee084b8b1d"
NASM_REVISION="cd37b81b320ead83ca5a6bbce5da0a6456663bc6"

if [[ ! -e "$SOURCE_DIR" ]]; then
    echo "SmallerC source tree not found; cloning revision $REVISION into $SOURCE_DIR" >&2
    git clone https://github.com/alexfru/SmallerC.git "$SOURCE_DIR"
    git -C "$SOURCE_DIR" checkout --detach "$REVISION"
fi
"$VERIFY_TREE" "$SOURCE_DIR" "$REVISION" "SmallerC"
"$VERIFY_TREE" "$NASM_SOURCE_DIR" "$NASM_REVISION" "NASM"
if [[ ! -f "$SOURCE_DIR/license.txt" || ! -f "$SOURCE_DIR/v0100/smlrc.c"
    || ! -f "$SOURCE_DIR/v0100/ucpp/LICENSE" ]]; then
    echo "SmallerC source tree still not usable: $SOURCE_DIR" >&2
    exit 1
fi
if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
    echo "emsdk environment script not found: $EMSDK_DIR/emsdk_env.sh" >&2
    exit 1
fi

export EMSDK_QUIET=1
# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh"

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smlrc-wasm.XXXXXX")"
cleanup() {
    rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

cp -R "$SOURCE_DIR"/. "$BUILD_DIR"/
git -C "$BUILD_DIR" apply --check "$LINE_INFO_PATCH" "$IDENT_TABLE_PATCH"
git -C "$BUILD_DIR" apply "$LINE_INFO_PATCH" "$IDENT_TABLE_PATCH"
mkdir -p "$SCRIPT_DIR/host"

# lcds.aもpin済みNASM 2.16.03で再生成する。ホストに入っている別版NASMへは依存しない。
NASM_BUILD_DIR="$BUILD_DIR/nasm-host"
mkdir -p "$NASM_BUILD_DIR"
cp -R "$NASM_SOURCE_DIR"/. "$NASM_BUILD_DIR"/
(
    cd "$NASM_BUILD_DIR"
    for macro_file in autoconf/m4/*.m4; do
        printf 'm4_include([%s])\n' "$macro_file"
    done > autoconf/aclocal.m4
    autoheader -B autoconf
    autoconf -B autoconf
    ./configure >/dev/null
    make -j "$BUILD_JOBS" nasm >/dev/null
)

UCPP_SOURCES=(
    "$BUILD_DIR/v0100/ucpp/arith.c"
    "$BUILD_DIR/v0100/ucpp/assert.c"
    "$BUILD_DIR/v0100/ucpp/cpp.c"
    "$BUILD_DIR/v0100/ucpp/eval.c"
    "$BUILD_DIR/v0100/ucpp/lexer.c"
    "$BUILD_DIR/v0100/ucpp/macro.c"
    "$BUILD_DIR/v0100/ucpp/mem.c"
    "$BUILD_DIR/v0100/ucpp/nhash.c"
)

HOST_CC="${CC:-cc}"
case "$(uname -s)" in
    Darwin) HOST_PLATFORM=(-DHOST_MACOS) ;;
    *) HOST_PLATFORM=(-DHOST_LINUX) ;;
esac
"$HOST_CC" -O2 "${HOST_PLATFORM[@]}" -o "$SCRIPT_DIR/host/smlrc" "$BUILD_DIR/v0100/smlrc.c"
"$HOST_CC" -O2 "${HOST_PLATFORM[@]}" -o "$SCRIPT_DIR/host/smlrl" "$BUILD_DIR/v0100/smlrl.c"
"$HOST_CC" -O2 "${HOST_PLATFORM[@]}" -o "$SCRIPT_DIR/host/smlrcc" "$BUILD_DIR/v0100/smlrcc.c"
"$HOST_CC" -O2 -DSTAND_ALONE -DUCPP_CONFIG -I"$BUILD_DIR/v0100/ucpp" \
    -o "$SCRIPT_DIR/host/smlrpp" "${UCPP_SOURCES[@]}"

COMMON_FLAGS=(
    -O2
    -sMODULARIZE=1
    -sINVOKE_RUN=0
    "-sEXPORTED_RUNTIME_METHODS=['FS','callMain']"
    -sFORCE_FILESYSTEM=1
    -sALLOW_MEMORY_GROWTH=1
    -sEXIT_RUNTIME=0
)

emcc "$BUILD_DIR/v0100/smlrc.c" -o "$SCRIPT_DIR/smlrc.js" \
    "${COMMON_FLAGS[@]}" -sEXPORT_NAME=createSmlrc
emcc "$BUILD_DIR/v0100/smlrl.c" -o "$SCRIPT_DIR/smlrl.js" \
    "${COMMON_FLAGS[@]}" -sEXPORT_NAME=createSmlrl
emcc -DSTAND_ALONE -DUCPP_CONFIG -I"$BUILD_DIR/v0100/ucpp" \
    "${UCPP_SOURCES[@]}" -o "$SCRIPT_DIR/smlrpp.js" \
    "${COMMON_FLAGS[@]}" -sEXPORT_NAME=createSmlrpp \
    "-sEXPORTED_FUNCTIONS=['_main','_fflush']"

# upstreamのlcds.txtをそのまま入力一覧としてsmall/tiny共用DOSライブラリを組む。
# 入力名は一時ディレクトリの絶対パスにせず、ELFのFILE symbolも再現可能に保つ。
(
    cd "$BUILD_DIR/v0100/srclib"
    PATH="$NASM_BUILD_DIR:$SCRIPT_DIR/host:$PATH" \
        "$SCRIPT_DIR/host/smlrcc" -SI ../include -I . @lcds.txt
)
cp "$BUILD_DIR/v0100/srclib/lcds.a" "$SCRIPT_DIR/lcds.a"

# huge モデル（386前提, -dosh）用のlcdh.aも同じpin済みNASM/host smlrccで組む。
# small経路とは独立の試作なので、失敗してもsmall側のビルドは壊さない。
(
    cd "$BUILD_DIR/v0100/srclib"
    PATH="$NASM_BUILD_DIR:$SCRIPT_DIR/host:$PATH" \
        "$SCRIPT_DIR/host/smlrcc" -SI ../include -I . @lcdh.txt
)
cp "$BUILD_DIR/v0100/srclib/lcdh.a" "$SCRIPT_DIR/lcdh.a"

cp "$BUILD_DIR/license.txt" "$SCRIPT_DIR/LICENSE.SmallerC"
cp "$BUILD_DIR/v0100/ucpp/LICENSE" "$SCRIPT_DIR/LICENSE.ucpp"
echo "Built wasm and host smlrpp/smlrc/smlrl plus lcds.a in $SCRIPT_DIR"
