import { required } from './required.ts';
// #187 qc (spec pages-and-activity E10, S3; acceptance-exo-block-sent-page): a send's record (the page it came from) is a
// silent journal entry or nothing; it never reaches the model or the person as a message. Here Exo runs without its page
// extension (local config surfaceMain off, the rollback), so no Pi command takes the record. The app (app.tsx) is rendered
// through the SDK's app test runtime (test/app-render.ts); its RPCs run on server.ts, a send goes through the mock BB to
// host.ts and the release owner on the real Pi CLI (test/mock-bb.ts). Fake: BB's host, OptChat, the model.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { liveFixture, owner, bridge, modelRequests } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
writeFileSync(f.config, JSON.stringify({ ...JSON.parse(readFileSync(f.config, 'utf8')), surfaceMain: 'off' }));
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
after(async () => {
  try {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 500));
  } finally { await f.model.close(); rmSync(f.root, { recursive: true, force: true }); }
});

const block = () => view.container.querySelector('section[aria-label="Exo"]');
const said = () => block()?.querySelector('[data-exo-said]')?.textContent ?? '';
const reply = () => block()?.querySelector('[data-exo-reply]')?.textContent ?? '';
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
const until = waiter(() => `bubble ${JSON.stringify(said())}; reply ${JSON.stringify(reply())}`);
/** Every person's message the model was sent, as text. */
const personMessages = () => modelRequests(f).flatMap(r => r.messages).filter(m => m.role === 'user')
  .map(m => typeof m.content === 'string' ? m.content : m.content.map((c: any) => c.text ?? '').join(''));

void test('a send that no Pi command can record goes alone: the model and the Exo block see only the person\'s message', async () => {
  for (const text of ['plan the week', 'which plums are ripe?']) {
    await until('the input to take a message', () => !!input() && !required(input(), "Expected input() to be non-null").disabled && !block()?.querySelector('[role="status"]'));
    fireEvent.change(required(input(), "Expected input() to be non-null"), { target: { value: text } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply() === `Exo (exo-optchat): ${text}` && !block()?.querySelector('[role="status"]'));
    assert.equal(said(), text);
  }
  assert.deepEqual([...new Set(personMessages())].filter(m => m.startsWith('/')), []);
});
