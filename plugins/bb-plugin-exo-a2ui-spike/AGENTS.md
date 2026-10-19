# bb-plugin-exo-a2ui-spike

BB plugin and Pi package for Exosurface (README.md). Node runs the TypeScript directly (`--experimental-transform-types`), no build step for tests.

## Gate before hand-off

Run `just check` in this directory after `npm ci`; hand off only when it exits 0. It is the package's one deterministic check (docs/specs/quality-gate.spec.html):

- Hard gates, must be clean: type check with the package's own tsconfig (`tsconfig.json`, `tsconfig.live.json`), every imported package listed (knip unlisted), every test passing (`npm test`).
- Counted gates, at or below `quality-baseline.json`: strictest type check (`tsconfig.strictest.json`), lint (`eslint.config.js`, typescript-eslint strictTypeChecked), knip unused files, unused exports and unused exported types.

Output is one line per gate; `FAIL` names the gate and, for a counted gate, its count and baseline. A count below its baseline passes and says "ready to record".

## Rules

- `quality-baseline.json` changes only through `just record`, which lowers counts to the current ones and refuses any raise. Never edit it by hand; commit it with the change that lowered it.
- A failing test is fixed to the package's current behaviour; never delete, skip or quarantine a test.
- Every tool the check runs is a pinned devDependency; add packages with `npm install --save-exact` and commit `package-lock.json`.
- `composition/` and `observer/` are archived experiments still imported by the extension; their dependencies are listed in this package.
