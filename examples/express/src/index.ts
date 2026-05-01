import express from "express";
import { FontObfuscator } from "font-obfuscator";

const app = express();
const port = Number(process.env.PORT ?? 3000);

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

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

app.get("/", async (_req, res) => {
  const html = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Express Example</title><style>button{padding:.45rem .8rem;margin:.24rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#111827;font-size:.9rem;font-weight:600;cursor:pointer}button:hover{border-color:#9ca3af}button:active{background:#f3f4f6}</style></head>
<body style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0">
  <h1>Express example</h1>
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

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(obfuscated);
});

app.listen(port, () => {
  console.log(`[express-example] http://localhost:${port}/`);
});
