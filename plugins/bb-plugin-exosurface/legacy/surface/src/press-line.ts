// A button press (spec pages-and-activity S3, F6) reaches Exo as the person's message, the press line describePress
// writes (canvas-memory.ts). The button's label travels beside it as data, never parsed back from the line: the pages
// extension journals this entry just before the press message, and the Exo block shows its label as the person's bubble.
// A send from the surface's input journals the same entry, without a label (spec E10).
// No imports: the primary's journal reader (legacy/primary/src/exo-turn.ts) reads it too.
export const PRESS_ENTRY='exosurface-press';
/** The message it goes with (`line`: shown or placed only when the message is that line); a press's button label; and the
 *  page the send or press came from (the page in view, a press's the page its button sits on), absent in older journals. */
export interface PressEntry {label?:string;line:string;page?:string}
