import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCodexArgs,
  buildReviewPrompt,
  parseClaudeTranscript,
  parseCodexJsonl,
  resolveCodexRuntime,
} from "./core.js";

const DEFAULT_CLAUDE_DRIVER = fileURLToPath(
  new URL("../scripts/claude-desktop.jxa", import.meta.url),
);

async function listTranscriptFiles(directory, { deadline = Infinity, now = Date.now } = {}) {
  if (now() >= deadline) return [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (now() >= deadline) break;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTranscriptFiles(path, { deadline, now })));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".jsonl") &&
      !entry.name.startsWith("agent-")
    ) {
      files.push(path);
    }
  }
  return files;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForClaudeTranscript({
  requestId,
  timeoutMs,
  startedAt,
  cwd,
  transcriptRoot = join(homedir(), ".claude", "projects"),
  now = Date.now,
  sleep = delay,
}) {
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const files = await listTranscriptFiles(transcriptRoot, { deadline, now });
    for (const file of files) {
      if (now() >= deadline) break;
      try {
        const metadata = await stat(file);
        if (metadata.mtimeMs < startedAt - 5_000) continue;

        const content = await readFile(file, "utf8");
        if (!content.includes(`DAB_REQUEST_ID:${requestId}`)) continue;

        const parsed = parseClaudeTranscript(content, requestId, cwd);
        if (parsed.complete && parsed.result) return parsed;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(1_000, remaining));
  }

  throw new Error(`Timed out waiting for Claude Desktop after ${timeoutMs}ms.`);
}

export async function executeProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer;
    const timeoutTimer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
        }, options.timeoutMs)
      : undefined;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

async function defaultOpenUrl(url) {
  const execution = await executeProcess("open", [url]);
  if (execution.exitCode !== 0) {
    throw new Error(execution.stderr || `Failed to open ${url}`);
  }
}

export async function runCodexReview({
  cwd,
  request,
  context = "",
  execute = executeProcess,
  runtime = resolveCodexRuntime(),
  openUrl = defaultOpenUrl,
  onProgress,
  timeoutMs = 600_000,
  requestId = randomUUID(),
}) {
  const prompt = buildReviewPrompt({
    sourceAgent: "claude",
    request,
    context,
    boundary: requestId,
  });
  const execution = await execute(runtime, buildCodexArgs({ cwd, prompt }), {
    cwd,
    onStderr: onProgress,
    timeoutMs,
  });

  if (execution.timedOut) {
    throw new Error(`Codex review timed out after ${timeoutMs}ms.`);
  }
  if (execution.exitCode !== 0) {
    throw new Error(execution.stderr.trim() || "Codex review failed.");
  }

  const parsed = parseCodexJsonl(execution.stdout);
  let handoffError;
  if (parsed.threadId) {
    try {
      await openUrl(`codex://threads/${encodeURIComponent(parsed.threadId)}`);
    } catch (error) {
      handoffError = error.message;
    }
  }

  return {
    target: "codex",
    sessionId: parsed.threadId,
    result: parsed.result,
    ...(handoffError ? { handoffError } : {}),
  };
}

export async function runClaudeReview({
  cwd,
  request,
  context = "",
  execute = executeProcess,
  driverPath = DEFAULT_CLAUDE_DRIVER,
  timeoutMs = 600_000,
  requestId = randomUUID(),
  waitForTranscript = waitForClaudeTranscript,
  now = Date.now,
}) {
  const prompt = `${buildReviewPrompt({
    sourceAgent: "codex",
    request,
    context,
    boundary: requestId,
  })}\n\nDAB_REQUEST_ID:${requestId}`;
  const startedAt = now();
  const execution = await execute(
    "osascript",
    ["-l", "JavaScript", driverPath, cwd, prompt, String(timeoutMs)],
    { cwd, timeoutMs },
  );

  if (execution.timedOut) {
    throw new Error("Timed out while submitting the task to Claude Desktop.");
  }
  if (execution.exitCode !== 0) {
    throw new Error(execution.stderr.trim() || "Claude Desktop review failed.");
  }

  let payload;
  try {
    payload = JSON.parse(execution.stdout.trim());
  } catch (error) {
    throw new Error(
      `Claude Desktop returned an unreadable response: ${error.message}`,
    );
  }

  if (!payload.submitted) {
    throw new Error("Claude Desktop did not accept the review task.");
  }

  const remainingTimeoutMs = Math.max(1, timeoutMs - (now() - startedAt));
  const transcript = await waitForTranscript({
    requestId,
    timeoutMs: remainingTimeoutMs,
    startedAt,
    cwd,
  });

  return {
    target: "claude",
    sessionId: transcript.sessionId,
    result: transcript.result,
  };
}
