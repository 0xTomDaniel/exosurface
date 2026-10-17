import {
  AbstractAgent,
  type RunAgentInput,
  type BaseEvent,
} from "@ag-ui/client";
import { EventSchemas } from "@ag-ui/core";
import { Observable } from "rxjs";
import { createParser } from "eventsource-parser";
import { THREAD } from "./domain.js";

export const TRANSPORT_LIMITS = {
  connectionBytes: 4 * 1024 * 1024,
  eventBytes: 256 * 1024,
  events: 256,
  stallMs: 6000,
};
/** Owned supported transport Adapter. Official apply/verify/transform/subscribers are inherited. */
export class ExoAgent extends AbstractAgent {
  private controllers = new Set<AbortController>();
  readonly transportMetrics = {
    connections: 0,
    bytes: 0,
    events: 0,
    maxChunkBytes: 0,
  };
  constructor(
    private url: string,
    private headers: Record<string, string> = {},
  ) {
    super({ threadId: THREAD, agentId: "exo" });
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return this.transport("/ag-ui/run", input);
  }
  protected override connect(input: RunAgentInput): Observable<BaseEvent> {
    return this.transport("/ag-ui/observe", input);
  }
  override abortRun() {
    for (const controller of this.controllers) controller.abort();
    super.abortRun();
  }
  private transport(path: string, input: RunAgentInput) {
    return new Observable<BaseEvent>((subscriber) => {
      const abort = new AbortController();
      this.controllers.add(abort);
      this.transportMetrics.connections++;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let bytes = 0,
        events = 0,
        unframed = 0,
        tail = "";
      const resetTimer = () => {
        clearTimeout(timeout);
        timeout = setTimeout(
          () => abort.abort(new Error("Transport stalled")),
          TRANSPORT_LIMITS.stallMs,
        );
      };
      resetTimer();
      void (async () => {
        try {
          const response = await fetch(`${this.url}${path}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              ...this.headers,
            },
            body: JSON.stringify(input),
            credentials: "same-origin",
            signal: abort.signal,
          });
          if (!response.ok) throw new Error(`AG-UI HTTP ${response.status}`);
          if (
            !response.headers
              .get("content-type")
              ?.includes("text/event-stream") ||
            !response.body
          )
            throw new Error("Expected SSE body");
          reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8", { fatal: true });
          const parser = createParser({
            onEvent: (message) => {
              unframed = 0;
              if (
                new TextEncoder().encode(message.data).length >
                TRANSPORT_LIMITS.eventBytes
              )
                throw new Error("AG-UI event exceeds limit");
              if (++events > TRANSPORT_LIMITS.events)
                throw new Error("AG-UI connection event limit");
              this.transportMetrics.events++;
              subscriber.next(EventSchemas.parse(JSON.parse(message.data)));
            },
            onComment: () => {
              unframed = 0;
            },
            onError: (error) => {
              throw error;
            },
          });
          while (!subscriber.closed) {
            const part = await reader.read();
            if (part.done) break;
            resetTimer();
            bytes += part.value.byteLength;
            unframed += part.value.byteLength;
            this.transportMetrics.bytes += part.value.byteLength;
            this.transportMetrics.maxChunkBytes = Math.max(
              this.transportMetrics.maxChunkBytes,
              part.value.byteLength,
            );
            // Check before feeding: no unbounded line/frame can grow in the SSE parser.
            if (
              bytes > TRANSPORT_LIMITS.connectionBytes ||
              unframed > TRANSPORT_LIMITS.eventBytes
            )
              throw new Error("AG-UI stream byte limit");
            const decoded = decoder.decode(part.value, { stream: true });
            tail = (tail + decoded).slice(-4);
            parser.feed(decoded);
          }
          parser.feed(decoder.decode());
          if (
            bytes > 0 &&
            !tail.endsWith("\n\n") &&
            !tail.endsWith("\r\n\r\n") &&
            !tail.endsWith("\r\r")
          )
            throw new Error("Truncated SSE frame");
          subscriber.complete();
        } catch (error) {
          if (!subscriber.closed) {
            if (
              abort.signal.aborted &&
              !abort.signal.reason?.message?.includes("stalled")
            )
              subscriber.complete();
            else subscriber.error(error);
          }
        } finally {
          clearTimeout(timeout);
          await reader?.cancel().catch(() => undefined);
          this.controllers.delete(abort);
        }
      })();
      // Public Observable teardown owns abort. It is not a copy of the SDK HTTP transform.
      return () => {
        clearTimeout(timeout);
        abort.abort();
        void reader?.cancel().catch(() => undefined);
        this.controllers.delete(abort);
      };
    });
  }
}
