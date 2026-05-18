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

/** メタデータフィルター設定（advisory ベースで計算される内部表現） */
export type MetadataFilter = {
  /** 隠すバージョン（metadata.versions から消す） */
  readonly hideVersions: readonly string[];
  /** dist-tags.latest を上書きするバージョン */
  readonly overrideLatest: string | undefined;
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

/** プロキシ全体の設定 */
export type ProxyConfig = {
  readonly upstream: UpstreamConfig;
  readonly minSeverity: AdvisorySeverity;
};

/** ユーザー設定（daemon.json に永続化） */
export type UserConfig = {
  readonly minSeverity: AdvisorySeverity;
};
