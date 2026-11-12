// Owner decisions #216 comments 6828772822 (Python) and 6830616474 (three source trees): closed owner deferrals the
// root gate (scripts/lint.ts, scripts/check-languages.ts) reads. Deferred means not assessed: not compliant, waived
// or exempt. These tests drive the shared record's public functions against disposable fixture roots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OWNER_DEFERRALS, deferredTreeDrift, isDeferredTree } from '../../../scripts/owner-deferrals.ts';

const prefixes = OWNER_DEFERRALS.sourceTrees.prefixes;
const gated = ['tsconfig.json', 'plugins/bb-plugin-exosurface/tsconfig.json'];

function fixture(trees: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'owner-deferrals-'));
  for (const tree of trees) mkdirSync(join(root, tree), { recursive: true });
  mkdirSync(join(root, 'plugins/bb-plugin-exosurface'), { recursive: true });
  writeFileSync(join(root, 'plugins/bb-plugin-exosurface/tsconfig.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  return root;
}

void test('deferral-trees: the owner record names exactly the three deferred trees', () => {
  assert.deepEqual([...prefixes].sort(), ['plugins/bb-plugin-exo-spike/', 'spikes/a2a-pi/', 'spikes/ag-ui-pi/']);
  assert.match(OWNER_DEFERRALS.sourceTrees.url, /issuecomment-6830616474$/u);
});

void test('deferral-trees: the closed record passes when each tree exists and no gated project is inside one', () => {
  assert.deepEqual(deferredTreeDrift(fixture(prefixes), gated), []);
});

void test('deferral-trees: a missing tree refuses, naming it', () => {
  const drift = deferredTreeDrift(fixture(prefixes.filter((tree) => tree !== 'spikes/ag-ui-pi/')), gated);
  assert.equal(drift.length, 1);
  assert.match(drift.join('\n'), /spikes\/ag-ui-pi\//u);
});

void test('deferral-trees: an extra tree that swallows a gated project refuses, naming both', () => {
  const extra = [...prefixes, 'plugins/bb-plugin-exosurface/'];
  const drift = deferredTreeDrift(fixture(prefixes), gated, extra);
  assert.match(drift.join('\n'), /plugins\/bb-plugin-exosurface\/tsconfig\.json/u);
});

void test('deferral-trees: an altered tree (no trailing slash, or a different name) refuses', () => {
  const root = fixture([...prefixes, 'spikes/a2a-p/']);
  assert.notDeepEqual(deferredTreeDrift(root, gated, prefixes.map((tree) => (tree === 'spikes/a2a-pi/' ? 'spikes/a2a-pi' : tree))), []);
  assert.notDeepEqual(deferredTreeDrift(fixture(prefixes), gated, ['spikes/a2a-p/', ...prefixes.filter((tree) => tree !== 'spikes/a2a-pi/')]), []);
});

void test('deferral-trees: a gated project put back inside a deferred tree refuses, naming it', () => {
  const drift = deferredTreeDrift(fixture(prefixes), [...gated, 'spikes/a2a-pi/tsconfig.json']);
  assert.match(drift.join('\n'), /spikes\/a2a-pi\/tsconfig\.json/u);
});

void test('deferral-trees: membership is by exact directory prefix, never a sibling with a longer name', () => {
  assert.equal(isDeferredTree('spikes/a2a-pi/src/host.ts'), true);
  assert.equal(isDeferredTree('plugins/bb-plugin-exo-spike/app.tsx'), true);
  assert.equal(isDeferredTree('spikes/a2a-pi-next/src/host.ts'), false);
  assert.equal(isDeferredTree('plugins/bb-plugin-exo-spike-two/app.tsx'), false);
  assert.equal(isDeferredTree('plugins/bb-plugin-exosurface/src/config.ts'), false);
});
