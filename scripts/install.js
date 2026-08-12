#!/usr/bin/env node

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { installLinks } from "../src/installer.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const binSource = join(projectRoot, "bin", "dab.js");
const binDirectory = join(homedir(), ".local", "bin");
const binTarget = join(binDirectory, "dab");
const codexSkillTarget = join(homedir(), ".agents", "skills", "peer-review");
const claudeSkillTarget = join(homedir(), ".claude", "skills", "peer-review");

await installLinks([
  { source: binSource, target: binTarget },
  {
    source: join(projectRoot, "integrations", "codex-skill", "peer-review"),
    target: codexSkillTarget,
    type: "dir",
  },
  {
    source: join(
      projectRoot,
      "integrations",
      "claude-plugin",
      "skills",
      "peer-review",
    ),
    target: claudeSkillTarget,
    type: "dir",
  },
]);

process.stdout.write(`Installed dab at ${binTarget}\n`);
process.stdout.write(`Installed Codex skill at ${codexSkillTarget}\n`);
process.stdout.write(`Installed Claude skill at ${claudeSkillTarget}\n`);
process.stdout.write(`Claude plugin source: ${join(projectRoot, "integrations", "claude-plugin")}\n`);
