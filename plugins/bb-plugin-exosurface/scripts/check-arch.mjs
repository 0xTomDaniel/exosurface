// Use the actual producer's complete native entry set, not a second hand-maintained runtime list.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
const plugin = resolve(import.meta.dirname, '..');
const graph = z.object({
  entries: z.record(z.string(), z.object({ entry: z.string().min(1) })),
  sourceClosure: z.object({ entries: z.array(z.string().min(1)) }),
}).parse(JSON.parse(readFileSync(resolve(plugin, 'dist/runtime-graph.json'), 'utf8')));
const entries = [...new Set([...Object.values(graph.entries).map(entry => entry.entry), ...graph.sourceClosure.entries])];
const result = spawnSync('pnpm', ['--workspace-root', 'exec', 'depcruise', '--output-type', 'json', ...entries.map(entry => resolve(plugin, entry))], {
  cwd: resolve(plugin, '../..'), stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
