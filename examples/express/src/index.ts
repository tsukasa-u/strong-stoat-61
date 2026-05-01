import express from "express";
import { FontObfuscator, preEncodeShuffled, type PrecomputedPage } from "../../../lib/index.ts";

const app = express();
const port = Number(process.env.PORT ?? 3000);

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

// Precompute PUA-encoded HTML once at startup; inject only a fresh
// per-request font ticket on each request via servePrecomputed().
const BASE_HTML = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Express Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Express example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <div>
    <button onclick="if(c<_pre.length-1)c++;el.textContent=_pre[_preIdx[c]]">Count</button>
    <button onclick="c=0;el.textContent=_pre[_preIdx[0]]">Reset</button>
  </div>
  <p id="cnt" class="secret">0</p>
  <script>var _pre=[],_preIdx=[],c=0,el=document.getElementById('cnt')<\/script>
</body>
</html>`;

let _rotatingEntryPromise: Promise<PrecomputedPage> | null = null;
let _rotatingEntryCreatedAt = 0;
const ROTATION_MS = 5 * 60 * 1000;

function getPage(): Promise<PrecomputedPage> {
  const now = Date.now();
  if (!_rotatingEntryPromise || now - _rotatingEntryCreatedAt >= ROTATION_MS) {
    _rotatingEntryCreatedAt = now;
    _rotatingEntryPromise = obfuscator.precomputeHtml(BASE_HTML, [".secret"]).then((page) => {
      const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
        Array.from({ length: 100 }, (_, i) => String(i)),
        page.mapping,
      );
      page.puaHtml = page.puaHtml
        .replace('var _pre=[]', `var _pre=${JSON.stringify(preArr)}`)
        .replace('_preIdx=[]', `_preIdx=${JSON.stringify(preIdx)}`);
      return page;
    });
  }
  return _rotatingEntryPromise;
}

app.get("/_obf/font/:token", async (req, res) => {
  const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const fontResponse = await obfuscator.maybeHandleFontRequest(
    new Request(requestUrl),
  );
  if (!fontResponse) {
    res.status(404).send("Not Found");
    return;
  }

  res.status(fontResponse.status);
  fontResponse.headers.forEach((value, key) => res.setHeader(key, value));
  const body = new Uint8Array(await fontResponse.arrayBuffer());
  res.send(Buffer.from(body));
});

app.get("/", async (req, res) => {
  const page = await getPage();
  const html = await obfuscator.servePrecomputed(page, {
    pageKey: "/",
    clientFingerprint: `${(req.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim()}|${req.headers["user-agent"] ?? ""}`,
    sendClientMapping: false,
  });

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(html);
});

app.listen(port, () => {
  console.log(`[express-example] http://localhost:${port}/`);
});
