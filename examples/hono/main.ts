/**
 * Hono example — Font Obfuscator adapter
 *
 * Run:
 *   pnpm example:hono
 */

import { Hono } from "hono";
import { FontObfuscator, withHonoObfuscation } from "../../lib/index.ts";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

// ── base Hono app ──────────────────────────────────────────────────────────

const app = new Hono();

app.get("/", (c) => {
  return c.html(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Hono + Font Obfuscator</title>
</head>
<body>
  <h1>Hono example</h1>
  <p class="secret">このテキストは難読化されます。 Hello World</p>
  <p class="plain">このテキストはそのまま表示されます。</p>
</body>
</html>`);
});

// ── wrap with obfuscation ──────────────────────────────────────────────────
// withHonoObfuscation wraps a fetch-compatible handler, which matches Hono's
// .fetch property exactly.

const wrappedFetch = withHonoObfuscation(app.fetch.bind(app), obfuscator, {
  selectors: [".secret"],
  sendClientMapping: false,
});

console.log("[hono-example] http://localhost:8001/");
serveFetch(wrappedFetch, 8001);
