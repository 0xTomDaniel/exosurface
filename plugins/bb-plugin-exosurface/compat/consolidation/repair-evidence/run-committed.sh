#!/bin/bash
set -u
TASK=$(cat /tmp/exo-packaging-repair-path)
PKG="$TASK/committed/plugins/bb-plugin-exosurface"
NAME=$1; WHERE=$2; shift 2
cd "$PKG/$WHERE" || exit 1
env -i HOME="$TASK/home" TMPDIR="$TASK/tmp" PATH="${NODE_PREFIX:?set NODE_PREFIX}"/bin:/usr/bin:/bin NODE_DISABLE_COMPILE_CACHE=1 "$@" > "$TASK/evidence/$NAME.log" 2> "$TASK/evidence/$NAME.stderr"
code=$?; printf '%s\n' "$code" > "$TASK/evidence/$NAME.exit"; exit "$code"
