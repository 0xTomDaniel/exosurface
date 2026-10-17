import { EventSchemas, EventType, type BaseEvent } from "@ag-ui/core";
import { type View } from "./domain.js";
import { surfaceOperations } from "./surface.js";

export function publication(view: View): BaseEvent[] {
  const runId = `publication:${view.sequence}`;
  const latest = view.turns.at(-1);
  const visual = view.turns.find((t) => t.surfaceRevision === view.revision);
  const utterances = view.turns.filter((t) => t.utterance).slice(-12);
  const streamed = utterances.at(-1);
  const metadata = {
    turnId: visual?.id ?? "",
    author: visual?.author ?? "exo",
    publicationTurnId: latest?.id ?? "",
    surfaceId: view.surfaceId,
    surfaceRevision: view.revision,
    sequence: view.sequence,
  };
  const events: unknown[] = [
    { type: EventType.RUN_STARTED, threadId: view.threadId, runId },
    { type: EventType.STATE_SNAPSHOT, snapshot: view },
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: utterances
        .filter((t) => t.id !== streamed?.id)
        .map((t) => ({
          id: `utterance:${t.id}`,
          role: t.author === "exo" ? "assistant" : "user",
          content: t.utterance,
          metadata: {
            turnId: t.id,
            author: t.author,
            reference: t.reference ?? null,
          },
        })),
    },
  ];
  if (streamed)
    events.push(
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: `utterance:${streamed.id}`,
        role: streamed.author === "exo" ? "assistant" : "user",
        metadata: {
          turnId: streamed.id,
          author: streamed.author,
          reference: streamed.reference ?? null,
        },
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: `utterance:${streamed.id}`,
        delta: streamed.utterance,
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: `utterance:${streamed.id}`,
      },
    );
  events.push(
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: `a2ui:${view.surfaceId}`,
      activityType: "a2ui-surface",
      content: { a2ui_operations: surfaceOperations(view) },
      replace: true,
      metadata,
    },
    { type: EventType.RUN_FINISHED, threadId: view.threadId, runId },
  );
  return events.map((e) => EventSchemas.parse(e));
}
