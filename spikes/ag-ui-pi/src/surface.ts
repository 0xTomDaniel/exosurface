import { A2uiMessageSchema, type A2uiMessage } from "@a2ui/web_core/v0_9";
import { CATALOG, SURFACE, type View } from "./domain.js";

/** Fixed-schema A2UI, as recommended by the upstream AG-UI integration skill. */
export function surfaceOperations(view: View): A2uiMessage[] {
  const components: Record<string, unknown>[] = [];
  const text = (id: string, value: string, variant = "body") => {
    components.push({ id, component: "Text", text: value, variant });
    return id;
  };
  const button = (
    id: string,
    label: string,
    name: string,
    objectId?: string,
  ) => {
    const child = text(`${id}:label`, label);
    components.push({
      id,
      component: "Button",
      child,
      action: {
        event: {
          name,
          context: {
            revision: view.revision,
            objectId: objectId ?? "",
            proposalId: view.proposal?.id ?? "",
          },
        },
      },
    });
    return id;
  };
  const children = [
    text("title", "A day with room to think", "h2"),
    text(
      "date",
      `${view.source.date} · source revision ${view.source.revision}`,
    ),
  ];
  for (const task of view.source.tasks) {
    const rowChildren = [
      text(`${task.id}:time`, `${task.time} · ${task.duration} min`),
      text(`${task.id}:title`, task.title, "h4"),
      text(
        `${task.id}:lock`,
        task.locked ? "Morning focus · locked" : "Flexible",
      ),
    ];
    rowChildren.push(button(`${task.id}:select`, "Select", "select", task.id));
    if (!task.locked)
      rowChildren.push(
        button(`${task.id}:move`, "After lunch", "move", task.id),
      );
    components.push({
      id: `${task.id}:row`,
      component: "Column",
      children: rowChildren,
    });
    children.push(`${task.id}:row`);
  }
  if (view.proposal) {
    children.push(
      text("proposal-title", `Proposal · ${view.proposal.status}`, "h3"),
    );
    children.push(
      text(
        "proposal-detail",
        `${view.source.tasks.find((t) => t.id === view.proposal?.taskId)?.title ?? view.proposal.taskId} → ${view.proposal.time}`,
      ),
    );
    if (view.proposal.status === "pending")
      children.push(button("accept", "Use this version", "accept"));
  }
  children.push(button("plan", "Assemble an agenda", "plan"));
  children.push(text("room-title", "The reading room", "h3"));
  children.push(
    text("light-state", view.light ? "The lamp is on." : "The lamp is off."),
  );
  children.push(
    button("light", view.light ? "Turn lamp off" : "Turn lamp on", "light"),
  );
  components.push({ id: "root", component: "Column", children });
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId: SURFACE, catalogId: CATALOG },
    },
    { version: "v0.9", updateComponents: { surfaceId: SURFACE, components } },
    {
      version: "v0.9",
      updateDataModel: {
        surfaceId: SURFACE,
        path: "/",
        value: {
          revision: view.revision,
          sourceRevision: view.source.revision,
        },
      },
    },
  ].map((v) => A2uiMessageSchema.parse(v));
}
