import type { Context } from "hono";
import type { NpmPackageMetadata, ProxyConfig } from "./types.ts";
import { parsePath } from "./package-name.ts";
import { applyMetadataFilter } from "./metadata-filter.ts";
import { checkAdvisory, checkAdvisoriesBulk, meetsMinSeverity } from "./advisories.service.ts";
import { computeAdvisoryFilter } from "./advisories-filter.ts";

type FetchFn = typeof globalThis.fetch;

type CreateProxyHandlerOptions = {
  readonly config: ProxyConfig;
  readonly fetch?: FetchFn;
};

/**
 * 上流レジストリにリクエストを転送するプロキシハンドラを生成する。
 *
 * - tarball リクエストはブロックリストと照合し、NG なら 403
 * - metadata リクエストはいったん上流から取得し、フィルターを適用してから返す
 * - その他のリクエストはそのまま上流に転送
 */
export const createProxyHandler = (options: CreateProxyHandlerOptions) => {
  const { config } = options;
  const doFetch: FetchFn = options.fetch ?? globalThis.fetch;

  return async (c: Context): Promise<Response> => {
    const url = new URL(c.req.url);
    // npm は scoped package の / を %2f にエンコードするのでデコードする
    const pathname = decodeURIComponent(url.pathname);
    const upstreamUrl = `${config.upstream.registry}${pathname}${url.search}`;

    // リクエストパスの解析
    const parsed = parsePath(pathname);

    // advisories チェック（tarball 取得前）
    if (config.advisories?.enabled === true && parsed.type === "tarball") {
      const advisories = await checkAdvisory({
        registryUrl: config.upstream.registry,
        pkg: parsed.name,
        version: parsed.version,
        fetch: doFetch,
      });
      const minSeverity = config.advisories.minSeverity ?? "high";
      const blocked = advisories.some((a) => meetsMinSeverity(a.severity, minSeverity));
      if (blocked) {
        return blockedResponse(`${parsed.name}@${parsed.version} (vulnerable)`, c);
      }
    }

    // ブロックリストチェック
    if (parsed.type !== "other") {
      for (const rule of config.blocklist) {
        if (rule.type === "package" && rule.name === parsed.name) {
          return blockedResponse(parsed.name, c);
        }
        if (
          rule.type === "version" &&
          rule.name === parsed.name &&
          parsed.type === "tarball" &&
          rule.version === parsed.version
        ) {
          return blockedResponse(`${parsed.name}@${parsed.version}`, c);
        }
      }
    }

    // 上流にリクエストを転送
    const reqHeaders = forwardableHeaders(c.req.raw.headers);

    let upstreamRes: Response;
    try {
      upstreamRes = await doFetch(upstreamUrl, {
        method: c.req.method,
        headers: reqHeaders,
        redirect: "follow",
      });
    } catch {
      return new Response("Upstream registry unavailable", { status: 502 });
    }

    // metadata レスポンスにはフィルターを適用
    if (parsed.type === "metadata" && upstreamRes.ok) {
      const contentType = upstreamRes.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        const cloned = upstreamRes.clone();
        try {
          const json: unknown = await cloned.json();
          if (isNpmPackageMetadata(json)) {
            // advisories ベースのフィルターを計算
            let computedFilter = config.metadataFilter;
            if (config.advisories?.enabled === true) {
              const versionKeys = Object.keys(json.versions);
              const bulkResult = await checkAdvisoriesBulk(
                config.upstream.registry,
                { [json.name]: versionKeys },
                doFetch,
              );
              const advisories = bulkResult[json.name] ?? [];
              if (advisories.length > 0) {
                const advisoryFilter = computeAdvisoryFilter(
                  json,
                  advisories,
                  config.advisories.minSeverity ?? "high",
                );
                // 既存の filter 設定とマージ
                const existingHidden = config.metadataFilter.hideVersions ?? [];
                computedFilter = {
                  hideVersions: [...existingHidden, ...advisoryFilter.hideVersions],
                  overrideLatest:
                    advisoryFilter.overrideLatest ?? config.metadataFilter.overrideLatest,
                };
              }
            }

            const filtered = applyMetadataFilter(json, computedFilter);
            return c.json(filtered);
          }
        } catch {
          // JSON パースに失敗したらそのまま転送（元の upstreamRes で）
        }
      }
    }

    // その他のレスポンスはそのまま転送
    const resHeaders = responseHeaders(upstreamRes.headers);
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    });
  };
};

/** ブロックされた場合のレスポンス */
const blockedResponse = (target: string, _c: Context): Response =>
  new Response(`Blocked: ${target}`, {
    status: 403,
    headers: { "content-type": "text/plain" },
  });

/** 上流に転送するリクエストヘッダーを構築（host は除外） */
const forwardableHeaders = (headers: Headers): Headers => {
  const result = new Headers(headers);
  result.delete("host");
  return result;
};

/** 上流からのレスポンスヘッダーをクライアント向けに構築（transfer-encoding は除外） */
const responseHeaders = (headers: Headers): Headers => {
  const result = new Headers(headers);
  result.delete("transfer-encoding");
  return result;
};

/** npm パッケージメタデータの型ガード */
const isNpmPackageMetadata = (value: unknown): value is NpmPackageMetadata => {
  if (typeof value !== "object" || value === null) return false;
  const hasName = "name" in value;
  const hasDistTags = "dist-tags" in value;
  const hasVersions = "versions" in value;
  if (!hasName || !hasDistTags || !hasVersions) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["name"] === "string" &&
    typeof obj["dist-tags"] === "object" &&
    obj["dist-tags"] !== null &&
    typeof obj["versions"] === "object" &&
    obj["versions"] !== null
  );
};
