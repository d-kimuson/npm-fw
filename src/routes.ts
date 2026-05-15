import type { Hono } from "hono";
import type { HonoAppType, HonoContext } from "./app.ts";

export const routes = (app: HonoAppType) => {
  return app.get("/info", (c) => {
    return c.json({
      status: "healthy",
      server: "npm-fw",
    } as const);
  });
};

export type RouteType = ReturnType<typeof routes>;

export type ApiSchema = RouteType extends Hono<HonoContext, infer S> ? S : never;
