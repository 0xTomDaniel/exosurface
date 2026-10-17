import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProcess } from "./process-support.js";

test("a browser discovers server-started work and reconnects through a real host restart", async ({
  page,
}) => {
  const dir = await mkdtemp(join(tmpdir(), "exo-browser-restart-"));
  let running = await startProcess(dir, [
    "--start-work",
    "--work-delay",
    "6000",
  ]);
  const oldUrl = running.url;
  try {
    await page.goto(oldUrl);
    await expect(page.getByTestId("work").first()).toContainText("running");
    await page.getByRole("button", { name: "Detach", exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.getByTestId("work").first()).toContainText("running");
    const port = new URL(oldUrl).port;
    await running.stop();
    running = await startProcess(dir, ["--port", port]);
    await expect(page.getByTestId("work").first()).toContainText(
      "interrupted",
      { timeout: 16000 },
    );
    await expect(page.getByText("A day with room to think")).toBeVisible();
    await page.screenshot({
      path: "evidence/browser-restart.png",
      fullPage: true,
    });
  } finally {
    await page.close();
    await running.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
