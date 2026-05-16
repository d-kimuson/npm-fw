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
});
