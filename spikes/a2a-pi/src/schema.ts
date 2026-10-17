import { z } from 'zod';
export const THREAD = 'thread-sunday';
export const A2UI_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.9';
export const A2UI_MIME = 'application/a2ui+json';
export const CATALOG = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
export const limits = { turns: 256, checkpointBytes: 524288, journalBytes: 8388608,
  observers: 16, retiredObservers: 2, retainedWork: 32, activeWork: 4,
  heartbeatMs: 200, leaseMs: 5000, publishMs: 50, writerBytes: 65536,
  requestBytes: 65536, idleMs: 1600, drainMs: 100 } as const;
const taskSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,60}$/), title: z.string().max(2048), time: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.number().positive().max(1440), area: z.string().max(80) }).strict();
export const sourceSchema = z.object({ date: z.string(), timezone: z.string(), tasks: z.array(taskSchema).max(30) }).strict();
export const referenceSchema = z.object({ surfaceId: z.string(), revision: z.number().int(),
  objectId: z.string().optional(), sourceRevision: z.string() }).strict();
export const turnSchema = z.object({ id: z.string(), author: z.enum(['person', 'exo', 'source']),
  at: z.string(), kind: z.string(), revision: z.number(), reference: referenceSchema.optional(),
  utterance: z.string().optional(), utteranceId: z.string().optional(), respondsTo: z.string().optional(), clientId: z.string().optional() }).strict();
export const proposalSchema = z.object({ id: z.string(), objectId: z.string(), time: z.string(),
  sourceRevision: z.string(), surfaceId: z.string(), basedOnRevision: z.number(),
  status: z.enum(['pending', 'applying', 'accepted', 'stale', 'uncertain']), receipt: z.string().optional() }).strict();
export const planSchema = z.object({ proposalId: z.string(), receipt: z.string(), taskId: z.string(),
  time: z.string(), sourceRevision: z.string() }).strict();
export const workSchema = z.object({ id: z.string(), state: z.enum(['working', 'completed', 'canceled', 'interrupted', 'failed']),
  kind: z.string(), startedAt: z.string(), outcome: z.string().optional() }).strict();
export const snapshotSchema = z.object({ threadId: z.literal(THREAD), surfaceId: z.string(),
  revision: z.number().int(), sourceRevision: z.string(), tasks: z.array(taskSchema),
  proposals: z.array(proposalSchema), lights: z.object({ studio: z.boolean() }).strict(),
  work: z.array(workSchema), turns: z.array(turnSchema), observerTaskId: z.string(),
  bootId: z.string(), model: z.string().optional(),
  modelResponse: z.object({ operations: z.array(z.unknown()), utterance: z.string().optional(),
    model: z.string(), promptBytes: z.number(), toolCalls: z.number(), sessionId: z.string() }).strict().optional() }).strict();
export const intentSchema = z.object({ name: z.enum(['select', 'move', 'accept', 'light', 'recreate', 'ask']),
  revision: z.number().int(), surfaceId: z.string(), objectId: z.string().optional(),
  proposalId: z.string().optional(), clientId: z.string().max(80).optional(),
  utterance: z.string().max(500).optional(), actionId: z.string().optional(),
  referenceRevision: z.number().int().optional() }).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Turn = z.infer<typeof turnSchema>;
export type Intent = z.infer<typeof intentSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Work = z.infer<typeof workSchema>;
export type Reference = z.infer<typeof referenceSchema>;
