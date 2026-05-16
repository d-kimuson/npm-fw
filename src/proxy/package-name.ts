export type ParsedPath =
  | {
      readonly type: "metadata";
      readonly name: string;
    }
  | {
      readonly type: "tarball";
      readonly name: string;
      readonly version: string;
    }
  | {
      readonly type: "other";
    };

/**
 * npm registry のパスを解析して、パッケージ名・種別・バージョンを抽出する。
 *
 * 例:
 *   /axios                   → { type: "metadata", name: "axios" }
 *   /@scope/pkg              → { type: "metadata", name: "@scope/pkg" }
 *   /axios/-/axios-1.7.0.tgz → { type: "tarball", name: "axios", version: "1.7.0" }
 *   /-/v1/search             → { type: "other" }
 */
export const parsePath = (pathname: string): ParsedPath => {
  if (pathname.startsWith("/-/") || pathname.startsWith("/_")) {
    return { type: "other" };
  }

  // tarball: /<pkg>/-/<pkg>-<version>.tgz
  // scoped tarball: /@scope/name/-/name-<version>.tgz
  const tarballMatch = pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/-\/[^/]+-(\d+\.\d+\.\d+.*?)\.tgz$/);
  if (tarballMatch) {
    const [, tarballPkg, tarballVer] = tarballMatch;
    if (tarballPkg !== undefined && tarballVer !== undefined) {
      return { type: "tarball", name: tarballPkg, version: tarballVer };
    }
  }

  // scoped package metadata: /@scope/name[/...]
  const scopedMatch = pathname.match(/^\/(@[^/]+\/[^/]+)/);
  if (scopedMatch) {
    const [, scopedPkg] = scopedMatch;
    if (scopedPkg !== undefined) {
      return { type: "metadata", name: scopedPkg };
    }
  }

  // unscoped package metadata: /name[/...]
  const unscopedMatch = pathname.match(/^\/([^/]+)/);
  if (unscopedMatch) {
    const [, unscopedPkg] = unscopedMatch;
    if (unscopedPkg !== undefined) {
      return { type: "metadata", name: unscopedPkg };
    }
  }

  return { type: "other" };
};

/** パスがパッケージメタデータリクエストかどうか */
export const isMetadataRequest = (pathname: string): boolean =>
  parsePath(pathname).type === "metadata";

/** パスが tarball リクエストかどうか */
export const isTarballRequest = (pathname: string): boolean =>
  parsePath(pathname).type === "tarball";
