// acceptance-keep: rendered person action, canonical public workspace delivery, retention and owner replay.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';
import { waiter } from './wait.ts';

const f = await liveFixture();
let ownerProcess = await owner(f), host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const view = kit.renderSlot(app.navPanels.find((p: { path: string }) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
const reply = () => view.container.querySelector('[data-exo-reply]')?.textContent;
const until = waiter(() => view.container.textContent ?? '');
const workspace = () => f.rpc.workspace({ deployment: 'main', cursor: null });
async function send(text: string) {
  await until('idle input', () => !!view.queryByRole('textbox', { name: 'Message' }) && !(view.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).disabled && view.container.querySelector('p.exo-status')?.getAttribute('data-busy') === 'false');
  fireEvent.change(view.getByRole('textbox', { name: 'Message' }), { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send', exact: true }));
  await until('finished reply', () => reply() === `Exo (${f.setup.profile}): ${text}`);
}
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('close', resolve)); }
  await new Promise(resolve => setTimeout(resolve, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

test('acceptance-keep: Keep persists the page through new topics, canvas retention and owner replay', async () => {
  await send('draw plum: Plum plan');
  await until('the page to be idle', () => view.container.querySelector('p.exo-status')?.getAttribute('data-busy') === 'false');
  fireEvent.click(view.getByRole('button', { name: 'Keep', exact: true }));
  await until('public kept metadata', async () => (await workspace()).delivery.checkpoint?.kept?.includes('plum') === true);
  const saved = await workspace(), revision = saved.revision;
  await assert.rejects(f.rpc.edit({ threadId: 'primary', revision: revision - 1, surfaceId: 'plum', updates: [], keep: true, mutationId: crypto.randomUUID() }), /stale_revision/);
  assert.equal((await workspace()).revision, revision, 'stale Keep does not mutate the page');
  for (const [ref, title] of [['pear', 'Pear plan'], ['apple', 'Apple plan'], ['lime', 'Lime plan'], ['lemon', 'Lemon plan'], ['grape', 'Grape plan'], ['peach', 'Peach plan'], ['cherry', 'Cherry plan'], ['berry', 'Berry plan']]) await send(`draw ${ref}: ${title}`);
  assert.ok(view.getByRole('button', { name: 'Plum plan (kept)', exact: true }));
  assert.ok(view.getByRole('button', { name: 'Berry plan', exact: true }));
  assert.deepEqual((await workspace()).delivery.checkpoint.kept, ['plum']);
  // Restart only the isolated fixture through its normal owner/bridge startup, so state is rebuilt from the canonical journal.
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('close', resolve)); }
  ownerProcess = await owner(f); host = bridge(f);
  assert.equal((await host.start('primary')).error, undefined);
  const replayed = await workspace();
  assert.deepEqual(replayed.delivery.checkpoint.kept, ['plum']);
  assert.ok(replayed.delivery.checkpoint.messages.some((message: { createSurface?: { surfaceId: string } }) => message.createSurface?.surfaceId === 'plum'));
  fireEvent.click(view.getByRole('button', { name: 'Plum plan (kept)', exact: true }));
  await until('kept page selected', () => view.container.querySelector('.exo-stage [data-surface]')?.getAttribute('data-surface') === 'plum');
  await send('reply without changing or drawing a page');
  const block = await f.rpc.exo_block({ threadId: 'primary', page: 'plum' });
  assert.equal(block.said, 'reply without changing or drawing a page');
  assert.equal(block.words, `Exo (${f.setup.profile}): reply without changing or drawing a page`);
  assert.equal((await f.rpc.exo_block({ threadId: 'primary', page: 'berry' })).said, 'draw berry: Berry plan');
});
