import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A file path, not URL.pathname: "/C:/..." is not a loadable path on Windows.
const checker = fileURLToPath(new URL("../scripts/check-security-floor.mjs", import.meta.url));
function withTree(check) {
  const root = mkdtempSync(join(tmpdir(), "duke-security-"));
  const put = (folder, name, version) => { const path = join(folder, name); mkdirSync(path, { recursive: true }); writeFileSync(join(path, "package.json"), JSON.stringify({ name, version })); return path; };
  try {
    const modules = join(root, "node_modules");
    for (const [name, version] of Object.entries({ react: "19.2.9", "react-dom": "19.2.9", "react-server-dom-webpack": "19.2.9", "@vitejs/plugin-rsc": "0.5.38", next: "16.4.2" })) put(modules, name, version);
    check({ root, modules, put, run: () => spawnSync(process.execPath, [checker, "--root", root], { encoding: "utf8", timeout: 10_000 }) });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("security floor rejects vulnerable RSC beyond six nested dependency levels", () => withTree(({ modules, put, run }) => {
  let nested = modules;
  for (let depth = 0; depth < 9; depth++) nested = join(put(nested, `dependency-${depth}`, "1.0.0"), "node_modules");
  put(nested, "react-server-dom-webpack", "19.2.8");
  const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /react-server-dom-webpack@19\.2\.8/);
}));
for (const name of ["react", "react-dom"]) test(`security floor inspects nested ${name} copies`, () => withTree(({ modules, put, run }) => {
  const nested = join(put(modules, "@scope/parent", "1.0.0"), "node_modules"); put(nested, name, "19.2.8");
  const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, new RegExp(`${name}@19\\.2\\.8`));
}));
test("security traversal terminates on a linked dependency cycle", () => withTree(({ modules, put, run }) => {
  const parent = put(modules, "parent", "1.0.0"); symlinkSync(modules, join(parent, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const result = run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Security floor: PASS/);
}));
