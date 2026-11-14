import { z } from 'zod';
import { primaryModelDefinition, isExoModel, mainModel, mainModelFile, save } from './state.ts';

interface Rpc { send(type: string, fields?: Record<string, unknown>): Promise<unknown> }
const rpcState = z.object({
  model: z.object({ provider: z.string(), id: z.string() }).nullish(),
  thinkingLevel: z.string().optional(),
  isStreaming: z.boolean().optional(),
  isCompacting: z.boolean().optional(),
  pendingMessageCount: z.number().optional(),
});
const remember = (id: string) => {
  if (mainModel() !== id) save(mainModelFile(), { id, at: new Date().toISOString() });
};

/** Saved preferences select a target, never establish what the running Pi actually uses. */
async function selectPrimaryModel(rpc: Rpc, picked: unknown, persist = remember) {
  const id = picked ?? mainModel();
  if (!isExoModel(id)) throw new Error('Unsupported primary Exo model; choose an Exo model in BB');
  const target = primaryModelDefinition(id), before = rpcState.parse(await rpc.send('get_state'));
  const modelChanged = before.model?.provider !== target.provider || before.model?.id !== target.modelId;
  const thinkingChanged = before.thinkingLevel !== target.thinking;
  if (modelChanged || thinkingChanged) {
    if (before.isStreaming || before.isCompacting || before.pendingMessageCount)
      throw new Error('Wait for primary Exo to become idle before changing its model');
    if (modelChanged) await rpc.send('set_model', { provider: target.provider, modelId: target.modelId });
    // Switching a model can clamp thinking, so reapply even if the old model was already high.
    await rpc.send('set_thinking_level', { level: target.thinking });
    const actual = rpcState.parse(await rpc.send('get_state'));
    if (actual.model?.provider !== target.provider || actual.model?.id !== target.modelId || actual.thinkingLevel !== target.thinking)
      throw new Error('Pi did not confirm the selected model and reasoning; message was not sent');
  }
  persist(id);
  return { id, changed: modelChanged || thinkingChanged };
}

/** Shared by startup/resume input and normal turns; failures must not prompt the old model. */
export async function promptWithPrimaryModel<T>(rpc: Rpc, picked: unknown, prompt: () => Promise<T>, persist = remember): Promise<T> {
  await selectPrimaryModel(rpc, picked, persist);
  return prompt();
}
