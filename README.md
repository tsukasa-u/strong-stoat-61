# Font Obfuscator

Language:

- English (this file)
- Japanese: [README.ja.md](README.ja.md)

Font Obfuscator is an HTML-response obfuscation library.
It remaps glyphs to Private Use Area (PUA) code points so that:

- Text still looks readable on screen
- Copied text / raw DOM text becomes hard to interpret

## Table of Contents

1. [How It Works](#how-it-works)
2. [How To Preserve Copy-Resistance](#how-to-preserve-copy-resistance)
3. [Core API](#core-api)
4. [Adapter Behavior by Framework](#adapter-behavior-by-framework)
5. [Framework Notes (React, Vue, Astro, Solid, Hono)](#framework-notes-react-vue-astro-solid-hono)
6. [GitHub Pages Strategy](#github-pages-strategy)
7. [Quick Start](#quick-start)
8. [Security Limits](#security-limits)
9. [Testing](#testing)
10. [Runtime Choice: Node/pnpm](#runtime-choice-nodepnpm)
11. [Troubleshooting: Cannot find module](#troubleshooting-cannot-find-module)
12. [Examples Layout](#examples-layout)

## How It Works

### 1) Font loading and parsing

- The library fetches `fontUrl`.
- If the font is WOFF2 (`wOF2`), it is decompressed to TTF first.
- Parsed with `opentype.js`.

### 2) Build a remap table

- It checks which characters from the configured `alphabet` exist in the source font.
- It assigns each usable character to a shuffled PUA code point (`U+E000+`).
- Shuffling is seed-based per session.

### 3) Build an obfuscated font

- A new TTF is generated where those glyphs now live on PUA code points.
- This font is served by tokenized endpoint: `fontRoutePrefix/<token>`.

### 4) Inject HTML payload

`obfuscateHtml()` injects:

- `@font-face` and selector-level font assignment
- Client-side script containing an encoded map (base64 + xor)
- Script rewrites text nodes under target selectors

### 5) Dynamic DOM support

- With `observeMutations: true`, a `MutationObserver` applies obfuscation to newly added content.

## How To Preserve Copy-Resistance

This library raises extraction cost. It is not DRM.

Recommended operational rules:

1. Apply on server-side HTML output (SSR or response middleware)
2. Keep sessions short (`sessionTtlMs`)
3. Obfuscate only sensitive areas (`selectors` minimum scope)
4. Avoid exposing plain text via API payloads or embedded JSON
5. Add bot/rate protections (WAF, rate limit, behavior-based detection)

## Core API

### `new FontObfuscator(options)`

- `fontUrl: string` (required)
- `fontRoutePrefix?: string` (default `/_obf/font`)
- `sessionTtlMs?: number`
- `alphabet?: string[]`

### `await obfuscator.obfuscateHtml(html, options)`

- `selectors: string[]` (required)
- `fontFamilyName?: string`
- `observeMutations?: boolean` (default `true`)

### `await obfuscator.maybeHandleFontRequest(request)`

- Returns `Response` when request matches obfuscated font path
- Returns `null` otherwise

## Adapter Behavior by Framework

All adapters do the same core pipeline:

1. Check and serve tokenized font path early (`maybeHandleFontRequest`)
2. Execute original handler
3. If response is `text/html`, inject obfuscation payload
4. If response is not HTML, pass-through unchanged

### Generic

- `withFetchObfuscation`
- `obfuscateHtmlResponse`

### Next.js / Remix / Astro

- `withNextRouteHandlerObfuscation`
- `withRemixRequestHandlerObfuscation`
- `withAstroEndpointObfuscation`

These are aliases over the same fetch-compatible adapter behavior.

### Hono

- `withHonoObfuscation`

Also an alias to fetch-compatible adapter flow.
Use where your route layer handles `Request -> Response`.

### SvelteKit

- `withSvelteKitHandleObfuscation`

This wraps `handle({ event, resolve })` style and post-processes the resolved HTML response.

## Framework Notes (React, Vue, Astro, Solid, Hono)

- React / Vue / Solid: works best in SSR frameworks (Next/Nuxt/SolidStart) where final HTML response can be transformed.
- Astro: middleware is the preferred integration point for normal `.astro` pages; endpoint wrapping is a secondary option.
- Hono: use the normal `new Hono()` app and wrap its fetch handler.

Important:

- Pure CSR-only apps can still run client-side obfuscation logic, but resistance is weaker than server-side injection model.

## GitHub Pages Strategy

GitHub Pages is static hosting. It cannot run tokenized font session endpoints by itself.

Recommended split:

1. Host documentation and static explanation UI on GitHub Pages (`docs/`)
2. Host runtime obfuscation server (Node/Edge) elsewhere
3. Link Pages docs to runtime demo endpoint

This repository includes:

- `docs/index.html` bilingual static documentation page with language switch
- `.github/workflows/deploy-pages.yml` for Pages deployment

## Quick Start

### Generic fetch-style integration

```ts
import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansCJKjp-Regular.otf",
  fontRoutePrefix: "/_obf/font",
});

const handler = withFetchObfuscation(
  async () => new Response("<html><head></head><body><p class='secret'>Hello</p></body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  }),
  obfuscator,
  { selectors: [".secret"], observeMutations: true },
);
```

### Manual font endpoint branch

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## Security Limits

- Not cryptographic protection
- Determined reverse engineering is still possible
- OCR-based extraction is out of scope
- Must be combined with transport/API hardening and abuse detection

## Testing

```bash
pnpm check
pnpm test
```

Current test coverage includes:

- Core obfuscator behavior
- Adapter behavior (Next/Remix/Astro/Hono/SvelteKit)
- HTML-only injection guarantee
- Invalid token handling

## Runtime Choice: Node/pnpm

This repository is now Node/pnpm-first.

Why this change was made:

- Fewer editor warnings in typical TypeScript/Node setups
- Better alignment with common production stacks
- Clear dependency and script management via `pnpm`

Practical recommendation:

- Use `pnpm` scripts for local development, testing, and examples.
- Keep adapter integration in your existing Node framework layer.
- Adapter logic is fetch-compatible, so architecture stays transferable.

## Troubleshooting: Cannot find module

If VS Code shows warnings like `Cannot find module ...`:

install dependencies first and make sure your workspace TypeScript server is using project config.

Recommended checks:

- `pnpm install`
- `pnpm check`
- Reload VS Code window after install if modules are still unresolved

Common causes are missing `node_modules` or stale TS language service cache.

## Examples Layout

The repository contains both quick runnable entries and framework-shaped example projects.

- See [examples/README.md](examples/README.md) for the full examples map.
- Runnable entries are the files exercised by `pnpm verify:examples`.
- Standalone framework skeletons are the `examples/<framework>/package.json` projects you can enter directly and run with `pnpm install` then `pnpm dev`.
