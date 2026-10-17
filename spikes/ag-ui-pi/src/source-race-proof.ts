import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExoHost } from "./host.js";

// A real second writer edits the authoritative source during the last write window.
// This is an adversarial probe, not a provider fixture or an expected GREEN test.
const dir = await mkdtemp(join(tmpdir(), "exo-source-race-"));
const host = await ExoHost.open(dir, { workDelayMs: 20 });
let externalEdit = false;
try {
  await host.startWork("race-plan");
  while (!host.snapshot().proposal)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const before = host.snapshot();
  const external = (await readFile(host.vaultPath, "utf8"))
    .replace("revision: 1", "revision: 2")
    .replace("time: '11:00'", "time: '14:30'");
  const editor = new Worker(
    `
    const {workerData,parentPort}=require('node:worker_threads');
    const fs=require('node:fs');
    parentPort.postMessage('ready');
    const until=Date.now()+5000;
    while(Date.now()<until){
      if(fs.existsSync(workerData.path+'.tmp')){
        fs.writeFileSync(workerData.path,workerData.external);
        parentPort.postMessage('edited');break;
      }
    }
  `,
    { eval: true, workerData: { path: host.vaultPath, external } },
  );
  await once(editor, "message");
  editor.on("message", (message) => {
    if (message === "edited") externalEdit = true;
  });
  const exited = once(editor, "exit");
  const result = await host.command({
    kind: "accept",
    actor: "person",
    requestId: "race-accept",
    proposalId: before.proposal!.id,
    revision: before.revision,
  });
  await exited;
  const after = await readFile(host.vaultPath, "utf8");
  const retained = after.includes("14:30");
  const proof = {
    status: !externalEdit ? "UNKNOWN" : retained ? "PASS" : "FAIL",
    requirement:
      "Concurrent external source edit is not overwritten by acceptance",
    externalEditObserved: externalEdit,
    externalTime: "14:30",
    acceptanceResult: result,
    resultingSource: host.snapshot().source,
    consequence:
      "The ordinary final revision check plus rename has a race against a non-cooperating external writer. No protocol SDK repairs can supply source compare-and-swap. This spike must not be certified for arbitrary concurrent vault writers.",
  };
  await writeFile("evidence/source-race.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
  if (proof.status !== "PASS") process.exitCode = 1;
} finally {
  await host.close();
  await rm(dir, { recursive: true, force: true });
}
