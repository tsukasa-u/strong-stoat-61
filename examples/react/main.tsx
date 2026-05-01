/** @jsxRuntime automatic */
/**
 * React SSR + Fetch adapter example (Node)
 *
 * Run:
 *   pnpm example:react
 */

import { renderToStaticMarkup } from "react-dom/server";
import { FontObfuscator, withFetchObfuscation } from "../../lib/index.ts";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

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
          <button id="btn-count">Count</button>
          <button id="btn-reset">Reset</button>
        </div>
        <p id="cnt" className="secret">0</p>
        <script dangerouslySetInnerHTML={{ __html: "var c=0,el=document.getElementById('cnt');document.getElementById('btn-count').onclick=function(){c++;el.textContent=c};document.getElementById('btn-reset').onclick=function(){c=0;el.textContent=0}" }} />
      </body>
    </html>
  );
}

function baseHandler(_req: Request): Response {
  const html = "<!doctype html>" + renderToStaticMarkup(<App />);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const handler = withFetchObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
});

console.log("[react-example] http://localhost:8020/");
serveFetch(handler, 8020);
