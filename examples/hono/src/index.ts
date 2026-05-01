import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { FontObfuscator, preEncodeShuffled } from "../../../lib/index.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];

const BASE_HTML = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Hono Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Hono example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <div>
    <button onclick="if(c<_pre.length-1)c++;el.textContent=_pre[_preIdx[c]]">Count</button>
    <button onclick="c=0;el.textContent=_pre[_preIdx[0]]">Reset</button>
  </div>
  <p id="cnt" class="secret">0</p>
</body>
</html>`;

const app = new Hono();

app.get("/_obf/font/:token", async (c) => {
  const fontRes = await obfuscator.maybeHandleFontRequest(c.req.raw);
  if (!fontRes) return c.text("Not Found", 404);
  return fontRes;
});

app.get("/", async (c) => {
  const pm = await obfuscator.getRotatingMapping(BASE_HTML);
  const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
    Array.from({ length: 100 }, (_, i) => String(i)),
    pm.mapping,
    { variants: pm.variants },
  );
  const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;

  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = c.req.header("user-agent") ?? "";

  let html = await obfuscator.serveWithMapping(BASE_HTML, SELECTORS, pm, {
    pageKey: "/",
    clientFingerprint: `${ip}|${ua}`,
    sendClientMapping: false,
  });
  html = html.replace("</body>", `${preScript}</body>`);
  return c.html(html, 200, { "cache-control": "no-store" });
});

serve({
  fetch: app.fetch,
  port: 3000,
});
