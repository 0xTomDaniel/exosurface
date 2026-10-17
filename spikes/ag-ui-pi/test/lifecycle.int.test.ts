import { test, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExoHost } from "../src/host.js";
import { serve } from "../src/server.js";
import { ExoAgent } from "../src/transport.js";
import { SURFACE } from "../src/domain.js";
import type { Command, View } from "../src/domain.js";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "exo-lifecycle-"));
  const host = await ExoHost.open(dir, { workDelayMs: 200, pollMs: 40 });
  const server = await serve(host, { port: 0 });
  const cookie = (await fetch(`${server.url}/session`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const agent = () => new ExoAgent(server.url, { Cookie: cookie });
  const command = async (c: Command) =>
    (await agent().runAgent({ forwardedProps: { command: c } }))
      .result as Record<string, unknown>;
  return {
    host,
    server,
    agent,
    command,
    dir,
    cookie,
    close: async () => {
      await server.close();
      await host.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("two independent HTTP clients accept concurrently and redeliver without a second source write", async () => {
  const f = await fixture();
  try {
    await f.command({
      kind: "move",
      actor: "person",
      requestId: "move",
      selection: { surfaceId: SURFACE, revision: 1, objectId: "sketch" },
    });
    await expect.poll(() => f.host.snapshot().proposal?.status).toBe("pending");
    const view = f.host.snapshot();
    const accepted = await Promise.all(
      ["a", "b"].map((requestId) =>
        f.command({
          kind: "accept",
          actor: "person",
          requestId,
          proposalId: view.proposal!.id,
          revision: view.revision,
        }),
      ),
    );
    expect(accepted.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(accepted[0].receiptId).toBe(accepted[1].receiptId);
    expect(f.host.snapshot().source.revision).toBe(2);
    expect(await readFile(f.host.vaultPath, "utf8")).toContain(
      "These Markdown frontmatter records are authoritative.",
    );
    expect(
      await readFile(join(f.dir, "vault", "Agenda.base"), "utf8"),
    ).toContain("name: Today");
    expect(
      f.host.snapshot().turns.filter((t) => t.kind === "acceptance"),
    ).toHaveLength(1);
    const repeated = await f.command({
      kind: "accept",
      actor: "person",
      requestId: "a",
      proposalId: view.proposal!.id,
      revision: view.revision,
    });
    expect(repeated.status).toBe("applied");
    expect(f.host.snapshot().source.revision).toBe(2);
    const conflict = await f.command({
      kind: "light",
      actor: "person",
      requestId: "a",
    });
    expect(conflict.status).toBe("conflict");
  } finally {
    await f.close();
  }
});

test("source changes during attachment are coherent and make the original action stale", async () => {
  const f = await fixture();
  const observer = f.agent();
  try {
    const connection = observer.connectAgent();
    await expect.poll(() => (observer.state as View).revision).toBe(1);
    const source = await readFile(f.host.vaultPath, "utf8");
    await writeFile(
      f.host.vaultPath,
      source
        .replace("revision: 1", "revision: 2")
        .replace("time: '11:00'", "time: '14:30'"),
    );
    const stale = await f.command({
      kind: "move",
      actor: "person",
      requestId: "stale",
      selection: { surfaceId: SURFACE, revision: 1, objectId: "sketch" },
    });
    expect(stale.status).toBe("stale");
    await expect.poll(() => (observer.state as View).source.revision).toBe(2);
    expect(
      (observer.state as View).source.tasks.find((t) => t.id === "sketch")
        ?.time,
    ).toBe("14:30");
    expect(
      f.host.history(1)?.source.tasks.find((t) => t.id === "sketch")?.time,
    ).toBe("11:00");
    expect(
      f.host.context({ surfaceId: SURFACE, revision: 1, objectId: "sketch" })
        .exactReference?.operations.length,
    ).toBe(3);
    await observer.detachActiveRun();
    await connection;
  } finally {
    observer.abortRun();
    await f.close();
  }
});

test("detach leaves other clients and work intact; explicit cancellation is acknowledged by execution", async () => {
  const f = await fixture();
  const a = f.agent(),
    b = f.agent();
  const ca = a.connectAgent(),
    cb = b.connectAgent();
  try {
    await expect.poll(() => f.host.metrics.observers).toBe(2);
    const work = await f.command({
      kind: "plan",
      actor: "person",
      requestId: "work",
    });
    await a.detachActiveRun();
    await ca;
    expect(f.host.snapshot().works[0].status).toBe("running");
    const cancel = await f.command({
      kind: "cancel",
      actor: "person",
      requestId: "cancel",
      workId: String(work.workId),
    });
    expect(cancel.status).toBe("cancelling");
    await expect
      .poll(() => f.host.snapshot().works[0].status)
      .toBe("cancelled");
    await expect
      .poll(() => (b.state as View).works[0]?.status)
      .toBe("cancelled");
    expect(f.host.snapshot().source.revision).toBe(1);
    const second = await f.command({
      kind: "plan",
      actor: "person",
      requestId: "finish",
    });
    await expect
      .poll(() => f.host.snapshot().works[1].status)
      .toBe("completed");
    const late = await f.command({
      kind: "cancel",
      actor: "person",
      requestId: "late-cancel",
      workId: String(second.workId),
    });
    expect(late.status).toBe("completed");
    await b.detachActiveRun();
    await cb;
  } finally {
    a.abortRun();
    b.abortRun();
    await f.close();
  }
});

test("restart exposes interrupted work, current sources and exact historical expressions without retry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "exo-restart-"));
  let host = await ExoHost.open(dir, { workDelayMs: 1000 });
  try {
    await host.command({
      kind: "plan",
      actor: "person",
      requestId: "interrupted",
    });
    await host.close();
    host = await ExoHost.open(dir);
    expect(host.snapshot().works[0].status).toBe("interrupted");
    expect(host.history(1)?.source.revision).toBe(1);
    expect(
      (
        await host.command({
          kind: "plan",
          actor: "person",
          requestId: "interrupted",
        })
      ).status,
    ).toBe("accepted");
    expect(host.snapshot().works).toHaveLength(1);
    expect(host.snapshot().works[0].status).toBe("interrupted");
  } finally {
    await host.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing session, wrong thread, forged offered action and oversized input are rejected", async () => {
  const f = await fixture();
  try {
    const body = {
      threadId: "thread:daily-agenda",
      runId: "bad",
      messages: [],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    };
    expect(
      (
        await fetch(`${f.server.url}/ag-ui/observe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${f.server.url}/ag-ui/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: f.cookie },
          body: JSON.stringify({ ...body, threadId: "someone-else" }),
        })
      ).status,
    ).toBe(404);
    const forged = {
      ...body,
      forwardedProps: {
        a2uiAction: {
          name: "light",
          surfaceId: SURFACE,
          sourceComponentId: "root",
          timestamp: new Date().toISOString(),
          context: { revision: 1 },
        },
        requestId: "forged",
      },
    };
    expect(
      (
        await fetch(`${f.server.url}/ag-ui/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: f.cookie },
          body: JSON.stringify(forged),
        })
      ).status,
    ).toBe(403);
    expect(f.host.snapshot().light).toBe(false);
    expect(
      (
        await fetch(`${f.server.url}/ag-ui/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: f.cookie },
          body: JSON.stringify({
            ...body,
            state: { padding: "x".repeat(70000) },
          }),
        })
      ).status,
    ).toBe(400);
  } finally {
    await f.close();
  }
});
