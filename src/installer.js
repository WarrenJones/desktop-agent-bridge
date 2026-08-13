import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { executeProcess } from "./runners.js";

export function skillLinkSpecifications({ projectRoot, homeDirectory }) {
  return [
    {
      source: join(
        projectRoot,
        "integrations",
        "codex-skill",
        "peer-review",
      ),
      target: join(homeDirectory, ".agents", "skills", "peer-review"),
      type: "dir",
    },
  ];
}

async function runClaudeCommand(execute, runtime, args) {
  const result = await execute(runtime, args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Claude command failed: ${args.join(" ")}`);
  }
  return result.stdout;
}

export async function ensureClaudePlugin({
  projectRoot,
  execute = executeProcess,
  claudeRuntime = process.env.DAB_CLAUDE_BIN || "claude",
}) {
  const marketplaces = JSON.parse(
    await runClaudeCommand(execute, claudeRuntime, [
      "plugin",
      "marketplace",
      "list",
      "--json",
    ]),
  );
  const marketplaceInstalled = marketplaces.some(
    (marketplace) => marketplace?.name === "desktop-agent-bridge",
  );
  if (marketplaceInstalled) {
    await runClaudeCommand(execute, claudeRuntime, [
      "plugin",
      "marketplace",
      "update",
      "desktop-agent-bridge",
    ]);
  } else {
    await runClaudeCommand(execute, claudeRuntime, [
      "plugin",
      "marketplace",
      "add",
      projectRoot,
    ]);
  }

  const plugins = JSON.parse(
    await runClaudeCommand(execute, claudeRuntime, ["plugin", "list", "--json"]),
  );
  const pluginInstalled = plugins.some((plugin) => {
    const identifier = plugin?.id ?? plugin?.name ?? "";
    return identifier === "desktop-agent-bridge@desktop-agent-bridge";
  });
  const identifier = "desktop-agent-bridge@desktop-agent-bridge";
  await runClaudeCommand(
    execute,
    claudeRuntime,
    pluginInstalled
      ? ["plugin", "update", identifier]
      : ["plugin", "install", identifier, "--scope", "user"],
  );

  return {
    source: join(projectRoot, "integrations", "claude-plugin"),
    target: identifier,
    type: "claude-plugin",
  };
}

async function preflightLink({ source, target }) {
  await lstat(source);
  try {
    const existing = await readlink(target);
    if (existing !== source) {
      throw new Error(`${target} already points to ${existing}`);
    }
    return false;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    if (error.code === "EINVAL") {
      throw new Error(`${target} already exists and is not a symlink.`);
    }
    throw error;
  }
}

export async function installLinks(specifications) {
  const plans = [];
  for (const specification of specifications) {
    plans.push({
      ...specification,
      shouldCreate: await preflightLink(specification),
    });
  }

  const created = [];
  try {
    for (const plan of plans) {
      if (!plan.shouldCreate) continue;
      await mkdir(dirname(plan.target), { recursive: true });
      await symlink(plan.source, plan.target, plan.type ?? "file");
      created.push(plan.target);
    }
  } catch (error) {
    await Promise.allSettled(created.map((target) => unlink(target)));
    throw error;
  }
}

export async function installSkills(options) {
  const specifications = skillLinkSpecifications(options);
  await installLinks(specifications);
  const claudePlugin = await ensureClaudePlugin(options);
  return [...specifications, claudePlugin];
}
