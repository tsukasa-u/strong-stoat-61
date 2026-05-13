# Font Obfuscator

Language:

- English (this file)
- Japanese: [README.ja.md](README.ja.md)

Font Obfuscator is a server-side HTML obfuscation library.
It remaps selected text to PUA code points and injects a one-time font ticket,
so text remains readable on screen but harder to extract from copied raw text.

## Quick Start

### Step 1: Install

```bash
pnpm add font-obfuscator
```

### Step 2: Wrap your HTML response handler

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

### Step 3: If you are not using adapter wrappers, handle font token requests early

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## What To Obfuscate

- Obfuscate only sensitive server-rendered text (minimal selector scope).
- Keep normal app state in framework-native state management.
- Do not treat hydration-managed or client-side DOM updates as obfuscation guarantees.

## Core APIs

Choose APIs by use case rather than memorizing a flat list.

### 1) Baseline APIs

- `new FontObfuscator(options)`
Use: create the obfuscator instance.
- `obfuscateHtml(html, { selectors })`
Use: one-shot server-side obfuscation for an HTML string.
- `maybeHandleFontRequest(request)`
Use: early return for `/_obf/font/...` ticket requests.

### 2) Cached static templates

- `precomputeHtml(html, { selectors })`
Use: precompute once for mostly-static templates.
- `servePrecomputed(precomputedPage, options?)`
Use: per-request ticket injection from the precomputed template.

### 3) Dynamic SSR pages

- `precomputeMapping(hintHtml?)`
Use: prepare mapping ahead of runtime rendering.
- `getRotatingMapping(hintHtml?)`
Use: get rotation-aware mapping for better replay resistance.
- `serveWithMapping(html, selectors, precomputedMapping, options?)`
Use: obfuscate request-time HTML with a known mapping.

### Obfuscated Dictionary / State Helpers

Use these helpers when you want framework-friendly i18n/state structures while
keeping client payload values obfuscated.

- `encodeText(text, mapping, options?)`
Use: obfuscate a single string.
- `preEncodeShuffled(values, mapping, options?)`
Use: pre-obfuscate value arrays with shuffle + decoys.
- `obfuscateDictionary(dict, mapping, options?)`
Use: obfuscate values of a flat string dictionary.
- `obfuscateI18nDictionary(dictionaries, mapping, options?)`
Use: obfuscate nested language dictionaries (`{ ja, en, ... }`).
- `obfuscateStringLeaves(state, mapping, options?)`
Use: obfuscate only string leaves in JSON-like state.

```ts
import {
  FontObfuscator,
  obfuscateI18nDictionary,
  obfuscateStringLeaves,
} from "font-obfuscator";

const obfuscator = new FontObfuscator({ fontUrl: "https://.../font.ttf" });
const pm = await obfuscator.getRotatingMapping("<p>hint text</p>");

const obfI18n = obfuscateI18nDictionary(
  {
    ja: { title: "こんにちは" },
    en: { title: "Hello" },
  },
  pm.mapping,
  { variants: pm.variants, variantSeed: pm.seed },
);

const obfState = obfuscateStringLeaves(
  { status: "idle", count: 1, labels: ["Start", "Done"] },
  pm.mapping,
  { variants: pm.variants, variantSeed: pm.seed },
);
```

### 5) Framework wrappers

- `obfuscateHtmlResponse(response, obfuscator, options)`
Use: post-process an existing `Response`.
- `withFetchObfuscation(...)`
Use: generic Fetch handler wrapper.
- `withNextRouteHandlerObfuscation(...)`
Use: Next.js Route Handler wrapper.
- `withRemixRequestHandlerObfuscation(...)`
Use: Remix request handler wrapper.
- `withAstroEndpointObfuscation(...)`
Use: Astro endpoint wrapper.
- `withSvelteKitHandleObfuscation(...)`
Use: SvelteKit `handle` wrapper.
- `withHonoObfuscation(...)`
Use: Hono handler wrapper.

Type exports (such as `FontObfuscatorOptions`) are available via TypeScript
autocomplete. If you need the full export surface, see `lib/index.ts`.

## PUA Capacity Modes

`FontObfuscator` supports `puaPlaneMode` to choose PUA pool capacity.

- `bmp` (default): BMP PUA only (6400)
- `bmp+supplementary`: BMP + Supplementary PUA Plane 15/16 (137468)

```ts
const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansJP[wght].ttf",
  fontRoutePrefix: "/_obf/font",
  puaPlaneMode: "bmp+supplementary",
});
```

Supplementary mode is experimental. Validate rendering on your target devices before production.

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
