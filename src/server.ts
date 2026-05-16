import { createServer } from "node:http";
import { createHandler } from "./routes.ts";
import type { ProxyConfig } from "./proxy/types.ts";

type ServerOptions = {
  port?: number;
  proxyConfig?: ProxyConfig;
};

export const startServer = (options?: ServerOptions) => {
  const { port = 42424, proxyConfig } = options ?? {};

  const handler = createHandler(proxyConfig);

  const server = createServer(handler);

  server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });

  let isRunning = true;
  const cleanUp = () => {
    if (isRunning) {
      server.close();
      isRunning = false;
    }
  };

  process.on("SIGINT", () => {
    cleanUp();
  });

  process.on("SIGTERM", () => {
    cleanUp();
  });

  return {
    server,
    cleanUp,
  } as const;
};
