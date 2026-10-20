import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
const git = resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim());
const directory = join(git, "week7-update.lock");
const owner = join(directory, "owner.json");
if (process.argv[2] === "acquire") {
  try { mkdirSync(directory); } catch { throw new Error("Another Week 7 run owns the publication lock; skip this run. Investigate a stale lock rather than overwriting it."); }
  const token = randomUUID();
  writeFileSync(owner, JSON.stringify({ token, createdAt: new Date().toISOString() }));
  console.log(token);
} else if (process.argv[2] === "release") {
  const record = JSON.parse(readFileSync(owner, "utf8"));
  if (!process.argv[3] || record.token !== process.argv[3]) throw new Error("Lock token does not match");
  unlinkSync(owner);
  rmdirSync(directory);
} else throw new Error("Use acquire or release <token>");
