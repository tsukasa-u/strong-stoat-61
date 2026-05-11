import type { LoaderFunctionArgs } from "@remix-run/node";
import { obfuscator, OBF_SELECTORS } from "../obfuscator.server";

const protectedHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Remix Protected Route</title>
</head>
<body>
  <main style="min-height:100vh;margin:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <h1>Protected raw HTML response</h1>
    <p class="secret">このテキストは難読化されます。Hello World</p>
    <p>This route is a resource response to avoid client-side hydration overwrite.</p>
  </main>
</body>
</html>`;

export async function loader({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const page = await obfuscator.getRotatingPrecomputedPage(
    protectedHtml,
    OBF_SELECTORS,
    pathname,
  );

  const body = await obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: obfuscator.getClientFingerprint(request),
  });

  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
