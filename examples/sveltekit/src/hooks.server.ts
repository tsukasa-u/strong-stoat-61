import type { Handle } from "@sveltejs/kit";
import { FontObfuscator, withSvelteKitHandleObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const baseHandle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};

export const handle: Handle = withSvelteKitHandleObfuscation(baseHandle, obfuscator, {
  selectors: [".secret"],
  skipPathPatterns: [/^\/_app\//],
});
