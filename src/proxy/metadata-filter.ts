import type { MetadataFilter, NpmPackageMetadata } from "./types.ts";

/**
 * npm レジストリのメタデータ JSON にフィルターを適用する pure function。
 *
 * - hideVersions に指定されたバージョンを `versions` から削除する
 * - overrideLatest が指定された場合、`dist-tags.latest` を上書きする
 *   （ただし、そのバージョンが versions に存在する場合のみ）
 */
export const applyMetadataFilter = (
  metadata: NpmPackageMetadata,
  filter: MetadataFilter,
): NpmPackageMetadata => {
  let result = metadata;

  // バージョンを隠す
  if (filter.hideVersions && filter.hideVersions.length > 0) {
    const versions = { ...result.versions };
    for (const v of filter.hideVersions) {
      delete versions[v];
    }
    result = { ...result, versions };
  }

  // latest を上書きする（バージョンが存在する場合のみ有効）
  if (filter.overrideLatest !== undefined && filter.overrideLatest in result.versions) {
    result = {
      ...result,
      "dist-tags": {
        ...result["dist-tags"],
        latest: filter.overrideLatest,
      },
    };
  }

  return result;
};
