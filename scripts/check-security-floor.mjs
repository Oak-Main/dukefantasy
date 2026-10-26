/**
 * Dependency-security floor for the vinext + @vitejs/plugin-rsc + React Server
 * Components stack (read-only; inspects what is actually installed).
 *
 * Advisories (published 2026-10-14):
 *   GHSA-xqc2-xf4c-x3h3  React Server Components RCE (critical)
 *   GHSA-h3gv-c5rc-p453  Denial of service in server functions
 *     react-server-dom-webpack / -turbopack / -parcel <= 19.2.8 and 19.3.0 are
 *     vulnerable; fixed in 19.0.9 / 19.1.10 / 19.2.9 / 19.3.1. This repo stays
 *     on the 19.2 line, so react, react-dom and react-server-dom-webpack must
 *     all be >= 19.2.9.
 *   GHSA-8969-277p-8rrm / GHSA-2956-r8mj-w5c4  vinext < 1.2.0, fixed in vinext
 *     1.2.0 together with @vitejs/plugin-rsc >= 0.5.37. This script asks for
 *     @vitejs/plugin-rsc >= 0.5.38, the first release whose notes record the
 *     React 19.3.1 update (the vendored Flight code); 0.5.37 predates it.
 *   GHSA-2464-fhr4-w9xw / GHSA-p3m5-59mp-jv5r / GHSA-673q-mjm6-r5xr  next < 16.4.1.
 *
 * Usage:
 *   node scripts/check-security-floor.mjs                  # React / RSC floor
 *   node scripts/check-security-floor.mjs --require-vinext # also assert vinext >= 1.2.0
 *   node scripts/check-security-floor.mjs --root <dir>     # inspect <dir>/node_modules instead
 *
 * Exit codes: 0 = floor met, 1 = a package is below the floor or missing.
 * No exploit payloads, network access or file writes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const requireVinext = args.includes("--require-vinext");
const rootFlag = args.indexOf("--root");
const root = resolve(rootFlag >= 0 ? args[rootFlag + 1] : fileURLToPath(new URL("..", import.meta.url)));

const REACT_FLOOR = "19.2.9";
const PLUGIN_RSC_FLOOR = "0.5.38";
const NEXT_FLOOR = "16.4.1";
const SHARP_FLOOR = "0.35.5";
const VINEXT_FLOOR = "1.2.0";
const RSDW_PACKAGES = ["react-server-dom-webpack", "react-server-dom-turbopack", "react-server-dom-parcel"];
// 19.3.0 is vulnerable even though it sorts above the 19.2.9 floor.
const KNOWN_VULNERABLE = new Map([["19.3.0", "19.3.0 is vulnerable (fixed in 19.3.1)"]]);

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(version));
  if (!match) throw new Error(`Unparseable version: ${version}`);
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split(".") : [] };
}

/** Semver precedence: negative when a < b, 0 when equal, positive when a > b. */
function compareVersions(a, b) {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return Number(x) - Number(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Installed copies of `name` under <root>/node_modules; nested copies too unless topLevelOnly. */
function installedCopies(name, { topLevelOnly = false } = {}) {
  const found = [];
  const visit = (nodeModules, depth) => {
    if (depth > 6 || !existsSync(nodeModules)) return;
    const own = join(nodeModules, name, "package.json");
    if (existsSync(own)) found.push({ path: join(nodeModules, name), version: JSON.parse(readFileSync(own, "utf8")).version });
    if (topLevelOnly) return;
    for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (entry.name.startsWith("@")) {
        for (const scoped of readdirSync(join(nodeModules, entry.name), { withFileTypes: true })) {
          if (scoped.isDirectory()) visit(join(nodeModules, entry.name, scoped.name, "node_modules"), depth + 1);
        }
      } else {
        visit(join(nodeModules, entry.name, "node_modules"), depth + 1);
      }
    }
  };
  visit(join(root, "node_modules"), 0);
  return found;
}

const failures = [];
const notes = [];
const relative = (path) => path.slice(root.length + 1).replaceAll("\\", "/");

function requireAtLeast(name, floor, { required = true, topLevelOnly = false } = {}) {
  const label = floor;
  const copies = installedCopies(name, { topLevelOnly });
  if (!copies.length) {
    if (required) failures.push(`${name}: not installed (run npm ci); floor is ${label}`);
    return [];
  }
  for (const copy of copies) {
    if (compareVersions(copy.version, floor) < 0) {
      failures.push(`${name}@${copy.version} at ${relative(copy.path)} is below the security floor ${label}`);
    } else if (KNOWN_VULNERABLE.has(copy.version) && RSDW_PACKAGES.includes(name)) {
      failures.push(`${name}@${copy.version} at ${relative(copy.path)}: ${KNOWN_VULNERABLE.get(copy.version)}`);
    } else {
      notes.push(`${name}@${copy.version} at ${relative(copy.path)} >= ${label}`);
    }
  }
  return copies;
}

const rsdw = requireAtLeast("react-server-dom-webpack", REACT_FLOOR);
for (const name of RSDW_PACKAGES.slice(1)) requireAtLeast(name, REACT_FLOOR, { required: false });

// react and react-dom must move with react-server-dom-webpack: RSDW 19.2.9 peer-requires ^19.2.9.
const onReact192 = rsdw.some((copy) => /^19\.2\./.test(copy.version));
for (const name of ["react", "react-dom"]) {
  if (onReact192) requireAtLeast(name, REACT_FLOOR, { topLevelOnly: true });
  else if (!installedCopies(name, { topLevelOnly: true }).length) failures.push(`${name}: not installed (run npm ci)`);
}

requireAtLeast("@vitejs/plugin-rsc", PLUGIN_RSC_FLOOR);
requireAtLeast("next", NEXT_FLOOR);

// sharp is informational here: the copies in this tree come from the dev toolchain
// (miniflare / wrangler), so a sub-floor copy is reported but does not fail the check.
for (const copy of installedCopies("sharp")) {
  const state = compareVersions(copy.version, SHARP_FLOOR) < 0 ? "below" : "at or above";
  notes.push(`sharp@${copy.version} at ${relative(copy.path)} is ${state} ${SHARP_FLOOR}; informational, not asserted`);
}

const vinext = installedCopies("vinext");
if (requireVinext) {
  requireAtLeast("vinext", VINEXT_FLOOR);
} else {
  for (const copy of vinext) {
    const state = compareVersions(copy.version, VINEXT_FLOOR) < 0 ? "below" : "at or above";
    notes.push(`vinext@${copy.version} is ${state} ${VINEXT_FLOOR}; not asserted here (use --require-vinext)`);
  }
}

for (const note of notes) console.log(`ok    ${note}`);
for (const failure of failures) console.error(`FAIL  ${failure}`);
if (failures.length) {
  console.error(`Security floor: FAIL (${failures.length} problem${failures.length === 1 ? "" : "s"}) in ${root}`);
  process.exit(1);
}
console.log(`Security floor: PASS${requireVinext ? " (including vinext)" : ""}`);
