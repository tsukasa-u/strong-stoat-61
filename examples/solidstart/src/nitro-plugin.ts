import { toWebRequest } from "vinxi/http";
import { obfuscator } from "./utils/obfuscator.ts";

const SELECTORS = [".secret"];

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:response", async (response, { event }) => {
    if (typeof response.body !== "string") return;
    const contentType =
      response.headers?.["content-type"] ||
      response.headers?.["Content-Type"] ||
      "";
    if (!String(contentType).toLowerCase().includes("text/html")) return;

    const pm = await obfuscator.getRotatingMapping(response.body);
    const fetchReq = toWebRequest(event as Parameters<typeof toWebRequest>[0]);

    response.body = await obfuscator.serveWithMapping(response.body, SELECTORS, pm, {
      pageKey: event.path,
      clientFingerprint: obfuscator.getClientFingerprint(fetchReq),
    });

    if (response.headers) {
      response.headers["cache-control"] = "no-store";
      delete response.headers["content-length"];
      delete response.headers["Content-Length"];
    }
  });
});
