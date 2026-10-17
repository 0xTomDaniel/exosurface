import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExoHost } from "./host.js";
import { executePi, piReadiness } from "./pi.js";
import { SURFACE, type ExecutionResult } from "./domain.js";

const readiness = await piReadiness();
if (!readiness.available.length) {
  console.log(
    JSON.stringify({
      status: "UNKNOWN",
      reason:
        "No available model credentials in the existing Pi/provider configuration.",
    }),
  );
  process.exitCode = 2;
} else {
  const dir = await mkdtemp(join(tmpdir(), "agui-pi-proof-"));
  const modelResults: ExecutionResult[] = [];
  const host = await ExoHost.open(dir, {
    executePi: async (p, s) => {
      const result = await executePi(p, s);
      modelResults.push(result);
      return result;
    },
  });
  const wait = async (id: unknown) => {
    const deadline = Date.now() + 100000;
    while (Date.now() < deadline) {
      const work = host.snapshot().works.find((w) => w.id === id);
      if (work?.status !== "running") return work;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Pi proof deadline");
  };
  try {
    const reference = {
      surfaceId: SURFACE,
      revision: 1,
      objectId: "sketch",
    } as const;
    const visual = await host.command({
      kind: "move",
      actor: "person",
      requestId: "pi-visual",
      selection: reference,
      mode: "pi",
    });
    const visualWork = await wait(visual.workId);
    const proposal = host.snapshot().proposal;
    if (
      visualWork?.status !== "completed" ||
      proposal?.taskId !== "sketch" ||
      proposal.time !== "13:00"
    )
      throw new Error("Visual-only Pi proposal was not correct");
    const accept = await host.command({
      kind: "accept",
      actor: "person",
      requestId: "pi-accept",
      proposalId: proposal.id,
      revision: host.snapshot().revision,
    });
    if (accept.status !== "applied")
      throw new Error("Pi proposal acceptance failed");
    const raw = await readFile(host.vaultPath, "utf8");
    await writeFile(
      host.vaultPath,
      raw
        .replace("revision: 2", "revision: 3")
        .replace("time: 13:00", "time: 14:30"),
    );
    const ask = await host.command({
      kind: "ask",
      actor: "person",
      requestId: "pi-history",
      selection: reference,
      utterance:
        "I selected this in visual revision 1 and accepted your move. Which exact object was that, what time did I originally see, what did I accept, and what time does the external source now show? Mention the original title and all three times.",
      mode: "pi",
    });
    const askWork = await wait(ask.workId);
    const answer = modelResults.at(-1)?.utterance ?? "";
    const proof = {
      status:
        askWork?.status === "completed" &&
        /11:00/.test(answer) &&
        /13:00/.test(answer) &&
        /14:30/.test(answer) &&
        /garden/i.test(answer)
          ? "PASS"
          : "FAIL",
      sdk: "@earendil-works/pi-coding-agent@0.85.1",
      transport: "AG-UI host executor (no Codex agent)",
      visualOnly: visualWork,
      acceptance: accept,
      historical: askWork,
      modelResults,
      source: host.snapshot().source,
    };
    await writeFile("evidence/pi-proof.json", JSON.stringify(proof, null, 2));
    console.log(
      JSON.stringify({
        status: proof.status,
        models: modelResults.map((r) => r.model),
        toolCalls: modelResults.map((r) => r.toolCalls),
        answer,
      }),
    );
    if (proof.status !== "PASS") process.exitCode = 1;
  } finally {
    await host.close();
    await rm(dir, { recursive: true, force: true });
  }
}
