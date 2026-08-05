#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
    echo "Usage: $0 <source-dir> <expected-revision> <name>" >&2
    exit 2
fi

SOURCE_DIR="$1"
EXPECTED_REVISION="$2"
NAME="$3"

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    echo "$NAME source tree is not a git clone: $SOURCE_DIR" >&2
    exit 1
fi

if [[ "$(git -C "$SOURCE_DIR" config --bool core.sparseCheckout || true)" == "true" ]]; then
    echo "$NAME source tree uses sparse checkout: $SOURCE_DIR" >&2
    exit 1
fi

ACTUAL_REVISION="$(git -C "$SOURCE_DIR" rev-parse --verify HEAD)"
if [[ "$ACTUAL_REVISION" != "$EXPECTED_REVISION" ]]; then
    echo "$NAME revision mismatch: expected $EXPECTED_REVISION, got $ACTUAL_REVISION" >&2
    exit 1
fi

if [[ -n "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ]]; then
    echo "$NAME source tree has local changes: $SOURCE_DIR" >&2
    exit 1
fi
