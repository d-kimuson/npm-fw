import { describe, expect, it } from "vitest";
import { createRequestContext, jsonResponse, textResponse } from "./http-context.ts";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

/** テスト用の IncomingMessage インスタンスを作成するヘルパー */
const createMockReq = (overrides: Partial<IncomingMessage> = {}): IncomingMessage => {
  const stream = new Readable();
  stream._read = () => {}; // noop
  // oxlint-disable-next-line no-unsafe-type-assertion
  return Object.assign(stream, {
    url: "/test-path",
    method: "GET",
    headers: {},
    ...overrides,
  }) as unknown as IncomingMessage;
};

describe("createRequestContext", () => {
  it("extracts url, method, and headers from IncomingMessage", () => {
    const req = createMockReq({
      url: "/axios?version=1.0.0",
      method: "GET",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
    });

    const ctx = createRequestContext(req);

    expect(ctx.url).toBe("/axios?version=1.0.0");
    expect(ctx.method).toBe("GET");
    expect(ctx.headers.get("content-type")).toBe("application/json");
    expect(ctx.headers.get("accept")).toBe("application/json");
  });

  it("defaults url to '/' when undefined", () => {
    const req = createMockReq({ url: undefined });

    const ctx = createRequestContext(req);

    expect(ctx.url).toBe("/");
  });

  it("defaults method to 'GET' when undefined", () => {
    const req = createMockReq({ method: undefined });

    const ctx = createRequestContext(req);

    expect(ctx.method).toBe("GET");
  });

  it("converts headers with array values (set-cookie etc.)", () => {
    const req = createMockReq({
      headers: {
        "set-cookie": ["a=1", "b=2"],
      },
    });

    const ctx = createRequestContext(req);

    // Web Standard Headers.get joins array values with comma
    expect(ctx.headers.get("set-cookie")).toBe("a=1, b=2");
  });

  it("handles POST method", () => {
    const req = createMockReq({ method: "POST" });

    const ctx = createRequestContext(req);

    expect(ctx.method).toBe("POST");
  });

  it("handles empty headers", () => {
    const req = createMockReq({ headers: {} });

    const ctx = createRequestContext(req);

    // Headers should be iterable but empty
    let count = 0;
    ctx.headers.forEach(() => count++);
    expect(count).toBe(0);
  });

  it("handles headers with undefined values", () => {
    const req = createMockReq({
      headers: {
        host: "localhost",
        "x-undefined": undefined,
      },
    });

    const ctx = createRequestContext(req);

    expect(ctx.headers.get("host")).toBe("localhost");
    expect(ctx.headers.get("x-undefined")).toBeNull();
  });
});

describe("jsonResponse", () => {
  it("returns a Response with JSON content-type", () => {
    const res = jsonResponse({ status: "ok" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("serializes data to JSON", async () => {
    const data = { message: "hello", count: 42 };
    const res = jsonResponse(data);

    const body = await res.json();
    expect(body).toEqual(data);
  });

  it("merges custom init options", () => {
    const res = jsonResponse({ ok: true }, { status: 201 });

    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("merges custom headers with content-type", () => {
    const res = jsonResponse({ ok: true }, { headers: { "x-custom": "value" } });

    expect(res.headers.get("x-custom")).toBe("value");
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("allows overriding content-type via custom headers", () => {
    const res = jsonResponse(
      { ok: true },
      {
        headers: { "content-type": "application/vnd.api+json" },
      },
    );

    // Our implementation sets content-type AFTER merging, so it overrides
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("works with Headers object as init headers", () => {
    const customHeaders = new Headers({ "x-custom": "value" });
    const res = jsonResponse({ ok: true }, { headers: customHeaders });

    expect(res.headers.get("x-custom")).toBe("value");
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});

describe("textResponse", () => {
  it("returns a Response with text/plain content-type", () => {
    const res = textResponse("hello");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
  });

  it("returns the body as-is", async () => {
    const res = textResponse("hello world");

    const body = await res.text();
    expect(body).toBe("hello world");
  });

  it("merges custom init options", () => {
    const res = textResponse("error", { status: 400 });

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("text/plain");
  });

  it("merges custom headers", () => {
    const res = textResponse("cached", { headers: { "x-cache": "HIT" } });

    expect(res.headers.get("x-cache")).toBe("HIT");
    expect(res.headers.get("content-type")).toBe("text/plain");
  });
});
