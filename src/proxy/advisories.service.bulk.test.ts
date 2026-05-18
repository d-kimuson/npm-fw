import { describe, expect, it, vi } from "vitest";
import { checkAdvisoriesBulk, clearAdvisoryCache, checkAdvisory } from "./advisories.service.ts";

const registryUrl = "https://registry.npmjs.org";

const sampleAdvisory = {
  id: 1,
  title: "Test vuln",
  severity: "high" as const,
  vulnerable_versions: ">=1.0.0",
  cwe: [],
  cvss: { score: 7.5, vectorString: null },
};

describe("checkAdvisoriesBulk", () => {
  it("calls API with uncached versions and returns results", async () => {
    clearAdvisoryCache();

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          pkgA: [sampleAdvisory],
          pkgB: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await checkAdvisoriesBulk(
      registryUrl,
      { pkgA: ["1.0.0"], pkgB: ["2.0.0"] },
      mockFetch,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/-/npm/v1/security/advisories/bulk"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result["pkgA"]).toHaveLength(1);
    expect(result["pkgB"]).toHaveLength(0);
  });

  it("skips API call when all versions are cached", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: [sampleAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    // First call populates cache
    await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should hit cache only
    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no additional call
    expect(result["pkgA"]).toHaveLength(1);
  });

  it("calls API only for uncached versions (partial cache)", async () => {
    clearAdvisoryCache();

    // Pre-populate cache for pkgA@1.0.0 via checkAdvisory
    const popFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: [sampleAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await checkAdvisory({
      registryUrl,
      pkg: "pkgA",
      version: "1.0.0",
      fetch: popFetch,
    });
    popFetch.mockClear();

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgB: [sampleAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    // pkgA@1.0.0 cached, pkgB@2.0.0 not cached
    const result = await checkAdvisoriesBulk(
      registryUrl,
      { pkgA: ["1.0.0"], pkgB: ["2.0.0"] },
      mockFetch,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Body should only contain uncached entries
    const callBody = mockFetch.mock.calls[0]?.[1]?.body;
    const body: unknown = JSON.parse(typeof callBody === "string" ? callBody : "{}");
    expect(body).toEqual({ pkgB: ["2.0.0"] });
    expect(result["pkgA"]).toHaveLength(1);
    expect(result["pkgB"]).toHaveLength(1);
  });

  it("returns empty object on API network error", async () => {
    clearAdvisoryCache();
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("Network error"));

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result).toEqual({});
  });

  it("returns empty object on API non-ok response", async () => {
    clearAdvisoryCache();
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result).toEqual({});
  });

  it("returns empty object on API invalid JSON response", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result).toEqual({});
  });

  it("handles multiple versions for the same package", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: [sampleAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0", "2.0.0"] }, mockFetch);

    expect(result["pkgA"]).toHaveLength(2); // same advisory returned for both versions
  });

  it("handles advisories with mixed severity", async () => {
    clearAdvisoryCache();
    const lowAdvisory = { ...sampleAdvisory, severity: "low" as const, id: 2 };
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: [sampleAdvisory, lowAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result["pkgA"]).toHaveLength(2);
  });

  it("handles response with malformed advisories (missing fields)", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          pkgA: [{ severity: "high" }], // missing id, vulnerable_versions
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result["pkgA"]).toHaveLength(0); // malformed filtered out
  });

  it("handles response where advisories is not an array", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: "not-array" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result["pkgA"]).toHaveLength(0);
  });

  it("returns empty for package not in response", async () => {
    clearAdvisoryCache();
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);

    expect(result["pkgA"]).toHaveLength(0);
  });

  it("re-fetches after cache TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    clearAdvisoryCache();

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ pkgA: [sampleAdvisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    // 1回目の呼び出し → API が呼ばれる
    await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 2回目の呼び出し（TTL 内）→ キャッシュヒット
    await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // TTL（12h + 1ms）経過後
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);

    // 3回目の呼び出し → キャッシュ期限切れで API 再呼び出し
    await checkAdvisoriesBulk(registryUrl, { pkgA: ["1.0.0"] }, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("filters advisories by vulnerable_versions range per version", async () => {
    clearAdvisoryCache();
    const advisory = {
      id: 1,
      title: "qs vuln (only <6.14.0)",
      severity: "high" as const,
      vulnerable_versions: "<6.14.0",
      cwe: [],
      cvss: { score: 7.5, vectorString: null },
    };

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ qs: [advisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(
      registryUrl,
      { qs: ["6.13.0", "6.14.0", "6.15.2"] },
      mockFetch,
    );

    // 6.13.0: <6.14.0 に該当 → advisory 1件
    expect(result["qs"]?.filter((a) => a.id === advisory.id)).toHaveLength(1);
    // 6.14.0: 該当なし → empty
    // 6.15.2: 該当なし → empty
    // buildResultFromCache は全バージョンの結果を flat して返すので 全体は 1件
    expect(result["qs"]).toHaveLength(1);
  });

  it("returns empty for all versions when advisory does not match any version", async () => {
    clearAdvisoryCache();
    const advisory = {
      id: 1,
      title: "qs vuln (only <6.14.0)",
      severity: "high" as const,
      vulnerable_versions: "<6.14.0",
      cwe: [],
      cvss: { score: 7.5, vectorString: null },
    };

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ qs: [advisory] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await checkAdvisoriesBulk(registryUrl, { qs: ["6.15.0", "6.15.2"] }, mockFetch);

    expect(result["qs"]).toHaveLength(0);
  });
});
