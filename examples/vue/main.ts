/**
 * Vue SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:vue
 */

import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { FontObfuscator } from "font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";
import App from "./App.vue";

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

const SELECTORS = [".secret"];

async function baseHandler(req: Request): Promise<Response> {
  const app = createSSRApp(App);

  const appHtml = await renderToString(app);
  const rawHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><title>Vue SSR + Font Obfuscator</title></head><body>${appHtml}</body></html>`;

  const html = await obfuscator.obfuscateHtml(rawHtml, {
    selectors: SELECTORS,
    pageKey: new URL(req.url).pathname,
    clientFingerprint: obfuscator.getClientFingerprint(req),
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const handler = async (req: Request): Promise<Response> => {
  const fontRes = await obfuscator.maybeHandleFontRequest(req);
  if (fontRes) return fontRes;
  return baseHandler(req);
};

console.log("[vue-example] http://localhost:8021/");
serveFetch(handler, 8021);
