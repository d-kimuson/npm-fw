/** npm registry からのレスポンス（メタデータ）を表す型 */
export type NpmPackageMetadata = {
  readonly name: string;
  readonly "dist-tags": Record<string, string>;
  readonly versions: Record<string, unknown>;
  readonly [key: string]: unknown;
};

/** プロキシの上流（実レジストリ）設定 */
export type UpstreamConfig = {
  readonly registry: string;
};

/** ブロックルール: パッケージ全体をブロック */
export type PackageBlockRule = {
  readonly type: "package";
  readonly name: string;
};

/** ブロックルール: 特定のバージョンをブロック */
export type VersionBlockRule = {
  readonly type: "version";
  readonly name: string;
  readonly version: string;
};

/** ブロックルールの直和 */
export type BlockRule = PackageBlockRule | VersionBlockRule;

/** メタデータフィルター設定 */
export type MetadataFilter = {
  /** 隠すバージョン（metadata.versions から消す） */
  readonly hideVersions?: readonly string[];
  /** dist-tags.latest を上書きするバージョン */
  readonly overrideLatest?: string;
};

/** npm advisory の severity */
export type AdvisorySeverity = "low" | "moderate" | "high" | "critical";

/** npm security advisory 1件 */
export type Advisory = {
  readonly id: number;
  readonly title: string;
  readonly severity: AdvisorySeverity;
  readonly vulnerable_versions: string;
  readonly cwe: readonly string[];
  readonly cvss: { readonly score: number; readonly vectorString: string | null };
};

/** advisories API のレスポンス: パッケージ名 → Advisory[] */
export type AdvisoriesResponse = Record<string, Advisory[]>;

/** advisories チェックの設定 */
export type AdvisoriesConfig = {
  /** 有効/無効 */
  readonly enabled: boolean;
  /** ブロックする最低 severity (デフォルト high) */
  readonly minSeverity?: AdvisorySeverity;
};

/** プロキシ全体の設定 */
export type ProxyConfig = {
  readonly upstream: UpstreamConfig;
  readonly blocklist: readonly BlockRule[];
  readonly metadataFilter: MetadataFilter;
  readonly advisories?: AdvisoriesConfig;
};
