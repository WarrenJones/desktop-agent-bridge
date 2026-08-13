import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runHook({ cwd, env, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["integrations/claude-plugin/scripts/session-start.mjs"],
      { cwd, env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Hook exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

test("the Claude SessionStart hook exports the exact source transcript", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dab-hook-"));
  const envFile = join(directory, "session-env");
  try {
    await runHook({
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, CLAUDE_ENV_FILE: envFile },
      input: JSON.stringify({
          session_id: "claude-session",
          transcript_path: "/tmp/Claude's session.jsonl",
      }),
    });

    const output = await readFile(envFile, "utf8");
    assert.match(output, /export DAB_SOURCE_SESSION_ID='claude-session'/);
    assert.match(
      output,
      /export DAB_SOURCE_TRANSCRIPT='\/tmp\/Claude'"'"'s session\.jsonl'/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
