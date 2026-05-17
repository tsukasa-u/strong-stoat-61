import { FontObfuscator } from "pua-font-obfuscator";

/**
 * Shared FontObfuscator singleton for the Nuxt server.
 *
 * IMPORTANT: Both server/middleware/pua-font-obfuscator.ts (which serves the one-time
 * font download) and server/plugins/pua-font-obfuscator.ts (which injects font tickets
 * into HTML) **must** use this same instance.  A separate instance would have a
 * different HMAC signing key, causing every font request to fail with 403.
 */
export const obfuscator = new FontObfuscator({
  fontUrl:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
  fontRoutePrefix: '/_obf/font',
});
