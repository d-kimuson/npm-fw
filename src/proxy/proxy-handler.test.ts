import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createProxyHandler } from "./proxy-handler.ts";
import type { ProxyConfig } from "./types.ts";

const baseConfig: ProxyConfig = {
  upstream: { registry: "https://registry.npmjs.org" },
  blocklist: [],
  metadataFilter: {},
};

/** テスト用の Hono アプリを作成し、proxy handler を登録して fetch できるようにする */
const createTestApp = (config: ProxyConfig, mockFetch: typeof globalThis.fetch) => {
  const app = new Hono();
  const handler = createProxyHandler({ config, fetch: mockFetch });
  app.all("*", handler);
  return app;
};

describe("createProxyHandler", () => {
  it("forwards request to upstream and returns response", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "axios", versions: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = createTestApp(baseConfig, mockFetch);
    const res = await app.request("/axios");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/axios",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("passes through non-metadata responses unchanged", async () => {
    const body = "some tarball data";
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const app = createTestApp(baseConfig, mockFetch);
    const res = await app.request("/axios/-/axios-1.0.0.tgz");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });

  it("returns 403 for blocked package", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>();
    const config: ProxyConfig = {
      ...baseConfig,
      blocklist: [{ type: "package", name: "malware" }],
    };

    const app = createTestApp(config, mockFetch);
    const res = await app.request("/malware");

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 403 for blocked package tarball", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>();
    const config: ProxyConfig = {
      ...baseConfig,
      blocklist: [{ type: "package", name: "malware" }],
    };

    const app = createTestApp(config, mockFetch);
    const res = await app.request("/malware/-/malware-1.0.0.tgz");

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 403 for blocked specific version", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>();
    const config: ProxyConfig = {
      ...baseConfig,
      blocklist: [{ type: "version", name: "axios", version: "1.8.0" }],
    };

    const app = createTestApp(config, mockFetch);
    const res = await app.request("/axios/-/axios-1.8.0.tgz");

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows non-blocked version of blocked package (version-block only)", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response("tarball data", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const config: ProxyConfig = {
      ...baseConfig,
      blocklist: [{ type: "version", name: "axios", version: "1.8.0" }],
    };

    const app = createTestApp(config, mockFetch);
    const res = await app.request("/axios/-/axios-1.7.0.tgz");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("returns 502 when upstream is unreachable", async () => {
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("Connection refused"));

    const app = createTestApp(baseConfig, mockFetch);
    const res = await app.request("/axios");

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream registry unavailable");
  });

  it("forwards query parameters to upstream", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "axios" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = createTestApp(baseConfig, mockFetch);
    await app.request("/axios?version=1.0.0");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/axios?version=1.0.0",
      expect.anything(),
    );
  });

  describe("advisories", () => {
    it("blocks tarball when advisory exists with sufficient severity", async () => {
      const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            axios: [
              {
                id: 1,
                title: "Test vuln",
                severity: "high",
                vulnerable_versions: ">=1.0.0",
                cwe: [],
                cvss: { score: 7.5, vectorString: null },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const config: ProxyConfig = {
        ...baseConfig,
        advisories: { enabled: true, minSeverity: "high" },
      };
      const app = createTestApp(config, mockFetch);
      const res = await app.request("/axios/-/axios-1.6.0.tgz");

      expect(res.status).toBe(403);
      expect(await res.text()).toContain("vulnerable");
    });

    it("allows tarball when no advisories found", async () => {
      const mockFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("tarball data", {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          }),
        );

      const config: ProxyConfig = {
        ...baseConfig,
        advisories: { enabled: true, minSeverity: "high" },
      };
      const app = createTestApp(config, mockFetch);
      const res = await app.request("/axios/-/axios-1.7.0.tgz");

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("filters metadata: hides vulnerable versions and overrides latest", async () => {
      // oxlint-disable no-unsafe-assignment
      const upstreamMetadata = {
        name: "lodash",
        "dist-tags": { latest: "4.17.20" },
        versions: {
          "4.17.19": {},
          "4.17.20": {},
          "4.17.21": {},
          "4.18.1": {},
        },
      };

      const mockFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(upstreamMetadata), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              lodash: [
                {
                  id: 1,
                  title: "Prototype Pollution",
                  severity: "high",
                  vulnerable_versions: ">=4.17.0 <4.17.21",
                  cwe: [],
                  cvss: { score: 7.5, vectorString: null },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );

      const config: ProxyConfig = {
        ...baseConfig,
        advisories: { enabled: true, minSeverity: "high" },
      };
      const app = createTestApp(config, mockFetch);
      const res = await app.request("/lodash");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        versions: expect.not.objectContaining({
          "4.17.19": expect.anything(),
          "4.17.20": expect.anything(),
        }),
        "dist-tags": expect.objectContaining({ latest: "4.18.1" }),
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("metadata: keeps latest unchanged if it is safe", async () => {
      // oxlint-disable no-unsafe-assignment
      const upstreamMetadata = {
        name: "lodash",
        "dist-tags": { latest: "4.18.1" },
        versions: {
          "4.17.20": {},
          "4.18.1": {},
        },
      };

      const mockFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(upstreamMetadata), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              lodash: [
                {
                  id: 1,
                  title: "Prototype Pollution",
                  severity: "high",
                  vulnerable_versions: ">=4.17.0 <4.17.21",
                  cwe: [],
                  cvss: { score: 7.5, vectorString: null },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );

      const config: ProxyConfig = {
        ...baseConfig,
        advisories: { enabled: true, minSeverity: "high" },
      };
      const app = createTestApp(config, mockFetch);
      const res = await app.request("/lodash");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        versions: expect.not.objectContaining({
          "4.17.20": expect.anything(),
        }),
        "dist-tags": expect.objectContaining({ latest: "4.18.1" }),
      });
    });
  });
});
