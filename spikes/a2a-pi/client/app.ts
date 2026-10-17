import { html, LitElement, nothing } from 'lit';
import { MessageProcessor, A2uiMessageListSchema, type A2uiClientAction } from '@a2ui/web_core/v0_9';
import { A2uiSurface, basicCatalog } from '@a2ui/lit/v0_9';
import { SubscribeToTaskRequest, type Artifact } from '@a2a-js/sdk';
import { connectClient, discover, request, requestOptions, sendIntent, type Client } from '../src/client.js';
import { A2UI_MIME, limits, snapshotSchema, type Snapshot, type Intent } from '../src/schema.js';
import './style.css';
void A2uiSurface;
const host = new URLSearchParams(location.search).get('host') ?? 'http://127.0.0.1:61001';
class ExoApp extends LitElement {
  private readonly clientId = crypto.randomUUID();
  private client?: Client;
  private current = new MessageProcessor([basicCatalog], action => this.act(action));
  private history = new MessageProcessor([basicCatalog]);
  private snapshot?: Snapshot;
  private historical?: Snapshot;
  private selected?: { id: string; revision: number };
  private controller?: AbortController;
  private connected = true;
  private connection = 'Connecting';
  private error = '';
  private utterance = '';
  private applied = 0;
  private duplicates = 0;
  private generations = 0;
  private maxClientFrame = 0;
  protected override createRenderRoot() { return this; }
  override connectedCallback() { super.connectedCallback(); void this.observe(); }
  override disconnectedCallback() { this.controller?.abort(); super.disconnectedCallback(); }
  async observe() {
    const controller = new AbortController(); this.controller = controller; this.generations++;
    const generation = this.generations;
    while (!controller.signal.aborted && generation === this.generations) {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const attempt = new AbortController();
      const signal = AbortSignal.any([controller.signal, attempt.signal]);
      const resetWatchdog = () => { clearTimeout(watchdog); watchdog = setTimeout(() => attempt.abort(), limits.idleMs); };
      try {
        resetWatchdog();
        this.client ??= await connectClient(host);
        const discovery = await discover(this.client, signal);
        const stream = this.client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ id: discovery.observerTaskId }), requestOptions(signal));
        resetWatchdog();
        for await (const event of stream) {
          resetWatchdog();
          if (controller.signal.aborted || generation !== this.generations) break;
          this.connection = 'Live'; this.error = '';
          if (event.payload?.$case === 'task') for (const artifact of event.payload.value.artifacts) this.apply(artifact);
          if (event.payload?.$case === 'artifactUpdate' && event.payload.value.artifact) this.apply(event.payload.value.artifact);
          this.requestUpdate();
        }
      } catch (error) {
        if (!controller.signal.aborted) { this.connection = 'Reconnecting'; this.error = error instanceof Error ? error.message : 'Connection unavailable'; this.requestUpdate(); }
      } finally { clearTimeout(watchdog); attempt.abort(); }
      if (!controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  apply(artifact: Artifact) {
    if (artifact.artifactId !== 'live-checkpoint') return;
    const snapshotPart = artifact.parts.find(p => p.mediaType === 'application/json');
    const uiPart = artifact.parts.find(p => p.mediaType === A2UI_MIME);
    const next = snapshotSchema.parse(snapshotPart?.content?.value);
    this.maxClientFrame = Math.max(this.maxClientFrame, JSON.stringify(artifact).length);
    if (this.snapshot && next.revision <= this.snapshot.revision && next.bootId === this.snapshot.bootId) { this.duplicates++; return; }
    const operations = A2uiMessageListSchema.parse(uiPart?.content?.value);
    if (this.snapshot?.modelResponse?.sessionId !== next.modelResponse?.sessionId && this.current.model.getSurface('exo-reflection')) this.current.model.deleteSurface('exo-reflection');
    if (this.snapshot && this.snapshot.surfaceId !== next.surfaceId) this.current.processMessages([{ version: 'v0.9', deleteSurface: { surfaceId: this.snapshot.surfaceId } }]);
    this.current.processMessages(operations.filter(op => !('createSurface' in op) || !this.current.model.getSurface(op.createSurface.surfaceId)));
    this.snapshot = next; this.applied++; this.requestUpdate();
    this.dataset.revision = String(next.revision); this.dataset.applied = String(this.applied);
  }
  async act(action: A2uiClientAction) {
    if (!this.client || !this.snapshot) return;
    if (action.name === 'select') this.selected = { id: String(action.context.objectId), revision: this.snapshot.revision };
    await this.submit({ ...action.context, name: action.name, surfaceId: action.surfaceId, clientId: 'browser',
      revision: Number(action.context.revision) } as Intent);
  }
  async submit(intent: Intent) {
    if (!this.client) return;
    try { await sendIntent(this.client, { ...intent, clientId: this.clientId }); this.error = ''; }
    catch (error) { this.error = error instanceof Error ? error.message : 'Action failed'; }
    this.requestUpdate();
  }
  async showHistory(revision: number) {
    if (!this.client) return;
    const message = await request(this.client, { request: 'history', revision });
    const value = message.parts[0]?.content?.value as { visual: unknown; operations: unknown };
    this.historical = snapshotSchema.parse(value.visual);
    this.history.model.dispose();
    this.history = new MessageProcessor([basicCatalog]);
    this.history.processMessages(A2uiMessageListSchema.parse(value.operations));
    this.requestUpdate();
  }
  toggle() {
    this.connected = !this.connected;
    if (this.connected) { this.connection = 'Connecting'; void this.observe(); }
    else { this.controller?.abort(); this.connection = 'Detached'; }
    this.requestUpdate();
  }
  override render() {
    const state = this.snapshot;
    const agenda = state && this.current.model.getSurface(state.surfaceId);
    const lights = this.current.model.getSurface('studio-lights');
    return html`<header><a class="wordmark" href="/">exo<span>surface</span></a><span class="eyebrow">SUNDAY / SEPTEMBER 13</span>
      <button class="connection" @click=${() => this.toggle()} aria-label=${this.connected ? 'Detach observer' : 'Reconnect observer'}><i class=${this.connection === 'Live' ? 'online' : ''}></i>${this.connection}</button></header>
      <main><section class="intro"><div><p class="eyebrow">A SHARED CONVERSATION</p><h1>Make room<br>for your day.</h1></div><p class="intro-copy">Choose a task. Shape a plan.<br>Exo keeps the thread, even<br>when you step away.</p></section>
      ${this.error ? html`<p role="alert" class="error">${this.error}</p>` : nothing}
      <div class="workspace"><section class="agenda-panel" aria-label="Current agenda"><div class="section-top"><span class="eyebrow">THE CURRENT SURFACE</span><span data-testid="revision">Revision ${state?.revision ?? '—'}</span></div>
        ${agenda ? html`<a2ui-surface .surface=${agenda}></a2ui-surface>` : html`<p>Opening your agenda…</p>`}
        ${this.current.model.getSurface('exo-reflection') ? html`<section class="pi-response" aria-label="Exo Pi visual response"><p class="eyebrow">EXO'S CONTRIBUTION</p><a2ui-surface .surface=${this.current.model.getSurface('exo-reflection')}></a2ui-surface></section>` : nothing}
        <div class="selection" aria-live="polite">${this.selected ? html`Selected: <strong>${this.selected.id}</strong> · visual revision ${this.selected.revision}` : 'Select an item to establish a shared reference.'}</div>
        <details class="language"><summary>Add words to this turn</summary><label for="utterance">Optional utterance</label><textarea id="utterance" .value=${this.utterance} @input=${(event: Event) => { this.utterance = (event.target as HTMLTextAreaElement).value; }} placeholder="Move this after lunch"></textarea>
          <div class="buttons"><button ?disabled=${!this.selected || !state} @click=${() => { if (state && this.selected) void this.submit({ name: 'move', surfaceId: state.surfaceId, revision: state.revision, objectId: this.selected.id, referenceRevision: this.selected.revision, utterance: this.utterance }); }}>Propose with selection</button>
          <button ?disabled=${!state} @click=${() => { if (state) void this.submit({ name: 'ask', surfaceId: state.surfaceId, revision: state.revision, objectId: this.selected?.id, referenceRevision: this.historical?.revision ?? this.selected?.revision, utterance: this.utterance || undefined }); }}>Ask Exo through Pi</button></div></details>
        <div class="work-list"><span class="eyebrow">EXO'S WORK</span>${state?.work.length ? state.work.map(work => html`<p><span class="work-state">${work.state}</span> Agenda review <small>${work.outcome ?? 'Working independently'}</small>${work.state === 'working' ? html`<button @click=${async () => { if (this.client) await this.client.cancelTask({ id: work.id, tenant: '', metadata: {} }, requestOptions()); }}>Stop work</button>` : nothing}</p>`) : html`<p>No active work. The surface stays available.</p>`}</div>
      </section><aside><section class="lights-panel">${lights ? html`<a2ui-surface .surface=${lights}></a2ui-surface>` : nothing}</section>
      <section class="thread-panel"><div class="section-top"><span class="eyebrow">THE THREAD</span><span>${state?.turns.length ?? 0} turns</span></div><p class="muted">Visual choices are part of the conversation.</p>
        <ol>${state?.turns.slice(-12).reverse().map(turn => html`<li><button @click=${() => void this.showHistory(turn.revision)}><span class="turn-author">${turn.author === 'person' ? 'You' : turn.author === 'exo' ? 'Exo' : 'Vault'}</span><span>${turn.kind.replaceAll('-', ' ')}</span><small>r${turn.revision}${turn.reference?.objectId ? ` · ${turn.reference.objectId}` : ''}</small>${turn.utterance ? html`<p>${turn.utterance}</p>` : nothing}</button></li>`)}</ol></section></aside></div>
      ${this.historical ? html`<section class="history-panel" aria-label="Historical surface"><div class="section-top"><span class="eyebrow">HISTORICAL REFERENCE · REVISION ${this.historical.revision}</span><button @click=${() => { this.historical = undefined; this.requestUpdate(); }}>Close history</button></div><p>Preserved as it appeared then. Current agenda remains above.</p><div class="historical-surface" inert><a2ui-surface .surface=${this.history.model.getSurface(this.historical.surfaceId)}></a2ui-surface></div></section>` : nothing}
      <footer>A2A / Pi exploration <span>Published A2UI Lit renderer · local fixture vault</span><details><summary>Observation evidence</summary><pre>${JSON.stringify({ applied: this.applied, duplicatesSuppressed: this.duplicates, maxClientFrame: this.maxClientFrame, generations: this.generations }, null, 2)}</pre></details></footer></main>`;
  }
}
customElements.define('exo-app', ExoApp);
