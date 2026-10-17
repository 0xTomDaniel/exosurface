import { LitElement, html, css, nothing } from "lit";
import {
  A2uiSurface,
  basicCatalog,
  type LitComponentApi,
} from "@a2ui/lit/v0_9";
import {
  MessageProcessor,
  A2uiMessageSchema,
  type A2uiClientAction,
} from "@a2ui/web_core/v0_9";
import { injectBasicCatalogStyles } from "@a2ui/web_core/v0_9/basic_catalog";
import { ExoAgent } from "./transport.js";
import {
  ViewSchema,
  SURFACE,
  HistoricalSchema,
  type View,
  type Command,
  type Historical,
} from "./domain.js";

void A2uiSurface;
injectBasicCatalogStyles();
class Workspace extends LitElement {
  private view?: View;
  private observer?: ExoAgent;
  private active = true;
  private connected = false;
  private status = "Opening the day…";
  private error = "";
  private selected?: Command["selection"];
  private utterance = "";
  private mode: "deterministic" | "pi" = "deterministic";
  private historyView?: Historical;
  private current = new MessageProcessor<LitComponentApi>(
    [basicCatalog],
    (action) => {
      void this.action(action);
    },
  );
  private historical = new MessageProcessor<LitComponentApi>([basicCatalog]);
  private sequence = -1;
  private renewals = 0;
  private applied = 0;
  private dropped = 0;
  static override styles = css`
    :host {
      display: block;
      background: #f4f1e9;
      min-height: 100vh;
      color: #243a35;
      font-family: "Avenir Next", "Trebuchet MS", sans-serif;
      --a2ui-color-primary: #245b49;
      --a2ui-color-on-primary: #fff;
      --a2ui-color-surface: #fffefa;
      --a2ui-color-border: #d3d8ca;
      --a2ui-button-margin: 0;
      --a2ui-button-padding: 0.45rem 0.85rem;
      --a2ui-button-border-radius: 3px;
      --a2ui-font-family: "Avenir Next", "Trebuchet MS", sans-serif;
      --a2ui-text-margin: 0;
      --a2ui-spacing-m: 0.45rem;
      --a2ui-spacing-l: 0.8rem;
    }
    * {
      box-sizing: border-box;
    }
    header {
      border-bottom: 1px solid #b9c6b8;
      padding: 28px 4vw 22px;
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
    }
    h1 {
      font:
        500 38px Georgia,
        serif;
      letter-spacing: -1.5px;
      margin: 6px 0;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 2px;
      font-size: 11px;
      color: #5b736b;
    }
    .status {
      font-size: 12px;
      max-width: 320px;
      text-align: right;
    }
    .indicator {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #68866b;
      margin-right: 7px;
    }
    .indicator.off {
      background: #b18050;
    }
    main {
      display: grid;
      grid-template-columns: minmax(390px, 1.6fr) minmax(300px, 1fr);
      gap: 40px;
      padding: 32px 4vw;
      max-width: 1400px;
      margin: auto;
    }
    .surface {
      background: #fffefa;
      border: 1px solid #d4d9cb;
      border-top: 4px solid #3c7056;
      padding: 26px 30px;
      box-shadow: 0 8px 24px #304b3910;
    }
    h2 {
      font:
        500 25px Georgia,
        serif;
      margin: 0 0 18px;
    }
    h3 {
      font:
        500 20px Georgia,
        serif;
      margin: 24px 0 10px;
    }
    button,
    select {
      font: inherit;
      padding: 8px 12px;
      border: 1px solid #a4b6a5;
      background: #f7f7f0;
      color: #294b3e;
      border-radius: 3px;
      cursor: pointer;
    }
    button:hover {
      background: #e3eddf;
    }
    button:focus-visible,
    textarea:focus-visible,
    select:focus-visible {
      outline: 3px solid #c69345;
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    textarea {
      width: 100%;
      min-height: 78px;
      background: #fffefa;
      border: 1px solid #becabd;
      border-radius: 3px;
      padding: 12px;
      color: #243a35;
      font: inherit;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin: 12px 0;
    }
    .reference {
      border-left: 3px solid #c49648;
      padding: 9px 12px;
      font-size: 13px;
      background: #f1ecdc;
      margin-bottom: 12px;
    }
    .hint {
      font-size: 12px;
      color: #617467;
      line-height: 1.6;
    }
    .turn {
      border-top: 1px solid #cbd3c5;
      padding: 12px 0;
    }
    .turn .author {
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .turn p {
      font-size: 13px;
      line-height: 1.5;
      margin: 6px 0;
    }
    .turn button {
      font-size: 11px;
      padding: 4px 8px;
    }
    .badge {
      font-size: 11px;
      background: #e0e9dc;
      padding: 4px 7px;
    }
    .work {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      font-size: 12px;
      border-bottom: 1px solid #cbd3c5;
    }
    .error {
      color: #923f2e;
      border-left: 3px solid #923f2e;
      padding: 8px 12px;
      margin: 12px 0;
    }
    details {
      margin-top: 24px;
      font-size: 12px;
    }
    pre {
      white-space: pre-wrap;
    }
    aside {
      min-width: 0;
    }
    .history {
      margin-top: 20px;
      border: 1px dashed #94a98c;
      padding: 18px;
      pointer-events: none;
    }
    .history-header {
      margin-top: 20px;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    @media (max-width: 760px) {
      header {
        align-items: start;
      }
      h1 {
        font-size: 30px;
      }
      main {
        grid-template-columns: 1fr;
        gap: 28px;
        padding: 22px 5vw;
      }
      .surface {
        padding: 18px;
      }
      .status {
        max-width: 150px;
      }
      header {
        padding: 22px 5vw;
      }
    }
  `;
  override connectedCallback() {
    super.connectedCallback();
    void this.attach();
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.active = false;
    this.observer?.abortRun();
    this.current.model.dispose();
    this.historical.model.dispose();
  }
  private async attach() {
    this.active = true;
    while (this.active) {
      const agent = new ExoAgent(location.origin);
      this.observer = agent;
      try {
        const session = await fetch("/session", {
          signal: AbortSignal.timeout(6000),
        });
        if (!session.ok)
          throw new Error("Could not establish the local session");
        if (!this.active) break;
        await agent.connectAgent(
          {},
          {
            onStateChanged: ({ state }) => {
              this.view = ViewSchema.parse(state);
              this.requestUpdate();
            },
            onActivitySnapshotEvent: ({ event }) => {
              if (event.activityType !== "a2ui-surface") return;
              const sequence = Number(event.metadata?.sequence ?? -1);
              if (sequence <= this.sequence) {
                this.dropped++;
                this.connected = true;
                this.status = "The day is live";
                this.error = "";
                this.requestUpdate();
                return;
              }
              const operations = event.content.a2ui_operations;
              if (!Array.isArray(operations))
                throw new Error("Missing A2UI operations");
              const validated = operations.map((op) =>
                A2uiMessageSchema.parse(op),
              );
              this.current.processMessages(
                this.current.model.getSurface(SURFACE)
                  ? validated.filter((op) => !("createSurface" in op))
                  : validated,
              );
              this.sequence = sequence;
              this.applied++;
              this.connected = true;
              this.status = "The day is live";
              this.error = "";
              this.requestUpdate();
            },
          },
        );
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : "Connection failed";
        this.status = "Reconnecting · last observed state";
        this.connected = false;
        this.requestUpdate();
      }
      if (this.active) {
        this.renewals++;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    this.connected = false;
    this.status = "Detached · Exo keeps working";
    this.requestUpdate();
  }
  private async command(command: Command) {
    const agent = new ExoAgent(location.origin);
    const result = await agent.runAgent({ forwardedProps: { command } });
    return result.result as Record<string, unknown>;
  }
  private async action(action: A2uiClientAction) {
    const revision = Number(action.context.revision);
    const objectId = String(action.context.objectId ?? "");
    if (action.name === "select")
      this.selected = { surfaceId: SURFACE, revision, objectId };
    try {
      const agent = new ExoAgent(location.origin);
      const response = await agent.runAgent({
        forwardedProps: {
          a2uiAction: action,
          requestId: crypto.randomUUID(),
          mode: this.mode,
          utterance: this.utterance || undefined,
        },
      });
      const result = response.result as Record<string, unknown>;
      if (
        ["stale", "rejected", "conflict", "capacity"].includes(
          String(result.status),
        )
      )
        this.error = `${result.status}: ${result.reason ?? "Please review the current day."}`;
      else {
        this.error = "";
        this.utterance = "";
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Action failed";
    }
    this.requestUpdate();
  }
  private async send(kind: "move" | "ask") {
    try {
      const result = await this.command({
        kind,
        actor: "person",
        requestId: crypto.randomUUID(),
        selection: this.selected,
        utterance: this.utterance,
        mode: this.mode,
      });
      this.error = ["stale", "rejected", "capacity"].includes(
        String(result.status),
      )
        ? `${result.status}: ${result.reason}`
        : "";
      this.utterance = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not send";
    }
    this.requestUpdate();
  }
  private async showHistory(revision: number) {
    const result = await this.command({
      kind: "history",
      actor: "person",
      requestId: crypto.randomUUID(),
      revision,
    });
    this.historyView = HistoricalSchema.parse(result.history);
    this.historical.model.dispose();
    this.historical = new MessageProcessor<LitComponentApi>([basicCatalog]);
    this.historical.processMessages(
      this.historyView.operations.map((op) => A2uiMessageSchema.parse(op)),
    );
    this.requestUpdate();
  }
  private async detach() {
    this.active = false;
    await this.observer?.detachActiveRun();
  }
  override render() {
    return html` <header>
        <div>
          <div class="eyebrow">Exosurface / Sunday, September 13</div>
          <h1>A day in view.</h1>
        </div>
        <div class="status">
          <span class="indicator ${this.connected ? "" : "off"}"></span>${this
            .status}
          <div class="actions">
            <button
              @click=${() => (this.active ? this.detach() : this.attach())}
            >
              ${this.active ? "Detach" : "Reconnect"}
            </button>
          </div>
        </div>
      </header>
      <main>
        <section>
          <div class="surface" data-testid="current-surface">
            <a2ui-surface
              .surface=${this.current.model.getSurface(SURFACE)}
            ></a2ui-surface>
          </div>
          <p class="hint">
            Your agenda is the conversation. Select, rearrange, and decide here.
            The lamp is simulated.
          </p>
        </section>
        <aside>
          <h2>Carry the thought forward</h2>
          ${this.selected
            ? html`<div class="reference" data-testid="selection">
                Selected ${this.selected.objectId} · visual revision
                ${this.selected.revision}
              </div>`
            : html`<p class="hint">
                Select an agenda item to give “this” an exact reference.
              </p>`}
          <label class="hint" for="utterance">Add words, if they help</label
          ><textarea
            id="utterance"
            placeholder="Move this after lunch…"
            .value=${this.utterance}
            @input=${(event: Event) => {
              this.utterance = (event.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          <div class="actions">
            <button
              ?disabled=${!this.selected}
              @click=${() => this.send("move")}
            >
              Propose the move</button
            ><button
              ?disabled=${!this.selected}
              @click=${() => this.send("ask")}
            >
              Ask about this</button
            ><select
              aria-label="Exo execution"
              .value=${this.mode}
              @change=${(e: Event) => {
                this.mode = (e.target as HTMLSelectElement).value as
                  | "deterministic"
                  | "pi";
              }}
            >
              <option value="deterministic">Lifecycle fixture</option>
              <option value="pi">Pi model</option>
            </select>
          </div>
          ${this.error
            ? html`<div class="error" role="alert">${this.error}</div>`
            : nothing}
          <h3>Work in progress</h3>
          ${this.view?.works
            .slice(-4)
            .reverse()
            .map(
              (w) =>
                html`<div class="work" data-testid="work">
                  <span
                    >${w.kind} · <strong>${w.status}</strong><br /><span
                      class="hint"
                      >${w.outcome ?? "Exo is working independently"}</span
                    ></span
                  >${w.status === "running"
                    ? html`<button
                        @click=${() =>
                          this.command({
                            kind: "cancel",
                            actor: "person",
                            requestId: crypto.randomUUID(),
                            workId: w.id,
                          })}
                      >
                        Stop
                      </button>`
                    : nothing}
                </div>`,
            ) ?? html`<p class="hint">Waiting for the first view.</p>`}
          <h3>The conversation through time</h3>
          <div data-testid="history-list">
            ${this.view?.turns
              .slice(-14)
              .reverse()
              .map(
                (t) =>
                  html`<div class="turn">
                    <span class="author">${t.author}</span>
                    <span class="badge">${t.kind}</span>
                    <p>
                      ${t.utterance ?? "A visual contribution"}${t.reference
                        ? ` · ${t.reference.objectId} at revision ${t.reference.revision}`
                        : ""}
                    </p>
                    ${t.surfaceRevision
                      ? html`<button
                          @click=${() => this.showHistory(t.surfaceRevision!)}
                        >
                          View revision ${t.surfaceRevision}
                        </button>`
                      : nothing}
                  </div>`,
              )}
          </div>
          ${this.historyView
            ? html`<div class="history-header">
                  Historical revision ${this.historyView.revision} · Read only
                </div>
                <div class="actions">
                  ${this.historyView.source.tasks.map(
                    (task) =>
                      html`<button
                        @click=${() => {
                          this.selected = {
                            surfaceId: SURFACE,
                            revision: this.historyView!.revision,
                            objectId: task.id,
                          };
                          this.requestUpdate();
                        }}
                      >
                        Reference ${task.id} at revision
                        ${this.historyView!.revision}
                      </button>`,
                  )}
                </div>
                <div class="history" data-testid="historical-surface">
                  <a2ui-surface
                    .surface=${this.historical.model.getSurface(SURFACE)}
                  ></a2ui-surface>
                </div>`
            : nothing}
          <details>
            <summary>Local spike evidence</summary>
            <pre data-testid="client-metrics">
${JSON.stringify(
                {
                  sequence: this.sequence,
                  revision: this.view?.revision,
                  renewals: this.renewals,
                  applied: this.applied,
                  dropped: this.dropped,
                  messages: this.observer?.messages.length ?? 0,
                },
                null,
                2,
              )}</pre
            >
          </details>
        </aside>
      </main>`;
  }
}
customElements.define("exo-workspace", Workspace);
