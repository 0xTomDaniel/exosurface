// The acceptance-missing-bound-fails assertion, shared by the page-bounds test and the quality-gate test that
// proves `just check` prints it: the message names every enforced bound the contract omits, with its words.
import assert from 'node:assert/strict';
import {statement} from '../src/page-bounds.ts';
import {contractMisses} from '../src/tool-contract.ts';

export function assertContractStatesEveryBound(contract: string): void {
  const misses = contractMisses(contract);
  assert.deepEqual(misses, [], `the update_exosurface contract omits ${String(misses.length)} enforced page bound(s): ${misses.map(k => `${k} (${statement(k)})`).join('; ')}`);
}
