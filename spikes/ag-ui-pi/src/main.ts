import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { z } from "zod";
import { ExoHost } from "./host.js";
import { serve } from "./server.js";
import { executePi } from "./pi.js";

const args = parseArgs({
  options: {
    port: { type: "string", default: "61002" },
    state: {
      type: "string",
      default: resolve(tmpdir(), "exosurface-ag-ui-pi"),
    },
    "work-delay": { type: "string", default: "650" },
    "crash-at": { type: "string" },
    production: { type: "boolean", default: false },
    "start-work": { type: "boolean", default: false },
  },
});
const port = z.coerce.number().int().min(0).max(65535).parse(args.values.port);
const delay = z.coerce
  .number()
  .min(0)
  .max(60000)
  .parse(args.values["work-delay"]);
const crashAt = z
  .enum(["after-prepare", "after-vault-write"])
  .optional()
  .parse(args.values["crash-at"]);
const host = await ExoHost.open(resolve(args.values.state!), {
  workDelayMs: delay,
  crashAt,
  executePi,
});
const vite = args.values.production
  ? undefined
  : await (
      await import("vite")
    ).createServer({
      server: { middlewareMode: true },
      appType: "spa",
      logLevel: "warn",
    });
const server = await serve(host, { port, vite });
console.log(
  JSON.stringify({
    url: server.url,
    state: host.dir,
    transport: "AG-UI",
    a2ui: "v0.9",
  }),
);
if (args.values["start-work"])
  await host.startWork(`server-start:${Date.now()}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void (async () => {
      await server.close();
      await host.close();
      await vite?.close();
      process.exit(0);
    })();
  });
