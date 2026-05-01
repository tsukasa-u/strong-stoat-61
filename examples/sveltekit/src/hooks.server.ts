import type { Handle } from "@sveltejs/kit";
import { FontObfuscator, preEncodeShuffled } from "../../../lib/index.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = new URL(event.request.url);

  if (!/^\/_app\//.test(pathname)) {
    const fontRes = await obfuscator.maybeHandleFontRequest(event.request);
    if (fontRes) return fontRes;
  }

  const response = await resolve(event);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const pm = await obfuscator.getRotatingMapping(source);
  const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
    Array.from({ length: 100 }, (_, i) => String(i)),
    pm.mapping,
  );
  const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;

  const ip = (event.request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = event.request.headers.get("user-agent") ?? "";

  const source = await response.text();
  let html = await obfuscator.serveWithMapping(source, SELECTORS, pm, {
    pageKey: pathname,
    clientFingerprint: `${ip}|${ua}`,
    sendClientMapping: false,
  });
  html = html.replace("</body>", `${preScript}</body>`);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
};
