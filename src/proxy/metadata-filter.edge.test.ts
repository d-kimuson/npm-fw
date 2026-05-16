import { describe, expect, it } from "vitest";
import { applyMetadataFilter } from "./metadata-filter.ts";
import type { NpmPackageMetadata } from "./types.ts";

const sampleMetadata: NpmPackageMetadata = {
  name: "test-pkg",
  "dist-tags": {
    latest: "3.0.0",
    next: "4.0.0-beta",
  },
  versions: {
    "1.0.0": {},
    "2.0.0": {},
    "3.0.0": {},
    "4.0.0-beta": {},
  },
  description: "A test package",
};

describe("applyMetadataFilter edge cases", () => {
  it("ignores hideVersions entries that do not exist in versions", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["99.99.99", "100.0.0"],
    });
    // versions unchanged
    expect(Object.keys(result.versions)).toEqual(["1.0.0", "2.0.0", "3.0.0", "4.0.0-beta"]);
  });

  it("handles hideVersions with mix of existing and non-existing", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0", "99.99.99"],
    });
    expect(result.versions).toEqual({
      "1.0.0": {},
      "2.0.0": {},
      "4.0.0-beta": {},
    });
  });

  it("no-ops when hideVersions is empty array", () => {
    const result = applyMetadataFilter(sampleMetadata, { hideVersions: [] });
    expect(result).toEqual(sampleMetadata);
  });

  it("does not apply overrideLatest when version was hidden", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["2.0.0"],
      overrideLatest: "2.0.0",
    });
    // 2.0.0 was removed from versions, so override should not apply
    expect(result["dist-tags"]["latest"]).toBe("3.0.0");
  });

  it("applies overrideLatest when version still exists after hiding", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0"],
      overrideLatest: "2.0.0",
    });
    // 2.0.0 exists, so override applies
    expect(result["dist-tags"]["latest"]).toBe("2.0.0");
  });

  it("handles undefined overwriteLatest (no-op)", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0"],
      overrideLatest: undefined,
    });
    expect(result.versions).toEqual({
      "1.0.0": {},
      "2.0.0": {},
      "4.0.0-beta": {},
    });
    expect(result["dist-tags"]["latest"]).toBe("3.0.0");
  });

  it("preserves dist-tags keys other than latest", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      overrideLatest: "2.0.0",
    });
    expect(result["dist-tags"]["next"]).toBe("4.0.0-beta");
  });

  it("preserves unknown extra fields", () => {
    const result = applyMetadataFilter(sampleMetadata, { hideVersions: ["3.0.0"] });
    expect(result["description"]).toBe("A test package");
    expect(result.name).toBe("test-pkg");
  });

  it("does not mutate original when hiding non-existent versions", () => {
    const original = structuredClone(sampleMetadata);
    applyMetadataFilter(sampleMetadata, { hideVersions: ["99.99.99"] });
    expect(sampleMetadata).toEqual(original);
  });
});
