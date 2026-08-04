#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../nasm-src"
EMSDK_DIR="$ROOT_DIR/emsdk"
BUILD_JOBS="${BUILD_JOBS:-3}"

# NASM のソースは upstream 無改変なので git 管理外（.gitignore）。無ければ取得する。
if [[ ! -f "$SOURCE_DIR/configure.ac" || ! -f "$SOURCE_DIR/version" ]]; then
    echo "NASM source tree not found; cloning nasm-2.16.03 into $SOURCE_DIR" >&2
    git clone --depth 1 --branch nasm-2.16.03 \
        https://github.com/netwide-assembler/nasm.git "$SOURCE_DIR"
fi
if [[ ! -f "$SOURCE_DIR/configure.ac" || ! -f "$SOURCE_DIR/version" ]]; then
    echo "NASM source tree still not usable: $SOURCE_DIR" >&2
    exit 1
fi
if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
    echo "emsdk environment script not found: $EMSDK_DIR/emsdk_env.sh" >&2
    exit 1
fi
if [[ "$(<"$SOURCE_DIR/version")" != "2.16.03" ]]; then
    echo "Expected NASM 2.16.03 in $SOURCE_DIR" >&2
    exit 1
fi

export EMSDK_QUIET=1
# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh"

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nasm-wasm.XXXXXX")"
cleanup() {
    rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

cp -R "$SOURCE_DIR"/. "$BUILD_DIR"/
cd "$BUILD_DIR"

# The Git tag does not contain generated configure/config.h.in files.
# Recreate the aclocal input from NASM's checked-in m4 macros without automake.
for macro_file in autoconf/m4/*.m4; do
    printf 'm4_include([%s])\n' "$macro_file"
done > autoconf/aclocal.m4
autoheader -B autoconf
autoconf -B autoconf

emconfigure ./configure

LINK_FLAGS="-Wl,--gc-sections -O2 -sMODULARIZE=1 -sEXPORT_NAME=createNasm -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=['FS','callMain'] -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0"
emmake make -j "$BUILD_JOBS" nasm.js X=.js CFLAGS="-O2" LDFLAGS="$LINK_FLAGS"

cp nasm.js nasm.wasm "$SCRIPT_DIR"/
echo "Built $SCRIPT_DIR/nasm.js and $SCRIPT_DIR/nasm.wasm"
