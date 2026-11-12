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
  sourceTrees: {
    url: "https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6830616474",
    prefixes: ["plugins/bb-plugin-exo-spike/", "spikes/a2a-pi/", "spikes/ag-ui-pi/"],
  },
} as const;

/** A repo-relative path inside one of the deferred trees (exact directory prefix). */
export function isDeferredTree(file: string, prefixes: readonly string[] = OWNER_DEFERRALS.sourceTrees.prefixes): boolean {
  return prefixes.some((prefix) => file.startsWith(prefix));
}

/**
 * Drift findings for the source-tree deferral: each prefix must be a plain relative directory path ending in "/",
 * exist as a real directory under root, not overlap another prefix, and contain no gated compiler project.
 */
export function deferredTreeDrift(root: string, gatedProjects: readonly string[], prefixes: readonly string[] = OWNER_DEFERRALS.sourceTrees.prefixes): string[] {
  const bad: string[] = [];
  const fix = `owner deferral ${OWNER_DEFERRALS.sourceTrees.url} covers exactly ${OWNER_DEFERRALS.sourceTrees.prefixes.join(" ")}`;
  if (new Set(prefixes).size !== prefixes.length) bad.push(`deferred trees repeat a prefix; ${fix}`);
  for (const prefix of prefixes) {
    if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/$/u.test(prefix)) {
      bad.push(`deferred tree ${prefix} is not a relative directory path ending in /; ${fix}`);
      continue;
    }
    if (lstatSync(path.join(root, prefix), { throwIfNoEntry: false })?.isDirectory() !== true) bad.push(`deferred tree ${prefix} does not exist as a directory; ${fix}`);
    for (const other of prefixes) {
      if (other !== prefix && other.startsWith(prefix)) bad.push(`deferred trees ${prefix} and ${other} overlap; ${fix}`);
    }
  }
  for (const project of gatedProjects) {
    if (isDeferredTree(project, prefixes)) bad.push(`gated compiler project ${project} is inside a deferred tree; remove it from ts_projects or end the deferral (${fix})`);
  }
  return bad;
}

/** The lines every gate run prints for the source-tree deferral, with how many files it leaves unassessed. */
export function deferredTreeLines(files: readonly string[]): string[] {
  return OWNER_DEFERRALS.sourceTrees.prefixes.map((prefix) => {
    const count = files.filter((file) => file.startsWith(prefix)).length;
    return `${prefix}: DEFERRED BY OWNER ${OWNER_DEFERRALS.sourceTrees.url}; ${String(count)} files not assessed, not compliant, waived or exempt`;
  });
}
