import { serve } from "@hono/node-server";
import { honoApp } from "./app.ts";
import { routes } from "./routes.ts";
import type { ProxyConfig } from "./proxy/types.ts";

type ServerOptions = {
  port?: number;
  proxyConfig?: ProxyConfig;
};

export const startServer = (options?: ServerOptions) => {
  const { port = 42424, proxyConfig } = options ?? {};

  routes(honoApp, proxyConfig);

  const server = serve(
    {
      fetch: honoApp.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );

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
