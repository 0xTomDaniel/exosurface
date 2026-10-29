#!/bin/bash
set -u
R=$(cat /tmp/exo-native-source-path)
name=$1; cwd=$2; shift 2
cd "$cwd" || exit 1
/usr/bin/env -i HOME="$R/home" TMPDIR="$R/tmp" PATH="${NODE_PREFIX:?set NODE_PREFIX}"/bin:/usr/bin:/bin NODE_DISABLE_COMPILE_CACHE=1 npm_config_offline=true NODE_OPTIONS="--require=$R/npm-tripwire.cjs" EXO_NATIVE_ROOT="$R" "$@" > "$R/evidence/$name.stdout" 2> "$R/evidence/$name.stderr"
code=$?; echo "$code" > "$R/evidence/$name.exit"; exit "$code"
