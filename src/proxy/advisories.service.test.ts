import { describe, expect, it, vi } from "vitest";
import { checkAdvisory, meetsMinSeverity, clearAdvisoryCache } from "./advisories.service.ts";

describe("meetsMinSeverity", () => {
  it("low < moderate < high < critical", () => {
    expect(meetsMinSeverity("low", "low")).toBe(true);
    expect(meetsMinSeverity("moderate", "low")).toBe(true);
    expect(meetsMinSeverity("high", "low")).toBe(true);
    expect(meetsMinSeverity("critical", "low")).toBe(true);

    expect(meetsMinSeverity("low", "high")).toBe(false);
    expect(meetsMinSeverity("moderate", "high")).toBe(false);
    expect(meetsMinSeverity("high", "high")).toBe(true);
    expect(meetsMinSeverity("critical", "high")).toBe(true);
  });
});

describe("checkAdvisory", () => {
  it("only returns advisories whose vulnerable_versions range matches the requested version", async () => {
    const advisory = {
      id: 1,
      title: "qs vuln (only <6.14.0)",
      severity: "high" as const,
      vulnerable_versions: "<6.14.0",
      cwe: ["CWE-1"],
      cvss: { score: 7.5, vectorString: null },
    };

    // 呼ばれるたびに新しい Response を返す（body 消費回避）
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ qs: [advisory] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    clearAdvisoryCache();

    // qs@6.14.0: <6.14.0 に該当しない → 空配列
    const result614 = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "qs",
      version: "6.14.0",
      fetch: mockFetch,
    });
    expect(result614).toHaveLength(0);

    // qs@6.15.2: <6.14.0 に該当しない → 空配列（キャッシュヒット）
    const result6152 = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "qs",
      version: "6.15.2",
      fetch: mockFetch,
    });
    expect(result6152).toHaveLength(0);

    // qs@6.13.0: <6.14.0 に該当 → advisory が返る
    const result613 = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "qs",
      version: "6.13.0",
      fetch: mockFetch,
    });
    expect(result613).toHaveLength(1);
    expect(result613[0]?.severity).toBe("high");
  });

  it("returns advisories for a vulnerable version", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          axios: [
            {
              id: 1,
              title: "Test vuln",
              severity: "high",
              vulnerable_versions: ">=1.0.0 <2.0.0",
              cwe: ["CWE-1"],
              cvss: { score: 7.5, vectorString: null },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    clearAdvisoryCache();
    const result = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.6.0",
      fetch: mockFetch,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe("high");
  });

  it("returns empty array for safe version", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    clearAdvisoryCache();
    const result = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "99.99.99",
      fetch: mockFetch,
    });

    expect(result).toHaveLength(0);
  });

  it("uses cache on second call", async () => {
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ axios: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    clearAdvisoryCache();
    await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.0.0",
      fetch: mockFetch,
    });
    await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.0.0",
      fetch: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when API fails", async () => {
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("Network error"));

    clearAdvisoryCache();
    const result = await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.0.0",
      fetch: mockFetch,
    });

    expect(result).toHaveLength(0);
  });

  it("re-fetches advisory after cache TTL expires", async () => {
    // useFakeTimers で Date.now() を制御
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const mockFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
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
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    clearAdvisoryCache();

    // 1回目の呼び出し → API が呼ばれる
    await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.6.0",
      fetch: mockFetch,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 2回目の呼び出し（TTL 内）→ キャッシュヒット
    await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.6.0",
      fetch: mockFetch,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1); // 呼ばれない

    // TTL（12h + 1ms）経過後
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);

    // 3回目の呼び出し → キャッシュ期限切れで API 再呼び出し
    await checkAdvisory({
      registryUrl: "https://registry.npmjs.org",
      pkg: "axios",
      version: "1.6.0",
      fetch: mockFetch,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
