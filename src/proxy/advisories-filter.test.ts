import { describe, expect, it } from "vitest";
import { computeAdvisoryFilter } from "./advisories-filter.ts";
import type { Advisory, NpmPackageMetadata } from "./types.ts";

const sampleMetadata: NpmPackageMetadata = {
  name: "test-pkg",
  "dist-tags": { latest: "3.0.0" },
  versions: {
    "1.0.0": {},
    "2.0.0": {},
    "3.0.0": {},
  },
};

const highAdvisory: Advisory = {
  id: 1,
  title: "Test vuln",
  severity: "high",
  vulnerable_versions: ">=2.0.0",
  cwe: [],
  cvss: { score: 7.5, vectorString: null },
};

describe("computeAdvisoryFilter", () => {
  it("returns empty filter when no advisories", () => {
    const result = computeAdvisoryFilter(sampleMetadata, [], "high");
    expect(result.hideVersions).toEqual([]);
    expect(result.overrideLatest).toBeUndefined();
  });

  it("returns empty filter when advisories below minSeverity", () => {
    const lowAdvisory: Advisory = {
      ...highAdvisory,
      severity: "low",
    };
    const result = computeAdvisoryFilter(sampleMetadata, [lowAdvisory], "high");
    expect(result.hideVersions).toEqual([]);
  });

  it("hides versions that match advisory range", () => {
    const result = computeAdvisoryFilter(sampleMetadata, [highAdvisory], "high");
    expect(result.hideVersions).toContain("2.0.0");
    expect(result.hideVersions).toContain("3.0.0");
    expect(result.hideVersions).not.toContain("1.0.0");
  });

  it("overrides latest when latest is vulnerable", () => {
    const result = computeAdvisoryFilter(sampleMetadata, [highAdvisory], "high");
    expect(result.overrideLatest).toBe("1.0.0");
  });

  it("does not override latest when latest is safe", () => {
    const safeMetadata: NpmPackageMetadata = {
      ...sampleMetadata,
      "dist-tags": { latest: "1.0.0" },
    };
    const result = computeAdvisoryFilter(safeMetadata, [highAdvisory], "high");
    expect(result.overrideLatest).toBeUndefined();
    expect(result.hideVersions).toContain("2.0.0");
    expect(result.hideVersions).toContain("3.0.0");
  });

  it("returns undefined overrideLatest when all versions are vulnerable", () => {
    const allVuln: Advisory = {
      ...highAdvisory,
      vulnerable_versions: ">=1.0.0",
    };
    const result = computeAdvisoryFilter(sampleMetadata, [allVuln], "high");
    expect(result.hideVersions).toHaveLength(3);
    expect(result.overrideLatest).toBeUndefined();
  });
});
