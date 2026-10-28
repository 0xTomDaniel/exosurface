// Deterministic content for the native-layout spike. No LLM, no network, no personal data.
// Everything here is synthetic so screenshots can be committed.

export const PLUGIN_ID = 'native-layout-spike';
export const PROVIDER_ID = 'nls-fixture';
export const PANEL_ACTION_ID = 'pages';
export const INPUT_RENDERER_ID = 'nls-confirm';
export const MODEL = {
  id: 'layout-fixture', model: 'layout-fixture', displayName: 'Layout fixture (not an LLM)',
  description: 'Deterministic staging fixture for the native BB layout spike', isDefault: true,
  supportedReasoningEfforts: [{ reasoningEffort: 'low' as const, description: 'Fixture; no reasoning' }],
  defaultReasoningEffort: 'low' as const,
};

export type Role = 'home' | 'surface' | 'worker';
export type SpikeThread = { role: Role; key: string; title: string; parentKey?: string; hidden?: boolean };

// Home is the single Exo entry; surfaces are child threads of Home; the worker is hidden plumbing.
export const LAYOUT: SpikeThread[] = [
  { role: 'home', key: 'home', title: 'Exo' },
  { role: 'surface', key: 'car', title: 'Car registration', parentKey: 'home' },
  { role: 'surface', key: 'taxes', title: 'Taxes 2025', parentKey: 'home' },
  { role: 'worker', key: 'worker', title: 'hidden worker (plumbing)', parentKey: 'home', hidden: true },
];

export type Page = { id: string; title: string; body: string[]; buttons: { id: string; label: string }[] };

export function pagesFor(key: string): Page[] {
  if (key === 'home') return [
    { id: 'today', title: 'Today', body: ['Review draft', 'Prepare demo', 'Team check-in Fri 10:00 AM'], buttons: [{ id: 'done-run', label: 'Mark review done' }, { id: 'ask', label: 'Ask me something (needs input)' }] },
    { id: 'week', title: 'This week', body: ['MIT: ship staging layout spike', '3 tasks waiting on others'], buttons: [{ id: 'slot', label: 'Slot tasks' }] },
  ];
  if (key === 'car') return [{ id: 'reg', title: 'Registration receipt', body: ['Plate FIXTURE-1', 'Total $0.00 (synthetic)'], buttons: [{ id: 'filed', label: 'Filed it' }] }];
  if (key === 'taxes') return [{ id: 'status', title: 'Return status', body: ['Federal: accepted (synthetic)', 'State: accepted (synthetic)'], buttons: [{ id: 'archive', label: 'Archive surface' }] }];
  return [];
}

export const PRESS_PREFIX = '[page press]';
export const pressText = (pageId: string, buttonId: string, label: string) => `${PRESS_PREFIX} ${pageId}/${buttonId} "${label}"`;

// What the fixture provider replies to a user/page message. SLOW_ marks an interruptible long turn.
export function reply(input: string): { text: string; delayMs: number } {
  const value = input.trim();
  if (value.startsWith(PRESS_PREFIX)) return { text: `Fixture saw the button press: ${value.slice(PRESS_PREFIX.length).trim()}`, delayMs: 300 };
  if (value.startsWith('SLOW')) return { text: 'Fixture finished the slow turn.', delayMs: 20_000 };
  if (!value) return { text: 'Fixture ready.', delayMs: 0 };
  return { text: `Fixture echo: ${value.slice(0, 2000)}`, delayMs: 200 };
}

// Staging guard: refuse anything that looks like the live BB server/daemon. An accident guard, not a sandbox.
export const LIVE_PORTS = [38886, 38887];
export function assertStagingUrl(url: string) {
  const u = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error(`Staging must be loopback, got ${u.hostname}`);
  if (LIVE_PORTS.includes(Number(u.port || 80))) throw new Error(`Refusing live BB port ${u.port}`);
  return u;
}
