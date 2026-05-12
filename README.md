# Font Obfuscator

Language:

- English (this file)
- Japanese: [README.ja.md](README.ja.md)

Font Obfuscator is a server-side HTML obfuscation library.
It remaps selected text to PUA code points and injects a one-time font ticket,
so text remains readable on screen but harder to extract from copied raw text.

## Quick Start

1. Install

```bash
pnpm add font-obfuscator
```

2. Wrap your HTML response handler

```ts
import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansJP[wght].ttf",
  fontRoutePrefix: "/_obf/font",
});

const handler = withFetchObfuscation(
  async () =>
    new Response("<html><head></head><body><p class='secret'>Hello</p></body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  obfuscator,
  { selectors: [".secret"] },
);
```

3. If you are not using adapter wrappers, handle font token requests early

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## What To Obfuscate

- Obfuscate only sensitive server-rendered text (minimal selector scope).
- Keep normal app state in framework-native state management.
- Do not treat hydration-managed or client-side DOM updates as obfuscation guarantees.

## Core APIs

- `new FontObfuscator(options)`
- `obfuscateHtml(html, { selectors })`
- `maybeHandleFontRequest(request)`
- `precomputeHtml()` + `servePrecomputed()` for cached templates
- `precomputeMapping()` + `serveWithMapping()` for dynamic SSR HTML

## Adapter Helpers

- Generic Fetch: `withFetchObfuscation`, `obfuscateHtmlResponse`
- Next.js: `withNextRouteHandlerObfuscation`
- Remix: `withRemixRequestHandlerObfuscation`
- Astro: `withAstroEndpointObfuscation`
- SvelteKit: `withSvelteKitHandleObfuscation`
- Hono: `withHonoObfuscation`

## Security Notes

- This library raises extraction cost; it is not DRM.
- Apply on server-rendered HTML responses.
- Keep token/session TTL short for better resistance.
- Avoid leaking plaintext in API payloads or embedded JSON.

## Examples

See [examples/README.md](examples/README.md).

- Next/Nuxt/Remix separate `/` interactive UI/state demos from `/protected` obfuscated HTML demos.
- Astro separates `/` client-side DOM updates from `/counter` and `/pre-encoded` obfuscated HTML demos.
- The Vue sample is SSR-only.

## Local Verification

```bash
pnpm build
pnpm verify:examples
pnpm exec tsx scripts/playwright-browser-test.ts
```
