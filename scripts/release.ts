#!/usr/bin/env node
/**
 * Release script for npm-fw.
 *
 * Usage:
 *   pnpm release                     # interactive version selection
 *   pnpm release --version patch     # bump patch
 *   pnpm release --version minor     # bump minor
 *   pnpm release --version major     # bump major
 *   pnpm release --version beta      # bump beta / start beta
 *   pnpm release --version 1.2.3     # explicit semver
 *   pnpm release -y --version patch  # skip confirmation
 *   pnpm release -y                  # skip confirmation (interactive version)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = (command: string, args: string[] = []): string =>
  execFileSync(command, args, { cwd: root, encoding: "utf-8" }).trim();

const runOrFail = (command: string, args: string[], label: string): void => {
  try {
    execFileSync(command, args, { cwd: root, stdio: "inherit" });
  } catch {
    console.error(`\n✗ ${label} failed. Aborting release.`);
    process.exit(1);
  }
};

type CliOptions = {
  readonly yes: boolean;
  readonly version: string | undefined;
};

const parseCliArgs = (args: readonly string[]): CliOptions => {
  let yes = false;
  let version: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "-y" || arg === "--yes") {
      yes = true;
      continue;
    }

    if (arg === "--version") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        console.error("✗ --version requires a value.");
        process.exit(1);
      }
      version = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: pnpm release [-y|--yes] [--version patch|minor|major|beta|x.y.z[-tag.n]]",
      );
      process.exit(0);
    }

    console.error(`✗ Unknown argument: ${arg}`);
    process.exit(1);
  }

  return { yes, version };
};

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

const parseVersion = (
  v: string,
): { major: number; minor: number; patch: number; pre: string | undefined } => {
  const [base, pre] = v.split("-");
  const segments = (base ?? "").split(".").map(Number);
  return {
    major: segments[0] ?? 0,
    minor: segments[1] ?? 0,
    patch: segments[2] ?? 0,
    pre,
  };
};

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

type VersionResolveResult =
  | { readonly type: "ok"; readonly version: string }
  | { readonly type: "error"; readonly message: string };

const resolveVersion = (versionSpec: string, fromVersion: string): VersionResolveResult => {
  const { major, minor, patch, pre } = parseVersion(fromVersion);
  const nextPatch = `${major}.${minor}.${patch + 1}`;

  if (versionSpec === "patch") {
    return {
      type: "ok",
      version: pre === undefined ? nextPatch : `${major}.${minor}.${patch}`,
    };
  }

  if (versionSpec === "minor") {
    return { type: "ok", version: `${major}.${minor + 1}.0` };
  }

  if (versionSpec === "major") {
    return { type: "ok", version: `${major + 1}.0.0` };
  }

  if (versionSpec === "beta") {
    if (pre === undefined) {
      return { type: "ok", version: `${nextPatch}-beta.0` };
    }

    const preParts = pre.split(".");
    const preTag = preParts[0] ?? "beta";
    const preNum = Number(preParts[1] ?? 0);
    return { type: "ok", version: `${major}.${minor}.${patch}-${preTag}.${preNum + 1}` };
  }

  if (semverPattern.test(versionSpec)) {
    return { type: "ok", version: versionSpec };
  }

  return {
    type: "error",
    message:
      "Unsupported --version value. Use patch, minor, major, beta, or an explicit semver like 1.2.3-beta.0.",
  };
};

const bumpChoices = (v: string): { name: string; value: string }[] => {
  const { major, minor, patch, pre } = parseVersion(v);

  if (pre !== undefined) {
    const preParts = pre.split(".");
    const preTag = preParts[0] ?? "beta";
    const preNum = Number(preParts[1] ?? 0);
    const nextPre = `${major}.${minor}.${patch}-${preTag}.${preNum + 1}`;
    return [
      { name: `${preTag} (${nextPre})`, value: nextPre },
      {
        name: `patch (${major}.${minor}.${patch})`,
        value: `${major}.${minor}.${patch}`,
      },
      {
        name: `minor (${major}.${minor + 1}.0)`,
        value: `${major}.${minor + 1}.0`,
      },
      { name: `major (${major + 1}.0.0)`, value: `${major + 1}.0.0` },
    ];
  }

  const nextPatch = `${major}.${minor}.${patch + 1}`;
  return [
    { name: `patch (${nextPatch})`, value: nextPatch },
    {
      name: `minor (${major}.${minor + 1}.0)`,
      value: `${major}.${minor + 1}.0`,
    },
    { name: `major (${major + 1}.0.0)`, value: `${major + 1}.0.0` },
    { name: `beta (${nextPatch}-beta.0)`, value: `${nextPatch}-beta.0` },
  ];
};

// ---------------------------------------------------------------------------
// Interactive prompts (built-in readline, no external deps)
// ---------------------------------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });

const chooseVersion = async (current: string): Promise<string> => {
  const choices = [...bumpChoices(current), { name: "Custom", value: "custom" }];

  console.log("Select release version:\n");
  choices.forEach((c, i) => console.log(`  [${i}] ${c.name}`));
  console.log();

  const answer = await question(`Enter number [0-${choices.length - 1}]: `);
  const index = Number(answer);

  if (Number.isNaN(index) || index < 0 || index >= choices.length) {
    console.log("Invalid choice.");
    process.exit(1);
  }

  const selected = choices[index];
  if (selected === undefined) {
    console.log("Invalid choice.");
    process.exit(1);
  }
  if (selected.value !== "custom") {
    return selected.value;
  }

  const custom = await question("Enter version: ");
  if (!semverPattern.test(custom)) {
    console.log(`✗ Invalid semver: ${custom}`);
    process.exit(1);
  }
  return custom;
};

const confirmRelease = async (tag: string): Promise<boolean> => {
  const answer = await question(
    `\nRelease ${tag}? This will commit, tag (signed), and push. [y/N] `,
  );
  const normalized = answer.toLowerCase().trim();
  return normalized === "y" || normalized === "yes";
};

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

const readGitConfig = (key: string): string => {
  try {
    return run("git", ["config", "--get", key]).toLowerCase();
  } catch {
    return "";
  }
};

// ---------------------------------------------------------------------------
// Pre-release checks
// ---------------------------------------------------------------------------

const runChecks = (): void => {
  console.log("\nRunning checks...\n");

  runOrFail("pnpm", ["lint"], "Lint");
  runOrFail("pnpm", ["typecheck"], "TypeCheck");
  runOrFail("pnpm", ["test"], "Test");
  runOrFail("pnpm", ["build"], "Build");

  // Pack smoke test
  const packCheckScript = path.join(root, "scripts", "pack", "check.sh");
  runOrFail("bash", [packCheckScript], "Pack smoke test");

  console.log("\n✓ All checks passed.\n");
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const cliOptions = parseCliArgs(process.argv.slice(2));

  // 1. Read package.json
  const pkgPath = path.join(root, "package.json");
  const parsedPackageJson: unknown = JSON.parse(readFileSync(pkgPath, "utf-8"));

  if (
    typeof parsedPackageJson !== "object" ||
    parsedPackageJson === null ||
    Array.isArray(parsedPackageJson) ||
    !("version" in parsedPackageJson) ||
    typeof parsedPackageJson.version !== "string"
  ) {
    console.error("✗ version field not found in package.json");
    process.exit(1);
  }

  const pkg = parsedPackageJson as Record<string, unknown>;
  const current = parsedPackageJson.version;

  console.log(`Current version: ${current}\n`);

  // 2. Check clean working tree
  const status = run("git", ["status", "--porcelain"]);
  if (status !== "") {
    console.error("✗ Working tree is not clean. Commit or stash changes first.");
    process.exit(1);
  }

  // 3. Check git signing configuration
  const gpgFormat = readGitConfig("gpg.format");
  const commitSign = readGitConfig("commit.gpgsign");
  const tagSign = readGitConfig("tag.gpgsign");

  if (gpgFormat !== "ssh" || commitSign !== "true" || tagSign !== "true") {
    console.error("✗ Git signing is not configured. Required:");
    console.error("  git config --global gpg.format ssh");
    console.error("  git config --global commit.gpgsign true");
    console.error("  git config --global tag.gpgsign true");
    process.exit(1);
  }

  // 4. Determine next version
  const nextVersion =
    cliOptions.version === undefined
      ? await chooseVersion(current)
      : (() => {
          const result = resolveVersion(cliOptions.version, current);
          if (result.type === "error") {
            console.error(`✗ ${result.message}`);
            process.exit(1);
          }
          return result.version;
        })();

  const tag = `v${nextVersion}`;

  // 5. Confirm
  const confirmed = cliOptions.yes ? true : await confirmRelease(tag);

  if (!confirmed) {
    console.log("Aborted.");
    rl.close();
    process.exit(0);
  }

  // 6. Run pre-release checks
  runChecks();

  // 7. Update package.json
  const nextPkg = { ...pkg, version: nextVersion };
  writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);
  console.log(`Updated package.json to ${nextVersion}`);

  // 8. Git operations
  run("git", ["add", "package.json"]);
  runOrFail("git", ["commit", "-S", "-m", `chore: release ${tag}`], "Signed commit");
  runOrFail("git", ["tag", "-s", tag, "-m", tag], "Signed tag");

  console.log(`\nCreated signed commit and tag ${tag}`);

  runOrFail("git", ["push"], "Push commits");
  runOrFail("git", ["push", "--tags"], "Push tags");

  console.log(`\n✓ Released ${tag} — GitHub Actions will publish to npm.`);

  rl.close();
};

main().catch((err: unknown) => {
  console.error("✗ Unexpected error:", err);
  process.exit(1);
});
