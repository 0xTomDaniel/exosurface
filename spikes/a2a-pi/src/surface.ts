import { A2uiMessageSchema, type A2uiMessage, type ComponentApi } from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';
import { CATALOG, type Snapshot } from './schema.js';

// All widgets are stock catalog components; Exo supplies domain data and actions.
export function surfaceMessages(state: Snapshot): A2uiMessage[] {
  const components: Record<string, unknown>[] = [];
  const children: string[] = ['heading'];
  const add = (c: Record<string, unknown>) => components.push(c);
  add({ id: 'heading', component: 'Text', text: 'Your day, in focus', variant: 'h2' });
  for (const task of state.tasks) {
    const key = task.id;
    children.push(`row-${key}`);
    add({ id: `row-${key}`, component: 'Row', children: [`time-${key}`, `label-${key}`, `select-${key}`, `move-${key}`], align: 'center' });
    add({ id: `time-${key}`, component: 'Text', text: { path: `/times/${key}` }, variant: 'body' });
    add({ id: `label-${key}`, component: 'Text', text: `${task.title} · ${task.minutes} min`, weight: 1 });
    add({ id: `select-label-${key}`, component: 'Text', text: 'Select' });
    add({ id: `select-${key}`, component: 'Button', child: `select-label-${key}`,
      action: { event: { name: 'select', context: { objectId: key, revision: state.revision } } } });
    add({ id: `move-label-${key}`, component: 'Text', text: 'After lunch' });
    add({ id: `move-${key}`, component: 'Button', child: `move-label-${key}`,
      action: { event: { name: 'move', context: { objectId: key, revision: state.revision } } } });
  }
  for (const proposal of state.proposals.slice(-3)) {
    const label = `proposal-label-${proposal.id}`;
    add({ id: label, component: 'Text', text: `${proposal.objectId} → ${proposal.time} · ${proposal.status}${proposal.status === 'accepted' && proposal.sourceRevision !== state.sourceRevision ? ' · source changed since acceptance' : ''}` });
    children.push(label);
    if (proposal.status === 'pending') {
      const id = `accept-${proposal.id}`;
      add({ id: `${id}-label`, component: 'Text', text: 'Use this version' });
      add({ id, component: 'Button', child: `${id}-label`, action: { event: { name: 'accept',
        context: { proposalId: proposal.id, revision: state.revision } } } });
      children.push(id);
    }
  }
  components.unshift({ id: 'root', component: 'Column', children });
  const messages: unknown[] = [
    { version: 'v0.9', createSurface: { surfaceId: state.surfaceId, catalogId: CATALOG } },
    { version: 'v0.9', updateComponents: { surfaceId: state.surfaceId, components } },
    { version: 'v0.9', updateDataModel: { surfaceId: state.surfaceId, path: '/', value: {
      times: Object.fromEntries(state.tasks.map(t => [t.id, t.time])) } } },
    { version: 'v0.9', createSurface: { surfaceId: 'studio-lights', catalogId: CATALOG } },
    { version: 'v0.9', updateComponents: { surfaceId: 'studio-lights', components: [
      { id: 'root', component: 'Column', children: ['light-title', 'light-state', 'light-toggle'] },
      { id: 'light-title', component: 'Text', text: 'Studio light', variant: 'h3' },
      { id: 'light-state', component: 'Text', text: { path: '/status' } },
      { id: 'light-label', component: 'Text', text: state.lights.studio ? 'Turn off' : 'Turn on' },
      { id: 'light-toggle', component: 'Button', child: 'light-label', action: { event: { name: 'light', context: { revision: state.revision } } } },
    ] } },
    { version: 'v0.9', updateDataModel: { surfaceId: 'studio-lights', path: '/', value: { status: state.lights.studio ? 'On · simulated' : 'Off · simulated' } } },
  ];
  return validateMessages([...messages, ...(state.modelResponse?.operations ?? [])]);
}

export function validateMessages(values: unknown[]): A2uiMessage[] {
  return values.map(value => {
    const message = A2uiMessageSchema.parse(value);
    if (message.version !== 'v0.9') throw new Error('This spike pins A2UI v0.9');
    if ('createSurface' in message && message.createSurface.catalogId !== CATALOG) throw new Error('Unapproved catalog');
    if ('updateComponents' in message) {
      for (const component of message.updateComponents.components) {
        const api: ComponentApi | undefined = basicCatalog.components.get(component.component);
        if (!api) throw new Error(`Unapproved component ${component.component}`);
        const { id: _id, component: _kind, ...properties } = component;
        api.schema.parse(properties);
      }
    }
    return message;
  });
}

export function validateReflection(values: unknown[]): A2uiMessage[] {
  if (values.length > 4 || Buffer.byteLength(JSON.stringify(values)) > 24000) throw new Error('Generated surface exceeds bound');
  const messages = validateMessages(values);
  const components = new Map<string, Record<string, unknown>>();
  let created = false;
  for (const message of messages) {
    if ('createSurface' in message) {
      if (created || message.createSurface.surfaceId !== 'exo-reflection') throw new Error('Unapproved generated surface');
      created = true;
    } else if ('updateComponents' in message) {
      if (!created || message.updateComponents.surfaceId !== 'exo-reflection') throw new Error('Create the reflection before updating it');
      for (const component of message.updateComponents.components) {
        if (!['Text', 'Column', 'Row', 'Card', 'Divider'].includes(component.component)) throw new Error('Unapproved generated component');
        if (components.has(component.id)) throw new Error('Duplicate generated component');
        if (component.id.length > 80 || components.size >= 64) throw new Error('Generated component bound exceeded');
        if (component.component === 'Text' && typeof component.text !== 'string') throw new Error('Reflection requires literal text');
        components.set(component.id, component);
      }
    } else throw new Error('Only a new reflection is permitted');
  }
  const reached = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error('Cyclic generated component graph');
    if (reached.has(id)) return;
    const component = components.get(id); if (!component) throw new Error(`Missing child ${id}`);
    visiting.add(id); reached.add(id);
    const children = component.component === 'Card' ? [component.child] : ['Column', 'Row'].includes(String(component.component)) ? component.children : [];
    if (!Array.isArray(children) || children.some(child => typeof child !== 'string')) throw new Error('Reflection requires literal child references');
    for (const child of children) visit(String(child));
    visiting.delete(id);
  }
  visit('root');
  if (reached.size !== components.size) throw new Error('Unreachable generated component');
  return messages;
}
