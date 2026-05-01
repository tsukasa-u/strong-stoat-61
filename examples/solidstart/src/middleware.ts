import { createMiddleware } from "@solidjs/start/middleware";
import { FontObfuscator, preEncodeShuffled } from "../../../lib/index.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

export default createMiddleware({
  onRequest: [
    async (event) => {
      const res = await obfuscator.maybeHandleFontRequest(event.request);
      if (res) return res;
    },
  ],
  onBeforeResponse: [
    async (event, response) => {
      const body = response.body;
      let html: string;
      if (typeof body === "string") {
        html = body;
      } else if (
        body !== null &&
        typeof body === "object" &&
        typeof (body as ReadableStream).getReader === "function"
      ) {
        html = await readStream(body as ReadableStream<Uint8Array>);
      } else {
        return;
      }
      if (!html.includes("<html")) return;

    const pm = await obfuscator.getRotatingMapping(html);
    const ip = (event.request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
      const ua = event.request.headers.get("user-agent") ?? "";

      let result = await obfuscator.serveWithMapping(html, SELECTORS, pm, {
        pageKey: new URL(event.request.url).pathname,
        clientFingerprint: `${ip}|${ua}`,
        sendClientMapping: false,
      });

      // Inject pre-encoded counter values (shuffled order) so COUNT stays obfuscated client-side.
      const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
        Array.from({ length: 100 }, (_, i) => String(i)),
        pm.mapping,
      );
      const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;
      result = result.replace("</body>", `${preScript}</body>`);

      response.body = result;
    },
  ],
});
