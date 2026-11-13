import { required } from './required.ts';
// What the person sees of the rendered Exo tab (#130), read as strings and counts: settings and their set-up fields, the
// sidebar, the surface in view and its input. Shared by test/set-up*.test.ts and demo/surfaces first-run.

// Shown: neither it nor anything around it is hidden from the person (aria-hidden, the hidden attribute, display:none).
export const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('hidden') || getComputedStyle(at).display === 'none') return false; return true; };
const CONTROL = 'input, select, textarea';

export function exoTab(view: { container: Element }, fireEvent: { click(el: Element): unknown; change(el: Element, init: object): unknown }) {
  const all = (selector: string) => [...view.container.querySelectorAll(selector)].filter(shown) as HTMLElement[];
  const settings = () => all('main[aria-label="Settings"]')[0] ?? null;
  const sidebar = () => all('nav[aria-label="Surfaces"]')[0] ?? null;
  const controls = () => [...(settings()?.querySelectorAll('label') ?? [])].filter(shown).map(label => ({ label, control: label.querySelector(CONTROL) as HTMLInputElement | HTMLSelectElement | null })).filter(x => x.control);
  const labelText = (label: Element) => [...label.childNodes].filter(n => !(n instanceof Element && n.matches(CONTROL))).map(n => n.textContent ?? '').join('').trim();
  const valueOf = (c: HTMLInputElement | HTMLSelectElement) => c instanceof HTMLSelectElement ? String(c.selectedOptions[0]?.textContent ?? '') : String(c.value);
  const buttons = (within: Element | null) => [...(within?.querySelectorAll('button') ?? [])].filter(shown) as HTMLButtonElement[];
  const messageInput = () => all('form[aria-label="Message Exo"] textarea')[0] as HTMLTextAreaElement | undefined;
  const t = {
    settingsShown: () => all('main[aria-label="Settings"]').length,
    sidebarShown: () => all('nav[aria-label="Surfaces"]').length,
    surfaceShown: () => all('main[aria-label="Exo"]').length,
    /** Settings' words other than their fields and buttons, in order. */
    text: () => [...(settings()?.querySelectorAll('h1, p') ?? [])].filter(shown).map(p => String(p.textContent)),
    /** Each set-up field: its label, its value, and whether the person may change it. */
    fields: () => controls().map(({ label, control }) => [labelText(label), valueOf(required(control, "Expected control to be non-null")), !required(control, "Expected control to be non-null").disabled] as [string, string, boolean]),
    /** The settings button that sets Exo up (or resumes it), if offered and enabled. */
    setUpButton: () => { const b = buttons(settings()).find(b => /^(Set up Exo|Resume set-up)$/.test(String(b.textContent))); return b && !b.disabled ? String(b.textContent) : null; },
    alerts: () => all('[role="alert"]').map(a => String(a.textContent)),
    listed: () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => String(li.textContent)),
    inView: () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => String(b.textContent)),
    /** The message input's value, or null when it is not shown. */
    input: () => { const i = messageInput(); return i ? String(i.value) : null; },
    /** Message inputs shown. */
    inputs: () => all('form[aria-label="Message Exo"]').length,
    press: (name: string) => { const b = buttons(view.container).find(b => b.textContent === name); if (!b) throw new Error(`no button "${name}"`); fireEvent.click(b); },
    describe: () => `settings ${t.settingsShown()} ${JSON.stringify(t.text())} fields ${JSON.stringify(t.fields())} button ${t.setUpButton()} alerts ${JSON.stringify(t.alerts())}; sidebar ${JSON.stringify(t.listed())} in view ${JSON.stringify(t.inView())}; surface ${t.surfaceShown()}; input ${JSON.stringify(t.input())}`,
  };
  return t;
}
