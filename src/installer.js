import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { dirname } from "node:path";

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
