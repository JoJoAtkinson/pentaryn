#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const LEGACY = [];                       // self-running suites not yet converted
const run = args => spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status ?? 1;
let status = run(["--test", "test/**/*.test.mjs"]);
for (const f of LEGACY) status = run([f]) || status;
process.exit(status);
