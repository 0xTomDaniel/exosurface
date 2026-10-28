#!/usr/bin/env node
// Built-in-only release tooling. No command invokes launchctl or modifies BB.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildArtifact, packArtifact, verifyArtifact, selftest } from './lib/artifact.mjs';
import { install, update, rollback, uninstall, setModels } from './lib/lifecycle.mjs';
import { doctor, formatDoctor } from './lib/doctor.mjs';
import { setup } from './lib/setup.mjs';
import { fail } from './lib/util.mjs';

const flags = new Set(['acceptFullAccess', 'allowDirty', 'serviceStopped', 'keepConfig', 'queryLaunchd', 'json']);
export function parse(args) {
  const [command = 'help', ...tail] = args, opts = {};
  for (let i = 0; i < tail.length; i++) {
    if (!/^--[a-z][a-z-]*$/.test(tail[i])) fail(`Expected --option, got ${tail[i]}`);
    const key = tail[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(opts, key)) fail(`Duplicate option ${tail[i]}`);
    if (flags.has(key)) opts[key] = true;
    else { if (!tail[i + 1] || tail[i + 1].startsWith('--')) fail(`Missing value for ${tail[i]}`); opts[key] = tail[++i]; }
  }
  return { command, opts };
}
export function main(args) {
  const { command, opts } = parse(args);
  let result;
  switch (command) {
    case 'build': if (!opts.packageDir || !opts.outDir) fail('build requires --package-dir and --out-dir'); result = buildArtifact(opts); break;
    case 'pack': if (!opts.artifact) fail('pack requires --artifact'); result = packArtifact(opts.artifact, opts.outDir); break;
    case 'verify': if (!opts.artifact) fail('verify requires --artifact directory'); result = verifyArtifact(opts.artifact); break;
    case 'selftest': result = selftest(opts.artifact, opts.node); if (result.status !== 'ok') process.exitCode = 1; break;
    case 'setup': result = setup(opts); break;
    case 'install': if (!opts.artifact) fail('install requires --artifact'); result = install(opts); break;
    case 'update': if (!opts.artifact) fail('update requires --artifact'); result = update(opts); break;
    case 'rollback': result = rollback(opts); break;
    case 'uninstall': result = uninstall(opts); break;
    case 'models': result = setModels(opts); break;
    case 'doctor': result = doctor(opts); if (!result.ok) process.exitCode = 1; if (!opts.json) { console.log(formatDoctor(result)); return; } break;
    case 'help': console.log('exo-release <build|pack|verify|selftest|setup|install|update|rollback|uninstall|models|doctor> --option value\nSee docs/release/install.md. Commands do not run launchctl, install dependencies or change BB.'); return;
    default: fail(`Unknown command ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = e.exitCode ?? 1; }
}
