import assert from 'node:assert/strict';

/** Checked access: retain false/zero/empty string, fail without inspecting a DOM graph. */
export function required<T>(value: T, message: string): NonNullable<T> {
  assert.ok(value !== null && value !== undefined, message);
  return value;
}
