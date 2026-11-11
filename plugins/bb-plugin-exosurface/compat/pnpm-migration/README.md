# Original npm provenance, #217

`original/` contains byte-exact Git objects from Exosurface commit `7125f968bd7b614ed198821cb0936d01f6639ad1`, each originally below `plugins/bb-plugin-exosurface/`. These are compatibility/provenance snapshots, not active installation projects. No existing historical record was rewritten. Their original relative directory layout is preserved, including nested manifests and complete lockfiles. No snapshot install/build or historical evidence replay is claimed.

| Original relative file | SHA256 |
| --- | --- |
| package.json | 956257c2c60cc710d7d52b3b5580b15dd87a18b89d09acf186e4f7f4ed4ad49b |
| package-lock.json | 57e5d4a4fb8711e24496d3e5b51f18e5184a61070436080f66161cdaf807c6b2 |
| release.json | 3340599adb40c315f7fafd5005b00a61937af4be1705404271d567736a5932a1 |
| legacy/surface/package.json | 514b71753378fcec76a93ac16430b1dc8274b68ad5c2b1e07136098a955f43bc |
| legacy/surface/package-lock.json | 12329573b2f5cb501ff106731541e82392d725db689d85cf3b705687ab7ffc4b |
| legacy/surface/composition/package.json | 504509ae54e2ef901f947cfdcccfc5a888fd6d5ca0c51e08362185844f8b4bee |
| legacy/surface/composition/package-lock.json | 70d5e473656c5e8899055747e901fdc8d8be62444945bd2a1948665feddea3db |

The referenced local zod3 artifact remains in its original tracked vendor tree, unchanged. Snapshot locks identify the old graph, never the new pnpm graph or current runtime evidence. Migration design, active-package inventory, head-specific commands/results, warnings and deferred standards: repository-root `docs/pnpm-migration.md`.
