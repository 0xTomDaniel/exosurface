# Promoting Exosurface to the primary Exo session

Status: **prepared, not started.** Every step below that touches the primary session needs the owner's explicit go at that time. The clone keeps running unchanged until the switch.

## Readiness evidence (clone, real use)

- **Context:** no layout JSON in any request or in OptChat memory. Canvas calls are stored verbatim as readable snapshot lines (median about 1.3 KB per call) and summarized in plain language. The per-request outline is current state and never persisted (budget 12 KB). The append-only check confirms history is never rewritten. Exo does not re-read surfaces it just drew.
- **Interaction:** drawing, edits by ref, button presses, canvas edits reaching the next turn, surface cards in the chat, rewind, bring-back with a pill (send, button, `@` mention), cancel. All observed working in live use.
- **OptChat:** the clone runs pure upstream 0.8.6, which includes the cache-mark fix merged from this project (jonaslsaa/pi-optchat#187). Upstream 0.8.6 loads a copy of the primary session's memory completely (every entry and summary, no warnings), adding only its `view.json`.

## Steps

1. **Back up the primary session.** Archive its OptChat home (profile, memories, sessions) and record checksums. Confirm the session file's byte prefix before and after every later step; history is append-only.
2. **Move the primary session to upstream OptChat 0.8.6.** Point its OptChat path at a clean upstream checkout instead of the patched 0.7.0 one. Both local patches are covered: the cache mark is upstream (#187), and the extra memory origin type only affects a label in OptChat's memory browser (entries from that origin show "imported from undefined"; cosmetic). Restart the primary owner only when idle, under its own supervisor, and confirm memory loads with the same counts.
3. **Give the primary plugin the canvas.** The canvas plugin descends from the primary plugin; outside the canvas code they differ in about 110 lines (bridge card rows, owner canvas commands). Port the canvas into the primary plugin on a branch in a separate worktree (the live checkout serves the primary plugin):
   - launch order `-e workspace-extension.ts -e <optchat> -e workspace-frame.ts -e live.ts --skill skills/exosurface`, with `EXOSURFACE_MODE=main` (header without clone wording);
   - **tools added, never replaced:** Exo keeps all of its own tools and gains `update_exosurface` and `read_exosurface`; the clone-only tool guard and blocks on file/shell/subagent tools are not ported;
   - the clone-home guards become primary-home checks; the canvas starts empty (no clone history is merged);
   - bridge: surface cards and hidden canvas rows; server: canvas RPCs, bring-back pill, dispatch hook; frontend: the canvas page beside the primary thread.
4. **Verify before switching:** tests, a staged render, and the context gates against the primary configuration (guide delivered, outline within budget, no layout JSON in requests or memory, append-only history).
5. **Switch** with a plugin reload and an idle restart of the primary owner. First real turns are the live check.
6. **Retire the clone** only after the owner is satisfied: stop its supervisor, keep its home and history archived.

## Rollback

Restore the previous primary plugin build and OptChat path and restart the owner. History is append-only, so canvas entries written meanwhile stay in the session; the 0.7.0 plugin ignores them.

## Known, not blocking

- Occasional full prompt-cache misses (about 8 a day in the clone), upstream of Exosurface; likely affects the primary session too.
- Reply overlap with the canvas is about 40% against a 25% target; accepted for now.
