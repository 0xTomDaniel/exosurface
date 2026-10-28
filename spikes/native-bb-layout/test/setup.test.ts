import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../server.ts';

function fixture() {
  let stored: any;
  let handlers: any;
  let failChild = false;
  const threads = new Map<string, any>();
  let count = 0;
  const bb: any = {
    providers: { register() {} },
    storage: { kv: { get: async () => stored, set: async (_: string, value: any) => { stored = structuredClone(value); } } },
    rpc: { register: (_: unknown, value: any) => { handlers = value; } },
    sdk: {
      projects: { list: async () => ({ projects: [{ id: 'synthetic-project', name: 'Layout fixture' }] }) },
      threads: {
        get: async ({ threadId }: any) => ({ thread: threads.get(threadId) }),
        spawn: async (args: any) => {
          assert.equal(args.environment.type, 'project-default');
          if (args.parentThreadId && failChild) throw new Error('synthetic provisioning failure');
          if (args.input?.length === 0) throw new Error('input must contain at least one entry');
          const id = `synthetic-${++count}`;
          threads.set(id, { ...args, id, environmentId: 'synthetic-env', status: 'idle' });
          return { id };
        },
      },
    },
  };
  plugin(bb);
  return { handlers, threads, get stored() { return stored; }, set failChild(value: boolean) { failChild = value; } };
}

test('staging setup creates one root, visible children, hidden worker; repeat is idempotent', async () => {
  const f = fixture();
  const first = await f.handlers.setup({ presetTabs: false });
  assert.equal(first.threads.length, 4);
  assert.equal(f.threads.size, 4);
  assert.equal(first.threads.filter((t: any) => t.visibility === 'hidden').length, 1);
  await f.handlers.setup({ presetTabs: false });
  assert.equal(f.threads.size, 4);
});

test('partial staging setup retains the root binding and resumes without duplicate root', async () => {
  const f = fixture(); f.failChild = true;
  await assert.rejects(f.handlers.setup({ presetTabs: false }), /synthetic provisioning failure/);
  assert.equal(f.threads.size, 1);
  assert.ok(f.stored.ids.home);
  f.failChild = false;
  await f.handlers.setup({ presetTabs: false });
  assert.equal(f.threads.size, 4);
});
