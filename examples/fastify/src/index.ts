import Fastify from "fastify";
import { FontObfuscator } from "font-obfuscator";

const app = Fastify();
const port = Number(process.env.PORT ?? 3000);

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

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

app.get("/", async (_request, reply) => {
  const html = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Fastify Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Fastify example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <div>
    <button onclick="c++;el.textContent=c">Count</button>
    <button onclick="c=0;el.textContent=0">Reset</button>
  </div>
  <p id="cnt" class="secret">0</p>
  <script>var c=0,el=document.getElementById('cnt')<\/script>
</body>
</html>`;

  const obfuscated = await obfuscator.obfuscateHtml(html, {
    selectors: [".secret"],
  });

  reply.header("content-type", "text/html; charset=utf-8");
  reply.send(obfuscated);
});

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`[fastify-example] http://localhost:${port}/`);
});
