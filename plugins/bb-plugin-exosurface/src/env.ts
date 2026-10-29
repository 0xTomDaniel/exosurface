// Child-process environments are built from an allowlist, never by copying process.env. BB, a terminal or a parent
// Pi can carry live bindings (PI_*, OPTCHAT_*, EXOSURFACE_*, EXO_BB_*) and vendor API keys; none of them may select
// Exo's state, profile, Pi home or credentials. Accident guard, not a sandbox.
const PASS = ['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TMPDIR', 'TZ'];
export const INHERITED_BINDING = /^(EXOSURFACE_|EXO_|OPTCHAT_|PI_)/;

export function childEnv(explicit: Record<string, string> = {}, from: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of PASS) if (typeof from[key] === 'string') env[key] = from[key];
  return { ...env, ...explicit };
}
