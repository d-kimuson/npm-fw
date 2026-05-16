import semver from "semver";
import type { Advisory, AdvisorySeverity, NpmPackageMetadata } from "./types.ts";
import { meetsMinSeverity } from "./advisories.service.ts";

type FilterResult = {
  /** 隠すべきバージョン一覧 */
  readonly hideVersions: readonly string[];
  /** 差し替えるべき latest（なければ undefined） */
  readonly overrideLatest: string | undefined;
};

/**
 * metadata と advisories から隠すべきバージョンと新しい latest を計算する。
 */
export const computeAdvisoryFilter = (
  metadata: NpmPackageMetadata,
  advisories: readonly Advisory[],
  minSeverity: AdvisorySeverity,
): FilterResult => {
  const versionKeys = Object.keys(metadata.versions);
  const severeOnly = advisories.filter((a) => meetsMinSeverity(a.severity, minSeverity));

  if (severeOnly.length === 0) {
    return { hideVersions: [], overrideLatest: undefined };
  }

  // 各バージョンがいずれかの advisory の range に該当するか検査
  const vulnerableVersions = versionKeys.filter((v) =>
    severeOnly.some((a) => semverSatisfies(v, a.vulnerable_versions)),
  );

  if (vulnerableVersions.length === 0) {
    return { hideVersions: [], overrideLatest: undefined };
  }

  const currentLatest = metadata["dist-tags"]["latest"];
  const latestIsVulnerable =
    currentLatest !== undefined && vulnerableVersions.includes(currentLatest);

  // latest が vulnerable なら、残った中で最新のものを探す
  let overrideLatest: string | undefined;
  if (latestIsVulnerable) {
    const safeVersions = versionKeys.filter((v) => !vulnerableVersions.includes(v));
    overrideLatest = findLatestSafeVersion(safeVersions);
  }

  return {
    hideVersions: vulnerableVersions,
    overrideLatest,
  };
};

/**
 * semver の range に version がマッチするか。
 * semver.satisfies が例外を投げた場合は安全側に倒して false を返す。
 */
const semverSatisfies = (version: string, range: string): boolean => {
  try {
    return semver.satisfies(version, range);
  } catch {
    return false;
  }
};

/**
 * 安全なバージョン一覧から最新を選ぶ。
 * - pre-release は除外
 * - semver 降順ソートして先頭を返す
 * - 該当なしなら undefined
 */
const findLatestSafeVersion = (safeVersions: readonly string[]): string | undefined => {
  const stable = safeVersions
    .filter((v) => semver.prerelease(v) === null)
    .map((v) => semver.parse(v))
    .filter((v): v is semver.SemVer => v !== null);

  if (stable.length === 0) return undefined;

  stable.sort(semver.rcompare);
  return stable[0]?.version;
};
