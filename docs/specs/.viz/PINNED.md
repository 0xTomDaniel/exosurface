# Pinned vendored runtime

Spec viewer files vendored from the octo-feather kit, not maintained source here: `scripts/source-inventory.json` classifies each as `vendored-dependency` against the sha256 below (format `audit-table`), and the source-integrity gate fails if the bytes change.

| File | Reason | SHA256 |
| --- | --- | --- |
| docs/specs/.viz/runtime.js | octo-feather spec-chat browser runtime v0.1; the spec pages and mockups load it with a script tag. It is not imported by Node and not part of the plugin build or release. This copy's sha differs from the kit's current runtime.js. | 5bbbd882458c72b190c32340375a8de276cddcadf78acbd53550cd8902cd88e0 |
