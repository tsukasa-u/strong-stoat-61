import { FontObfuscator } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:response", async (response) => {
    if (typeof response.body !== "string") return;
    const contentType =
      response.headers?.["content-type"] ||
      response.headers?.["Content-Type"] ||
      "";
    if (!String(contentType).toLowerCase().includes("text/html")) return;

    response.body = await obfuscator.obfuscateHtml(response.body, {
      selectors: [".secret"],
    });

    if (response.headers) {
      delete response.headers["content-length"];
      delete response.headers["Content-Length"];
    }
  });
});
