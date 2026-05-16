#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import getPort from "get-port";
import { runDaemon } from "./daemon.ts";

const mainCli = (): void => {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // --- package.json の読み取り ---

  type PackageJson = { version: string };
  const isPackageJson = (data: unknown): data is PackageJson => {
    if (typeof data !== "object" || data === null) return false;
    return "version" in data && typeof (data as Record<string, unknown>)["version"] === "string";
  };
  const readPkg = (): PackageJson => {
    const raw = readFileSync(join(__dirname, "../package.json"), "utf-8");
    const data: unknown = JSON.parse(raw);
    if (!isPackageJson(data)) throw new Error("Invalid package.json");
    return data;
  };

  // --- daemon 状態管理 ---

  const STATE_DIR = join(homedir(), ".npm-fw");
  const STATE_FILE = join(STATE_DIR, "daemon.json");
  const DAEMON_STARTUP_TIMEOUT_MS = 15_000;

  type DaemonState = { readonly pid: number; readonly port: number };

  const readState = async (): Promise<DaemonState | null> => {
    try {
      const raw = await readFile(STATE_FILE, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && "pid" in parsed && "port" in parsed) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj["pid"] === "number" && typeof obj["port"] === "number") {
          return { pid: obj["pid"], port: obj["port"] };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const isAlive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  const writeState = async (state: DaemonState): Promise<void> => {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state));
  };

  const removeState = async (): Promise<void> => {
    try {
      await rm(STATE_FILE, { force: true });
    } catch {
      // ignore
    }
  };

  /** daemon を停止 */
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

  /** daemon の起動を確認し、なければ起動して port を返す */
  const ensureDaemon = async (): Promise<number> => {
    const existing = await readState();
    if (existing && isAlive(existing.pid)) {
      return existing.port;
    }

    // 空いている port を取得
    const port = await getPort({ port: 4873 });

    // 自分自身を daemon モードで spawn
    const child = spawn(process.execPath, [process.argv[1] ?? "", "--server"], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, NPM_FW_PORT: String(port) },
    });

    if (child.pid === undefined) {
      throw new Error("Failed to start daemon: no pid");
    }

    await writeState({ pid: child.pid, port });
    child.unref();

    // server が起動するまで待つ
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

  /** ユーザーコマンドを proxy 経由で実行 */
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

  // --- cli ---

  const pkg = readPkg();

  const program = new Command();

  program.name("npm-fw").description("npm registry proxy firewall").version(pkg.version);

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

  // daemon-status
  program
    .command("daemon-status")
    .description("Show daemon status")
    .action(async () => {
      const state = await readState();
      if (state && isAlive(state.pid)) {
        console.log(`Daemon running (pid: ${state.pid}, port: ${state.port})`);
      } else {
        console.log("Daemon not running");
      }
    });

  // --server flag (内部用) — 削除
  program.arguments("[command...]").action(async (args: string[]) => {
    await runCommand(args);
  });

  // 引数なしで help 表示
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }

  program.parse();
};

// --server flag は commander より先に処理（内部用）
if (process.argv.includes("--server")) {
  runDaemon();
} else {
  mainCli();
}
