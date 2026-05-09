import type { Express } from "express";
import type { FontObfuscator } from "font-obfuscator";
import { renderDemoView } from "../views/demoViews.tsx";

const SELECTORS = [".secret"];

async function servePage(obfuscator: FontObfuscator, pathname: string, fingerprint: string): Promise<string> {
  const baseHtml = renderDemoView(pathname);
  const page = await obfuscator.getRotatingPrecomputedPage(baseHtml, SELECTORS, pathname);
  return obfuscator.servePrecomputed(page, {
    pageKey: pathname,
    clientFingerprint: fingerprint,
  });
}

export function registerDemoRoutes(app: Express, obfuscator: FontObfuscator): void {
  app.get("/_obf/font/:token", async (req, res) => {
    const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const fontResponse = await obfuscator.maybeHandleFontRequest(new Request(requestUrl));
    if (!fontResponse) {
      res.status(404).send("Not Found");
      return;
    }

    res.status(fontResponse.status);
    fontResponse.headers.forEach((value, key) => res.setHeader(key, value));
    const body = new Uint8Array(await fontResponse.arrayBuffer());
    res.send(Buffer.from(body));
  });

  app.get(["/", "/counter", "/pre-encoded"], async (req, res) => {
    const pathname = req.path;
    const fingerprint = `${(req.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim()}|${req.headers["user-agent"] ?? ""}`;
    const html = await servePage(obfuscator, pathname, fingerprint);

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.send(html);
  });
}
