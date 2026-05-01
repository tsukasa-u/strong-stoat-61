import Fastify from "fastify";
import { FontObfuscator, preEncodeShuffled, type PrecomputedPage } from "../../../lib/index.ts";

const app = Fastify();
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
<head><meta charset="utf-8" /><title>Fastify Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Fastify example</h1>
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

app.get("/_obf/font/:token", async (request, reply) => {
  const fontResponse = await obfuscator.maybeHandleFontRequest(
    new Request(`http://localhost:${port}${request.url}`),
  );
  if (!fontResponse) {
    reply.code(404).send("Not Found");
    return;
  }

  reply.code(fontResponse.status);
  fontResponse.headers.forEach((value, key) => reply.header(key, value));
  const body = new Uint8Array(await fontResponse.arrayBuffer());
  reply.send(Buffer.from(body));
});

app.get("/", async (request, reply) => {
  const page = await getPage();
  const html = await obfuscator.servePrecomputed(page, {
    pageKey: "/",
    clientFingerprint: `${(request.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim()}|${request.headers["user-agent"] ?? ""}`,
    sendClientMapping: false,
  });

  reply.header("content-type", "text/html; charset=utf-8");
  reply.header("cache-control", "no-store");
  reply.send(html);
});

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`[fastify-example] http://localhost:${port}/`);
});
