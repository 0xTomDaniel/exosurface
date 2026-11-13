import { layout, type Config } from './config.ts';
import { isRecord, loadIf, save } from './store.ts';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
/** BB rejects empty spawn input. Consume one exact, bound local control turn without a provider call. */
export const initializationText = (key: string) => `EXOSURFACE_INITIALIZE:${key}`;
export async function consumeInitialization(config: Config, threadId: string, text: string) {
  const journal: unknown = loadIf(layout(config.stateDir).firstRun), file = join(config.stateDir, 'bb-thread-intent.json');
  if (!isRecord(journal)) return false;
  const key = journal['key'], journalThread = journal['threadId'];
  if (typeof key !== 'string' || !key || text !== initializationText(key) || journal['profile'] !== config.profile || journal['vault'] !== realpathSync(config.vault)) return false;
  // Spawn may return before its provider starts. Never accept a control for an unknown candidate thread.
  for (let n = 0; n < 50; n++) {
    const intent: unknown = loadIf(file);
    if (!isRecord(intent) || intent['key'] !== key || intent['providerId'] !== 'exosurface' || intent['initializationConsumed']) return false;
    if (intent['threadId']) {
      if (intent['threadId'] !== threadId || (journalThread && journalThread !== threadId)) return false;
      save(file, { ...intent, initializationConsumed: true });
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false; // Unknown creation remains an explicit reconciliation case, not a prompt/auth bypass.
}
