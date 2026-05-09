import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { FontObfuscator } from "font-obfuscator";
import { renderDemoView } from "../views/demoViews.tsx";

const SELECTORS = [".secret"];

/**
 * Convert a Fastify request to a Fetch-API Request so library helpers
 * (`maybeHandleFontRequest`, `getClientFingerprint`) can apply their own
 * `trustedProxies` rules instead of us blindly trusting `x-forwarded-for`.
 */
function toFetchRequest(req: FastifyRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  // Fixed origin: only pathname/search are consumed by the library.
  return new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers,
  });
}

async function servePage(
  obfuscator: FontObfuscator,
  pathname: string,
  req: FastifyRequest,
): Promise<string> {
  const baseHtml = renderDemoView(pathname);
  const page = await obfuscator.getRotatingPrecomputedPage(baseHtml, SELECTORS, pathname);
  return obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: obfuscator.getClientFingerprint(toFetchRequest(req)),
  });
}

export function registerDemoRoutes(app: FastifyInstance, obfuscator: FontObfuscator): void {
  app.get("/_obf/font/:token", async (request, reply) => {
    const fontResponse = await obfuscator.maybeHandleFontRequest(toFetchRequest(request));
    if (!fontResponse) {
      reply.code(404).send("Not Found");
      return;
    }

    reply.code(fontResponse.status);
    fontResponse.headers.forEach((value, key) => reply.header(key, value));
    return reply.send(Buffer.from(await fontResponse.arrayBuffer()));
  });

  const pageHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split("?")[0] || "/";
    const html = await servePage(obfuscator, pathname, request);
    reply.header("content-type", "text/html; charset=utf-8");
    reply.header("cache-control", "no-store");
    return reply.send(html);
  };

  app.get("/", pageHandler);
  app.get("/counter", pageHandler);
  app.get("/pre-encoded", pageHandler);
}
