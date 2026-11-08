// A button press (spec pages-and-activity S3, F6) reaches Exo as the person's message, the press line describePress
// writes (canvas-memory.ts). The button's label travels beside it as data, never parsed back from the line: the pages
// extension journals this entry just before the press message, and the Exo block shows its label as the person's bubble.
// No imports: the primary's journal reader (legacy/primary/src/exo-turn.ts) reads it too.
export const PRESS_ENTRY='exosurface-press';
/** The pressed button's label, and the press line it goes with: a message shows as the label only when it is that line. */
export type PressEntry={label:string;line:string};
