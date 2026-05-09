import type { Express, Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { FontObfuscator } from "font-obfuscator";
import { renderDemoView } from "../views/demoViews.tsx";

const SELECTORS = [".secret"];

/**
 * Convert an Express request to a Fetch-API Request so library helpers
 * (`maybeHandleFontRequest`, `getClientFingerprint`) can apply their own
 * `trustedProxies` rules instead of us blindly trusting `x-forwarded-for`.
 */
function toFetchRequest(req: ExpressRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  // Fixed origin: only pathname/search are consumed by the library.
  return new Request(`http://localhost${req.originalUrl}`, {
    method: req.method,
    headers,
  });
}

async function servePage(
  obfuscator: FontObfuscator,
  pathname: string,
  req: ExpressRequest,
): Promise<string> {
  const baseHtml = renderDemoView(pathname);
  const page = await obfuscator.getRotatingPrecomputedPage(baseHtml, SELECTORS, pathname);
  return obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: obfuscator.getClientFingerprint(toFetchRequest(req)),
  });
}

export function registerDemoRoutes(app: Express, obfuscator: FontObfuscator): void {
  app.get("/_obf/font/:token", async (req, res) => {
    const fontResponse = await obfuscator.maybeHandleFontRequest(toFetchRequest(req));
    if (!fontResponse) {
      res.status(404).send("Not Found");
      return;
    }

    res.status(fontResponse.status);
    fontResponse.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(Buffer.from(await fontResponse.arrayBuffer()));
  });

  const pageHandler = async (req: ExpressRequest, res: ExpressResponse) => {
    const html = await servePage(obfuscator, req.path, req);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.send(html);
  };

  app.get("/", pageHandler);
  app.get("/counter", pageHandler);
  app.get("/pre-encoded", pageHandler);
}
