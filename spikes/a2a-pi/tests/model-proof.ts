import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { startHost } from '../src/host.js';
import { connectClient, discover, sendIntent } from '../src/client.js';
import type { Snapshot } from '../src/schema.js';
const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-real-pi-'));
let host = await startHost({ stateDir: dir, port: 61001 });
const vite = await createServer(); await vite.listen();
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const client = await connectClient(host.url);
const proofs: unknown[] = [];
const evidence = 'evidence/generated'; mkdirSync(evidence, { recursive: true });
async function waitModel(previous: number): Promise<Snapshot> {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const state = await discover(client);
    const work = state.work.filter(w => w.kind === 'pi-conversation')[previous];
    if (work?.state === 'failed') throw new Error(work.outcome);
    if (work?.state === 'completed') return state;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Pi model execution timed out after 120 seconds');
}
try {
  await page.goto('http://127.0.0.1:61011');
  const initial = await discover(client);
  await sendIntent(client, { name: 'select', objectId: 'research-review', revision: initial.revision, surfaceId: initial.surfaceId });
  let state = await discover(client);
  await sendIntent(client, { name: 'ask', objectId: 'research-review', referenceRevision: initial.revision, revision: state.revision, surfaceId: state.surfaceId });
  state = await waitModel(0);
  assert.ok(JSON.stringify(state.modelResponse?.operations).includes('research-review'));
  assert.equal(state.turns.find(t => t.kind === 'ask')?.utterance, undefined);
  assert.equal(state.modelResponse?.utterance, undefined, 'A visual-only turn does not require a linguistic expression');
  await page.getByRole('region', { name: 'Exo Pi visual response' }).getByText(/research-review/).first().waitFor();
  proofs.push(JSON.parse(readFileSync(join(dir, 'pi-proof.json'), 'utf8')));
  await host.close();
  host = await startHost({ stateDir: dir, port: 61001 });
  // Restart can invalidate an HTTP keep-alive connection. Exercise read-only
  // recovery, like the browser watchdog, without resubmitting the model turn.
  for (let attempt = 0; ; attempt++) {
    try { state = await discover(client); break; }
    catch (error) { if (attempt >= 4) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(JSON.stringify(state.modelResponse?.operations).includes('research-review'), 'Pi visual output survives host restart');
  await sendIntent(client, { name: 'move', objectId: 'research-review', referenceRevision: initial.revision, revision: state.revision, surfaceId: state.surfaceId, utterance: 'Move this after lunch' });
  state = await discover(client);
  await sendIntent(client, { name: 'accept', proposalId: state.proposals[0]!.id, revision: state.revision, surfaceId: state.surfaceId });
  writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace("time: '11:00'", "time: '14:15'"));
  state = await discover(client);
  await page.reload();
  await sendIntent(client, { name: 'ask', objectId: 'research-review', referenceRevision: initial.revision, revision: state.revision, surfaceId: state.surfaceId,
    utterance: 'Explain why this selected task changed. What were its original visual time, accepted time, and current source time?' });
  state = await waitModel(1);
  const result = JSON.stringify(state.modelResponse?.operations);
  assert.ok(result.includes('research-review'), 'Exact selected object survives model projection');
  assert.ok(result.includes('11:00'), 'Historical visual time restored into Pi');
  assert.match(result, /13:00|1:00\s*PM/i, 'Accepted historical decision available to Pi');
  assert.match(result, /14:15|2:15\s*PM/i, 'Current source time available to Pi');
  proofs.push(JSON.parse(readFileSync(join(dir, 'pi-proof.json'), 'utf8')));
  await page.getByRole('region', { name: 'Exo Pi visual response' }).getByText(/14:15|2:15\s*PM/i).first().waitFor();
  await page.screenshot({ path: `${evidence}/pi-historical-reference.png`, fullPage: true });
  writeFileSync(`${evidence}/pi-proof.json`, JSON.stringify({ status: 'PASS', model: state.model, stateDir: dir, proofs }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', model: state.model, modelCalls: 2, stateDir: dir, evidence: `${evidence}/pi-proof.json` }));
} catch (error) {
  writeFileSync(`${evidence}/pi-proof.json`, JSON.stringify({ status: 'FAIL', error: error instanceof Error ? error.message : String(error), stateDir: dir, proofs }, null, 2));
  console.error(error instanceof Error ? error.message : 'Model validation failed'); process.exitCode = 1;
} finally { await browser.close(); await vite.close(); await host.close(); }
