import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state =
  process.env.EXO_BROWSER_STATE ??
  mkdtempSync(join(tmpdir(), "exo-agui-browser-"));
process.env.EXO_BROWSER_STATE = state;
export default defineConfig({
  testDir: "test",
  testMatch: "*.browser.test.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 40000,
  use: {
    baseURL: "http://127.0.0.1:61002",
    viewport: { width: 1400, height: 1100 },
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  webServer: {
    command: `npm start -- --port 61002 --state ${state} --work-delay 1400`,
    url: "http://127.0.0.1:61002/session",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
