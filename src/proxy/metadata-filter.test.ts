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

describe("applyMetadataFilter", () => {
  it("returns unchanged metadata when filter is empty", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: [],
      overrideLatest: undefined,
    });
    expect(result).toEqual(sampleMetadata);
  });

  it("hides specified versions", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0", "4.0.0-beta"],
      overrideLatest: undefined,
    });
    expect(result.versions).toEqual({
      "1.0.0": {},
      "2.0.0": {},
    });
    // other fields unchanged
    expect(result.name).toBe("test-pkg");
    expect(result["dist-tags"]).toEqual(sampleMetadata["dist-tags"]);
  });

  it("overrides latest dist-tag when version exists", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: [],
      overrideLatest: "2.0.0",
    });
    expect(result["dist-tags"]["latest"]).toBe("2.0.0");
    expect(result["dist-tags"]["next"]).toBe("4.0.0-beta");
  });

  it("does not override latest when version does not exist", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: [],
      overrideLatest: "99.99.99",
    });
    expect(result["dist-tags"]["latest"]).toBe("3.0.0");
  });

  it("combines hideVersions and overrideLatest", () => {
    const result = applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0", "4.0.0-beta"],
      overrideLatest: "2.0.0",
    });
    expect(result.versions).toEqual({
      "1.0.0": {},
      "2.0.0": {},
    });
    expect(result["dist-tags"]["latest"]).toBe("2.0.0");
  });

  it("does not mutate the original metadata", () => {
    const original = structuredClone(sampleMetadata);
    applyMetadataFilter(sampleMetadata, {
      hideVersions: ["3.0.0"],
      overrideLatest: "2.0.0",
    });
    expect(sampleMetadata).toEqual(original);
  });
});
