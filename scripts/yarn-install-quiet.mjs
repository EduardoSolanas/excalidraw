import { spawn } from "node:child_process";

const peerWarningPattern =
  /^warning .* has (?:unmet|incorrect) peer dependency /;
const vscodeEngineWarningPattern =
  /^warning vscode-languageclient@\S+: The engine "vscode" appears to be invalid\.$/;

export function shouldSuppressYarnInstallWarning(line) {
  return peerWarningPattern.test(line) || vscodeEngineWarningPattern.test(line);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const child = spawn("yarn", process.argv.slice(2), {
    stdio: ["inherit", "inherit", "pipe"],
  });
  let pending = "";

  child.stderr.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!shouldSuppressYarnInstallWarning(line)) {
        process.stderr.write(`${line}\n`);
      }
    }
  });

  child.on("close", (code, signal) => {
    if (pending && !shouldSuppressYarnInstallWarning(pending)) {
      process.stderr.write(pending);
    }
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 1;
    }
  });
}
