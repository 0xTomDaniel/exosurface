import { spawn } from "node:child_process";

export async function startProcess(dir: string, extra: string[] = []) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "--production",
      "--port",
      "0",
      "--state",
      dir,
      ...extra,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-500);
  });
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => resolve(code)),
  );
  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Host startup timeout"));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      for (const line of output.split("\n")) {
        try {
          const value = JSON.parse(line) as { url?: string };
          if (value.url) {
            clearTimeout(timer);
            resolve(value.url);
          }
        } catch {
          /* startup text */
        }
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`Host exited during startup: ${stderr}`));
    });
  });
  const cookie = (await fetch(`${url}/session`)).headers
    .get("set-cookie")!
    .split(";")[0];
  return {
    child,
    url,
    cookie,
    exited,
    stop: async () => {
      child.kill("SIGTERM");
      await exited;
    },
  };
}
