import type { Hono } from "hono";
import type { HonoAppType, HonoContext } from "./app.ts";
import type { ProxyConfig } from "./proxy/types.ts";
import { createProxyHandler } from "./proxy/proxy-handler.ts";

export const routes = (app: HonoAppType, proxyConfig?: ProxyConfig) => {
  app.get("/info", (c) => {
    return c.json({
      status: "healthy",
      server: "npm-fw",
    } as const);
  });

  // registry proxy — catch-all で上流レジストリに転送する
  if (proxyConfig) {
    const proxyHandler = createProxyHandler({ config: proxyConfig });
    app.all("*", proxyHandler);
  }

  return app;
};

export type RouteType = ReturnType<typeof routes>;

export type ApiSchema = RouteType extends Hono<HonoContext, infer S> ? S : never;
