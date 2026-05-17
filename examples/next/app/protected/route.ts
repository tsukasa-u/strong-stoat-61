import { NextResponse } from "next/server";
import {
  FontObfuscator,
  withNextRouteHandlerObfuscation,
} from "pua-font-obfuscator";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseHandler = async () => {
  const html = await readFile(join(__dirname, "template.html"), "utf-8");
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const GET = withNextRouteHandlerObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
  skipPathPatterns: [/^\/_next\//],

});
