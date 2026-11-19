// #143 (#31; owner ruling 2026-11-06): a person's typed textbox notes reach Exo in full. A press that sends a long
// multiline note, and a typed note Exo hears about on the next turn, arrive whole in Exo's prompt as Pi recorded it.
// Through the live entry points: server.ts RPCs (action, edit), the mock BB's dispatch to host.ts, the release owner, real Pi.
import { required } from './required.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { liveFixture, owner, bridge, modelRequests } from './mock-bb.ts';
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
void test('a press sending a long multiline typed note: Exo\'s prompt holds all of it', async () => {
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

void test('a long typed note Exo hears about on the next turn (inputs changed) arrives in full', async () => {
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

void test('a press near the press bound: Exo\'s prompt holds the whole note', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  // Six batches of notes, over 12,000 characters: over every bound short of the press's own (16,384 with the press).
  const long = [2, 3, 4, 5, 6, 7].map(n => NOTE.replace('Batch 2 review', `Batch ${n} review`)).join('\n\n');
  assert.ok(long.length > 12000 && long.length < 15500, `note ${long.length} characters`);
  const revision = (await pages()).revision, before = turns();
  const context = Object.fromEntries(Object.keys(button.action.event.context).map(k => [k, long]));
  const pressed = await f.rpc.action({ threadId: 'primary', revision, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: [CATALOG] } } } });
  assert.deepEqual(pressed, { accepted: true });
  await until('the press turn', () => turns() > before);
  const prompt = lastPrompt();
  assert.ok(prompt.includes(`“${long}”`), `Exo received ${prompt.length} characters, ending ${JSON.stringify(prompt.slice(-80))}`);
});

void test('the page state sent with each request (the outline): a saved note too long for it is never cut silently', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  // The person saves a note on the page (edit RPC), then sends a message; the page state is what the model received with it.
  const path = button.action.event.context[Object.keys(button.action.event.context)[0]].path;
  async function sentWith(note: string) {
    await f.rpc.edit({ threadId: 'primary', revision: (await pages()).revision, surfaceId, updates: [{ path, value: note }], mutationId: randomUUID() });
    const before = turns();
    host.send('primary', 'what does the page say?');
    await until('the turn after the edit', () => turns() > before);
    const state = required(modelRequests(f).at(-1), "Expected modelRequests(f).at(-1) to be non-null").messages.findLast((m: any) => m.role === 'user' && textOf(m).startsWith('Machine state of the surface'));
    return textOf(state);
  }
  const short = await sentWith(NOTE);
  assert.ok(short.includes(NOTE.replace(/\n/g, '\\n')), 'a note that fits is in the outline whole');
  const long = [2, 3, 4, 5, 6, 7].map(n => NOTE.replace('Batch 2 review', `Batch ${n} review`)).join('\n\n');
  const outline = await sentWith(long);
  assert.ok(!outline.endsWith('…'), `no silent cut; ends ${JSON.stringify(outline.slice(-120))}`);
  assert.match(outline, /\n\[The outline stops here: the pages run to \d+ characters, more than the 12000 it holds\. read_exosurface with a page's ref shows it in full, typed text included\.\]$/);
});

void test('a press or an edit over the bounds is refused in plain words; nothing is changed or sent', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  const path = button.action.event.context[Object.keys(button.action.event.context)[0]].path;
  const revision = (await pages()).revision, before = turns(), sent = f.sends.length, over = 'x'.repeat(16385);
  // Each value at the input bound (BB's rpc contract refuses one longer before the server); the press as a whole runs past its bound.
  const context = Object.fromEntries(Object.keys(button.action.event.context).map(k => [k, 'x'.repeat(16384)]));
  await assert.rejects(f.rpc.action({ threadId: 'primary', revision, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: [CATALOG] } } } }),
    { message: /^This press carries \d+ characters with its typed text; a press carries at most 16384\. Nothing was sent; shorten the text and press again\.$/ });
  await assert.rejects(f.rpc.edit({ threadId: 'primary', revision, surfaceId, updates: [{ path, value: over }], mutationId: randomUUID() }),
    { message: 'The typed text is 16385 characters; a page input holds at most 16384. Nothing was changed or sent.' });
  // One edit whose updates together run past the page command bound (20,000 units), each update within the input bound.
  await assert.rejects(f.rpc.edit({ threadId: 'primary', revision, surfaceId, updates: [{ path, value: 'y'.repeat(10000) }, { path, value: 'z'.repeat(10000) }], mutationId: randomUUID() }),
    { message: 'Page command exceeds 20000 serialized UTF-16 units. Nothing was changed or sent.' });
  assert.equal((await pages()).revision, revision);
  assert.equal(f.sends.length, sent);
  assert.equal(turns(), before);
});

