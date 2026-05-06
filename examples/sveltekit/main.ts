/**
 * SvelteKit adapter runnable example (Node)
 *
 * Run:
 *   pnpm example:sveltekit
 */

import {
  FontObfuscator,
  withSvelteKitHandleObfuscation,
  type SvelteKitEventLike,
} from "font-obfuscator";
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

const handle = withSvelteKitHandleObfuscation(
  async ({ event, resolve }) => {
    return resolve(event);
  },
  obfuscator,
  {
    selectors: [".secret"],
    skipPathPatterns: [/^\/_app\//],
  },
);

function resolveLikeSvelteKit(_event: SvelteKitEventLike): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>SvelteKit Adapter Example</title></head>
<body>
  <h1>withSvelteKitHandleObfuscation</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <p class="plain">このテキストは通常表示です。</p>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const fetchHandler = (req: Request) =>
  handle({
    event: { request: req },
    resolve: async (event) => resolveLikeSvelteKit(event),
  });

console.log("[sveltekit-adapter-example] http://localhost:8013/");
serveFetch(fetchHandler, 8013);
