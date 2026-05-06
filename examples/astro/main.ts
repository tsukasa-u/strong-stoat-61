/**
 * Astro adapter runnable example (Node)
 *
 * Run:
 *   pnpm example:astro
 */

import { FontObfuscator, withAstroEndpointObfuscation } from "font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
  budgetPolicy: "adaptive",
  variantAllocator: "frequency-weighted",
  onBudgetDegrade: (e) =>
    console.warn(`[font-obfuscator] variant shortfall: ${e.variantShortfall}/${e.totalChars} chars`),
});

function baseHandler(_req: Request): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Astro Adapter Example</title></head>
<body>
  <h1>withAstroEndpointObfuscation</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <p class="plain">このテキストは通常表示です。</p>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const handler = withAstroEndpointObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
  skipPathPatterns: [/^\/_astro\//],
});

console.log("[astro-adapter-example] http://localhost:8012/");
serveFetch(handler, 8012);
