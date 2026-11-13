import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { save, loadIf } from '../../../src/store.ts';
import { INITIALIZATION } from './canonical-fresh.ts';
/** Disposable, user-authorized initialization only. Uses the CLI's supported
 * extension API, never the incompatible public SDK index or private modules. */
export default function initialize(pi: ExtensionAPI) {
  pi.on('before_provider_request', () => { throw Error('Setup initialization forbids inference'); });
  pi.registerCommand('exosurface-initialize-session', { description: 'Initialize authorized Exosurface setup session without inference', handler: async (_args, ctx) => {
    const home = process.env["EXOSURFACE_SETUP_HOME"], operationId = process.env["EXOSURFACE_SETUP_OPERATION"];
    if (!home || !operationId || !/^[a-zA-Z0-9_-]{8,80}$/.test(operationId)) throw Error('Explicit setup operation required');
    const file = join(home, 'canonical-pi-intent.json'), old = loadIf(file);
    if (old) throw Error('Initialization identity already issued; resume that exact session, never append again');
    const result = await ctx.newSession({ setup: async manager => {
      save(file, { operationId, id: manager.getSessionId(), file: manager.getSessionFile() });
      manager.appendCustomEntry('exosurface.setup', { operationId });
      manager.appendMessage({ role: 'user', content: [{ type: 'text', text: INITIALIZATION }], timestamp: Date.now() });
    } });
    if (result.cancelled || !existsSync(file)) throw Error('Initialization was cancelled');
  } });
}
