# The one gate (AGENTS.md): agents, .githooks/pre-commit and CI run `just check`.

set shell := ["bash", "-euo", "pipefail", "-c"]
# Recipe arguments reach the shell as "$@", never as pasted text.
set positional-arguments

# This repo's tools (mise.toml at mise.lock versions) on PATH for every recipe, from any caller (a shell, the git
# hook, CI, an agent pane): mise's own answer for this repo's config (`mise bin-paths`, the config its shims read),
# placed just before the caller PATH's first system dir (/usr/local/sbin /usr/local/bin /usr/sbin /usr/bin /sbin
# /bin; at the end when it has none): mise replaces only what would resolve from the system, and every dir the
# caller put earlier still wins. A tool not installed is named on stderr with the fix. Only this repo's tools, which
# scripts/own-tool-paths.ts names (its node found through `mise which`, which installs nothing): `mise bin-paths`
# alone adds the user's global mise tools too (octo-feather #500). From another working directory
# (`just --working-directory DIR`, where backticks run) the script is not found: none.
export PATH := `command -v mise >/dev/null || { echo "just: mise is not on PATH, so this repo's tools (mise.toml) are not resolved; install mise $(cat mise-version) (mise-version)" >&2; printf '%s' "$PATH"; exit 0; }; m="$(mise ls --local --missing 2>/dev/null | awk '{print $1 "@" $2}' | paste -sd ' ' -)"; [[ -z "$m" ]] || echo "just: not installed: $m (mise.toml, mise.lock); run: octo-feather-mise-install (the octo-feather kit's scripts/)" >&2; n="$(mise which node 2>/dev/null)" || n=""; add="$([[ -z "$n" ]] || "$n" scripts/own-tool-paths.ts 2>/dev/null)" || add=""; out=""; put=""; IFS=: read -ra ds <<<"$PATH"; for d in "${ds[@]}"; do [[ -n "$d" ]] || continue; case "${d%/}" in /usr/local/sbin|/usr/local/bin|/usr/sbin|/usr/bin|/sbin|/bin) [[ -n "$put" ]] || { out+="${add:+$add:}"; put=1; } ;; esac; out+="$d:"; done; [[ -n "$put" ]] || out+="${add:+$add:}"; printf '%s' "${out%:}"`

default:
    @just --list

# Install the pinned tools (mise.toml, mise.lock), dependencies and the git hook. The tools: octo-feather-mise-install,
# the octo-feather kit's one install of a repo's own locked mise tools (why not a bare mise install: its --help), when
# on PATH (an agent pane's); else mise's own `mise install --locked`, and on its failure the kit command is named.
setup:
    @if command -v octo-feather-mise-install >/dev/null; then octo-feather-mise-install; else mise install --locked || { rc=$?; echo "just setup: mise install --locked failed (exit $rc); if it names tools of your global mise config, install only this repo's: octo-feather-mise-install, in the octo-feather kit's scripts dir (e.g. ~/src/octo-feather/scripts/octo-feather-mise-install)" >&2; exit "$rc"; }; fi
    pnpm install --frozen-lockfile
    git config core.hooksPath .githooks

# Pilot: retain the native build/type/mock-BB pipeline offline. Gaps: docs/pnpm-migration.md.
check:
    plugins/bb-plugin-exosurface/scripts/check

build:
    ./scripts/build
