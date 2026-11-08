// A button press in words (spec pages-and-activity S3, F6): the one line the person's press sends as their message,
// "▸ <surface> · <button> — <input label>: <value> · …", and the button's label read back from it, which the Exo block
// shows as the person's bubble. No imports: the primary's journal reader (legacy/primary/src/exo-turn.ts) reads it too.
export const PRESS_PREFIX='▸ ';
const SURFACE_END=' · ',LABEL_END=' — ';
/** The press line; the surface's name never holds " · " and the label never " — ", so the label reads back exactly. */
export const pressLine=(surface:string,label:string,values:string[])=>`${PRESS_PREFIX}${surface.replaceAll(SURFACE_END,' - ')}${SURFACE_END}${label.replaceAll(LABEL_END,' - ')}${values.length?LABEL_END+values.join(' · '):''}`;
/** The button's label in a press line, or undefined when the text is no press line. */
export function pressLabel(text:string):string|undefined{
 if(!text.startsWith(PRESS_PREFIX))return undefined;
 const rest=text.slice(PRESS_PREFIX.length),at=rest.indexOf(SURFACE_END);if(at<0)return undefined;
 const label=rest.slice(at+SURFACE_END.length),end=label.indexOf(LABEL_END);
 return end<0?label:label.slice(0,end);
}
