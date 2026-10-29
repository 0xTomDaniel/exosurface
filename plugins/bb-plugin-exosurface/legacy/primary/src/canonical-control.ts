import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createExclusive, loadIf } from '../../../src/store.ts';
import { setupStatus } from './canonical-setup.ts';
export const initializationControl = (operationId: string) => `/exosurface-initialize ${operationId}`;
export function consumeAdmittedCanonicalStart(home: string, threadId: string, operationId: string) {
  const j = setupStatus(home), candidate = loadIf(join(home, 'canonical-native-candidate.json'));
  if (!j || !['spawning', 'thread-ready'].includes(j.stage) || candidate?.threadId !== threadId || candidate?.operationId !== operationId || j.request.operationId !== operationId || candidate?.projectId !== j.request.projectId || candidate?.providerId !== 'exo-spike') throw Error('Canonical initialization provider options were not admitted');
  return consumeCanonicalInitialization(home, threadId, [{ type: 'text', text: initializationControl(operationId) }]);
}
/** Both thread/start and turn/start must invoke this BEFORE model selection,
 * owner attachment or ordinary prompt forwarding. Reserved controls never infer. */
export function consumeCanonicalInitialization(home: string, threadId: string, input: unknown): { providerThreadId: string } | undefined {
  if (!Array.isArray(input)) return undefined;
  const text = input.map(i => i?.type === 'text' ? i.text : '').join('');
  if (!text.trimStart().startsWith('/exosurface-initialize') && !input.some(i => i?.type === 'text' && typeof i.text === 'string' && i.text.trimStart().startsWith('/exosurface-initialize'))) return undefined;
  const j = setupStatus(home);
  if (!j || !['spawning', 'thread-ready', 'bound'].includes(j.stage) || (j.threadId && j.threadId !== threadId) || input.length !== 1 || input[0]?.type !== 'text' || text !== initializationControl(j.request.operationId) || !/^[a-zA-Z0-9_-]+$/.test(threadId)) throw Error('Invalid or stale canonical initialization control; no prompt forwarded');
  const file = join(home, 'canonical-native-candidate.json'), value = { operationId: j.request.operationId, threadId, providerId: 'exo-spike', projectId: j.request.projectId };
  if (!createExclusive(file, value) && (!existsSync(file) || readFileSync(file, 'utf8') !== JSON.stringify(value, null, 2) + '\n')) throw Error('Conflicting native initialization candidate');
  return { providerThreadId: `exo:${j.request.profile}:main` };
}
