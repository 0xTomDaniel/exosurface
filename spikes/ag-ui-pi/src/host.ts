import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import {
  CommandSchema,
  SourceSchema,
  StoreSchema,
  THREAD,
  SURFACE,
  type Command,
  type View,
  type Stored,
  type Turn,
  type Result,
  type Projection,
  type ExecutionResult,
} from "./domain.js";
import { surfaceOperations } from "./surface.js";

export type HostOptions = {
  workDelayMs?: number;
  pollMs?: number;
  crashAt?: "after-prepare" | "after-vault-write";
  executePi?: (p: Projection, s: AbortSignal) => Promise<ExecutionResult>;
};
export class ExoHost {
  private state!: Stored;
  private serial: Promise<unknown> = Promise.resolve();
  private observers = new Set<(view: View) => void>();
  private jobs = new Map<string, AbortController>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  readonly metrics = {
    writes: 0,
    bytesWritten: 0,
    observers: 0,
    maxObservers: 0,
    sourceErrors: 0,
  };
  private constructor(
    readonly dir: string,
    private options: HostOptions,
  ) {}
  static async open(dir: string, options: HostOptions = {}) {
    const host = new ExoHost(dir, options);
    await host.initialize();
    return host;
  }
  get vaultPath() {
    return join(this.dir, "vault", "agenda.md");
  }
  private async readSource() {
    const raw = await readFile(this.vaultPath, "utf8");
    if (raw.length > 65536) throw new Error("Vault source exceeds 64 KiB");
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!match) throw new Error("Missing Markdown frontmatter");
    return SourceSchema.parse(parse(match[1]));
  }
  private async initialize() {
    await mkdir(join(this.dir, "vault"), { recursive: true });
    try {
      await stat(this.vaultPath);
    } catch {
      await copyFile(
        new URL("../fixtures/vault/agenda.md", import.meta.url),
        this.vaultPath,
      );
      await copyFile(
        new URL("../fixtures/vault/Agenda.base", import.meta.url),
        join(this.dir, "vault", "Agenda.base"),
      );
    }
    const source = await this.readSource();
    try {
      const raw = await readFile(join(this.dir, "checkpoint.json"), "utf8");
      if (raw.length > 4 * 1024 * 1024)
        throw new Error("Checkpoint exceeds 4 MiB");
      this.state = StoreSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = {
        version: 1,
        view: {
          threadId: THREAD,
          surfaceId: SURFACE,
          sequence: 0,
          revision: 0,
          source,
          light: false,
          works: [],
          turns: [],
        },
        revisions: [],
        receipts: [],
      };
      this.contribute("exo", "opening", true);
      await this.save();
    }
    let dirty = false;
    for (const work of this.state.view.works)
      if (work.status === "running") {
        work.status = "interrupted";
        work.outcome = "Host restarted; execution was not resumed or replayed.";
        dirty = true;
      }
    const pending = this.state.pendingEffect;
    if (pending) {
      this.state.view.source = source;
      const applied = source.lastAcceptance === pending.requestId;
      if (this.state.view.proposal?.id === pending.proposalId) {
        this.state.view.proposal.status = applied ? "accepted" : "stale";
        this.state.view.proposal.receiptId = applied
          ? pending.requestId
          : undefined;
      }
      this.state.view.notice = applied
        ? "Recovered the applied acceptance from the vault receipt."
        : "Acceptance interrupted before an observed effect; no automatic retry.";
      this.contribute(
        "exo",
        applied ? "effect-reconciled" : "effect-interrupted",
        true,
        undefined,
        pending.turnId,
      );
      this.state.pendingEffect = undefined;
      dirty = true;
    }
    if (JSON.stringify(source) !== JSON.stringify(this.state.view.source)) {
      this.state.view.source = source;
      this.contribute("source", "external-edit", true);
      dirty = true;
    }
    if (dirty) {
      this.state.view.sequence++;
      await this.save();
    }
    this.timer = setInterval(() => {
      void this.enqueue(() => this.reconcile()).catch(() => {
        this.metrics.sourceErrors++;
      });
    }, this.options.pollMs ?? 200);
    this.timer.unref();
  }
  private async save() {
    const bytes = JSON.stringify(StoreSchema.parse(this.state));
    if (Buffer.byteLength(bytes) > 4 * 1024 * 1024)
      throw new Error("Checkpoint capacity reached");
    const path = join(this.dir, "checkpoint.json");
    await writeFile(`${path}.tmp`, bytes, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    this.metrics.writes++;
    this.metrics.bytesWritten += Buffer.byteLength(bytes);
  }
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.serial.then(op);
    this.serial = next.catch(() => undefined);
    return next;
  }
  snapshot(): View {
    return structuredClone(this.state.view);
  }
  history(revision: number) {
    return structuredClone(
      this.state.revisions.find((r) => r.revision === revision),
    );
  }
  context(selection?: Command["selection"]): Projection {
    const exact = selection ? this.history(selection.revision) : undefined;
    if (
      selection &&
      (!exact || !exact.source.tasks.some((t) => t.id === selection.objectId))
    )
      throw new Error("Unknown exact historical reference");
    return {
      threadId: THREAD,
      current: this.snapshot(),
      exactReference: exact ?? null,
      recentTurns: structuredClone(this.state.view.turns.slice(-24)),
      instructions:
        "Treat visual turns as conversation. The reference preserves the exact source, component tree, grouping, times and lock emphasis originally seen. Current source is authoritative. A proposal is not an applied change. Do not rewrite a historical referent to the current task.",
    };
  }
  observe(listener: (view: View) => void) {
    if (this.observers.size >= 16) throw new Error("Observer capacity reached");
    // Subscription installation and snapshot are synchronous with the single writer.
    this.observers.add(listener);
    this.metrics.observers = this.observers.size;
    this.metrics.maxObservers = Math.max(
      this.metrics.maxObservers,
      this.observers.size,
    );
    listener(this.snapshot());
    return () => {
      this.observers.delete(listener);
      this.metrics.observers = this.observers.size;
    };
  }
  private contribute(
    author: Turn["author"],
    kind: string,
    visual: boolean,
    selection?: Command["selection"],
    respondsTo?: string,
    utterance?: string,
  ) {
    if (
      this.state.view.turns.length >= 250 ||
      this.state.revisions.length >= 124
    )
      throw new Error(
        "Spike history capacity reached; archive this temporary thread before continuing",
      );
    const turn: Turn = {
      id: randomUUID(),
      author,
      kind,
      at: new Date().toISOString(),
      sourceRevision: this.state.view.source.revision,
      reference: selection,
      respondsTo,
      utterance,
    };
    if (visual) {
      this.state.view.revision++;
      turn.surfaceRevision = this.state.view.revision;
    }
    this.state.view.turns.push(turn);
    if (visual)
      this.state.revisions.push({
        revision: this.state.view.revision,
        source: structuredClone(this.state.view.source),
        turnId: turn.id,
        light: this.state.view.light,
        operations: surfaceOperations(this.state.view).map((op) => ({ ...op })),
      });
    return turn;
  }
  private async publish() {
    this.state.view.sequence++;
    await this.save();
    for (const fn of this.observers) fn(this.snapshot());
  }
  private async reconcile() {
    if (this.closed) return;
    const source = await this.readSource();
    if (JSON.stringify(source) === JSON.stringify(this.state.view.source))
      return;
    if (source.revision <= this.state.view.source.revision)
      throw new Error("External source change must advance its revision");
    this.state.view.source = source;
    if (this.state.view.proposal?.status === "pending")
      this.state.view.proposal.status = "stale";
    this.contribute("source", "external-edit", true);
    await this.publish();
  }
  async startWork(requestId: string = randomUUID()) {
    return this.command({ kind: "plan", actor: "person", requestId }, "server");
  }
  async command(raw: Command, origin?: "server"): Promise<Result> {
    return this.enqueue(async () => {
      const command = CommandSchema.parse(raw);
      const author = origin === "server" ? "exo" : command.actor;
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ command, origin: origin ?? "client" }))
        .digest("hex");
      const previous = this.state.receipts.find(
        (r) => r.requestId === command.requestId,
      );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          return { status: "conflict", reason: "request-id-reused" };
        return previous.result as Result;
      }
      await this.reconcile();
      const view = this.state.view;
      if (command.kind === "history")
        return {
          status: "ok",
          history: this.history(command.revision ?? 0) ?? null,
        };
      const priorProposal = view.proposal;
      if (
        command.kind === "accept" &&
        priorProposal &&
        priorProposal.id === command.proposalId &&
        priorProposal.status === "accepted"
      )
        return {
          status: "applied",
          receiptId: priorProposal.receiptId,
          duplicate: true,
        };
      if (
        command.kind !== "ask" &&
        command.selection &&
        command.selection.revision !== view.revision
      )
        return { status: "stale", reason: "surface-revision-changed" };
      if (command.selection && command.selection.surfaceId !== SURFACE)
        return { status: "rejected", reason: "unknown-surface" };
      if (
        command.selection &&
        !this.history(command.selection.revision)?.source.tasks.some(
          (t) => t.id === command.selection?.objectId,
        )
      )
        return { status: "rejected", reason: "unknown-object" };
      if (
        this.state.receipts.length >= 250 ||
        view.turns.length >= 246 ||
        this.state.revisions.length >= 120
      )
        return { status: "capacity", reason: "bounded-spike-retention" };
      const finish = async (result: Result) => {
        this.state.receipts.push({
          requestId: command.requestId,
          fingerprint,
          result,
        });
        await this.publish();
        return result;
      };
      if (command.kind === "cancel") {
        const work = view.works.find((w) => w.id === command.workId);
        if (!work) return { status: "not-found" };
        if (work.status !== "running")
          return finish({
            status: work.status,
            workId: work.id,
            outcome: work.outcome,
          });
        this.jobs.get(work.id)?.abort();
        // Completion is acknowledged by the owned execution, not by closing HTTP.
        return finish({ status: "cancelling", workId: work.id });
      }
      if (command.kind === "accept") {
        const p = view.proposal;
        if (
          !p ||
          p.id !== command.proposalId ||
          p.status !== "pending" ||
          p.sourceRevision !== view.source.revision ||
          command.revision !== view.revision
        )
          return { status: "stale", reason: "proposal-or-source-changed" };
        const turn = this.contribute(
          author,
          "acceptance",
          false,
          undefined,
          p.turnId,
          command.utterance,
        );
        this.state.pendingEffect = {
          requestId: command.requestId,
          proposalId: p.id,
          taskId: p.taskId,
          time: p.time,
          sourceRevision: p.sourceRevision,
          turnId: turn.id,
        };
        await this.save();
        if (this.options.crashAt === "after-prepare") process.exit(87);
        const source = await this.readSource();
        if (source.revision !== p.sourceRevision) {
          this.state.pendingEffect = undefined;
          p.status = "stale";
          return finish({
            status: "stale",
            reason: "source-changed-before-write",
          });
        }
        const task = source.tasks.find((t) => t.id === p.taskId);
        if (!task || task.locked)
          return { status: "rejected", reason: "unknown-or-locked-task" };
        task.time = p.time;
        source.revision++;
        source.lastAcceptance = command.requestId;
        const path = this.vaultPath;
        const original = await readFile(path, "utf8");
        const body = original.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
        await writeFile(`${path}.tmp`, `---\n${stringify(source)}---${body}`);
        await rename(`${path}.tmp`, path);
        if (this.options.crashAt === "after-vault-write") process.exit(88);
        view.source = source;
        p.status = "accepted";
        p.receiptId = command.requestId;
        this.state.pendingEffect = undefined;
        this.contribute("exo", "applied", true, undefined, turn.id);
        return finish({ status: "applied", receiptId: command.requestId });
      }
      if (command.kind === "light") {
        const turn = this.contribute(
          author,
          "light-command",
          false,
          undefined,
          undefined,
          command.utterance,
        );
        view.light = !view.light;
        this.contribute("exo", "light-outcome", true, undefined, turn.id);
        return finish({ status: "applied", light: view.light });
      }
      if (command.kind === "select") {
        const turn = this.contribute(
          author,
          "selection",
          false,
          command.selection,
          undefined,
          command.utterance,
        );
        return finish({ status: "recorded", turnId: turn.id });
      }
      if (
        view.works.filter((w) => w.status === "running").length >= 2 ||
        view.works.length >= 32
      )
        return { status: "capacity", reason: "work-limit" };
      if (command.kind === "move" && !command.selection)
        return { status: "rejected", reason: "selection-required" };
      if (
        command.kind === "move" &&
        view.source.tasks.find((t) => t.id === command.selection?.objectId)
          ?.locked
      )
        return { status: "rejected", reason: "locked-task" };
      const turn = this.contribute(
        author,
        command.kind,
        false,
        command.selection,
        undefined,
        command.utterance,
      );
      const work = {
        id: randomUUID(),
        kind: command.kind,
        status: "running" as const,
        turnId: turn.id,
        mode: command.mode,
      };
      view.works.push(work);
      const abort = new AbortController();
      this.jobs.set(work.id, abort);
      const projection = this.context(command.selection);
      await finish({ status: "accepted", workId: work.id, turnId: turn.id });
      void this.execute(work.id, command, projection, abort);
      return { status: "accepted", workId: work.id, turnId: turn.id };
    });
  }
  private async execute(
    id: string,
    command: Command,
    projection: Projection,
    abort: AbortController,
  ) {
    let result: ExecutionResult | undefined;
    let failure: string | undefined;
    try {
      if (command.mode === "pi") {
        if (!this.options.executePi)
          throw new Error("Pi execution unavailable: host has no Pi binding");
        result = await this.options.executePi(projection, abort.signal);
      } else {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, this.options.workDelayMs ?? 650);
          abort.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("cancelled"));
            },
            { once: true },
          );
        });
        result = {
          taskId: command.selection?.objectId ?? "sketch",
          time: "13:00",
          utterance: command.utterance
            ? "The selected task can move after lunch; your morning focus stays locked."
            : undefined,
        };
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "Execution failed";
    }
    await this.enqueue(async () => {
      const work = this.state.view.works.find((w) => w.id === id);
      if (!work || this.closed) return;
      if (abort.signal.aborted) {
        work.status = "cancelled";
        work.outcome =
          "Execution stopped before any proposed change was applied.";
      } else if (failure) {
        work.status = "failed";
        work.outcome = failure.slice(0, 240);
      } else {
        work.status = "completed";
        work.outcome = "Proposal created; source unchanged until acceptance.";
        if (command.kind !== "ask") {
          const task = this.state.view.source.tasks.find(
            (t) => t.id === result?.taskId,
          );
          if (!task || task.locked) {
            work.status = "failed";
            work.outcome =
              "Generated proposal did not name an editable source task.";
          } else if (
            this.state.view.source.revision !==
            projection.current.source.revision
          ) {
            work.outcome =
              "Source changed during execution; obsolete proposal discarded.";
          } else
            this.state.view.proposal = {
              id: randomUUID(),
              taskId: task.id,
              time: result?.time ?? "13:00",
              sourceRevision: this.state.view.source.revision,
              surfaceRevision: this.state.view.revision + 1,
              status: "pending",
              turnId: work.turnId,
            };
        }
        this.contribute(
          "exo",
          command.kind === "ask" ? "explanation" : "proposal",
          true,
          command.selection,
          work.turnId,
          result?.utterance,
        );
      }
      this.jobs.delete(id);
      await this.publish();
    });
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    for (const abort of this.jobs.values()) abort.abort();
    this.observers.clear();
    this.metrics.observers = 0;
    await this.serial;
  }
}
