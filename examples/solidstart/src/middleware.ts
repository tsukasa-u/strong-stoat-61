import { createMiddleware } from "@solidjs/start/middleware";
import { removeResponseHeader, setResponseHeader } from "vinxi/http";
import { obfuscator } from "./utils/obfuscator.ts";

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
      let result = await obfuscator.serveWithMapping(html, SELECTORS, pm, {
        pageKey: new URL(event.request.url).pathname,
        clientFingerprint: obfuscator.getClientFingerprint(event.request),
      });

      response.body = result;
      setResponseHeader(event.nativeEvent, "cache-control", "no-store");
      removeResponseHeader(event.nativeEvent, "content-length");
      removeResponseHeader(event.nativeEvent, "Content-Length");
    },
  ],
});
