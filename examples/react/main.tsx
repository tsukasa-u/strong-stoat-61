/** @jsxRuntime automatic */
/**
 * React SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:react
 */

import { renderToStaticMarkup } from "react-dom/server";
import { FontObfuscator } from "pua-font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";
import { ReactPage } from "./src/Page.tsx";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
  budgetPolicy: "adaptive",
  variantAllocator: "frequency-weighted",
  onBudgetDegrade: (e) =>
    console.warn(`[pua-font-obfuscator] variant shortfall: ${e.variantShortfall}/${e.totalChars} chars`),
});

const SELECTORS = [".secret"];

function renderPage(pathname: string): string {
  return "<!doctype html>" + renderToStaticMarkup(<ReactPage pathname={pathname} />);
}

async function baseHandler(req: Request): Promise<Response> {
  const pathname = new URL(req.url).pathname;
  if (!["/", "/pre-encoded"].includes(pathname)) {
    return new Response("Not Found", { status: 404 });
  }
  const rawHtml = renderPage(pathname);
  const html = await obfuscator.obfuscateHtml(rawHtml, {
    selectors: SELECTORS,
    pageKey: pathname,
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

console.log("[react-example] http://localhost:8020/");
serveFetch(handler, 8020);
