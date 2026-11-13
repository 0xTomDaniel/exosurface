// This repo's own mise tools' bin dirs, colon-joined, for the justfile's PATH (octo-feather #500).
//
// `mise bin-paths` alone also names the tools of the user's global mise config; this repo's own are the ones its
// mise.toml files pin, which `mise ls --local --json` names. Prints nothing when mise is not on PATH or answers
// nothing.
import { spawnSync } from "node:child_process";

function ask(...args: string[]): string {
  const r = spawnSync("mise", args, { encoding: "utf8" });
  return r.error === undefined && r.status === 0 ? r.stdout : "";
}

function ownTools(): string[] {
  try {
    const tools: unknown = JSON.parse(ask("ls", "--local", "--json") || "{}");
    return typeof tools === "object" && tools !== null ? Object.keys(tools).sort() : [];
  } catch {
    return [];
  }
}

const names = ownTools();
if (process.argv.includes("--names")) {
  if (names.length === 0) throw new Error("mise ls --local --json supplied no tools; check mise.toml before setup");
  process.stdout.write(names.join("\n"));
} else {
  const paths = names.length > 0 ? ask("bin-paths", ...names).split("\n") : [];
  process.stdout.write(paths.filter((p) => p !== "").join(":"));
}
