import type { Handle } from "@sveltejs/kit";
import { FontObfuscator } from "font-obfuscator";

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

  const source = await response.text();
  const pm = await obfuscator.getRotatingMapping(source);
  let html = await obfuscator.serveWithMapping(source, SELECTORS, pm, {
    pageKey: pathname,
    clientFingerprint: obfuscator.getClientFingerprint(event.request),
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return new Response(html, { status: response.status, headers });
};
