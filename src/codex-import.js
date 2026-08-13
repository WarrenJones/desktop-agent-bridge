import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";

const IMPORT_COMPLETED = "externalAgentConfig/import/completed";

export function buildExternalAgentSessionMigration({ sourcePath, cwd }) {
  return {
    migrationItems: [
      {
        itemType: "SESSIONS",
        description: `Transfer Claude session ${basename(sourcePath)}`,
        cwd: null,
        details: {
          plugins: [],
          sessions: [{ path: sourcePath, cwd, title: null }],
          mcpServers: [],
          hooks: [],
          subagents: [],
          commands: [],
        },
      },
    ],
  };
}

export async function findImportedThreadId({
  sourcePath,
  codexHome = join(homedir(), ".codex"),
}) {
  const canonicalSource = await realpath(sourcePath);
  const source = await readFile(canonicalSource);
  const contentSha256 = createHash("sha256").update(source).digest("hex");
  let ledger;
  try {
    ledger = JSON.parse(
      await readFile(join(codexHome, "external_agent_session_imports.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  return (Array.isArray(ledger.records) ? ledger.records : [])
    .filter(
      (record) =>
        record?.source_path === canonicalSource &&
        record?.content_sha256 === contentSha256 &&
        typeof record?.imported_thread_id === "string",
    )
    .at(-1)?.imported_thread_id;
}

class AppServerClient {
  constructor(processHandle) {
    this.processHandle = processHandle;
    this.pending = new Map();
    this.nextId = 1;
    this.notificationHandler = undefined;
    this.stderr = "";
    this.closed = false;
  }

  start() {
    this.processHandle.stdout.setEncoding("utf8");
    this.processHandle.stderr.setEncoding("utf8");
    this.processHandle.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.lines = createInterface({ input: this.processHandle.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    this.processHandle.on("error", (error) => this.rejectAll(error));
    this.processHandle.on("exit", (code, signal) => {
      if (this.closed && code === 0) return;
      const detail = this.stderr.trim();
      this.rejectAll(
        new Error(
          `Codex app-server exited ${signal ? `with ${signal}` : `with code ${code}`}${
            detail ? `: ${detail}` : ""
          }`,
        ),
      );
    });
  }

  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.rejectAll(new Error(`Could not parse Codex app-server output: ${error.message}`));
      return;
    }
    if (message.id !== undefined && message.method) {
      this.send({
        id: message.id,
        error: { code: -32601, message: `Unsupported server request: ${message.method}` },
      });
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "Codex RPC failed."));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) this.notificationHandler?.(message);
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  send(message) {
    this.processHandle.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  setNotificationHandler(handler) {
    this.notificationHandler = handler;
  }

  async close() {
    this.closed = true;
    this.lines?.close();
    this.processHandle.stdin.end();
    if (this.processHandle.exitCode === null && !this.processHandle.killed) {
      this.processHandle.kill("SIGTERM");
    }
  }
}

export async function createCodexAppServerClient({
  runtime,
  cwd,
  spawnProcess = spawn,
}) {
  const processHandle = spawnProcess(runtime, ["app-server", "--stdio"], {
    cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new AppServerClient(processHandle);
  client.start();
  await client.request("initialize", {
    clientInfo: {
      title: "Desktop Agent Bridge",
      name: "desktop-agent-bridge",
      version: "0.2.0",
    },
    capabilities: {
      experimentalApi: false,
      requestAttestation: false,
      optOutNotificationMethods: [
        "item/agentMessage/delta",
        "item/reasoning/summaryTextDelta",
        "item/reasoning/summaryPartAdded",
        "item/reasoning/textDelta",
      ],
    },
  });
  client.notify("initialized", {});
  return client;
}

export async function importClaudeSession({
  sourcePath,
  cwd,
  runtime,
  timeoutMs = 120_000,
  createClient = createCodexAppServerClient,
  readImportedThreadId = findImportedThreadId,
}) {
  const client = await createClient({ runtime, cwd });
  let timeout;
  try {
    const completed = new Promise((resolve, reject) => {
      client.setNotificationHandler((message) => {
        if (message.method === IMPORT_COMPLETED) resolve();
      });
      timeout = setTimeout(
        () => reject(new Error("Timed out waiting for Codex to import the Claude session.")),
        timeoutMs,
      );
    });
    await client.request(
      "externalAgentConfig/import",
      buildExternalAgentSessionMigration({ sourcePath, cwd }),
    );
    await completed;
    const threadId = await readImportedThreadId({ sourcePath });
    if (!threadId) {
      throw new Error("Codex imported the Claude session but did not record a thread ID.");
    }
    return threadId;
  } finally {
    clearTimeout(timeout);
    await client.close();
  }
}
