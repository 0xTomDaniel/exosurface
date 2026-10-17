import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { RunAgentInputSchema, EventSchemas, EventType } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import { A2uiClientActionSchema } from "@a2ui/web_core/v0_9";
import type { ViteDevServer } from "vite";
import { ExoHost } from "./host.js";
import { publication } from "./publication.js";
import { CommandSchema, THREAD, type Command } from "./domain.js";

export const SERVER_LIMITS = {
  observers: 16,
  leaseMs: 3000,
  publications: 16,
  writerBytes: 512 * 1024,
  frameBytes: 256 * 1024,
  requestBytes: 64 * 1024,
};
export async function serve(
  host: ExoHost,
  options: { port: number; vite?: ViteDevServer; leaseMs?: number },
) {
  const token = randomUUID();
  const encoder = new EventEncoder();
  const metrics = {
    active: 0,
    total: 0,
    dropped: 0,
    maxWriterBytes: 0,
    wireBytes: 0,
    maxPublicationBytes: 0,
    published: 0,
  };
  const streams = new Set<ServerResponse>();
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  async function input(req: IncomingMessage) {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += data.length;
      if (bytes > SERVER_LIMITS.requestBytes)
        throw new Error("Request too large");
      chunks.push(data);
    }
    return RunAgentInputSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  }
  const server = createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? "/", `http://${req.headers.host}`)
        .pathname;
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) {
        json(res, 403, { error: "origin rejected" });
        return;
      }
      if (path === "/session") {
        res.setHeader(
          "Set-Cookie",
          `exo=${token}; HttpOnly; SameSite=Strict; Path=/`,
        );
        json(res, 200, { threadId: THREAD });
        return;
      }
      if (path.startsWith("/ag-ui/") || path === "/metrics") {
        if (
          !req.headers.cookie
            ?.split(";")
            .some((v) => v.trim() === `exo=${token}`)
        ) {
          json(res, 401, { error: "session required" });
          return;
        }
      }
      if (path === "/metrics") {
        const file = await stat(join(host.dir, "checkpoint.json"));
        json(res, 200, {
          transport: metrics,
          host: host.metrics,
          checkpointBytes: file.size,
          memory: process.memoryUsage(),
        });
        return;
      }
      if (path === "/ag-ui/run" && req.method === "POST") {
        const body = await input(req);
        if (body.threadId !== THREAD) {
          json(res, 404, { error: "unknown thread" });
          return;
        }
        const props = body.forwardedProps as Record<string, unknown>;
        let raw = props.command;
        if (props.a2uiAction) {
          const action = A2uiClientActionSchema.parse(props.a2uiAction);
          const { revision, objectId, proposalId } = action.context;
          const candidate = {
            kind: action.name,
            requestId: props.requestId,
            actor: "person",
            mode: props.mode ?? "deterministic",
            utterance: props.utterance,
            revision,
            proposalId,
            ...(objectId
              ? {
                  selection: {
                    surfaceId: action.surfaceId,
                    revision,
                    objectId,
                  },
                }
              : {}),
          };
          // Validate the action source against the exact saved presentation, not client state.
          const historic =
            typeof revision === "number" ? host.history(revision) : undefined;
          const components = historic?.operations.flatMap((op) => {
            const update = op.updateComponents as
              | { components?: Record<string, unknown>[] }
              | undefined;
            return update?.components ?? [];
          });
          const component = components?.find(
            (c) => c.id === action.sourceComponentId,
          );
          const offered = (
            component?.action as
              | { event?: { name?: string; context?: Record<string, unknown> } }
              | undefined
          )?.event;
          if (
            offered?.name !== action.name ||
            JSON.stringify(offered.context) !== JSON.stringify(action.context)
          ) {
            json(res, 403, { error: "action not offered by exact surface" });
            return;
          }
          raw = candidate;
        }
        const command = CommandSchema.parse(raw);
        const result = await host.command(command as Command);
        res.writeHead(200, {
          "Content-Type": encoder.getContentType(),
          "Cache-Control": "no-store",
        });
        for (const event of [
          { type: EventType.RUN_STARTED, threadId: THREAD, runId: body.runId },
          {
            type: EventType.RUN_FINISHED,
            threadId: THREAD,
            runId: body.runId,
            result,
          },
        ])
          res.write(encoder.encode(EventSchemas.parse(event)));
        res.end();
        return;
      }
      if (path === "/ag-ui/observe" && req.method === "POST") {
        const body = await input(req);
        if (body.threadId !== THREAD) {
          json(res, 404, { error: "unknown thread" });
          return;
        }
        if (metrics.active >= SERVER_LIMITS.observers) {
          json(res, 429, { error: "observer limit" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": encoder.getContentType(),
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        streams.add(res);
        metrics.active++;
        metrics.total++;
        let unsub = () => {};
        let cleaned = false;
        let publications = 0;
        let blocked = false;
        let pending: string | undefined;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          clearTimeout(lease);
          clearInterval(heartbeat);
          unsub();
          streams.delete(res);
          metrics.active--;
        };
        const finish = () => {
          cleanup();
          res.end();
        };
        const lease = setTimeout(
          finish,
          options.leaseMs ?? SERVER_LIMITS.leaseMs,
        );
        const heartbeat = setInterval(() => {
          if (!blocked && !cleaned) res.write(": observer alive\n\n");
        }, 750);
        res.once("close", cleanup);
        res.once("error", cleanup);
        const write = (frame: string) => {
          if (cleaned) return;
          if (
            res.writableLength + Buffer.byteLength(frame) >
            SERVER_LIMITS.writerBytes
          ) {
            metrics.dropped++;
            cleanup();
            res.destroy();
            return;
          }
          const ok = res.write(frame);
          metrics.wireBytes += Buffer.byteLength(frame);
          metrics.maxWriterBytes = Math.max(
            metrics.maxWriterBytes,
            res.writableLength,
          );
          metrics.published++;
          publications++;
          if (!ok) blocked = true;
          if (publications >= SERVER_LIMITS.publications) finish();
        };
        res.on("drain", () => {
          blocked = false;
          if (pending) {
            const value = pending;
            pending = undefined;
            write(value);
          }
        });
        const unsubscribe = host.observe((view) => {
          const frame = publication(view)
            .map((e) => encoder.encode(e))
            .join("");
          metrics.maxPublicationBytes = Math.max(
            metrics.maxPublicationBytes,
            Buffer.byteLength(frame),
          );
          if (Buffer.byteLength(frame) > SERVER_LIMITS.frameBytes) {
            metrics.dropped++;
            cleanup();
            res.destroy();
            return;
          }
          // One latest complete snapshot can wait; no unbounded queue of obsolete views.
          if (blocked) {
            pending = frame;
            return;
          }
          write(frame);
        });
        unsub = unsubscribe;
        if (cleaned) unsub();
        return;
      }
      if (options.vite) {
        options.vite.middlewares(req, res, () =>
          json(res, 404, { error: "not found" }),
        );
        return;
      }
      if (path === "/" || path === "/index.html") {
        try {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            await readFile(new URL("../dist/index.html", import.meta.url)),
          );
        } catch {
          json(res, 404, {
            error: "Build the browser or start in development mode",
          });
        }
        return;
      }
      if (path.startsWith("/assets/") && !path.includes("..")) {
        try {
          const data = await readFile(
            new URL(`../dist${path}`, import.meta.url),
          );
          res.writeHead(200, {
            "Content-Type": path.endsWith(".js")
              ? "text/javascript"
              : "text/css",
          });
          res.end(data);
        } catch {
          json(res, 404, { error: "missing asset" });
        }
        return;
      }
      json(res, 404, { error: "not found" });
    })().catch((error) => {
      if (!res.headersSent)
        json(res, 400, {
          error: error instanceof Error ? error.message : "invalid input",
        });
      else res.destroy();
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(options.port, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    metrics,
    close: async () => {
      for (const res of streams) res.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
