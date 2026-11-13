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
export PATH := `command -v mise >/dev/null || { echo "just: mise is not on PATH, so this repo's tools (mise.toml) are not resolved; install mise $(cat mise-version) (mise-version)" >&2; printf '%s' "$PATH"; exit 0; }; m="$(mise ls --local --missing 2>/dev/null | awk '{print $1 "@" $2}' | paste -sd ' ' -)"; [[ -z "$m" ]] || echo "just: not installed: $m (mise.toml, mise.lock); run: just setup (installs only this repo's locked tool requests)" >&2; n="$(mise which node 2>/dev/null)" || n=""; add="$([[ -z "$n" ]] || "$n" scripts/own-tool-paths.ts 2>/dev/null)" || add=""; out=""; put=""; IFS=: read -ra ds <<<"$PATH"; for d in "${ds[@]}"; do [[ -n "$d" ]] || continue; case "${d%/}" in /usr/local/sbin|/usr/local/bin|/usr/sbin|/usr/bin|/sbin|/bin) [[ -n "$put" ]] || { out+="${add:+$add:}"; put=1; } ;; esac; out+="$d:"; done; [[ -n "$put" ]] || out+="${add:+$add:}"; printf '%s' "${out%:}"`

default:
    @just --list

# Bootstrap the locally requested Node, then ask mise for this repo's complete tool requests.
# Explicit names prevent installation of unrelated global mise tools. Versions remain owned by mise.toml/mise.lock.
setup:
    mise install --locked --jobs 1 node
    @n="$(mise which node)"; requests="$("$n" scripts/own-tool-paths.ts --names)"; mapfile -t tools <<<"$requests"; mise install --locked --jobs 1 "${tools[@]}"
    just setup-dependencies
    git config core.hooksPath .githooks

# Root shipping graph, then the separately locked nonshipping source-preparation workspace.
# Initial pnpm import is a producer migration step, never ordinary setup or a check.
setup-dependencies:
    @test -f plugins/bb-plugin-exo-a2ui-spike/pnpm-workspace.yaml && test -f plugins/bb-plugin-exo-a2ui-spike/pnpm-lock.yaml || { echo 'Missing auxiliary preparation workspace/lock; consume the canonical producer inputs before setup' >&2; exit 1; }
    pnpm install --frozen-lockfile
    env -u NPM_CONFIG_WORKSPACE_DIR -u npm_config_workspace_dir pnpm --dir "{{justfile_directory()}}/plugins/bb-plugin-exo-a2ui-spike" --config.ignore-pnpmfile=true install --frozen-lockfile

# The native bounded gate consumes this same list, under its existing flock.
# check-python stays a manual recipe: Python lint/type is DEFERRED BY OWNER (issue #216 comment 6828772822),
# not compliant, waived or exempt; scripts/check-languages.ts names the two deferred check_languages rows.
GATE_RECIPES := "check-source-integrity check-languages check-scripts check-ts check-arch check-dead-code check-specs"
check_languages := "TypeScript:tsc:check-ts:ts-files TypeScript:eslint:check-languages:eslint-files JavaScript:tsc:check-ts:ts-files JavaScript:eslint:check-languages:eslint-files Shell:shellcheck:check-scripts:shell-files BASH:shellcheck:check-scripts:shell-files Python:ruff:check-python:python-lint-files Python:basedpyright:check-python:python-type-files"

check:
    plugins/bb-plugin-exosurface/scripts/check

check-source-integrity:
    PYTHONDONTWRITEBYTECODE=1 python -B scripts/source-inventory.py

check-languages:
    node scripts/check-languages.ts

# Both compiler commands use the same real projects, native diagnostics and verified applicability.
ts_projects := "tsconfig.json plugins/bb-plugin-exosurface/tsconfig.json plugins/bb-plugin-exo-a2ui-spike/tsconfig.json plugins/bb-plugin-exo-a2ui-spike/tsconfig.composition.json docs/specs/.viz/tsconfig.json"

ts-files:
    @args=(); for project in {{ts_projects}}; do args+=("--project=$project"); done; node scripts/lint.ts --compiler-files "${args[@]}"

# ESLint's own report, including files with diagnostics.
eslint-files:
    @node scripts/lint.ts --files

shell-files:
    @git ls-files ':(attr:shell)'

check-scripts:
    just shell-files | xargs -r -d '\n' shellcheck -S warning

check-ts:
    @args=(); for project in {{ts_projects}}; do args+=("--project=$project"); done; node scripts/lint.ts --compiler "${args[@]}"

check-arch:
    node plugins/bb-plugin-exosurface/scripts/check-arch.mjs

check-dead-code:
    node scripts/lint.ts --knip

python-lint-files:
    @inputs="$(python -B scripts/source-inventory.py --maintained)"; mapfile -t files <<<"$inputs"; ruff check --show-files "${files[@]}"

# The manual check-python recipe's input list (Python lint/type is DEFERRED BY OWNER; this row is never run by the gate).
python-type-files:
    @python -B scripts/source-inventory.py --maintained

# Manual only, not in GATE_RECIPES: Python lint/type is DEFERRED BY OWNER (issue #216 comment 6828772822).
check-python:
    @inputs="$(python -B scripts/source-inventory.py --maintained)"; mapfile -t files <<<"$inputs"; ruff check "${files[@]}"; pnpm exec basedpyright --project pyrightconfig.json "${files[@]}"

check-specs:
    PYTHONDONTWRITEBYTECODE=1 python -B scripts/vendor/spec-status/check.py check docs/specs

build:
    ./scripts/build
