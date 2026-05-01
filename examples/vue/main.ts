/**
 * Vue SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:vue
 */

import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { FontObfuscator, withFetchObfuscation } from "../../lib/index.ts";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

async function baseHandler(_req: Request): Promise<Response> {
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
  const script = "var c=0,el=document.getElementById('cnt');document.getElementById('btn-count').onclick=function(){c++;el.textContent=c};document.getElementById('btn-reset').onclick=function(){c=0;el.textContent=0}";
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><title>Vue SSR + Font Obfuscator</title><style>${css}</style></head><body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">${body}<div><button id="btn-count">Count</button><button id="btn-reset">Reset</button></div><p id="cnt" class="secret">0</p><script>${script}<\/script></body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const handler = withFetchObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
});

console.log("[vue-example] http://localhost:8021/");
serveFetch(handler, 8021);
