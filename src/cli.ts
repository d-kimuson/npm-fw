#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import getPort from "get-port";
import { runDaemon } from "./daemon.ts";
import { readState, isAlive, writeState, removeState } from "./daemon-state.ts";
import pkg from "../package.json" with { type: "json" };
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DAEMON_STARTUP_TIMEOUT_MS = 15_000;
const DAEMON_BASE_PORT = 42424;

const stopDaemon = async (): Promise<boolean> => {
  const state = await readState();
  if (!state || !isAlive(state.pid)) {
    await removeState();
    return false;
  }
  try {
    process.kill(state.pid, "SIGTERM");
  } catch {
    // already dead
  }
  await removeState();
  return true;
};

const ensureDaemon = async (): Promise<number> => {
  const existing = await readState();
  if (existing && isAlive(existing.pid)) {
    return existing.port;
  }

  const port = await getPort({ port: DAEMON_BASE_PORT });

  const child = spawn(process.execPath, [process.argv[1] ?? "", "daemon-start"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, NPM_FW_PORT: String(port) },
  });

  if (child.pid === undefined) {
    throw new Error("Failed to start daemon: no pid");
  }

  await writeState({ pid: child.pid, port });
  child.unref();

  const start = Date.now();
  while (Date.now() - start < DAEMON_STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`http://localhost:${port}/info`);
      if (res.ok) return port;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(`Daemon did not start within ${DAEMON_STARTUP_TIMEOUT_MS}ms`);
};

