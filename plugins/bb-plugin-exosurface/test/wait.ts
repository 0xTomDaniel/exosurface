// The test suite's one wait: poll a condition against a wall-clock deadline (Date.now()). A count of polls or of nominal
// milliseconds stops bounding anything once a starved event loop fires its timers late; the clock still does.
/** Polls ok() every `every` ms until it holds (true) or `ms` of wall-clock time have passed (false). */
export async function settled(ok: () => boolean | Promise<boolean>, ms: number, every = 50): Promise<boolean> {
  for (const end = Date.now() + ms; ;) {
    if (await ok()) return true;
    if (Date.now() > end) return false;
    await new Promise(r => setTimeout(r, every));
  }
}
/** A wait that throws on its deadline, naming what it waited for and what `detail` reports of the screen at that moment. */
export function waiter(detail: () => string = () => '') {
  return async (what: string, ok: () => boolean | Promise<boolean>, ms = 20000, every = 50) => {
    if (await settled(ok, ms, every)) return;
    let seen = ''; try { seen = detail(); } catch (e) { seen = `(${String(e)})`; }
    throw new Error(`Timed out waiting for ${what}${seen ? `; ${seen}` : ''}`);
  };
}
