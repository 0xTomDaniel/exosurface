import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExoHost } from "../src/host.js";

test("server-started agenda work completes with no observers, then is discoverable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agui-pi-red-"));
  const host = await ExoHost.open(dir);
  try {
    const admitted = await host.startWork("plan-1");
    expect(admitted.status).toBe("accepted");
    await expect.poll(() => host.snapshot().works[0]?.status).toBe("completed");
    expect(host.snapshot().proposal?.status).toBe("pending");
    expect(
      host
        .snapshot()
        .turns.some((t) => t.author === "exo" && t.surfaceRevision),
    ).toBe(true);
  } finally {
    await host.close();
    await rm(dir, { recursive: true, force: true });
  }
});
