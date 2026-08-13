import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

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
    {
      source: join(
        projectRoot,
        "integrations",
        "claude-plugin",
        "skills",
        "peer-review",
      ),
      target: join(homeDirectory, ".claude", "skills", "peer-review"),
      type: "dir",
    },
  ];
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
  return specifications;
}
