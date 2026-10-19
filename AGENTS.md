# Exosurface

A shared, adaptive interface for a person and their personal agent (see README.md, vocabulary in GLOSSARY.md). The working code is the plugin package `plugins/bb-plugin-exo-a2ui-spike`; read its `AGENTS.md` before changing it.

Repo skills: typescript, nodejs

## Rules

- `just check` is the gate: at the repo root it runs the package check (`plugins/bb-plugin-exo-a2ui-spike`, `just check`). A red check blocks hand-off.
- npm, not pnpm: install from the package lockfile with `npm ci`.
- Specs in `docs/specs/*.spec.html` are frozen once accepted; spec changes go through the owner.
- Public repo: no secrets, IPs, hostnames or home paths in code, comments or commits.
- Integrate worker commits with `just integrate N REF...` (the kit's `octo-feather-integrate`).

## Commands

- `just setup` once: `npm ci` in the package.
- `just check` the gate.
