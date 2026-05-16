import type { IncomingMessage } from "node:http";

/**
 * Native Node.js request から抽出した proxy handler 向けのコンテキスト。
 * hono の Context 相当の情報を最小限のインターフェースで提供する。
 */
export type RequestContext = {
  /** リクエスト URL（pathname + search） */
  readonly url: string;
  /** HTTP メソッド */
  readonly method: string;
  /** リクエストヘッダー（Web Standard Headers） */
  readonly headers: Headers;
};

/** IncomingMessage から RequestContext を生成する */
export const createRequestContext = (req: IncomingMessage): RequestContext => ({
  url: req.url ?? "/",
  method: req.method ?? "GET",
  headers: incomingHeadersToWebHeaders(req.headers),
});

/** Node.js の IncomingHttpHeaders を Web Standard Headers に変換する */
const incomingHeadersToWebHeaders = (incoming: IncomingMessage["headers"]): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
};

/** JSON レスポンスを生成するヘルパー */
export const jsonResponse = (data: unknown, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
};

/** プレーンテキストのエラーレスポンスを生成するヘルパー */
export const textResponse = (body: string, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "text/plain");
  return new Response(body, {
    ...init,
    headers,
  });
};
