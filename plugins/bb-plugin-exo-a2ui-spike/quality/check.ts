// `just check`: every deterministic gate of the package. Exit 0 only when all pass.
import {check} from './gates.ts';

const report = await check(process.argv[2] ?? process.cwd());
for (const line of [...report.details, ...report.lines]) console.log(line);
console.log(report.ok ? 'check: passed' : `check: failed (${String(report.lines.filter(l => l.startsWith('FAIL')).length)} gates)`);
process.exitCode = report.ok ? 0 : 1;
