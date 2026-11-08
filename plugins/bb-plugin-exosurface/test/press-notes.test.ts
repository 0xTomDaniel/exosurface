// #143 (#31; owner ruling 2026-11-06): a person's typed textbox notes reach Exo in full. A press that sends a long
// multiline note, and a typed note Exo hears about on the next turn, arrive whole in Exo's prompt as Pi recorded it.
// Through the live entry points: server.ts RPCs (action, edit), the mock BB's dispatch to host.ts, the release owner, real Pi.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { settled } from './wait.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
after(async () => {
  for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
  const ended = (c: typeof ownerProcess) => c.exitCode !== null || c.signalCode !== null;
  if (await settled(() => ended(host.child) && ended(ownerProcess), 15000)) rmSync(f.root, { recursive: true, force: true });
  else console.error(`fixture processes still running; fixture kept at ${f.root}`);
});

const CATALOG = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const pages = () => f.rpc.workspace({ deployment: 'main', cursor: null });
const until = async (what: string, ok: () => boolean | Promise<boolean>) => { if (!(await settled(ok, 20000))) throw new Error(`timed out: ${what}`); };
const turns = () => host.deltas('primary').filter((d: any) => d.kind === 'turn.boundary').length;
/** Every entry of the primary's Pi session journal: what Exo received, as Pi recorded it. */
const journal = () => readFileSync(f.piRuns()[0].sessionFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const textOf = (m: any) => typeof m?.content === 'string' ? m.content : (m?.content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
/** The person's last message to Exo (a press arrives as one). */
const lastPrompt = () => textOf(journal().findLast(e => e.type === 'message' && e.message.role === 'user')?.message);

// Realistic triage notes, like Tom's on page ct (#31): several paragraphs, each a line or more, the instruction at the end.
const NOTE = [
  'Batch 2 review, carried tasks from C7. I went through each one with the calendar open and the inbox beside it.',
  'The dentist reschedule is done; I called on Tuesday and they moved it to the 14th at 9:30, so close that one and drop the reminder. The gutter quote from Hal is still waiting on him; he said end of the month, so leave it open but push the check-in to the 30th.',
  'Insurance renewal: the paperwork came in the mail and it is on the desk in the blue folder. I have not read it yet. Keep it active and put it at the top of next week, it needs an hour with no interruptions, and flag that the premium went up last year without a letter.',
  'The garden bed order can wait until spring. Archive it with a note that the cedar boards were the ones we liked, the 2x10 ones from the yard on Pine Street, not the big box store.',
  'Mom\'s birthday: the gift is ordered and arrives Friday. Card still needs writing. Move "write card" to Thursday evening so it goes out with the Saturday mail.',
  'Car registration was renewed online on the 3rd, receipt is in the email folder "car". Close it. The oil change is overdue by maybe 800 miles; make that a new task for this weekend, morning slot, before the hardware store trip.',
  'Library books are due on the 12th, two of them are not finished. Renew both online instead of returning them, and keep the task until the renewal shows on the account.',
  'Bank: the duplicate charge from the hotel was refunded, I saw it on the statement. Close it, but keep the hotel booking task open because the second night still shows as pending and I want that confirmed in writing.',
  'Taxes: the 1099 from the brokerage has not arrived. Leave it open with a check date of the 20th; if it is still missing then, write to them.',
  'Unticked items in this batch are not done just because I did not tick them. Keep active in C7 -- just because it isn\'t checked, doesn\'t mean you close it. Ask me about any you are unsure of before moving anything to the archive, and tell me which ones you kept so I can see the whole list once everything worked well.',
].join('\n\n');
const LAST_WORDS = 'once everything worked well.';

let surfaceId = '', button: any;
test('a press sending a long multiline typed note: Exo\'s prompt holds all of it', async () => {
  assert.ok(NOTE.length > 2000 && NOTE.split('\n').length > 10, `note ${NOTE.length} characters, ${NOTE.split('\n').length} lines`);
  const snapshot = '- region "Carried tasks" [ref=ct]:\n  - textbox "Batch 2 notes" [ref=note] [multiline]\n  - button "Apply" [ref=apply] [action=apply] [sends=note]';
  host.send('primary', `call: ${JSON.stringify({ baseRevision: 0, snapshot })}`);
  await until('the drawn page', async () => (await pages()).revision === 1 && turns() >= 1);
  const drawn = (await pages()).delivery.checkpoint;
  button = drawn.messages.flatMap((m: any) => m.updateComponents?.components ?? []).find((n: any) => n.action?.event);
  surfaceId = drawn.messages.find((m: any) => m.createSurface).createSurface.surfaceId;
  const context = Object.fromEntries(Object.keys(button.action.event.context).map(k => [k, NOTE]));
  const before = turns();
  const pressed = await f.rpc.action({ threadId: 'primary', revision: 1, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: [CATALOG] } } } });
  assert.deepEqual(pressed, { accepted: true });
  await until('the press turn', () => turns() > before);
  const prompt = lastPrompt();
  assert.ok(prompt.startsWith('▸ Carried tasks · Apply — Batch 2 notes: “'), prompt.slice(0, 120));
  assert.ok(prompt.includes(`“${NOTE}”`), `Exo received ${prompt.length} characters, ending ${JSON.stringify(prompt.slice(-80))}`);
  assert.ok(prompt.includes(LAST_WORDS));
});

test('a long typed note Exo hears about on the next turn (inputs changed) arrives in full', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  const edited = NOTE.replace('Batch 2 review', 'Batch 2 review, second pass');
  const revision = (await pages()).revision;
  await f.rpc.edit({ threadId: 'primary', revision, surfaceId, updates: [{ path: button.action.event.context[Object.keys(button.action.event.context)[0]].path, value: edited }], mutationId: randomUUID() });
  const before = turns();
  host.send('primary', 'what changed?');
  await until('the turn after the edit', () => turns() > before);
  const heard = journal().filter(e => e.type === 'custom_message' && e.customType === 'page-edits').map(e => textOf(e)).at(-1) ?? '';
  assert.ok(heard.includes(edited.replace(/\r?\n/g, '\n')), `Exo heard ${heard.length} characters: ${JSON.stringify(heard.slice(-120))}`);
});
