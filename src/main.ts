import { startServer } from "./server.ts";

startServer({
  proxyConfig: {
    upstream: { registry: "https://registry.npmjs.org" },
    blocklist: [],
    metadataFilter: {},
    advisories: { enabled: true, minSeverity: "high" },
  },
});
