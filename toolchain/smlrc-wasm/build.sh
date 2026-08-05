#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../smallerc-src"
EMSDK_DIR="$ROOT_DIR/emsdk"
VERIFY_TREE="$SCRIPT_DIR/../verify-upstream-tree.sh"
REVISION="1865d79ce7a5ad3f8a9515a571437cee084b8b1d"

if [[ ! -e "$SOURCE_DIR" ]]; then
    echo "SmallerC source tree not found; cloning revision $REVISION into $SOURCE_DIR" >&2
    git clone https://github.com/alexfru/SmallerC.git "$SOURCE_DIR"
    git -C "$SOURCE_DIR" checkout --detach "$REVISION"
fi
"$VERIFY_TREE" "$SOURCE_DIR" "$REVISION" "SmallerC"
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
mkdir -p "$SCRIPT_DIR/host"

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
"$HOST_CC" -O2 -o "$SCRIPT_DIR/host/smlrc" "$BUILD_DIR/v0100/smlrc.c"
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
emcc -DSTAND_ALONE -DUCPP_CONFIG -I"$BUILD_DIR/v0100/ucpp" \
    "${UCPP_SOURCES[@]}" -o "$SCRIPT_DIR/smlrpp.js" \
    "${COMMON_FLAGS[@]}" -sEXPORT_NAME=createSmlrpp \
    "-sEXPORTED_FUNCTIONS=['_main','_fflush']"

cp "$BUILD_DIR/license.txt" "$SCRIPT_DIR/LICENSE.SmallerC"
cp "$BUILD_DIR/v0100/ucpp/LICENSE" "$SCRIPT_DIR/LICENSE.ucpp"
echo "Built wasm and host smlrpp/smlrc in $SCRIPT_DIR"
