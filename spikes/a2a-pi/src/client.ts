import { build } from './typed.js';
import { Message, Part, SendMessageRequest } from '@a2a-js/sdk';
import { ClientFactory, ClientFactoryOptions, DefaultAgentCardResolver, type Client } from '@a2a-js/sdk/client';
import { A2UI_MIME, A2UI_URI, CATALOG, THREAD, snapshotSchema, type Intent, type Snapshot } from './schema.js';
export type { Client };
export const requestOptions = (signal?: AbortSignal) => ({ signal,
  serviceParameters: { 'Authorization': 'Bearer demo-owner', 'A2A-Extensions': A2UI_URI } });
export const dataPart = (value: unknown, mediaType = 'application/json') => build(Part, {
  content: { $case: 'data', value }, mediaType, metadata: { mimeType: mediaType } });
export async function connectClient(url: string): Promise<Client> {
  const cardResolver = new DefaultAgentCardResolver({ fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(1600) }) });
  return new ClientFactory({ ...ClientFactoryOptions.default, cardResolver }).createFromUrl(url);
}
export async function request(client: Client, data: unknown, utterance?: string, signal?: AbortSignal): Promise<Message> {
  const parts = [dataPart(data)];
  if (utterance) parts.push(build(Part, { content: { $case: 'text', value: utterance }, mediaType: 'text/plain' }));
  const result = await client.sendMessage(build(SendMessageRequest, { message: build(Message, {
    messageId: crypto.randomUUID(), contextId: THREAD, role: 1, parts,
    metadata: { a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: [CATALOG] } } },
  }) }), requestOptions(signal));
  if (!('messageId' in result)) throw new Error('Expected a direct Message');
  const error = result.parts.find(p => p.content?.$case === 'data' && p.content.value?.error);
  if (error?.content?.$case === 'data') throw new Error(String(error.content.value.error));
  return result;
}
export async function discover(client: Client, signal?: AbortSignal): Promise<Snapshot> {
  const message = await request(client, { request: 'discover' }, undefined, signal);
  return snapshotSchema.parse(message.parts.find(p => p.content?.$case === 'data')?.content?.value);
}
export async function sendIntent(client: Client, intent: Intent): Promise<Message> {
  const { utterance, ...context } = intent;
  const parts = [dataPart([{ version: 'v0.9', action: {
    name: intent.name, surfaceId: intent.surfaceId, sourceComponentId: intent.objectId ?? intent.name,
    timestamp: new Date().toISOString(), context } }], A2UI_MIME)];
  if (utterance) parts.push(build(Part, { content: { $case: 'text', value: utterance }, mediaType: 'text/plain' }));
  const result = await client.sendMessage(build(SendMessageRequest, { message: build(Message, {
    messageId: intent.actionId ?? crypto.randomUUID(), contextId: THREAD, role: 1, parts,
    metadata: { a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: [CATALOG] } } },
  }) }), requestOptions());
  if (!('messageId' in result)) throw new Error('Expected a direct Message');
  const failure = result.parts.find(p => p.content?.$case === 'data' && p.content.value?.error);
  if (failure?.content?.$case === 'data') throw new Error(String(failure.content.value.error));
  return result;
}
