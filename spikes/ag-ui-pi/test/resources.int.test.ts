import { test, expect } from "vitest";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request, createServer } from "node:http";
import { ExoHost } from "../src/host.js";
import { serve, SERVER_LIMITS } from "../src/server.js";
import { ExoAgent, TRANSPORT_LIMITS } from "../src/transport.js";
import type { View } from "../src/domain.js";

const input = {
  threadId: "thread:daily-agenda",
  runId: "observation",
  messages: [],
  state: {},
  tools: [],
  context: [],
  forwardedProps: {},
};
test("100 HTTP attach/detaches and bounded slow/stalled observers release resources", async () => {
  const dir = await mkdtemp(join(tmpdir(), "exo-resources-"));
  const host = await ExoHost.open(dir, { pollMs: 50 });
  const server = await serve(host, { port: 0 });
  const cookie = (await fetch(`${server.url}/session`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const baseline = process.memoryUsage();
  let maxMessages = 0,
    maxPendingEvents = 0;
  const churn = [];
  try {
    for (let i = 0; i < 100; i++) {
      const agent = new ExoAgent(server.url, { Cookie: cookie });
      const connected = agent.connectAgent();
      await expect.poll(() => agent.messages.length, { interval: 1 }).toBe(1);
      maxMessages = Math.max(maxMessages, agent.messages.length);
      await agent.detachActiveRun();
      await connected;
      await expect.poll(() => host.metrics.observers, { interval: 1 }).toBe(0);
      if (i % 20 === 0)
        churn.push({
          cycle: i,
          observers: host.metrics.observers,
          heapUsed: process.memoryUsage().heapUsed,
        });
    }
    const slow = new ExoAgent(server.url, { Cookie: cookie });
    let appliedEvents = 0;
    const slowConnection = slow.connectAgent(
      {},
      {
        onEvent: async () => {
          maxPendingEvents = Math.max(
            maxPendingEvents,
            slow.transportMetrics.events - appliedEvents,
          );
          await new Promise((resolve) => setTimeout(resolve, 15));
          appliedEvents++;
        },
      },
    );
    const stalled = request(
      `${server.url}/ag-ui/observe`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
      },
      (res) => {
        res.pause();
      },
    );
    stalled.end(JSON.stringify(input));
    await expect.poll(() => host.metrics.observers).toBe(2);
    for (let i = 0; i < 40; i++)
      await host.command({
        kind: "light",
        actor: "person",
        requestId: `resource-light-${i}`,
      });
    await slowConnection;
    stalled.destroy();
    await expect.poll(() => host.metrics.observers).toBe(0);
    expect(server.metrics.maxWriterBytes).toBeLessThanOrEqual(
      SERVER_LIMITS.writerBytes,
    );
    expect(server.metrics.maxPublicationBytes).toBeLessThanOrEqual(
      SERVER_LIMITS.frameBytes,
    );
    expect(slow.transportMetrics.events).toBeLessThanOrEqual(
      TRANSPORT_LIMITS.events,
    );
    expect(slow.messages).toHaveLength(1);
    expect(host.snapshot().revision).toBe(41);
    const fresh = new ExoAgent(server.url, { Cookie: cookie });
    const freshConnection = fresh.connectAgent();
    await expect.poll(() => (fresh.state as View).revision).toBe(41);
    await fresh.detachActiveRun();
    await freshConnection;
    await expect.poll(() => host.metrics.observers).toBe(0);
    const report = {
      status: "PASS",
      scope: {
        churnCycles: 100,
        surfacePublications: 40,
        slowSubscriberDelayMs: 15,
        stalledReaders: 1,
      },
      limits: { server: SERVER_LIMITS, client: TRANSPORT_LIMITS },
      maxMessages,
      maxPendingEvents,
      transport: server.metrics,
      host: host.metrics,
      checkpointBytes: (await stat(join(dir, "checkpoint.json"))).size,
      baseline,
      after: process.memoryUsage(),
      churn,
    };
    await writeFile("evidence/resources.json", JSON.stringify(report, null, 2));
  } finally {
    await server.close();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 25000);

for (const scenario of [
  "http-failure",
  "truncated-frame",
  "oversized-frame",
  "stalled-response",
  "invalid-event",
] as const)
  test(`bounded transport rejects ${scenario} through the official client`, async () => {
    let active = 0;
    const server = createServer((req, res) => {
      active++;
      res.once("close", () => {
        active--;
      });
      req.resume();
      if (scenario === "http-failure") {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.flushHeaders();
      if (scenario === "stalled-response") return;
      if (scenario === "truncated-frame") {
        res.end('data: {"type":"RUN_STARTED"');
        return;
      }
      if (scenario === "oversized-frame") {
        res.end(`data: ${"x".repeat(300000)}`);
        return;
      }
      res.end('data: {"type":"NOT_AN_AGUI_EVENT"}\n\n');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const agent = new ExoAgent(`http://127.0.0.1:${address.port}`);
      await expect(agent.connectAgent()).rejects.toThrow();
      await expect.poll(() => active).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10000);
