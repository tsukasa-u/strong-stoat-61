import { getRequestURL, setResponseHeader } from "h3";
import { obfuscator } from "../utils/obfuscator.ts";

const SELECTORS = [".secret"];

const protectedHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Nuxt Protected Route</title>
</head>
<body>
  <main style="min-height:100vh;margin:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <h1>Protected raw HTML response</h1>
    <p class="secret">このテキストは難読化されます。Hello World</p>
    <p>This route uses server-rendered raw HTML to avoid client-side hydration overwrite.</p>
  </main>
</body>
</html>`;

export default defineEventHandler(async (event) => {
  const request = new Request(getRequestURL(event).toString(), {
    method: event.method,
    headers: event.headers,
  });

  const pathname = new URL(request.url).pathname;
  const page = await obfuscator.getRotatingPrecomputedPage(
    protectedHtml,
    SELECTORS,
    pathname,
  );

  const body = await obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: obfuscator.getClientFingerprint(request),
  });

  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");
  return body;
});
