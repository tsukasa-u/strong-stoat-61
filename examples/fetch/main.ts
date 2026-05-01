/**
 * Generic Fetch example — Font Obfuscator adapter
 *
 * Any runtime that uses the Fetch API for its HTTP server (Node, Bun,
 * Cloudflare Workers, …) can use withFetchObfuscation directly.
 *
 * Run:
 *   pnpm example:fetch
 */

import { FontObfuscator, withFetchObfuscation } from "../../lib/index.ts";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

// ── base handler ───────────────────────────────────────────────────────────

function baseHandler(_req: Request): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Fetch + Font Obfuscator</title>
</head>
<body>
  <h1>Generic Fetch example</h1>
  <p class="secret">このテキストは難読化されます。 Hello World</p>
  <p class="plain">このテキストはそのまま表示されます。</p>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// ── wrap with obfuscation ──────────────────────────────────────────────────

const handler = withFetchObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
  sendClientMapping: false,
});

console.log("[fetch-example] http://localhost:8003/");
serveFetch(handler, 8003);
