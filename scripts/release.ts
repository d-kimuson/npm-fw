#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Release 前チェックスクリプト。
 * lint → typecheck → test → build → codeql の順に実行し、
 * いずれかが失敗した時点で非ゼロ終了する。
 *
 * codeql は nix develop 環境でのインストールを前提とする。
 * 未インストールの場合はスキップ（警告のみ）。
 */

type Check = {
  readonly name: string;
  command: string;
  args: string[];
};

const codeqlAvailable = (): boolean => {
  const which = spawnSync("which", ["codeql"], { stdio: "pipe" });
  return which.status === 0;
};

const codeqlDbPath = join(tmpdir(), "npm-fw-codeql-db");

const checks: readonly Check[] = [
  { name: "lint", command: "pnpm", args: ["lint"] },
  { name: "typecheck", command: "pnpm", args: ["typecheck"] },
  { name: "test", command: "pnpm", args: ["test"] },
  { name: "build", command: "pnpm", args: ["build"] },
  {
    name: "codeql",
    command: "codeql",
    args: ["database", "create", codeqlDbPath, "--language=javascript-typescript", "--overwrite"],
  },
];

let failed = false;

for (const check of checks) {
  process.stdout.write(`[release-check] ${check.name}... `);

  // codeql が利用不可の場合はスキップ
  if (check.command === "codeql" && !codeqlAvailable()) {
    console.log("SKIP (codeql not installed — run `nix develop` first)");
    continue;
  }

  const result = spawnSync(check.command, check.args, {
    stdio: "pipe",
    env: { ...process.env },
  });

  if (result.status === 0) {
    console.log("OK");
  } else {
    console.log("FAIL");
    if (result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }
    if (result.stdout.length > 0) {
      process.stderr.write(result.stdout);
    }
    failed = true;
    break;
  }
}

// codeql database を cleanup
try {
  rmSync(codeqlDbPath, { recursive: true, force: true });
} catch {
  // ignore
}

if (failed) {
  console.log("\n❌ Release check failed.");
  process.exit(1);
}

console.log("\n✅ All release checks passed.");
