import { startServer } from "./server.ts";
import type { ProxyConfig } from "./proxy/types.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STATE_DIR = join(homedir(), ".npm-fw");
const STATE_FILE = join(STATE_DIR, "daemon.json");

type DaemonState = {
  readonly pid: number;
  readonly port: number;
};

const readPort = (): number => {
  const envPort = process.env["NPM_FW_PORT"];
  if (envPort !== undefined) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 3000;
};

const writeState = (port: number): void => {
  mkdirSync(STATE_DIR, { recursive: true });
  const state: DaemonState = { pid: process.pid, port };
  writeFileSync(STATE_FILE, JSON.stringify(state));
};

export const runDaemon = (): void => {
  const port = readPort();

  const proxyConfig: ProxyConfig = {
    upstream: { registry: "https://registry.npmjs.org" },
    blocklist: [],
    metadataFilter: {},
    advisories: { enabled: true, minSeverity: "high" },
  };

  writeState(port);

  startServer({ port, proxyConfig });

  // 起動ログは stderr に出しておく（daemon の stdout は閉じられるため）
  process.stderr.write(`npm-fw daemon started on http://localhost:${port}\n`);
};
