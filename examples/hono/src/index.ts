import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { FontObfuscator, withHonoObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const app = new Hono();

app.get("/", (c) =>
  c.html(`<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Hono Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Hono example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <div>
    <button onclick="c++;el.textContent=c">Count</button>
    <button onclick="c=0;el.textContent=0">Reset</button>
  </div>
  <p id="cnt" class="secret">0</p>
  <script>var c=0,el=document.getElementById('cnt')<\/script>
</body>
</html>`)
);

const fetchHandler = withHonoObfuscation(app.fetch, obfuscator, {
  selectors: [".secret"],
});

serve({
  fetch: fetchHandler,
  port: 3000,
});
