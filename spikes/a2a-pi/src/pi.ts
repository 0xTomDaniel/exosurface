import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { CATALOG, type Snapshot, type Turn } from './schema.js';
import { surfaceMessages, validateReflection } from './surface.js';

export type PiResponse = { model: string; utterance?: string; operations: unknown[]; promptBytes: number; toolCalls: number; sessionId: string };
// Deliberate projection: authored turns + the exact referenced visual structure,
// current sources, decisions, layout/grouping, and IDs. A UI save is not Pi memory.
export function projectContext(current: Snapshot, reference: Snapshot, turn: Turn) {
  return { threadId: current.threadId, contribution: turn,
    historicalReference: { surfaceId: reference.surfaceId, revision: reference.revision,
      sourceRevision: reference.sourceRevision, tasks: reference.tasks, proposals: reference.proposals,
      a2ui: surfaceMessages(reference), selectedObjectId: turn.reference?.objectId },
    current: { revision: current.revision, sourceRevision: current.sourceRevision, tasks: current.tasks,
      proposals: current.proposals, lights: current.lights },
    authoredTurns: current.turns.filter(t => current.turns.slice(-24).some(recent => recent.id === t.id) ||
      t.revision === reference.revision || t.reference?.objectId === turn.reference?.objectId || t.author === 'source') };
}

export async function runPi(directory: string, current: Snapshot, reference: Snapshot, turn: Turn, signal: AbortSignal): Promise<PiResponse> {
  const runtime = await ModelRuntime.create({ modelsStorePath: join(directory, 'models-cache.json'), allowModelNetwork: false });
  const available = runtime.getAvailableSnapshot();
  const settingsPath = join(homedir(), '.pi', 'agent', 'settings.json');
  const configured = existsSync(settingsPath) ? z.object({ defaultProvider: z.string().optional(), defaultModel: z.string().optional() }).parse(JSON.parse(readFileSync(settingsPath, 'utf8'))) : {};
  const model = available.find(m => m.provider === configured.defaultProvider && m.id === configured.defaultModel) ?? available[0];
  if (!model) throw new Error('Pi model unavailable: configure an existing Pi provider before live validation');
  const projection = projectContext(current, reference, turn);
  const capabilities = new MessageProcessor([basicCatalog]).getClientCapabilities({ includeInlineCatalogs: true });
  const prompt = JSON.stringify(projection);
  let response: PiResponse | undefined;
  let toolCalls = 0;
  const settings = SettingsManager.inMemory({ defaultProvider: model.provider, defaultModel: model.id });
  const agentDir = join(directory, 'pi-isolated'); mkdirSync(agentDir, { recursive: true });
  const loader = new DefaultResourceLoader({ cwd: directory, agentDir, settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    // Reuses upstream DirectJsonPromptGenerator's schema + top-down guidance.
    // Tools carry raw A2UI, so textual <a2ui-json> delimiters are unnecessary here.
    systemPrompt: `You are Exo, a personal agent in a temporal multimodal conversation. A visual turn is a complete contribution without chat. The input deliberately includes exact historical and current visual context; source records remain authoritative. Never claim to have applied a proposal or device command. Do not use a shell, files, or tools other than send_a2ui_json_to_client.
Use that tool exactly once to produce an A2UI v0.9 visual response summarizing what the person selected, its exact historical time and current time, and why any source/acceptance revision changed the plan. Disambiguate research-brief from research-review using the IDs. Continue the interaction from these facts, do not ask the person to repeat context. Include the object ID in the visual text.
Explain changes in terms of the person's task, choice, and later source edit. Do not display source hashes, UUIDs, Pi session IDs, raw timestamps, or implementation details. The object ID and readable times are sufficient to distinguish the referenced task. Do not invent a reason for an external edit when the context contains none.
Use createSurface for surfaceId exo-reflection and catalogId ${CATALOG}, then updateComponents. Components must use component and id properties; put root first and parents before children. Use only Text, Column, Row, Card, Divider. Refer to children by ID. Never emit actions, links, HTML, or source-mutating commands. If the person used language, an optional short utterance can accompany the visual expression; if no utterance is present, omit your utterance. Generated messages must validate against the supplied published catalog schema.
Published renderer/catalog capabilities: ${JSON.stringify(capabilities)}`,
    extensionFactories: [pi => {
      pi.registerTool({ name: 'send_a2ui_json_to_client', label: 'Present Exosurface',
        description: 'Publish one validated A2UI visual expression, with an optional associated utterance.',
        parameters: Type.Object({ messages: Type.Array(Type.Unknown()), utterance: Type.Optional(Type.String()) }),
        async execute(_id, params) {
          toolCalls++;
          if (response) throw new Error('Only one visual contribution is allowed per execution');
          const messages = validateReflection(params.messages);
          response = { operations: messages, utterance: params.utterance, model: `${model.provider}/${model.id}`, promptBytes: Buffer.byteLength(prompt), toolCalls, sessionId: '' };
          return { content: [{ type: 'text', text: 'Visual expression validated. End the turn.' }], details: { validated: true } };
        },
      });
    }],
  });
  await loader.reload();
  const sessionManager = SessionManager.inMemory(directory);
  const { session } = await createAgentSession({ cwd: directory, agentDir, modelRuntime: runtime, model,
    thinkingLevel: 'low', noTools: 'builtin', tools: ['send_a2ui_json_to_client'], resourceLoader: loader,
    settingsManager: settings, sessionManager });
  const abort = () => void session.abort(); signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new Error('Pi execution canceled');
    await session.prompt(prompt);
    if (!response) {
      const assistant = session.messages.filter(message => message.role === 'assistant').at(-1);
      writeFileSync(join(directory, 'pi-diagnostic.json'), JSON.stringify({ tools: session.getActiveToolNames(),
        model: `${model.provider}/${model.id}`, stopReason: assistant?.stopReason,
        error: assistant?.errorMessage, content: assistant?.content.filter(part => part.type === 'text' || part.type === 'toolCall') }, null, 2), { mode: 0o600 });
      throw new Error(`Pi completed without a validated A2UI tool result (${assistant?.stopReason ?? 'no assistant response'})`);
    }
    response.sessionId = sessionManager.getSessionId();
    // Safe fixture evidence: no provider headers, credentials, or hidden reasoning.
    writeFileSync(join(directory, 'pi-proof.json'), JSON.stringify({ projection, response }, null, 2), { mode: 0o600 });
    return response;
  } finally { signal.removeEventListener('abort', abort); session.dispose(); }
}
