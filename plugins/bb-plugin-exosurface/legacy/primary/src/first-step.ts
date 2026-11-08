// The first step of every Exo turn in plain words (spec pages-and-activity E9, owner ruling on #85): from the person's send
// until the model streams its first reasoning or tool step, the Exo block's one line names this. No Node imports: the surface
// app (browser) shows it from the send, the owner and server.ts from the turn's start.
export const FIRST_STEP = 'Reading your message';
