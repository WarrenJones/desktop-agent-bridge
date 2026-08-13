import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExternalAgentSessionMigration,
  findImportedThreadId,
  importClaudeSession,
} from "../src/codex-import.js";

test("buildExternalAgentSessionMigration describes one Claude transcript import", () => {
  assert.deepEqual(
    buildExternalAgentSessionMigration({ sourcePath: "/source/claude.jsonl", cwd: "/repo" }),
    {
      migrationItems: [
        {
          itemType: "SESSIONS",
          description: "Transfer Claude session claude.jsonl",
          cwd: null,
          details: {
            plugins: [],
            sessions: [{ path: "/source/claude.jsonl", cwd: "/repo", title: null }],
            mcpServers: [],
            hooks: [],
            subagents: [],
            commands: [],
          },
        },
      ],
    },
  );
});

test("importClaudeSession waits for completion and returns the ledger thread", async () => {
  const calls = [];
  let handler;
  let closed = false;
  const client = {
    setNotificationHandler(next) {
      handler = next;
    },
    async request(method, params) {
      calls.push({ method, params });
      queueMicrotask(() =>
        handler?.({ method: "externalAgentConfig/import/completed", params: {} }),
      );
      return {};
    },
    async close() {
      closed = true;
    },
  };

  const threadId = await importClaudeSession({
    sourcePath: "/source/claude.jsonl",
    cwd: "/repo",
    runtime: "/desktop/codex",
    createClient: async (options) => {
      assert.equal(options.runtime, "/desktop/codex");
      return client;
    },
    readImportedThreadId: async () => "thread-imported",
  });

  assert.equal(calls[0].method, "externalAgentConfig/import");
  assert.equal(calls[0].params.migrationItems[0].details.sessions[0].path, "/source/claude.jsonl");
  assert.equal(threadId, "thread-imported");
  assert.equal(closed, true);
});

test("findImportedThreadId matches canonical path and content hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dab-import-"));
  try {
    const sourcePath = join(directory, "claude.jsonl");
    const codexHome = join(directory, ".codex");
    const ledgerPath = join(codexHome, "external_agent_session_imports.json");
    const content = '{"type":"user"}\n';
    await writeFile(sourcePath, content);
    await writeFile(
      ledgerPath,
      JSON.stringify({
        records: [
          {
            source_path: await realpath(sourcePath),
            content_sha256: createHash("sha256").update(content).digest("hex"),
            imported_thread_id: "thread-123",
          },
        ],
      }),
      { flag: "wx" },
    ).catch(async (error) => {
      if (error.code !== "ENOENT") throw error;
      const { mkdir } = await import("node:fs/promises");
      await mkdir(codexHome, { recursive: true });
      await writeFile(
        ledgerPath,
        JSON.stringify({
          records: [
            {
              source_path: await realpath(sourcePath),
              content_sha256: createHash("sha256").update(content).digest("hex"),
              imported_thread_id: "thread-123",
            },
          ],
        }),
      );
    });

    assert.equal(
      await findImportedThreadId({ sourcePath, codexHome }),
      "thread-123",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
