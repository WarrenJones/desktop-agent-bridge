import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("the package is a Claude marketplace with a hook-enabled first-party plugin", async () => {
  const marketplace = await json(".claude-plugin/marketplace.json");
  const hooks = await json("integrations/claude-plugin/hooks/hooks.json");

  assert.equal(marketplace.name, "desktop-agent-bridge");
  assert.equal(marketplace.plugins[0].source, "./integrations/claude-plugin");
  assert.match(
    hooks.hooks.SessionStart[0].hooks[0].command,
    /session-start\.mjs/,
  );
});

test("the third-party skill package example depends on DAB without project files", async () => {
  const packageManifest = await json("examples/security-review-skill/package.json");
  const pluginManifest = await json(
    "examples/security-review-skill/.claude-plugin/plugin.json",
  );
  const skill = await readFile(
    new URL("examples/security-review-skill/skills/security-review/SKILL.md", root),
    "utf8",
  );

  assert.match(packageManifest.peerDependencies["desktop-agent-bridge"], /^>=/);
  assert.equal(pluginManifest.skills, "./skills/");
  assert.match(skill, /dab handoff/);
  assert.match(skill, /--context-mode auto/);
  assert.doesNotMatch(skill, /\.claude\/skills|\.agents\/skills/);
});

test("first-party peer-review skills request automatic full-session context", async () => {
  const codexSkill = await readFile(
    new URL("integrations/codex-skill/peer-review/SKILL.md", root),
    "utf8",
  );
  const claudeSkill = await readFile(
    new URL("integrations/claude-plugin/skills/peer-review/SKILL.md", root),
    "utf8",
  );

  for (const skill of [codexSkill, claudeSkill]) {
    assert.match(skill, /dab handoff/);
    assert.match(skill, /--context-mode auto/);
    assert.doesNotMatch(skill, /Do not paste full transcripts/);
  }
});
