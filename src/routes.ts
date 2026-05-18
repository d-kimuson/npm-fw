import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyConfig } from "./proxy/types.ts";
import { createProxyHandler } from "./proxy/proxy-handler.ts";
import { createRequestContext } from "./http-context.ts";

/**
 * Native Node.js HTTP リクエストハンドラを作成する。
 * - GET /info → ヘルスチェック
 * - それ以外 → 上流レジストリへのプロキシ
 */
export const createHandler = (proxyConfig?: ProxyConfig) => {
  const proxyHandler = proxyConfig ? createProxyHandler({ config: proxyConfig }) : undefined;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const ctx = createRequestContext(req);

    // GET /info — health check
    if (req.method === "GET" && req.url === "/info") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          server: "npm-fw",
          minSeverity: proxyConfig?.minSeverity ?? "high",
        }),
      );
      return;
    }

    // プロキシハンドラ
    if (proxyHandler) {
      try {
        const response = await proxyHandler(ctx);
        sendResponse(res, response);
      } catch {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("Upstream registry unavailable");
      }
      return;
    }

    // プロキシ設定がない場合は 404
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not Found");
  };
};

/** Web Standard Response を Node.js ServerResponse に書き出す */
const sendResponse = (res: ServerResponse, response: Response): void => {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(response.status, headers);

  if (response.body) {
    const reader = response.body.getReader();
    const pump = async (): Promise<void> => {
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) {
            res.end();
            return;
          }
          // oxlint-disable-next-line strict-boolean-expressions
          if (result.value) {
            res.write(result.value);
          }
        }
      } catch {
        res.end();
      }
    };
    void pump();
  } else {
    res.end();
  }
};

/** ルーティングの型情報（CLI から使わないが互換性のため保持） */
export type ApiSchema = Record<string, never>;
