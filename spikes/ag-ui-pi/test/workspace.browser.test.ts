import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.describe.configure({ mode: "serial" });

test("actual Lit A2UI agenda survives detach/reconnect and preserves a combined visual turn", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("A day with room to think")).toBeVisible();
  await expect(
    page.getByText("Sketch the garden plan", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select", exact: true })
    .nth(1)
    .click();
  await expect(page.getByTestId("selection")).toContainText("sketch");
  await page
    .getByLabel("Add words, if they help")
    .fill("Move this after lunch");
  await page
    .getByRole("button", { name: "Propose the move", exact: true })
    .click();
  await expect(page.getByTestId("work").first()).toContainText("running");
  await page.getByRole("button", { name: "Detach", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByTestId("work").first()).toContainText("completed");
  await expect(
    page.getByRole("button", { name: "Use this version", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("history-list")).toContainText(
    "Move this after lunch",
  );
  await page
    .getByRole("button", { name: "View revision 1", exact: true })
    .click();
  await expect(
    page.getByTestId("historical-surface").getByText("11:00 · 60 min"),
  ).toBeVisible();
  await expect(
    page.getByTestId("current-surface").getByText("Proposal · pending"),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/browser-agenda.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("two browser clients accept once, receive idle source edits, preserve focused words and control the lamp", async ({
  browser,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage();
  await Promise.all([a.goto("/"), b.goto("/")]);
  await expect(
    a.getByRole("button", { name: "Use this version", exact: true }),
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Use this version", exact: true }),
  ).toBeVisible();
  // Both browsers dispatch from the same displayed revision before either observes the change.
  await Promise.all([
    a.getByRole("button", { name: "Use this version", exact: true }).click(),
    b.getByRole("button", { name: "Use this version", exact: true }).click(),
  ]);
  await expect(
    a.getByText("Proposal · accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    b.getByText("Proposal · accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    a.getByText("source revision 2", { exact: false }),
  ).toBeVisible();
  const field = a.getByLabel("Add words, if they help");
  await field.fill("Keep this thought while sources change");
  await field.focus();
  const { readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const path = join(process.env.EXO_BROWSER_STATE!, "vault", "agenda.md");
  await writeFile(
    path,
    (await readFile(path, "utf8"))
      .replace("revision: 2", "revision: 3")
      .replace("time: 13:00", "time: 14:30"),
  );
  await expect(a.getByText("14:30 · 60 min", { exact: true })).toBeVisible();
  await expect(b.getByText("14:30 · 60 min", { exact: true })).toBeVisible();
  await expect(field).toHaveValue("Keep this thought while sources change");
  await expect(field).toBeFocused();
  await a.getByRole("button", { name: "Turn lamp on", exact: true }).click();
  await expect(b.getByText("The lamp is on.", { exact: true })).toBeVisible();
  await a.setViewportSize({ width: 390, height: 844 });
  expect(
    await a.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await a.screenshot({ path: "evidence/browser-mobile.png", fullPage: true });
  await Promise.all([a.close(), b.close()]);
});

test("an actual Pi model continues from a restored historical visual referent in the browser", async ({
  page,
}) => {
  test.skip(
    process.env.EXO_LIVE_PI !== "1",
    "Explicit opt-in for live model cost; deterministic tests are not model proof.",
  );
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "View revision 1", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Reference sketch at revision 1",
      exact: true,
    })
    .click();
  await page.getByLabel("Exo execution").selectOption("pi");
  await page
    .getByLabel("Add words, if they help")
    .fill(
      "What exact task did I select in this old visual revision? Give its original time, the time I accepted, and the time the external source now shows.",
    );
  await page
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  await expect(page.getByTestId("work").first()).toContainText("ask");
  await expect(page.getByTestId("work").first()).toContainText("completed", {
    timeout: 100000,
  });
  const history = page.getByTestId("history-list");
  await expect(history).toContainText("11:00");
  await expect(history).toContainText("13:00");
  await expect(history).toContainText("14:30");
  await expect(
    page.getByTestId("historical-surface").getByText("11:00 · 60 min"),
  ).toBeVisible();
  await expect(
    page.getByTestId("current-surface").getByText("14:30 · 60 min"),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/browser-pi-history.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("20 real browser detach/attach cycles and a stalled browser recover a bounded current projection", async ({
  page,
}) => {
  const { writeFile } = await import("node:fs/promises");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("A day with room to think")).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Runtime.getHeapUsage");
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "Detach", exact: true }).click();
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(
      page.getByText("The day is live", { exact: false }),
    ).toBeVisible();
  }
  const stalled = page.evaluate(() => {
    const end = performance.now() + 1000;
    while (performance.now() < end) {
      /* deliberate main-thread stall */
    }
  });
  for (let i = 0; i < 6; i++) {
    const response = await page.request.post("/ag-ui/run", {
      data: {
        threadId: "thread:daily-agenda",
        runId: `browser-stall-${i}`,
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {
          command: {
            kind: "light",
            actor: "voice",
            requestId: `browser-stall-${i}`,
          },
        },
      },
    });
    expect(response.ok()).toBe(true);
  }
  await stalled;
  await expect(
    page.getByText("The lamp is on.", { exact: true }),
  ).toBeVisible();
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Runtime.getHeapUsage");
  const client = JSON.parse(
    (await page.getByTestId("client-metrics").textContent())!,
  ) as { messages: number };
  expect(client.messages).toBeLessThanOrEqual(13);
  await page.getByRole("button", { name: "Detach", exact: true }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get("/metrics");
      return ((await response.json()) as { host: { observers: number } }).host
        .observers;
    })
    .toBe(0);
  const response = await page.request.get("/metrics");
  const host: unknown = await response.json();
  await writeFile(
    "evidence/browser-resources.json",
    JSON.stringify(
      {
        status: "PASS",
        churnCycles: 20,
        mainThreadStallMs: 1000,
        publicationsDuringStall: 6,
        before,
        after,
        client,
        host,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
