/**
 * Bun example — Font Obfuscator
 *
 * Run:
 *   bun install
 *   bun run main.ts
 *
 * `Bun.serve()` accepts a fetch-compatible handler, so `withFetchObfuscation`
 * works without any Node.js compatibility shim.
 */

import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

function baseHandler(_req: Request): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Bun + Font Obfuscator</title>
</head>
<body>
  <h1>Bun example</h1>
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

export { handler };

// Bun.serve() is the built-in HTTP server.
// Pass trustedProxies if running behind a reverse proxy.
if (typeof Bun !== "undefined") {
  Bun.serve({
    fetch: handler,
    port: 3000,
  });

  console.log("Listening on http://localhost:3000");
}
