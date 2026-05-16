import type { Advisory, AdvisoriesResponse, AdvisorySeverity } from "./types.ts";

type FetchFn = typeof globalThis.fetch;

type CheckOptions = {
  readonly registryUrl: string;
  readonly pkg: string;
  readonly version: string;
  readonly fetch?: FetchFn;
};

/**
 * 特定のパッケージバージョンに advisory が存在するかチェックする。
 * キャッシュヒット時は API 呼び出しを省略する。
 */
export const checkAdvisory = async (options: CheckOptions): Promise<readonly Advisory[]> => {
  const { registryUrl, pkg, version } = options;
  const doFetch = options.fetch ?? globalThis.fetch;

  const cacheKey = `${pkg}@${version}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const url = `${registryUrl}/-/npm/v1/security/advisories/bulk`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [pkg]: [version] }),
    });
  } catch {
    // API に到達できない場合は安全側に倒して通過させる
    return [];
  }

  if (!res.ok) return [];

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const advisories = extractAdvisories(json, pkg);
  setCached(cacheKey, advisories);
  return advisories;
};

/**
 * 複数バージョンの advisory を一括チェックする。
 * キャッシュ済みのものはスキップし、未キャッシュ分のみ API を呼ぶ。
 */
export const checkAdvisoriesBulk = async (
  registryUrl: string,
  packages: Record<string, string[]>,
  fetchFn?: FetchFn,
): Promise<AdvisoriesResponse> => {
  const doFetch = fetchFn ?? globalThis.fetch;
  const uncached: Record<string, string[]> = {};

  for (const [pkg, versions] of Object.entries(packages)) {
    const missing = versions.filter((v) => getCached(`${pkg}@${v}`) === undefined);
    if (missing.length > 0) {
      uncached[pkg] = missing;
    }
  }

  if (Object.keys(uncached).length === 0) {
    // 全キャッシュヒット
    return buildResultFromCache(packages);
  }

  const url = `${registryUrl}/-/npm/v1/security/advisories/bulk`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(uncached),
    });
  } catch {
    return {};
  }

  if (!res.ok) return {};

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {};
  }

  // キャッシュに保存
  cacheAdvisoriesResponse(json, uncached);

  return buildResultFromCache(packages);
};

/**
 * 指定した severity 以上かを判定する。
 * severity の重み: low=0, moderate=1, high=2, critical=3
 */
export const meetsMinSeverity = (
  advisorySeverity: AdvisorySeverity,
  minSeverity: AdvisorySeverity,
): boolean => severityRank(advisorySeverity) >= severityRank(minSeverity);

const severityRank = (s: AdvisorySeverity): number => {
  switch (s) {
    case "low":
      return 0;
    case "moderate":
      return 1;
    case "high":
      return 2;
    case "critical":
      return 3;
    default:
      return 0;
  }
};

/** 生レスポンスから特定パッケージの advisory を抽出 */
const extractAdvisories = (json: unknown, pkg: string): readonly Advisory[] => {
  if (typeof json !== "object" || json === null) return [];
  if (!(pkg in json)) return [];
  // oxlint-disable-next-line no-unsafe-type-assertion
  const obj = json as Record<string, unknown>;
  const advisories = obj[pkg];
  if (!Array.isArray(advisories)) return [];
  return advisories.filter(isAdvisory);
};

/** レスポンスをキャッシュに保存 */
const cacheAdvisoriesResponse = (json: unknown, uncached: Record<string, string[]>): void => {
  if (typeof json !== "object" || json === null) return;
  // oxlint-disable-next-line no-unsafe-type-assertion
  const obj = json as Record<string, unknown>;
  for (const pkg of Object.keys(obj)) {
    const advisories = obj[pkg];
    if (!Array.isArray(advisories)) continue;
    const filtered = advisories.filter(isAdvisory);
    for (const v of uncached[pkg] ?? []) {
      setCached(`${pkg}@${v}`, filtered);
    }
  }
};

/** キャッシュから結果を構築 */
const buildResultFromCache = (packages: Record<string, string[]>): AdvisoriesResponse => {
  const result: AdvisoriesResponse = {};
  for (const [pkg, versions] of Object.entries(packages)) {
    result[pkg] = versions.map((v) => getCached(`${pkg}@${v}`) ?? []).flat();
  }
  return result;
};

/** Advisory の型ガード */
const isAdvisory = (value: unknown): value is Advisory => {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || !("severity" in value) || !("vulnerable_versions" in value)) return false;
  // in チェックで narrowing 済み → widening
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["id"] === "number" &&
    typeof obj["severity"] === "string" &&
    typeof obj["vulnerable_versions"] === "string"
  );
};

/** キャッシュエントリ。cachedAt で有効期限を判定する */
type CacheEntry = {
  readonly advisories: readonly Advisory[];
  readonly cachedAt: number;
};

/**
 * キャッシュの TTL（ミリ秒）。
 * pnpm audit など既存実装を参考に 12 時間。
 * advisory データは公開後にも更新される可能性があるため。
 */
const ADVISORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** インメモリキャッシュ。TTL で期限切れを管理 */
const advisoryCache = new Map<string, CacheEntry>();

/** キャッシュから有効なエントリを取得。期限切れなら undefined */
const getCached = (key: string): readonly Advisory[] | undefined => {
  const entry = advisoryCache.get(key);
  if (entry === undefined) return undefined;
  if (Date.now() - entry.cachedAt > ADVISORY_CACHE_TTL_MS) {
    advisoryCache.delete(key);
    return undefined;
  }
  return entry.advisories;
};

/** キャッシュにエントリを保存 */
const setCached = (key: string, advisories: readonly Advisory[]): void => {
  advisoryCache.set(key, { advisories, cachedAt: Date.now() });
};

/** テスト用にキャッシュをクリア */
export const clearAdvisoryCache = (): void => {
  advisoryCache.clear();
};
