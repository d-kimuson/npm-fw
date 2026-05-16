import { describe, expect, it } from "vitest";
import { computeAdvisoryFilter } from "./advisories-filter.ts";
import type { Advisory, NpmPackageMetadata } from "./types.ts";

const baseMetadata: NpmPackageMetadata = {
  name: "test-pkg",
  "dist-tags": { latest: "3.0.0" },
  versions: {
    "1.0.0": {},
    "2.0.0": {},
    "3.0.0": {},
    "4.0.0-rc.1": {},
    "5.0.0": {},
  },
};

describe("computeAdvisoryFilter complex scenarios", () => {
  describe("multiple advisories with overlapping ranges", () => {
    it("hides versions matching any advisory", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln A",
          severity: "high",
          vulnerable_versions: ">=1.0.0 <2.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
        {
          id: 2,
          title: "Vuln B",
          severity: "high",
          vulnerable_versions: ">=2.0.0 <4.0.0",
          cwe: [],
          cvss: { score: 8.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toContain("1.0.0");
      expect(result.hideVersions).toContain("2.0.0");
      expect(result.hideVersions).toContain("3.0.0");
      expect(result.hideVersions).not.toContain("4.0.0-rc.1");
      expect(result.hideVersions).not.toContain("5.0.0");
    });

    it("deduplicates hidden versions across advisories", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln A",
          severity: "critical",
          vulnerable_versions: ">=1.0.0",
          cwe: [],
          cvss: { score: 9.0, vectorString: null },
        },
        {
          id: 2,
          title: "Vuln B",
          severity: "high",
          vulnerable_versions: ">=1.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      // Should not have duplicates
      expect(result.hideVersions.length).toBe(new Set(result.hideVersions).size);
    });
  });

  describe("mixed severity filtering", () => {
    it("only hides versions for advisories meeting minSeverity", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Low vuln",
          severity: "low",
          vulnerable_versions: ">=1.0.0 <3.0.0",
          cwe: [],
          cvss: { score: 2.0, vectorString: null },
        },
        {
          id: 2,
          title: "Critical vuln",
          severity: "critical",
          vulnerable_versions: ">=3.0.0",
          cwe: [],
          cvss: { score: 9.5, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      // Only critical advisory versions should be hidden
      // Note: 4.0.0-rc.1 is prerelease; semver.satisfies with >=3.0.0 (no prerelease tag) does NOT match it
      expect(result.hideVersions).toContain("3.0.0");
      expect(result.hideVersions).toContain("5.0.0");
      expect(result.hideVersions).not.toContain("4.0.0-rc.1");
      expect(result.hideVersions).not.toContain("1.0.0");
      expect(result.hideVersions).not.toContain("2.0.0");
    });

    it("hides all when minSeverity is low", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Low vuln",
          severity: "low",
          vulnerable_versions: ">=1.0.0",
          cwe: [],
          cvss: { score: 1.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "low");
      // 4.0.0-rc.1 is prerelease; >=1.0.0 (no prerelease tag) does not match it
      expect(result.hideVersions.length).toBe(4);
    });
  });

  describe("pre-release version handling", () => {
    it("includes pre-release versions in hidden list when vulnerable", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=4.0.0-rc",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toContain("4.0.0-rc.1");
      expect(result.hideVersions).toContain("5.0.0");
    });

    it("skips pre-release when selecting safe latest", () => {
      const meta: NpmPackageMetadata = {
        name: "test-pkg",
        "dist-tags": { latest: "3.0.0" },
        versions: {
          "1.0.0": {},
          "2.0.0": {},
          "3.0.0": {},
          "4.0.0-alpha.1": {},
        },
      };

      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=3.0.0",
          cwe: [],
          cvss: { score: 7.5, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(meta, advisories, "high");
      // 3.0.0 and 4.0.0-alpha.1 hidden, safe versions: 1.0.0, 2.0.0
      // 4.0.0-alpha.1 is pre-release so not eligible for latest
      expect(result.overrideLatest).toBe("2.0.0");
    });
  });

  describe("semver range edge cases", () => {
    it("handles exact version range", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: "2.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toEqual(["2.0.0"]);
    });

    it("handles greater-than range", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">4.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toContain("5.0.0");
      expect(result.hideVersions).not.toContain("4.0.0-rc.1");
    });

    it("handles OR range", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=1.0.0 <2.0.0 || >=4.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toContain("1.0.0");
      expect(result.hideVersions).not.toContain("2.0.0");
      expect(result.hideVersions).not.toContain("3.0.0");
      expect(result.hideVersions).toContain("5.0.0");
    });

    it("handles range with whitespace (trimmed)", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: " >=2.0.0 ",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      expect(result.hideVersions).toContain("2.0.0");
    });

    it("handles caret range", () => {
      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: "^1.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(baseMetadata, advisories, "high");
      // ^1.0.0 matches >=1.0.0 <2.0.0
      expect(result.hideVersions).toContain("1.0.0");
      expect(result.hideVersions).not.toContain("2.0.0");
    });
  });

  describe("latest selection", () => {
    it("selects stable version over pre-release for latest override", () => {
      const meta: NpmPackageMetadata = {
        name: "test-pkg",
        "dist-tags": { latest: "5.0.0" },
        versions: {
          "1.0.0": {},
          "2.0.0": {},
          "5.0.0": {},
          "6.0.0-beta.1": {},
        },
      };

      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=5.0.0",
          cwe: [],
          cvss: { score: 8.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(meta, advisories, "high");
      // 5.0.0 + 6.0.0-beta.1 hidden, safe: 1.0.0, 2.0.0
      // Should pick 2.0.0 (stable) not 6.0.0-beta.1
      expect(result.overrideLatest).toBe("2.0.0");
    });

    it("returns undefined for overrideLatest when only pre-release safe versions exist", () => {
      const meta: NpmPackageMetadata = {
        name: "test-pkg",
        "dist-tags": { latest: "2.0.0" },
        versions: {
          "1.0.0-alpha.1": {},
          "2.0.0": {},
        },
      };

      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=2.0.0",
          cwe: [],
          cvss: { score: 8.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(meta, advisories, "high");
      // 2.0.0 hidden, safe: 1.0.0-alpha.1 (pre-release only)
      expect(result.overrideLatest).toBeUndefined();
    });
  });

  describe("no dist-tags", () => {
    it("handles missing dist-tags gracefully", () => {
      const meta: NpmPackageMetadata = {
        name: "test-pkg",
        "dist-tags": {},
        versions: {
          "1.0.0": {},
          "2.0.0": {},
        },
      };

      const advisories: readonly Advisory[] = [
        {
          id: 1,
          title: "Vuln",
          severity: "high",
          vulnerable_versions: ">=2.0.0",
          cwe: [],
          cvss: { score: 7.0, vectorString: null },
        },
      ];

      const result = computeAdvisoryFilter(meta, advisories, "high");
      expect(result.hideVersions).toEqual(["2.0.0"]);
      // latest is undefined, so not vulnerable → no override
      expect(result.overrideLatest).toBeUndefined();
    });
  });
});
