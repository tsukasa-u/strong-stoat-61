import { FontObfuscator } from "pua-font-obfuscator";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

export const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

export const OBF_SELECTORS = [".secret"];
