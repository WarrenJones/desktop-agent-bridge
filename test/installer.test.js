import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installLinks } from "../src/installer.js";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "dab-installer-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("installLinks refuses a user-owned directory without deleting its files", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = join(directory, "source");
    const conflict = join(directory, "existing-skill");
    await mkdir(source);
    await mkdir(conflict);
    await writeFile(join(conflict, "notes.txt"), "keep me");

    await assert.rejects(
      installLinks([{ source, target: conflict, type: "dir" }]),
      /already exists and is not a symlink/,
    );
    assert.equal(await readFile(join(conflict, "notes.txt"), "utf8"), "keep me");
  });
});

test("installLinks preflights every target before creating any symlink", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = join(directory, "source");
    const firstTarget = join(directory, "first");
    const conflict = join(directory, "conflict");
    await mkdir(source);
    await mkdir(conflict);

    await assert.rejects(
      installLinks([
        { source, target: firstTarget, type: "dir" },
        { source, target: conflict, type: "dir" },
      ]),
      /already exists and is not a symlink/,
    );
    await assert.rejects(lstat(firstTarget), { code: "ENOENT" });
  });
});

test("installLinks is idempotent for links already owned by the project", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = join(directory, "source");
    const target = join(directory, "nested", "skill");
    await mkdir(source);

    await installLinks([{ source, target, type: "dir" }]);
    await installLinks([{ source, target, type: "dir" }]);

    assert.equal((await lstat(target)).isSymbolicLink(), true);
  });
});
