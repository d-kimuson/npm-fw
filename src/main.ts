import { startServer } from "./server.ts";
import { initAdvisoryCache } from "./proxy/advisories.service.ts";

void initAdvisoryCache();

startServer({
  proxyConfig: {
    upstream: { registry: "https://registry.npmjs.org" },
    blocklist: [],
    metadataFilter: {},
    advisories: { enabled: true, minSeverity: "high" },
  },
});