void test('an edit whose page command is exactly 20000 units is saved; one unit more is refused in plain words, the page unchanged', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  const path = button.action.event.context[Object.keys(button.action.event.context)[0]].path;
  const revision = (await pages()).revision, mutationId = randomUUID();
  // The page command the edit becomes, as written to the owner:
  // {"revision":R,"surfaceId":"S","updates":[{"path":"P","value":"A"},{"path":"P","value":"B"}],"mutationId":"M","source":"edit"}
  // Its fixed characters, counted by hand: 12+14+13+9+11+3+9+11+3+15+18 = 118.
  const fixed = 118 + String(revision).length + surfaceId.length + 2 * path.length + mutationId.length, b = 'b'.repeat(9000);
  const a = 'a'.repeat(20000 - fixed - b.length);
  assert.ok(a.length <= 16384, `each value within the input bound (${a.length})`);
  assert.deepEqual(await f.rpc.edit({ threadId: 'primary', revision, surfaceId, updates: [{ path, value: a }, { path, value: b }], mutationId }), { revision: revision + 1 });
  const sent = f.sends.length, before = turns();
  await assert.rejects(f.rpc.edit({ threadId: 'primary', revision: revision + 1, surfaceId, updates: [{ path, value: a + 'a' }, { path, value: b }], mutationId: randomUUID() }),
    { message: 'Page command exceeds 20000 serialized UTF-16 units. Nothing was changed or sent.' });
  assert.equal((await pages()).revision, revision + 1);
  assert.equal(f.sends.length, sent);
  assert.equal(turns(), before);
});

void test('a press on an earlier version (bring-back) over the bounds is refused in plain words; nothing is brought back or sent', async () => {
  assert.ok(surfaceId, 'needs the drawn page');
  const path = button.action.event.context[Object.keys(button.action.event.context)[0]].path;
  const revision = (await pages()).revision, before = turns(), sent = f.sends.length;
  assert.ok(revision > 1, 'the page as first drawn (revision 1) is an earlier version now');
  const press = (context: Record<string, string>) => f.rpc.action({ threadId: 'primary', revision, rewind: { surface: surfaceId, revision: 1 }, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: [CATALOG] } } } });
  const keys = Object.keys(button.action.event.context);
  // The person typed 16,385 characters into the earlier version before pressing: the bring-back carries them.
  await f.rpc.pending({ threadId: 'primary', op: 'set', version: { surface: surfaceId, revision: 1 }, updates: [{ path, value: 'x'.repeat(16385) }] });
  await assert.rejects(press(Object.fromEntries(keys.map(k => [k, 'short']))),
    { message: 'The typed text is 16385 characters; a page input holds at most 16384. Nothing was changed or sent.' });
  await f.rpc.pending({ threadId: 'primary', op: 'clear' });
  // The press itself over its bound, on the earlier version.
  await assert.rejects(press(Object.fromEntries(keys.map(k => [k, 'x'.repeat(16384)]))),
    { message: /^This press carries \d+ characters with its typed text; a press carries at most 16384\. Nothing was sent; shorten the text and press again\.$/ });
  assert.equal((await pages()).revision, revision);
  assert.equal(f.sends.length, sent);
  assert.equal(turns(), before);
});
