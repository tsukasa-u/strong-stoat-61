/**
 * Vue SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:vue
 */

import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { FontObfuscator, encodeText, type PrecomputedMapping } from "../../lib/index.ts";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];
const _mapping: Promise<PrecomputedMapping> = obfuscator.precomputeMapping();

async function baseHandler(req: Request): Promise<Response> {
  const pm = await _mapping;
  const preArr = Array.from({ length: 100 }, (_, i) => encodeText(String(i), pm.mapping));
  const preScript = `<script>var _pre=${JSON.stringify(preArr)},c=0,el=document.getElementById('cnt')<\/script>`;

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";

  const app = createSSRApp({
    render() {
      return h("div", { id: "app" }, [
        h("h1", "Vue SSR example"),
        h("p", { class: "secret" }, "このテキストは難読化されます。Hello World"),
      ]);
    },
  });

  const body = await renderToString(app);
  const css = "button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}";
  const rawHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><title>Vue SSR + Font Obfuscator</title><style>${css}</style></head><body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">${body}<div><button onclick="if(c<_pre.length-1)c++;el.textContent=_pre[c]">Count</button><button onclick="c=0;el.textContent=_pre[0]">Reset</button></div><p id="cnt" class="secret">0</p></body></html>`;

  let html = await obfuscator.serveWithMapping(rawHtml, SELECTORS, pm, {
    pageKey: new URL(req.url).pathname,
    clientFingerprint: `${ip}|${ua}`,
    sendClientMapping: false,
  });
  html = html.replace("</body>", `${preScript}</body>`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const handler = async (req: Request): Promise<Response> => {
  const fontRes = await obfuscator.maybeHandleFontRequest(req);
  if (fontRes) return fontRes;
  return baseHandler(req);
};

console.log("[vue-example] http://localhost:8021/");
serveFetch(handler, 8021);
