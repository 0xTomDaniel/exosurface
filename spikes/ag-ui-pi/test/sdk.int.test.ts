import { test, expect } from "vitest";
import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { EventSchemas, EventType } from "@ag-ui/core";
import { of } from "rxjs";

// Literal protocol examples cross the public supported run Seam; no SDK internals are copied.
class ProtocolProbe extends AbstractAgent {
  constructor(private events: unknown[]) {
    super({ threadId: "thread" });
  }
  run(_input: RunAgentInput) {
    return of(
      ...(this.events.map((e) => EventSchemas.parse(e)) as BaseEvent[]),
    );
  }
}
test("published connectAgent swallows unimplemented connect into an empty result, with no observation", async () => {
  const agent = new ProtocolProbe([]);
  expect(await agent.connectAgent()).toEqual({
    result: undefined,
    newMessages: [],
  });
  expect(agent.isRunning).toBe(false);
});

test("official accumulation propagates text/activity metadata and applies an activity delta", async () => {
  const agent = new ProtocolProbe([
    { type: "RUN_STARTED", threadId: "thread", runId: "run" },
    {
      type: "TEXT_MESSAGE_START",
      messageId: "words",
      role: "assistant",
      metadata: { turnId: "turn:1" },
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "words",
      delta: "The original plan.",
    },
    { type: "TEXT_MESSAGE_END", messageId: "words" },
    {
      type: "ACTIVITY_SNAPSHOT",
      messageId: "visual",
      activityType: "a2ui-surface",
      content: { revision: 1 },
      metadata: { turnId: "turn:1" },
    },
    {
      type: "ACTIVITY_DELTA",
      messageId: "visual",
      activityType: "a2ui-surface",
      patch: [{ op: "replace", path: "/revision", value: 2 }],
      metadata: { turnId: "turn:2" },
    },
    { type: "RUN_FINISHED", threadId: "thread", runId: "run" },
  ]);
  await agent.runAgent();
  expect(agent.messages.find((m) => m.id === "words")?.metadata?.turnId).toBe(
    "turn:1",
  );
  const visual = agent.messages.find((m) => m.id === "visual");
  expect(visual?.metadata?.turnId).toBe("turn:2");
  expect(visual?.role === "activity" && visual.content.revision).toBe(2);
});

test("official verifier rejects invalid publication ordering instead of silently rendering it", async () => {
  const agent = new ProtocolProbe([
    { type: EventType.RUN_STARTED, threadId: "thread", runId: "a" },
    { type: EventType.RUN_STARTED, threadId: "thread", runId: "b" },
  ]);
  await expect(agent.runAgent()).rejects.toThrow();
});
