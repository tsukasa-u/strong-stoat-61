import type { FastifyInstance } from "fastify";
import type { FontObfuscator } from "pua-font-obfuscator";
import { renderDisasterView } from "../views/disasterViews.ts";

const SELECTORS = [".secret"];

async function servePage(obfuscator: FontObfuscator, pathname: string, fingerprint: string): Promise<string> {
  const baseHtml = renderDisasterView(pathname);
  const page = await obfuscator.getRotatingPrecomputedPage(baseHtml, SELECTORS, pathname);
  return obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: fingerprint,
  });
}

export function registerDisasterRoutes(app: FastifyInstance, obfuscator: FontObfuscator, port: number): void {
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

  const pageHandler = async (request: any, reply: any) => {
    const pathname = request.url.split("?")[0] || "/";
    const fingerprint = `${(request.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim()}|${request.headers["user-agent"] ?? ""}`;
    const html = await servePage(obfuscator, pathname, fingerprint);

    reply.header("content-type", "text/html; charset=utf-8");
    reply.header("cache-control", "no-store");
    reply.send(html);
  };

  app.get("/", pageHandler);
  app.get("/evacuation", pageHandler);
  app.get("/alerts", pageHandler);
}
