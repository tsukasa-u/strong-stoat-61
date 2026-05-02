/**
 * Cloudflare Workers example — Font Obfuscator
 *
 * Deploy:
 *   pnpm install
 *   pnpm wrangler deploy
 *
 * The library uses only Web-standard APIs (crypto.subtle, fetch, Request,
 * Response, URL) which are natively available in the Workers runtime.
 *
 * FontObfuscator is instantiated once at module scope (top-level await is
 * supported in Workers with `compatibility_date = "2023-05-15"` or later).
 *
 * NOTE: Each Worker isolate has its own FontObfuscator instance, so the
 * per-IP rate limiter state is not shared across multiple isolates.
 * For stricter limits, front the Worker with Cloudflare Rate Limiting rules.
 */

import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
  // Workers are stateless across requests; use a shorter rotation interval
  // to limit the exposure window of any captured font or _pre array.
  mappingRotationIntervalMs: 60_000,
});

function baseHandler(_req: Request): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Cloudflare Workers + Font Obfuscator</title>
</head>
<body>
  <h1>Cloudflare Workers example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <p class="plain">このテキストはそのまま表示されます。</p>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const handler = withFetchObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
});

// Workers export a default object with a `fetch` method.
export default { fetch: handler };
