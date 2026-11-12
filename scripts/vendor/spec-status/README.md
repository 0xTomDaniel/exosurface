# Project-local spec/status guard

Owner: Exosurface standards/check maintainers. Owner authorized bounded reuse of this actual validator and its runtime closure on 2026-11-11. No private repository, token, checkout, launcher, skill markers or runtime acquisition is required.

Command: `python -B scripts/vendor/spec-status/check.py check docs/specs`. Root `just check`, its existing hook and CI use the same command through `check-specs`. Python 3.13.5, Git and Bash are ordinary project tools. Accepted target commit objects must exist locally; CI checks out full target history.

## Audited source

Audit reference only: octo-feather commit `a58919e2446850b19f2482aa5fd93dbc0e59b4ac`. This reference is not a setup/check/fetch prerequisite.

| Local file | Original path | Original SHA256 |
| --- | --- | --- |
| check.py | scripts/octo-feather-spec-status | f747efe832d2dd5971dbc17fa0a054d968d1f95dcbeff974ab25f9971131483b |
| github-issues.sh | .agents/skills/github-issues/scripts/lane-key | 438ad696f6f500b279b6bc08cf743c5d61380bbc3234d3fb4a9cb97bc2630f5a |
| linear.sh | .agents/skills/linear/scripts/lane-key | 213185d9912a3a8b57cf7505e7470021d9c9956ba59c5f8976dcd5eb33b4eba4 |
| LICENSE | LICENSE | d53642cb46073bcc457922fe34ddb725d08dfea527ebeed53dc4fdd8d44ee7ab |

License: Apache-2.0, copied completely. NOTICE retains upstream's applicable opening attribution through the antecedent notice. The subsequent inventory of unrelated roles/skills/UI notices is omitted because none of those files is included. Original NOTICE audit SHA256: `67a3402585cbd3b602bffc4173e900502b24cbec7d73ac8b12a5a6496815e284`.

## Exact relocation delta

The checker has a prominent modification notice. Only original `is_lane_key` lines 268..280 change behavior of file discovery: project-relative paths select the two byte-identical normalizers instead of dynamically loading `pi-role`, its TRACKERS table and skill-marker discovery. Both original tracker helpers are packaged, in original GitHub-then-Linear order; missing helper fails closed. Memoization and `stdout.strip() == lane` are unchanged. No grammar is reimplemented. All other checker code remains unchanged, including duplicate JSON detection, evidence/criteria, accepted Git contents/history, call fields and anchor/adds/weakens validation. Unused original stdlib imports are retained to keep the delta narrow.

No full launcher, fake SKILL markers, role/config/evidence inventory or new package was copied. Runtime input is the target's specs/status/call logs and Git objects, never copied acceptance data.

Updates are explicit project-reviewed source changes: retain notices and record source hashes, relocation delta and differential positive/negative evidence. Example: a changed lane helper must remain the actual canonical normalizer and be checked against both canonical and rejected GitHub/Linear lane inputs, not replaced with an inferred regex.

## Proof status

Local three-set command passed. `scripts/prove-spec-status.py` exercised 29 original/local comparisons with exact exit/stdout/stderr equality. Under an actual Bubblewrap mount namespace hiding the upstream repository and CLI, the same 29 local cases matched recorded reference observations; two additional missing-helper cases failed closed. Reference/update mode is optional and never required by the gate. No acceptance records were changed.

`relocation.patch` records the explicit modification. `scripts/source-inventory.json` owns literal source applicability; its verifier reverses this patch in scratch and compares the reconstructed core with the original audit hash above, and verifies both exact normalizers against this table. It uses no upstream runtime path. The patched checker is not claimed byte-identical to its original.

Full native standards gate remains incomplete. A genuine attempt rebuilt owner/runtime then timed out in typed language coverage at 300 seconds. Subsequent source-integrity wiring and single-pass lint batching still require a complete green gate and review.
