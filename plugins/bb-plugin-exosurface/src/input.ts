// A person's native-composer text is forwarded verbatim or explicitly rejected; never summarized/truncated.
export const MAX_PROMPT_BYTES = 512 * 1024;
export function validatePrompt(message: string) {
  const bytes = Buffer.byteLength(message);
  if (!message.trim() || bytes > MAX_PROMPT_BYTES) throw new Error(`Prompt is ${bytes} bytes; send 1–${MAX_PROMPT_BYTES} bytes of nonblank text. Nothing was sent.`);
}
