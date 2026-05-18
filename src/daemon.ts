import { startServer } from "./server.ts";
import type { ProxyConfig } from "./proxy/types.ts";
import { writeStateSync, readUserConfigSync } from "./daemon-state.ts";
import { initAdvisoryCache } from "./proxy/advisories.service.ts";

const readPort = (): number => {
  const envPort = process.env["NPM_FW_PORT"];
  if (envPort !== undefined) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 42424;
};

export const runDaemon = (): void => {
  const port = readPort();
  const userConfig = readUserConfigSync();

  const proxyConfig: ProxyConfig = {
    upstream: { registry: "https://registry.npmjs.org" },
    minSeverity: userConfig.minSeverity,
  };

  writeStateSync({ pid: process.pid, port });

  void initAdvisoryCache();

  startServer({ port, proxyConfig });

  // 起動ログは stderr に出しておく（daemon の stdout は閉じられるため）
  process.stderr.write(`npm-fw daemon started on http://localhost:${port}\n`);
};
