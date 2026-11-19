// Closed owner deferrals the root gate reads (scripts/lint.ts, scripts/check-languages.ts). Deferred BY OWNER means
// not assessed: not compliant, waived or exempt; nothing is deleted, moved, baselined or reclassified. Drift from this
// record refuses instead of skipping more or less than the owner decided.
import { lstatSync } from "node:fs";
import path from "node:path";

export const OWNER_DEFERRALS = {
  // Python lint/type: issue #216 comment 6828772822. Exactly these check_languages rows; check-python stays manual.
  python: {
    url: "https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6828772822",
    language: "Python",
    recipe: "check-python",
    rows: ["Python:ruff:check-python:python-lint-files", "Python:basedpyright:check-python:python-type-files"],
  },
  // TypeScript/JavaScript gate: issue #216 comment 6830616474. Exactly these source trees, by directory prefix.
  sourceTrees: [{
    url: "https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6830616474",
    prefixes: ["plugins/bb-plugin-exo-spike/", "spikes/a2a-pi/", "spikes/ag-ui-pi/"],
  }, {
    url: "https://github.com/0xTomDaniel/exosurface/issues/259#issuecomment-6865599114",
    prefixes: ["plugins/bb-plugin-exosurface/compat/a2ui-runtime/fixtures/", "plugins/bb-plugin-exosurface/compat/a2ui-runtime/test/"],
  }],
} as const;

/** A repo-relative path inside one of the deferred trees (exact directory prefix). */
export function isDeferredTree(file: string): boolean {
  return OWNER_DEFERRALS.sourceTrees.some((entry) => entry.prefixes.some((prefix) => file.startsWith(prefix)));
}

/**
 * Drift findings for the source-tree deferral: each deferred tree must exist as a real directory under root, and no
 * gated compiler project may sit inside one.
 */
export function deferredTreeDrift(root: string, gatedProjects: readonly string[]): string[] {
  const bad: string[] = [];
  for (const entry of OWNER_DEFERRALS.sourceTrees) {
    const fix = `owner deferral ${entry.url} covers exactly ${entry.prefixes.join(" ")}`;
    for (const prefix of entry.prefixes) {
      if (lstatSync(path.join(root, prefix), { throwIfNoEntry: false })?.isDirectory() !== true) bad.push(`deferred tree ${prefix} does not exist as a directory; ${fix}`);
    }
    for (const project of gatedProjects) {
      if (entry.prefixes.some((prefix) => project.startsWith(prefix))) bad.push(`gated compiler project ${project} is inside a deferred tree; remove it from ts_projects or end the deferral (${fix})`);
    }
  }
  return bad;
}

/** The lines every gate run prints for the source-tree deferral, with how many files it leaves unassessed. */
export function deferredTreeLines(files: readonly string[]): string[] {
  return OWNER_DEFERRALS.sourceTrees.flatMap((entry) => entry.prefixes.map((prefix) => {
    const count = files.filter((file) => file.startsWith(prefix)).length;
    return `${prefix}: DEFERRED BY OWNER ${entry.url}; ${String(count)} files not assessed, not compliant, waived or exempt`;
  }));
}
