#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import getPort from "get-port";
import { runDaemon } from "./daemon.ts";
import { readState, isAlive, writeState, removeState } from "./daemon-state.ts";
import pkg from "../package.json" with { type: "json" };

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

  const [cmd, ...cmdArgs] = args;
  if (cmd === undefined) {
    process.exit(1);
  }

  const child = spawn(cmd, cmdArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_registry: `http://localhost:${port}/`,
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

    console.log(`✅ npm-fw is set up as registry proxy`);
    console.log(`   Registry: ${registry}`);
    console.log(`   Run "npm-fw doctor" to verify the setup`);
  });

// doctor
program
  .command("doctor")
  .description("Check daemon status and npm registry configuration")
  .action(async () => {
    let hasError = false;

    // Check daemon
    const state = await readState();
    if (!state || !isAlive(state.pid)) {
      console.log("❌ Daemon is not running");
      hasError = true;
    } else {
      console.log(`✅ Daemon running (pid: ${state.pid}, port: ${state.port})`);
    }

    // Check npm registry config
    if (state && isAlive(state.pid)) {
      const expectedRegistry = `http://localhost:${state.port}/`;
      const { stdout, code } = await npmConfig(["get", "registry"]);

      if (code !== 0) {
        console.log("❌ Could not read npm registry config");
        hasError = true;
      } else {
        const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, "");
        const current = normalizeUrl(stdout);
        const expected = normalizeUrl(expectedRegistry);

        if (current === expected) {
          console.log(`✅ npm registry: ${stdout.trim()}`);
        } else {
          console.log("⚠️  npm registry is not routed through npm-fw");
          console.log(`   Current:  ${stdout.trim() || "(not set)"}`);
          console.log(`   Expected: ${expectedRegistry}`);
          hasError = true;
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
  $ npm-fw setup-standalone
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
