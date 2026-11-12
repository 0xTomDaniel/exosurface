// Test-only observer preloaded into the unmodified owner (node --import). Records the exact
// argv/cwd/env of each child spawn to EXO_SPAWN_RECORD, then calls through unchanged.
// Pi retitles itself, so ps cannot show its argv. Fixture-only: never use with real credentials.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
const file = process.env["EXO_SPAWN_RECORD"], original = cp.spawn;
cp.spawn = function (command, args, options) {
  if (file) appendFileSync(file, JSON.stringify({ command, args, cwd: options?.cwd, env: options?.env }) + '\n');
  return original.apply(this, arguments);
};
syncBuiltinESMExports();
