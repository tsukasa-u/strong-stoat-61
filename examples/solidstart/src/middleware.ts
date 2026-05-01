import { createMiddleware } from "@solidjs/start/middleware";
import { FontObfuscator } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

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
    async (_event, response) => {
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
      response.body = await obfuscator.obfuscateHtml(html, {
        selectors: [".secret"],
      });
    },
  ],
});
