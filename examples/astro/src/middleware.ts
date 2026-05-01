import type { MiddlewareHandler } from "astro";
import { FontObfuscator, obfuscateHtmlResponse } from "../../../lib/index.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

export const onRequest: MiddlewareHandler = async ({ request }, next) => {
  const pathname = new URL(request.url).pathname;

  if (/^\/_astro\//.test(pathname)) {
    return next();
  }

  const fontRes = await obfuscator.maybeHandleFontRequest(request);
  if (fontRes) {
    return fontRes;
  }

  const response = await next();
  return obfuscateHtmlResponse(response, obfuscator, {
    selectors: [".secret"],
    sendClientMapping: false,
  });
};
