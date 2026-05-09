/**
 * Hono example — Font Obfuscator adapter
 *
 * Run:
 *   pnpm example:hono
 */

import { Hono } from "hono";
import { FontObfuscator, withHonoObfuscation } from "font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";
import { registerDemoRoutes } from "./src/routes/registerDemoRoutes.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
  budgetPolicy: "adaptive",
  variantAllocator: "frequency-weighted",
  onBudgetDegrade: (e) =>
    console.warn(`[font-obfuscator] variant shortfall: ${e.variantShortfall}/${e.totalChars} chars`),
});

// ── base Hono app ──────────────────────────────────────────────────────────

const app = new Hono();
registerDemoRoutes(app);

// ── wrap with obfuscation ──────────────────────────────────────────────────
// withHonoObfuscation wraps a fetch-compatible handler, which matches Hono's
// .fetch property exactly.

const wrappedFetch = withHonoObfuscation(app.fetch.bind(app), obfuscator, {
  selectors: [".secret"],
});

console.log("[hono-example] http://localhost:8001/");
serveFetch(wrappedFetch, 8001);
