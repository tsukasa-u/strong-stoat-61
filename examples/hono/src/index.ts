import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { FontObfuscator, withHonoObfuscation } from "pua-font-obfuscator";
import { registerDemoRoutes } from "./routes/registerDemoRoutes.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
  budgetPolicy: "adaptive",
  variantAllocator: "frequency-weighted",
  onBudgetDegrade: (e) =>
    console.warn(`[pua-font-obfuscator] variant shortfall: ${e.variantShortfall}/${e.totalChars} chars`),
});

const port = Number(process.env.PORT ?? 3000);

const app = new Hono();
registerDemoRoutes(app);

const wrappedFetch = withHonoObfuscation(app.fetch.bind(app), obfuscator, {
  selectors: [".secret"],
});

serve({
  fetch: wrappedFetch,
  port,
});
