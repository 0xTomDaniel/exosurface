import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { intentSchema, limits, planSchema, snapshotSchema, sourceSchema, THREAD, type Snapshot, type Turn, type Work } from './schema.js';

export class Thread {
  state: Snapshot;
  readonly vault: string;
  readonly file: string;
  readonly visuals = new Map<number, Snapshot>();
  writes = 0;
  writeBytes = 0;
  onChange: () => void = () => {};
  constructor(readonly directory: string, private readonly afterPlanWrite?: () => void) {
    mkdirSync(directory, { recursive: true });
    this.vault = join(directory, 'vault');
    this.file = join(directory, 'thread.json');
    if (!existsSync(this.vault)) cpSync(new URL('../fixtures/vault/', import.meta.url), this.vault, { recursive: true });
    const source = this.source();
    if (existsSync(this.file)) {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { current: unknown; visuals: unknown[] };
      this.state = snapshotSchema.parse(saved.current);
      for (const visual of saved.visuals) { const value = snapshotSchema.parse(visual); this.visuals.set(value.revision, value); }
      this.state.bootId = randomUUID();
      this.state.observerTaskId = '';
      for (const work of this.state.work) if (work.state === 'working') {
        work.state = 'interrupted'; work.outcome = 'Host restarted. Execution was interrupted; no automatic replay.';
      }
      for (const proposal of this.state.proposals) if (proposal.status === 'applying') {
        const path = join(this.vault, 'Plans', `${proposal.id}.md`);
        if (existsSync(path)) {
          const raw = readFileSync(path, 'utf8');
          const plan = planSchema.safeParse(parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''));
          const matches = plan.success && plan.data.receipt === proposal.receipt && plan.data.proposalId === proposal.id &&
            plan.data.taskId === proposal.objectId && plan.data.time === proposal.time && plan.data.sourceRevision === proposal.sourceRevision;
          proposal.status = matches ? 'accepted' : 'uncertain';
          if (matches && proposal.sourceRevision === source.revision) {
            const task = this.state.tasks.find(t => t.id === proposal.objectId); if (task) task.time = proposal.time;
          }
        } else proposal.status = 'uncertain';
      }
      this.publish('exo', 'host-restarted');
    } else {
      this.state = { threadId: THREAD, surfaceId: `agenda-${randomUUID()}`, revision: 0,
        sourceRevision: source.revision, tasks: source.data.tasks, proposals: [], lights: { studio: false },
        work: [], turns: [], observerTaskId: '', bootId: randomUUID() };
      this.publish('exo', 'agenda-presented');
    }
  }
  source() {
    const raw = readFileSync(join(this.vault, 'Agenda.md'), 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) throw new Error('Agenda.md requires YAML frontmatter');
    return { revision: createHash('sha256').update(raw).digest('hex'), data: sourceSchema.parse(parse(frontmatter[1]!)) };
  }
  snapshot(): Snapshot { return structuredClone(this.state); }
  private admitTurns(count: number) {
    const reserved = this.state.work.filter(work => work.state === 'working').length * 2;
    if (this.state.turns.length + count + reserved > limits.turns) throw new Error('Thread turn capacity reached; archive before continuing');
  }
  persist() {
    const raw = JSON.stringify({ current: this.state, visuals: [...this.visuals.values()] });
    if (Buffer.byteLength(raw) > limits.journalBytes) throw new Error('Thread retention capacity reached; archive before continuing');
    const pending = `${this.file}.tmp`;
    writeFileSync(pending, raw, { mode: 0o600 }); renameSync(pending, this.file);
    this.writes++; this.writeBytes += Buffer.byteLength(raw);
  }
  publish(author: Turn['author'], kind: string, details: Partial<Turn> = {}): Turn {
    if (this.state.turns.length >= limits.turns) throw new Error('Thread turn capacity reached; archive before continuing');
    this.state.revision++;
    const turn: Turn = { id: randomUUID(), at: new Date().toISOString(), author, kind, revision: this.state.revision, ...details };
    if (turn.utterance !== undefined) turn.utteranceId = `${turn.id}:utterance`;
    this.state.turns.push(turn);
    // Historical visual checkpoints exclude unrelated work/turn lists; referents remain exact.
    const visual = this.snapshot(); visual.turns = []; visual.work = []; visual.observerTaskId = '';
    this.visuals.set(visual.revision, visual);
    this.persist(); this.onChange(); return turn;
  }
  reconcile() {
    const source = this.source();
    if (source.revision === this.state.sourceRevision) return;
    this.admitTurns(1);
    this.state.sourceRevision = source.revision; this.state.tasks = source.data.tasks;
    for (const proposal of this.state.proposals) if (proposal.status === 'pending') proposal.status = 'stale';
    this.publish('source', 'vault-edited');
  }
  intent(value: unknown) {
    const intent = intentSchema.parse(value);
    this.reconcile();
    const proposal = this.state.proposals.find(p => p.id === intent.proposalId);
    if (intent.name === 'accept' && proposal?.status === 'accepted' && proposal.receipt) {
      const person = this.state.turns.find(t => t.id === proposal.receipt)!;
      return { person, intent, receipt: proposal.receipt, duplicate: true };
    }
    if (intent.surfaceId !== this.state.surfaceId && !(intent.name === 'light' && intent.surfaceId === 'studio-lights')) throw new Error('Stale surface incarnation');
    if (intent.revision !== this.state.revision) throw new Error('Stale surface revision');
    if (intent.objectId && intent.name !== 'ask' && !this.state.tasks.some(t => t.id === intent.objectId)) throw new Error('Unknown agenda task');
    if (intent.name === 'accept' && (!proposal || proposal.status !== 'pending' || proposal.sourceRevision !== this.state.sourceRevision)) throw new Error('Stale or missing proposal');
    if (intent.name === 'move' && !intent.objectId) throw new Error('Select an agenda task');
    this.admitTurns(intent.name === 'select' ? 1 : intent.name === 'ask' ? 4 : 2);
    const referred = intent.referenceRevision === undefined ? this.state : this.visuals.get(intent.referenceRevision);
    if (!referred) throw new Error('Historical reference not found');
    if (intent.objectId && intent.name === 'ask' && !referred.tasks.some(t => t.id === intent.objectId)) throw new Error('Unknown historical agenda task');
    if (intent.name === 'move' && referred.sourceRevision !== this.state.sourceRevision) throw new Error('Stale selected source revision');
    const reference = { surfaceId: intent.name === 'light' ? 'studio-lights' : referred.surfaceId, revision: referred.revision,
      objectId: intent.objectId, sourceRevision: referred.sourceRevision };
    const person = this.publish('person', intent.name, { reference, utterance: intent.utterance, clientId: intent.clientId });
    if (intent.name === 'move') {
      this.state.proposals.push({ id: randomUUID(), objectId: intent.objectId!, time: '13:00',
        sourceRevision: this.state.sourceRevision, surfaceId: this.state.surfaceId, basedOnRevision: intent.revision, status: 'pending' });
      this.publish('exo', 'agenda-proposed', { respondsTo: person.id,
        utterance: intent.utterance ? `The selected ${intent.objectId} is proposed for 13:00; the other task stays in place.` : undefined });
    }
    if (intent.name === 'accept' && proposal) {
      proposal.receipt = person.id; proposal.status = 'applying'; this.persist();
      mkdirSync(join(this.vault, 'Plans'), { recursive: true });
      // Exclusive creation of a new plan never overwrites the authoritative task
      // Markdown. A repeated delivery uses the durable proposal receipt above.
      writeFileSync(join(this.vault, 'Plans', `${proposal.id}.md`), `---\n${stringify({ proposalId: proposal.id,
        receipt: person.id, taskId: proposal.objectId, time: proposal.time, sourceRevision: proposal.sourceRevision })}---\n\nAccepted agenda plan.\n`, { flag: 'wx' });
      this.afterPlanWrite?.();
      proposal.status = 'accepted';
      this.state.tasks.find(t => t.id === proposal.objectId)!.time = proposal.time;
      this.publish('exo', 'acceptance-applied', { respondsTo: person.id, reference });
    }
    if (intent.name === 'light') {
      this.state.lights.studio = !this.state.lights.studio;
      this.publish('exo', 'light-observed', { respondsTo: person.id, reference });
    }
    if (intent.name === 'recreate') {
      this.state.surfaceId = `agenda-${randomUUID()}`;
      for (const p of this.state.proposals) if (p.status === 'pending') p.status = 'stale';
      this.publish('exo', 'surface-recreated', { respondsTo: person.id });
    }
    return { person, intent, receipt: proposal?.receipt, duplicate: false };
  }
  work(id: string, kind: string): Work {
    if (this.state.work.filter(w => w.state === 'working').length >= limits.activeWork) throw new Error('Work capacity reached');
    this.admitTurns(3);
    const work: Work = { id, kind, state: 'working', startedAt: new Date().toISOString() };
    this.state.work.push(work);
    while (this.state.work.length > limits.retainedWork) {
      const retired = this.state.work.findIndex(w => w.state !== 'working');
      if (retired < 0) break;
      this.state.work.splice(retired, 1);
    }
    this.publish('exo', 'work-started'); return work;
  }
  finish(id: string, state: Work['state'], outcome: string) {
    const work = this.state.work.find(w => w.id === id);
    if (!work || work.state !== 'working') return;
    work.state = state; work.outcome = outcome; this.publish('exo', `work-${state}`);
  }
}
