import test from "node:test";
import assert from "node:assert/strict";

import { handoff } from "desktop-agent-bridge";

test("the npm package exports a stable handoff API for third-party skills", async () => {
  await assert.rejects(
    handoff({ to: "unknown", cwd: "/repo", request: "Do work" }),
    /to must be claude or codex/,
  );
});
