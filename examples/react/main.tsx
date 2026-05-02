/** @jsxRuntime automatic */
/**
 * React SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:react
 */

import { renderToStaticMarkup } from "react-dom/server";
import { FontObfuscator, preEncodeShuffled } from "font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];

function App() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>React SSR + Font Obfuscator</title>
        <style>{"button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}"}</style>
      </head>
      <body style={{ minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <h1>React SSR example</h1>
        <p className="secret">このテキストは難読化されます。Hello World</p>
        <div>
          <button id="btn-count" onclick="if(c<_pre.length-1)c++;el.textContent=_pre[_preIdx[c]]">Count</button>
          <button id="btn-reset" onclick="c=0;el.textContent=_pre[_preIdx[0]]">Reset</button>
        </div>
        <p id="cnt" className="secret">0</p>
      </body>
    </html>
  );
}

async function baseHandler(req: Request): Promise<Response> {
  const rawHtml = "<!doctype html>" + renderToStaticMarkup(<App />);
  const pm = await obfuscator.getRotatingMapping(rawHtml);
  const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
    Array.from({ length: 100 }, (_, i) => String(i)),
    pm.mapping,
    { variants: pm.variants },
  );
  const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;

  let html = await obfuscator.serveWithMapping(rawHtml, SELECTORS, pm, {
    pageKey: new URL(req.url).pathname,
    clientFingerprint: obfuscator.getClientFingerprint(req),
  });
  html = html.replace("</body>", `${preScript}</body>`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const handler = async (req: Request): Promise<Response> => {
  const fontRes = await obfuscator.maybeHandleFontRequest(req);
  if (fontRes) return fontRes;
  return baseHandler(req);
};

console.log("[react-example] http://localhost:8020/");
serveFetch(handler, 8020);
