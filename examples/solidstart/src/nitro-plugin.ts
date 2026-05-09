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
    const ip = (event.headers.get?.("x-forwarded-for") ?? "").split(",")[0].trim();
    const ua = event.headers.get?.("user-agent") ?? "";

    response.body = await obfuscator.serveWithMapping(response.body, SELECTORS, pm, {
      pageKey: event.path,
      clientFingerprint: `${ip}|${ua}`,
    });

    const h = response.headers as any;
    if (h) {
      if (typeof h.set === "function") {
        h.set("cache-control", "no-store");
        if (typeof h.delete === "function") {
          h.delete("content-length");
          h.delete("Content-Length");
        }
      } else {
        delete h["content-length"];
        delete h["Content-Length"];
        h["cache-control"] = "no-store";
      }
    }
  });
});
