// Environment for every staging process and isolated test run. Built from an empty object (allowlist),
// never by copying process.env, so live selectors such as EXOSURFACE_*, EXO_BB_*, EXO_A2UI_*,
// OPTCHAT_*, PI_* and EXO_CONFIG can't leak in from the parent shell (the Exo/Pi agent's own env).
// Accident guard only, not a sandbox: same macOS user, same Keychain.
import { dirname, join, resolve } from 'node:path';
import { existsSync, realpathSync, lstatSync } from 'node:fs';

export const FORBIDDEN = /^(EXOSURFACE_|EXO_BB_|EXO_A2UI_|EXO_|OPTCHAT_|PI_)/;
export const LIVE_PORTS = [38886, 38887];

export function stageEnv({ stage, serverPort = 39886, daemonPort = 39887, nodeBin = process.execPath } = {}) {
  if (!stage || !/^\/(?:private\/)?tmp\/nls-[a-zA-Z0-9_-]+$/.test(stage) || resolve(stage) !== stage) throw new Error(`stage must be a dedicated /tmp/nls-* directory, got ${stage}`);
  if (existsSync(stage) && (lstatSync(stage).isSymbolicLink() || !realpathSync(stage).startsWith('/private/tmp/nls-') && !realpathSync(stage).startsWith('/tmp/nls-'))) throw new Error('Staging path escapes temporary root');
  for (const port of [serverPort, daemonPort]) if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid staging port');
  if (LIVE_PORTS.includes(serverPort) || LIVE_PORTS.includes(daemonPort) || serverPort === daemonPort) throw new Error('Refusing live/duplicate BB ports');
  const env = {
    HOME: join(stage, 'home'),
    XDG_CONFIG_HOME: join(stage, 'config'),
    XDG_CACHE_HOME: join(stage, 'cache'),
    XDG_DATA_HOME: join(stage, 'share'),
    BB_DATA_DIR: join(stage, 'data'),
    BB_SERVER_URL: `http://127.0.0.1:${serverPort}`,
    BB_SERVER_PORT: String(serverPort),
    BB_HOST_DAEMON_PORT: String(daemonPort),
    BB_SERVER_BIND_HOST: '127.0.0.1',
    BB_TELEMETRY: 'false',
    // Deliberate fixture binding: any Exo code that honours EXO_CONFIG sees a non-existent staging file.
    EXO_CONFIG: join(stage, 'home', '.config', 'exo', 'exosurface.staging-absent.json'),
    // node only: no claude/codex/pi CLIs reachable, so no provider can pick up its own credentials.
    PATH: `${dirname(nodeBin)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    TMPDIR: join(stage, 'tmp'),
    LANG: 'en_US.UTF-8',
  };
  return env;
}

// Assert a final env carries no inherited live selector (EXO_CONFIG is allowed only as our staging value).
export function assertClean(env, stage) {
  const bad = Object.keys(env).filter(k => FORBIDDEN.test(k) && !(k === 'EXO_CONFIG' && env[k].startsWith(stage)));
  if (bad.length) throw new Error(`Inherited live selectors present: ${bad.join(', ')}`);
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && /\/\.(bb|exo-bb-spike|exo-a2ui-spike|optchat[^/]*|pi)(\/|$)/.test(v) && !v.startsWith(stage)) throw new Error(`${k} points at live state: ${v}`);
  return env;
}
