import { startServer } from "./server.ts";
import { initAdvisoryCache } from "./proxy/advisories.service.ts";
import { readUserConfig } from "./daemon-state.ts";

void initAdvisoryCache();

const userConfig = await readUserConfig();

startServer({
  proxyConfig: {
    upstream: { registry: "https://registry.npmjs.org" },
    minSeverity: userConfig.minSeverity,
  },
});
