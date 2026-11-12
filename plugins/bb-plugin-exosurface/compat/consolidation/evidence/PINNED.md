# Pinned evidence captures

Evidence files kept byte-for-byte as captured. They are not maintained source: `scripts/source-inventory.json` classifies each as `capture-integrity` against the sha256 below (format `sanitized-table`), and the source-integrity gate fails if the bytes change.

| File | Reason | SHA256 |
| --- | --- | --- |
| plugins/bb-plugin-exosurface/compat/consolidation/evidence/initial-wrong-runtime-server.js | Esbuild server bundle captured as evidence of the initial wrong runtime build (commit 5e90042). Nothing imports, executes, ships or references it; it is not in release.json resources. | f24f81fb9a00c7517f3881d6756abf91b4644b1d13af22e43625e9b10a166f57 |
