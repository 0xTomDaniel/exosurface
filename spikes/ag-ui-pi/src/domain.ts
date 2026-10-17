import { z } from "zod";

export const THREAD = "thread:daily-agenda";
export const SURFACE = "surface:daily-agenda";
export const CATALOG =
  "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
export const TaskSchema = z
  .object({
    id: z.string().max(64),
    title: z.string().max(120),
    time: z.string().regex(/^\d\d:\d\d$/),
    duration: z.number().int().positive().max(240),
    locked: z.boolean(),
  })
  .strict();
export const SourceSchema = z
  .object({
    date: z.string(),
    revision: z.number().int().positive(),
    tasks: z.array(TaskSchema).max(12),
    lastAcceptance: z.string().optional(),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;
export const ReferenceSchema = z
  .object({
    surfaceId: z.literal(SURFACE),
    revision: z.number().int().positive(),
    objectId: z.string().max(64),
  })
  .strict();
export const CommandSchema = z
  .object({
    kind: z.enum([
      "plan",
      "move",
      "select",
      "accept",
      "cancel",
      "light",
      "ask",
      "history",
    ]),
    requestId: z.string().min(1).max(96),
    actor: z.enum(["person", "voice"]),
    selection: ReferenceSchema.optional(),
    utterance: z.string().max(1500).optional(),
    proposalId: z.string().optional(),
    workId: z.string().optional(),
    revision: z.number().int().positive().optional(),
    mode: z.enum(["deterministic", "pi"]).default("deterministic"),
  })
  .strict();
export type Command = z.input<typeof CommandSchema>;
export const TurnSchema = z
  .object({
    id: z.string(),
    author: z.enum(["person", "voice", "exo", "source"]),
    kind: z.string(),
    at: z.string(),
    surfaceRevision: z.number().optional(),
    sourceRevision: z.number(),
    reference: ReferenceSchema.optional(),
    respondsTo: z.string().optional(),
    utterance: z.string().optional(),
  })
  .strict();
export type Turn = z.infer<typeof TurnSchema>;
export const WorkSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    status: z.enum([
      "running",
      "completed",
      "cancelled",
      "interrupted",
      "failed",
    ]),
    turnId: z.string(),
    mode: z.enum(["deterministic", "pi"]),
    outcome: z.string().optional(),
  })
  .strict();
export const ProposalSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    time: z.string(),
    sourceRevision: z.number(),
    surfaceRevision: z.number(),
    status: z.enum(["pending", "accepted", "stale"]),
    turnId: z.string(),
    receiptId: z.string().optional(),
  })
  .strict();
export const ViewSchema = z
  .object({
    threadId: z.literal(THREAD),
    surfaceId: z.literal(SURFACE),
    sequence: z.number().int(),
    revision: z.number().int(),
    source: SourceSchema,
    light: z.boolean(),
    works: z.array(WorkSchema).max(32),
    turns: z.array(TurnSchema).max(256),
    proposal: ProposalSchema.optional(),
    notice: z.string().optional(),
  })
  .strict();
export type View = z.infer<typeof ViewSchema>;
export type A2Operation = Record<string, unknown>;
export const HistoricalSchema = z
  .object({
    revision: z.number(),
    source: SourceSchema,
    turnId: z.string(),
    light: z.boolean(),
    operations: z.array(z.record(z.string(), z.unknown())).max(6),
  })
  .strict();
export type Historical = z.infer<typeof HistoricalSchema>;
export const ReceiptSchema = z
  .object({
    requestId: z.string(),
    fingerprint: z.string(),
    result: z.record(z.string(), z.unknown()),
  })
  .strict();
export const StoreSchema = z
  .object({
    version: z.literal(1),
    view: ViewSchema,
    revisions: z.array(HistoricalSchema).max(128),
    receipts: z.array(ReceiptSchema).max(256),
    pendingEffect: z
      .object({
        requestId: z.string(),
        proposalId: z.string(),
        taskId: z.string(),
        time: z.string(),
        sourceRevision: z.number(),
        turnId: z.string(),
      })
      .optional(),
  })
  .strict();
export type Stored = z.infer<typeof StoreSchema>;
export type Result = Record<string, unknown> & { status: string };
export type Projection = {
  threadId: string;
  current: View;
  exactReference: Historical | null;
  recentTurns: Turn[];
  instructions: string;
};
export type ExecutionResult = {
  utterance?: string;
  taskId?: string;
  time?: string;
  model?: string;
  toolCalls?: string[];
  input?: Projection;
};
