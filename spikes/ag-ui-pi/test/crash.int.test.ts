import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExoAgent } from "../src/transport.js";
import { startProcess } from "./process-support.js";
import type { Command, View } from "../src/domain.js";

for (const fault of ["after-prepare", "after-vault-write"] as const)
  test(`process restart reconciles ${fault} without blind reapplication`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "exo-crash-"));
    let running = await startProcess(dir, [
      "--crash-at",
      fault,
      "--work-delay",
      "30",
    ]);
    const command = async (c: Command) =>
      (
        await new ExoAgent(running.url, { Cookie: running.cookie }).runAgent({
          forwardedProps: { command: c },
        })
      ).result as Record<string, unknown>;
    const observer = new ExoAgent(running.url, { Cookie: running.cookie });
    const connection = observer.connectAgent().catch(() => undefined);
    try {
      await command({ kind: "plan", actor: "person", requestId: "plan" });
      await expect
        .poll(() => (observer.state as View).proposal?.status)
        .toBe("pending");
      const view = observer.state as View;
      await command({
        kind: "accept",
        actor: "person",
        requestId: "receipt",
        proposalId: view.proposal!.id,
        revision: view.revision,
      }).catch(() => undefined);
      expect(await running.exited).toBe(fault === "after-prepare" ? 87 : 88);
      observer.abortRun();
      await connection;
      running = await startProcess(dir);
      const restored = new ExoAgent(running.url, { Cookie: running.cookie });
      const recovery = restored.connectAgent();
      await expect
        .poll(() => (restored.state as View).source?.revision)
        .toBe(fault === "after-prepare" ? 1 : 2);
      expect((restored.state as View).proposal?.status).toBe(
        fault === "after-prepare" ? "stale" : "accepted",
      );
      if (fault === "after-vault-write") {
        expect(
          (
            await command({
              kind: "accept",
              actor: "person",
              requestId: "receipt",
              proposalId: view.proposal!.id,
              revision: view.revision,
            })
          ).status,
        ).toBe("applied");
        expect((restored.state as View).source.revision).toBe(2);
      }
      await restored.detachActiveRun();
      await recovery;
    } finally {
      observer.abortRun();
      await running.stop();
      await rm(dir, { recursive: true, force: true });
    }
  }, 25000);
