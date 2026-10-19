// `just record`: lowers the committed baseline to the check's own counts; refuses any raise.
import {record} from './gates.ts';

const result = await record(process.argv[2] ?? process.cwd());
for (const line of result.lines) console.log(line);
process.exitCode = result.ok ? 0 : 1;
