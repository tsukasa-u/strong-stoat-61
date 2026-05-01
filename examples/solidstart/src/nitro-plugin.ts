import { FontObfuscator, encodeText, type PrecomputedMapping } from "../../../lib/index.ts";

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

const SELECTORS = [".secret"];

// Nitro plugin functions must be synchronous, but registered hooks can be async.
// Kick off precomputation immediately so that by the first request the mapping
// (and the scrambled font) is already cached server-side.
let _mapping: Promise<PrecomputedMapping>;

export default defineNitroPlugin((nitroApp) => {
  _mapping = obfuscator.precomputeMapping();

  nitroApp.hooks.hook("render:response", async (response, { event }) => {
    if (typeof response.body !== "string") return;
    const contentType =
      response.headers?.["content-type"] ||
      response.headers?.["Content-Type"] ||
      "";
    if (!String(contentType).toLowerCase().includes("text/html")) return;

    const pm = await _mapping;
    const ip = (event.headers.get?.("x-forwarded-for") ?? "").split(",")[0].trim();
    const ua = event.headers.get?.("user-agent") ?? "";

    response.body = await obfuscator.serveWithMapping(response.body, SELECTORS, pm, {
      pageKey: event.path,
      clientFingerprint: `${ip}|${ua}`,
      sendClientMapping: false,
    });

    // Inject pre-encoded counter values so COUNT stays obfuscated client-side.
    const preArr = Array.from({ length: 100 }, (_, i) => encodeText(String(i), pm.mapping));
    const preScript = `<script>var _pre=${JSON.stringify(preArr)},c=0,el=document.getElementById('cnt')<\/script>`;
    response.body = response.body.replace("</body>", `${preScript}</body>`);

    if (response.headers) {
      delete response.headers["content-length"];
      delete response.headers["Content-Length"];
    }
  });
});
