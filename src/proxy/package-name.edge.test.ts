import { describe, expect, it } from "vitest";
import { parsePath, isMetadataRequest, isTarballRequest } from "./package-name.ts";

describe("parsePath edge cases", () => {
  describe("tarball with variants", () => {
    it("parses tarball with build metadata", () => {
      const result = parsePath("/pkg/-/pkg-1.0.0+build2025.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "pkg",
        version: "1.0.0+build2025",
      });
    });

    it("parses scoped tarball with pre-release and build metadata", () => {
      const result = parsePath("/@scope/pkg/-/pkg-2.0.0-alpha.1+build.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "@scope/pkg",
        version: "2.0.0-alpha.1+build",
      });
    });

    it("parses tarball with different package name from filename prefix (edge)", () => {
      // In real npm, name in path matches filename prefix
      const result = parsePath("/axios/-/axios-0.25.0.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "axios",
        version: "0.25.0",
      });
    });

    it("parses tarball with major-only version-like string", () => {
      // npm semver requires 3 parts but the regex captures \d+\.\d+\.\d+
      // This won't match as tarball since version needs 3 parts
      const result = parsePath("/pkg/-/pkg-1.tgz");
      expect(result.type).toBe("metadata"); // falls through to unscoped match
    });
  });

  describe("scoped package variants", () => {
    it("parses deeply scoped package name as metadata", () => {
      const result = parsePath("/@scope/pkg/subpath");
      // regex matches /@scope/pkg then stops before /subpath
      expect(result).toEqual({ type: "metadata", name: "@scope/pkg" });
    });

    it("parses scoped package with version path", () => {
      const result = parsePath("/@scope/pkg/1.0.0");
      expect(result).toEqual({ type: "metadata", name: "@scope/pkg" });
    });
  });

  describe("unusual paths", () => {
    it("handles empty string", () => {
      const result = parsePath("");
      expect(result.type).toBe("other");
    });

    it("handles path with only slash", () => {
      const result = parsePath("/");
      expect(result.type).toBe("other");
    });

    it("handles encoded scoped package path", () => {
      // URL-encoded @ is %40, but parsePath receives the decoded pathname
      const result = parsePath("/@scope%2fname"); // %2f = /
      // After decode it would be /@scope/name, but parsePath gets pathname before decode
      expect(result.type).toBe("metadata");
    });

    it("handles underscore API paths", () => {
      expect(parsePath("/_changes").type).toBe("other");
      expect(parsePath("/_all_dbs").type).toBe("other");
    });

    it("handles dash-prefixed API paths", () => {
      expect(parsePath("/-/v1/search?text=react").type).toBe("other");
      expect(parsePath("/-/npm/v1/security/advisories/bulk").type).toBe("other");
    });

    it("handles package name with dots", () => {
      const result = parsePath("/@babel/core");
      expect(result).toEqual({ type: "metadata", name: "@babel/core" });
    });

    it("handles package name with hyphens", () => {
      const result = parsePath("/@types/node");
      expect(result).toEqual({ type: "metadata", name: "@types/node" });
    });
  });

  describe("security-related paths", () => {
    it("identifies advisory API paths as other", () => {
      expect(parsePath("/-/npm/v1/security/advisories/bulk").type).toBe("other");
    });

    it("identifies audience paths as other", () => {
      expect(parsePath("/-/npm/v1/security/audits/quick").type).toBe("other");
    });
  });
});

describe("isMetadataRequest edge cases", () => {
  it("returns true for package paths with trailing content", () => {
    // Package paths with subpaths are still metadata requests
    expect(isMetadataRequest("/axios/1.0.0")).toBe(true);
  });

  it("returns false for tarball paths", () => {
    expect(isMetadataRequest("/axios/-/axios-1.0.0.tgz")).toBe(false);
  });

  it("returns false for API paths", () => {
    expect(isMetadataRequest("/-/v1/search")).toBe(false);
  });
});

describe("isTarballRequest edge cases", () => {
  it("returns true for various tarball paths", () => {
    expect(isTarballRequest("/axios/-/axios-1.0.0.tgz")).toBe(true);
    expect(isTarballRequest("/@scope/pkg/-/pkg-2.0.0.tgz")).toBe(true);
    expect(isTarballRequest("/react/-/react-19.0.0-rc.1.tgz")).toBe(true);
  });

  it("returns false for metadata paths", () => {
    expect(isTarballRequest("/axios")).toBe(false);
    expect(isTarballRequest("/@scope/pkg")).toBe(false);
  });

  it("returns false for API paths", () => {
    expect(isTarballRequest("/-/v1/search")).toBe(false);
  });
});
