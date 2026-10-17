import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExoHost } from "../src/host.js";
import { serve } from "../src/server.js";
import { ExoAgent } from "../src/transport.js";

test("official observer processing restores A2UI with no resubmission and releases detach", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agui-transport-"));
  const host = await ExoHost.open(dir, { workDelayMs: 50 });
  const server = await serve(host, { port: 0 });
  const cookie = (await fetch(`${server.url}/session`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const agent = new ExoAgent(server.url, { Cookie: cookie });
  try {
    await host.command({
      kind: "plan",
      actor: "person",
      requestId: "background",
    });
    const connected = agent.connectAgent();
    await expect
      .poll(
        () => agent.messages.find((m) => m.role === "activity")?.activityType,
      )
      .toBe("a2ui-surface");
    await expect.poll(() => host.snapshot().works[0]?.status).toBe("completed");
    expect(
      agent.messages.some(
        (m) =>
          m.role === "activity" &&
          m.metadata?.surfaceId === "surface:daily-agenda",
      ),
    ).toBe(true);
    await agent.detachActiveRun();
    await connected;
    await expect.poll(() => host.metrics.observers).toBe(0);
  } finally {
    await server.close();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  }
});
