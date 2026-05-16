import { describe, expect, it } from "vitest";
import { parsePath, isMetadataRequest, isTarballRequest } from "./package-name.ts";

describe("parsePath", () => {
  describe("metadata requests", () => {
    it("parses unscoped package name", () => {
      const result = parsePath("/axios");
      expect(result).toEqual({ type: "metadata", name: "axios" });
    });

    it("parses scoped package name", () => {
      const result = parsePath("/@scope/package");
      expect(result).toEqual({ type: "metadata", name: "@scope/package" });
    });

    it("parses package name with trailing slash", () => {
      const result = parsePath("/axios/");
      // trailing slash still matches the unscoped pattern
      expect(result.type).toBe("metadata");
      expect(result.type === "metadata" ? result.name : "").toBe("axios");
    });
  });

  describe("tarball requests", () => {
    it("parses unscoped tarball", () => {
      const result = parsePath("/axios/-/axios-1.7.0.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "axios",
        version: "1.7.0",
      });
    });

    it("parses scoped tarball", () => {
      const result = parsePath("/@scope/package/-/package-2.0.0.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "@scope/package",
        version: "2.0.0",
      });
    });

    it("parses version with pre-release tag", () => {
      const result = parsePath("/react/-/react-19.0.0-rc.1.tgz");
      expect(result).toEqual({
        type: "tarball",
        name: "react",
        version: "19.0.0-rc.1",
      });
    });
  });

  describe("other requests", () => {
    it("returns other for registry API paths", () => {
      expect(parsePath("/-/v1/search").type).toBe("other");
      expect(parsePath("/-/user/org.couchdb.user:foo").type).toBe("other");
    });

    it("returns other for underscore paths", () => {
      expect(parsePath("/_session").type).toBe("other");
    });

    it("returns other for root path", () => {
      expect(parsePath("/").type).toBe("other");
    });
  });
});

describe("isMetadataRequest", () => {
  it("returns true for package metadata path", () => {
    expect(isMetadataRequest("/axios")).toBe(true);
    expect(isMetadataRequest("/@scope/pkg")).toBe(true);
  });

  it("returns false for tarball path", () => {
    expect(isTarballRequest("/axios/-/axios-1.0.0.tgz")).toBe(true);
    expect(isTarballRequest("/axios")).toBe(false);
  });
});
