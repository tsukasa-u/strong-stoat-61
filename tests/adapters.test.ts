import { expect, it } from "vitest";
import {
  FontObfuscator,
  withAstroEndpointObfuscation,
  withFetchObfuscation,
  withHonoObfuscation,
  withNextRouteHandlerObfuscation,
  withRemixRequestHandlerObfuscation,
  withSvelteKitHandleObfuscation,
} from "../lib/index.ts";

const fontUrl =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";

function createObfuscator() {
  return new FontObfuscator({ fontUrl, fontRoutePrefix: "/_obf/font" });
}

it("withFetchObfuscation injects obfuscation into html responses", async () => {
  const obfuscator = createObfuscator();
  const wrapped = withFetchObfuscation(
    () =>
      new Response("<html><head></head><body><p class='t'>Hello</p></body></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    obfuscator,
    { selectors: [".t"] },
  );

  const res = await wrapped(new Request("http://localhost/"));
  const html = await res.text();
  expect(res.status).toBe(200);
  expect(html).toContain("@font-face");
  expect(html).toContain("_obf/font/");
  expect(html).not.toContain("MutationObserver");
  // Obfuscated HTML must never be cached — the embedded font ticket is one-time use with a 5s TTL.
  expect(res.headers.get("cache-control")).toBe("no-store");
});

it("withFetchObfuscation does not touch non-html responses", async () => {
  const obfuscator = createObfuscator();
  const wrapped = withFetchObfuscation(
    () =>
      new Response("plain", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    obfuscator,
    { selectors: [".x"] },
  );

  const res = await wrapped(new Request("http://localhost/"));
  expect(await res.text()).toBe("plain");
});

it("withFetchObfuscation preserves HEAD semantics for html responses", async () => {
  const obfuscator = createObfuscator();
  const wrapped = withFetchObfuscation(
    () =>
      new Response("<html><head></head><body><p class='t'>Hello</p></body></html>", {
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "999" },
      }),
    obfuscator,
    { selectors: [".t"] },
  );

  const res = await wrapped(new Request("http://localhost/", { method: "HEAD" }));
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("content-length")).toBeNull();
});

it("framework aliases (Next/Remix/Astro/Hono) behave like fetch wrapper", async () => {
  const html = "<html><head></head><body><div id='a'>x</div></body></html>";

  for (
    const factory of [
      withNextRouteHandlerObfuscation,
      withRemixRequestHandlerObfuscation,
      withAstroEndpointObfuscation,
      withHonoObfuscation,
    ]
  ) {
    const obfuscator = createObfuscator();
    const wrapped = factory(
      () =>
        new Response(html, {
          headers: { "content-type": "text/html" },
        }),
      obfuscator,
      { selectors: ["#a"] },
    );
    const out = await (await wrapped(new Request("http://localhost/"))).text();
    expect(out).toContain("@font-face");
  }
});

it("withSvelteKitHandleObfuscation wraps handle and preserves font endpoint", async () => {
  const obfuscator = createObfuscator();

  const handle = withSvelteKitHandleObfuscation(
    async ({ event, resolve }) => resolve(event),
    obfuscator,
    { selectors: [".secret"] },
  );

  const htmlEvent = {
    event: {
      request: new Request("http://localhost/page"),
    },
    resolve: async () =>
      new Response("<html><head></head><body><p class='secret'>A</p></body></html>", {
        headers: { "content-type": "text/html" },
      }),
  };

  const htmlRes = await handle(htmlEvent);
  const text = await htmlRes.text();
  expect(text).toContain("@font-face");
  expect(htmlRes.headers.get("cache-control")).toBe("no-store");

  const fontHit = await handle({
    event: {
      request: new Request("http://localhost/_obf/font/not-a-token"),
    },
    resolve: async () => new Response("should-not-be-used"),
  });

  expect(fontHit.status).toBe(404);
  expect(await fontHit.text()).toContain("Not Found");
});
