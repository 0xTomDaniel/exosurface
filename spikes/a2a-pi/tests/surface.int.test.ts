import { expect, test } from 'vitest';
import { validateReflection } from '../src/surface.js';
import { CATALOG } from '../src/schema.js';

// Exercise the model-tool validation Interface with the published catalog.
// These are declarative UI inputs, not a replacement model or renderer.
test('generated reflections must be a complete finite approved component graph', () => {
  const create = { version: 'v0.9', createSurface: { surfaceId: 'exo-reflection', catalogId: CATALOG } };
  const update = (components: unknown[]) => ({ version: 'v0.9', updateComponents: { surfaceId: 'exo-reflection', components } });
  const root = { id: 'root', component: 'Column', children: ['text'] };
  const text = { id: 'text', component: 'Text', text: 'Research review was at 11:00.' };
  expect(validateReflection([create, update([root, text])])).toHaveLength(2);
  expect(() => validateReflection([create, update([root])])).toThrow('Missing child');
  expect(() => validateReflection([create, update([{ ...root, children: ['root'] }])])).toThrow('Cyclic');
  expect(() => validateReflection([create, update([root, text, text])])).toThrow('Duplicate');
  expect(() => validateReflection([create, update([root, { ...text, text: { path: '/unknown' } }])])).toThrow('literal text');
  expect(() => validateReflection([create, update([root, text, { id: 'orphan', component: 'Text', text: 'Hidden' }])])).toThrow('Unreachable');
  expect(() => validateReflection([create, update([root, { id: 'text', component: 'Image', url: 'https://example.invalid' }])])).toThrow('Unapproved');
});
