import { FontObfuscator } from "../../../../lib/index.ts";

/**
 * Shared FontObfuscator singleton for SolidStart server hooks.
 *
 * If middleware and Nitro hooks are both enabled, they must use the same
 * instance so ticket signing/verification uses the same HMAC key.
 */
export const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});