const runCommand = async (args: string[]): Promise<void> => {
  if (args.length === 0) {
    console.error("Usage: npm-fw <command...>");
    console.error("Example: npm-fw npm install axios");
    process.exit(1);
  }

  const port = await ensureDaemon();
  const registry = `http://localhost:${port}/`;

  const [cmd, ...cmdArgs] = args;
  if (cmd === undefined) {
    process.exit(1);
  }

  const child = spawn(cmd, cmdArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_registry: registry,
      pnpm_config_registry: registry,
      YARN_NPM_REGISTRY_SERVER: registry,
      YARN_REGISTRY: registry,
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
};

// --- npm config helper ---

const npmConfig = (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> =>
  new Promise((resolve) => {
    const child = spawn("npm", ["config", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });

const yarnConfig = (
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> =>
  new Promise((resolve) => {
    const child = spawn("yarn", ["config", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });
    child.on("error", () => resolve({ stdout, stderr, code: null }));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });

// --- yarnrc helper ---

const YARNRC_PATH = join(homedir(), ".yarnrc.yml");

const readYarnrcLines = async (): Promise<string[]> => {
  try {
    const content = await readFile(YARNRC_PATH, "utf-8");
    return content.split("\n");
  } catch {
    return [];
  }
};

const writeYarnrcLines = async (lines: string[]): Promise<void> => {
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  if (nonEmpty.length === 0) {
    try {
      await rm(YARNRC_PATH, { force: true });
    } catch {
      // ignore
    }
    return;
  }
  const content = nonEmpty.join("\n") + "\n";
  await writeFile(YARNRC_PATH, content);
};

const setYarnNpmRegistryServer = async (registry: string): Promise<void> => {
  const lines = await readYarnrcLines();
  const key = "npmRegistryServer:";
  let found = false;

  const updated = lines.map((line) => {
    if (line.trimStart().startsWith(key)) {
      found = true;
      return `npmRegistryServer: "${registry}"`;
    }
    return line;
  });

  if (!found) {
    updated.push(`npmRegistryServer: "${registry}"`);
  }

  await writeYarnrcLines(updated);
};

const deleteYarnNpmRegistryServer = async (): Promise<boolean> => {
  const lines = await readYarnrcLines();
  if (lines.length === 0) return false;

  const key = "npmRegistryServer:";
  const updated = lines.filter((line) => !line.trimStart().startsWith(key));

  if (updated.length === lines.length) return false;

  await writeYarnrcLines(updated);
  return true;
};

// --- CLI ---

const program = new Command()
  .name(pkg.name)
  .description(pkg.description)
  .version(pkg.version)
  // Allow unknown options so that passthrough commands like `pnpm add -D` pass through
  // without Commander rejecting them. Known subcommands and --help work as normal.
  .allowUnknownOption();

// setup-standalone
program
  .command("setup-standalone")
  .description("Set up npm-fw as a persistent registry proxy")
  .action(async () => {
    const port = await ensureDaemon();
    const registry = `http://localhost:${port}/`;

    const result = await npmConfig(["set", "registry", registry]);
    if (result.code !== 0) {
      console.error(`Failed to set npm registry: ${result.stderr}`);
      process.exit(1);
    }

    // Write yarn berry config
    await setYarnNpmRegistryServer(registry);

    console.log(`✅ npm-fw is set up as registry proxy`);
    console.log(`   Registry: ${registry}`);
    console.log(`   Run "npm-fw doctor" to verify the setup`);
  });

// clean
program
  .command("clean")
  .description("Remove npm-fw standalone configuration and stop the daemon")
  .action(async () => {
    let cleaned = false;

    // Stop daemon
    const daemonStopped = await stopDaemon();

    // Remove npm registry config
    const npmResult = await npmConfig(["delete", "registry"]);
    if (npmResult.code === 0) {
      cleaned = true;
    }

    // Remove yarn berry config
    const yarnCleaned = await deleteYarnNpmRegistryServer();
    if (yarnCleaned) {
      cleaned = true;
    }

    if (daemonStopped || cleaned) {
      console.log("✅ Cleaned up npm-fw configuration");
    } else {
      console.log("Nothing to clean");
    }
  });

// doctor
program
  .command("doctor")
  .description("Check daemon status and npm registry configuration")
  .action(async () => {
    let hasError = false;

    const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, "");

    // Check daemon
    const state = await readState();
    if (!state || !isAlive(state.pid)) {
      console.log("❌ Daemon is not running");
      hasError = true;
    } else {
      console.log(`✅ Daemon running (pid: ${state.pid}, port: ${state.port})`);
    }

    if (state && isAlive(state.pid)) {
      const expectedRegistry = `http://localhost:${state.port}/`;
      const expected = normalizeUrl(expectedRegistry);

      // Check npm config
      const { stdout: npmOut, code: npmCode } = await npmConfig(["get", "registry"]);

      if (npmCode !== 0) {
        console.log("❌ Could not read npm registry config");
        hasError = true;
      } else {
        const current = normalizeUrl(npmOut);

        if (current === expected) {
          console.log(`✅ npm registry: ${npmOut.trim()}`);
        } else {
          console.log("⚠️  npm registry is not routed through npm-fw");
          console.log(`   Current:  ${npmOut.trim() || "(not set)"}`);
          console.log(`   Expected: ${expectedRegistry}`);
          hasError = true;
        }
      }

      // Check yarn config
      const yarnBerry = await yarnConfig(["get", "npmRegistryServer"]);
      if (yarnBerry.code === null) {
        console.log("ℹ️  yarn not found (skipped yarn checks)");
      } else {
        if (yarnBerry.code === 0) {
          const current = normalizeUrl(yarnBerry.stdout);
          if (current === expected) {
            console.log(`✅ yarn berry registry: ${yarnBerry.stdout.trim()}`);
          } else {
            console.log("⚠️  yarn berry registry is not routed through npm-fw");
            console.log(`   Current:  ${yarnBerry.stdout.trim() || "(not set)"}`);
            console.log(`   Expected: ${expectedRegistry}`);
            hasError = true;
          }
        } else {
          console.log("ℹ️  yarn berry registry: not set");
        }

        const yarnV1 = await yarnConfig(["get", "registry"]);
        if (yarnV1.code === 0) {
          const current = normalizeUrl(yarnV1.stdout);
          if (current === expected) {
            console.log(`✅ yarn v1 registry: ${yarnV1.stdout.trim()}`);
          } else {
            console.log("⚠️  yarn v1 registry is not routed through npm-fw");
            console.log(`   Current:  ${yarnV1.stdout.trim() || "(not set)"}`);
            console.log(`   Expected: ${expectedRegistry}`);
            hasError = true;
          }
        } else {
          console.log("ℹ️  yarn v1 registry: not set");
        }
      }
    }

    if (hasError) {
      console.log("");
      console.log('Run "npm-fw setup-standalone" to fix.');
      process.exit(1);
    }
  });

// daemon-start
program
  .command("daemon-start")
  .description("Start the proxy daemon directly (for systemd/launchd)")
  .action(() => {
    runDaemon();
  });

// daemon-stop
program
  .command("daemon-stop")
  .description("Stop the proxy daemon")
  .action(async () => {
    const stopped = await stopDaemon();
    if (stopped) {
      console.log("Daemon stopped");
    } else {
      console.log("Daemon not running");
    }
  });

// daemon-reload
program
  .command("daemon-reload")
  .description("Restart the proxy daemon")
  .action(async () => {
    await stopDaemon();
    try {
      const port = await ensureDaemon();
      console.log(`Daemon restarted on http://localhost:${port}`);
    } catch (err) {
      console.error("Failed to restart daemon:", err);
      process.exit(1);
    }
  });

// Default: proxy a command
program.arguments("[command...]").action(async (args: string[]) => {
  await runCommand(args);
});

program.addHelpText(
  "after",
  `
Examples:
  $ npm-fw npm install axios
  $ npm-fw pnpm add -D @types/node
  $ npm-fw yarn add @types/node
  $ npm-fw setup-standalone
  $ npm-fw clean
  $ npm-fw doctor
  $ npm-fw daemon-stop
  $ npm-fw daemon-reload
`,
);

// Show help if no arguments
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
