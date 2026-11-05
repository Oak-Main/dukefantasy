/**
 * Runs the dataset cross-check against the current edition's pinned ESPN
 * extraction, so a reviewer can reproduce what was published without knowing
 * which dated folder holds the evidence.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "data/content-refresh/current.json"), "utf8"));
const evidence = join("data/content-refresh", manifest.snapshot.replace(/snapshot\.json$/, "espn-verification.json"));
const result = spawnSync(
  process.execPath,
  [join(root, "scripts/verify-nfl-dataset.mjs"), "--evidence", join(root, evidence)],
  { stdio: "inherit", cwd: root },
);
process.exit(result.status ?? 1);
