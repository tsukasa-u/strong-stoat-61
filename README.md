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
5. [Framework Notes (React, Vue, Astro, Solid, Hono, Bun, Cloudflare Workers)](#framework-notes-react-vue-astro-solid-hono-bun-cloudflare-workers)
6. [Quick Start](#quick-start)
7. [Security Limits](#security-limits)
8. [Testing](#testing)
9. [Runtime Choice: Node/pnpm](#runtime-choice-nodepnpm)
10. [Troubleshooting: Cannot find module](#troubleshooting-cannot-find-module)
11. [Examples Layout](#examples-layout)

## How It Works

### 1) Font loading and parsing

- The library fetches `fontUrl` at startup.
- If the font is WOFF2 (`wOF2`), it is decompressed to TTF first.
- Parsed with `opentype.js`.

### 2) Build a remap table

- It checks which characters from the configured `alphabet` exist in the source font.
- It assigns each usable character to a shuffled PUA code point (`U+E000+`).
- Shuffling is seed-based per session, rotated on a configurable interval.

### 3) Build an obfuscated font

- A new TTF is generated where those glyphs live on PUA code points.
- This font is served via a one-time signed token URL: `fontRoutePrefix/<token>?exp=<ms>&sig=<hex>`.
- The token is single-use and expires after `fontUrlTtlMs`.

### 4) Inject HTML payload (server-side only)

`obfuscateHtml()` (or `servePrecomputed()`) does **all** encoding on the server:

- Replaces every text node inside the target selectors with PUA-encoded characters.
- Injects a `@font-face` rule + per-selector `font-family` override so the browser renders the correct glyphs.
- No mapping or decoding logic is ever sent to the client.

### 5) Dynamic values (counters, prices)

Use [`preEncodeShuffled`](#preencodeShuffled) to pre-encode arrays of values server-side.
The client receives only an array of PUA strings and an index — never the mapping.

## How To Preserve Copy-Resistance

This library raises extraction cost. It is not DRM.

Recommended operational rules:

1. Apply on server-side HTML output (SSR or response middleware)
2. Keep sessions short (`sessionTtlMs`)
3. Obfuscate only sensitive areas (`selectors` minimum scope)
4. Avoid exposing plain text via API payloads or embedded JSON
5. Add bot/rate protections (WAF, rate limit, behavior-based detection)
6. Trust `x-forwarded-for` only behind a trusted reverse proxy/CDN; otherwise treat it as user-controlled input

Current implementation hardening:

- One-time font ticket URLs
- Short-lived font URL expiry
- HMAC-SHA256 ticket signatures
- Basic selector input validation for inline injection safety

## Core API

### Which pattern to use?

| Scenario | Pattern |
|---|---|
| Simple / low-traffic / fully dynamic HTML | `obfuscateHtml()` |
| Static HTML template (Express, Fastify, Hono) | `precomputeHtml()` + `getRotatingPrecomputedPage()` + `servePrecomputed()` |
| Dynamic SSR body (Nuxt, SolidStart Nitro) | `precomputeMapping()` + `getRotatingMapping()` + `serveWithMapping()` |
| Next.js / Remix / Astro / SvelteKit / Hono / Bun / Cloudflare Workers | Adapter helpers — see [Adapter Behavior](#adapter-behavior-by-framework) |

### `new FontObfuscator(options)`

| Option | Default | Description |
|---|---|---|
| `fontUrl` | (required) | `http`/`https` URL of source TTF or WOFF2 font |
| `fontRoutePrefix` | `/_obf/font` | Path prefix for the one-time font token endpoint |
| `fontUrlTtlMs` | `30_000` | Token TTL in ms; increase if slow networks cause expiry |
| `fontDisplay` | `"block"` | CSS `font-display` strategy in the injected `@font-face` |
| `variantCount` | `1` | PUA variants per character — makes frequency analysis impossible (see [PUA budget](#pua-budget)) |
| `digitVariantCount` | `4` | Digits receive `max(variantCount, digitVariantCount)` variants for extra counter protection |
| `mappingRotationIntervalMs` | `120_000` | How often the PUA shuffle mapping rotates (ms) |
| `alphabet` | ASCII + hiragana + katakana + full-width | Characters to include in the scrambled font |
| `trustedProxies` | `undefined` | IP list of trusted reverse proxies for XFF walking |
| `devMode` | `false` | Show floating panel listing unmapped characters |
| `budgetPolicy` | `"legacy"` | PUA budget overflow policy: `"legacy"` (warn), `"adaptive"` (graceful degradation + hook), `"strict"` (throw) |
| `variantAllocator` | `"uniform"` | Variant slot distribution strategy when `budgetPolicy` is `"adaptive"`: `"uniform"` or `"class-weighted"` |
| `minPrimaryGuarantee` | `1` | Minimum PUA slots per character guaranteed in `"adaptive"` mode |
| `onBudgetDegrade` | `undefined` | Called when variant budget runs short in `"adaptive"` mode — use to emit metrics |

### `await obfuscator.obfuscateHtml(html, { selectors })`

All-in-one per-request obfuscation.  Builds a fresh font + mapping on every call.

- `selectors: string[]` — required; simple `.class` or `#id` selectors only
- `fontFamilyName?: string` — override the generated CSS family name
- `pageKey?: string` — namespace for font tickets (default `/`)
- `clientFingerprint?: string` — bind the token to this client
- `devMode?: boolean` — override instance-level devMode for this call

### `await obfuscator.maybeHandleFontRequest(request)`

Place this at the top of your router.  Returns a `Response` when the request
matches the font token path, `null` otherwise.

### `await obfuscator.precomputeHtml(html, selectors)` → `PrecomputedPage`

Builds the mapping once.  Store the result; call `servePrecomputed` per request.
To inject `preEncodeShuffled` arrays, patch `page.rawHtml` before caching:

```ts
const page = await obfuscator.precomputeHtml(BASE_HTML, [".secret"]);
const { encoded, indices } = preEncodeShuffled(values, page.mapping);
page.rawHtml = page.rawHtml
  .replace('var _pre=[]', `var _pre=${JSON.stringify(encoded)}`)
  .replace('_preIdx=[]',  `_preIdx=${JSON.stringify(indices)}`);
```

### `obfuscator.getRotatingPrecomputedPage(html, selectors, key?)` → `Promise<PrecomputedPage>`

Same as `precomputeHtml` but automatically rebuilds after `mappingRotationIntervalMs`.

### `await obfuscator.servePrecomputed(page, options?)` → `string`

Injects a fresh per-request font ticket into a `PrecomputedPage`.
Re-encodes text with a new digit-variant seed so every response looks different.

### `await obfuscator.precomputeMapping(hintHtml?)` → `PrecomputedMapping`

Builds a stable seed + mapping without needing the final HTML body.
Use for dynamic SSR (Nuxt, SolidStart).

### `obfuscator.getRotatingMapping(hintHtml?)` → `Promise<PrecomputedMapping>`

Same as `precomputeMapping` but auto-rotates.  Call **per-request**.

### `await obfuscator.serveWithMapping(html, selectors, mapping, options?)` → `string`

PUA-encodes `html` using a precomputed mapping and injects a fresh font ticket.

### `encodeText(text, mapping, options?)`

Encode a single string to PUA characters server-side.

### `preEncodeShuffled(values, mapping, options?)`

Pre-encode an array of values with shuffled positions and decoy entries.
The client receives `{ encoded, indices }` and reads `encoded[indices[i]]`.
See the `@example` in the JSDoc for a full counter pattern.

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

### Bun / Cloudflare Workers / Deno

- `withFetchObfuscation`

These runtimes are Fetch-native, so use the generic fetch adapter directly.
- Bun: `Bun.serve({ fetch: handler })`
- Cloudflare Workers: `export default { fetch: handler }`
- Deno: `Deno.serve(handler)`

### SvelteKit

- `withSvelteKitHandleObfuscation`

This wraps `handle({ event, resolve })` style and post-processes the resolved HTML response.

## Framework Notes (React, Vue, Astro, Solid, Hono, Bun, Cloudflare Workers)

- React / Vue / Solid: works best in SSR frameworks (Next/Nuxt/SolidStart) where final HTML response can be transformed.
- Astro: middleware is the preferred integration point for normal `.astro` pages; endpoint wrapping is a secondary option.
- Hono: use the normal `new Hono()` app and wrap its fetch handler.
- Bun: use `Bun.serve()` and pass a wrapped fetch handler.
- Cloudflare Workers: export a default object with `fetch`; note that in-memory state is isolate-local.

Important:

- Pure CSR-only apps can still run client-side obfuscation logic, but resistance is weaker than server-side injection model.

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
  { selectors: [".secret"] },
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

### PUA budget

The BMP Private Use Area holds **6,400 codepoints** (U+E000–U+F8FF).
Total PUA slots used = `uniqueChars × variantCount` (digits use `max(variantCount, digitVariantCount)`).

| Scenario | Unique chars | `variantCount` | Slots used |
|---|---|---|---|
| Default alphabet, default options | ~333 | 1 (digits: 4) | ~393 |
| Default alphabet, `variantCount: 4` | ~333 | 4 | ~1,332 |
| + 500 kanji, `variantCount: 4` | ~833 | 4 | ~3,332 |
| All Joyo kanji, `variantCount: 4` | ~2,469 | 4 | ~9,876 ← **exceeds 6,400** |

For kanji-heavy content with high variant counts, use `variantCount: 2` or increase the rotation frequency instead of relying on static variants alone.

#### Budget overflow policies

Control what happens when the slot budget runs short via `budgetPolicy`:

```ts
// "legacy" (default): console.warn on shortfall, existing behaviour unchanged
new FontObfuscator({ fontUrl, budgetPolicy: "legacy" });

// "adaptive": primary slot always guaranteed; surplus distributed by variantAllocator
// onBudgetDegrade fires when variant count is reduced — no plaintext leakage
new FontObfuscator({
  fontUrl,
  budgetPolicy: "adaptive",
  variantAllocator: "class-weighted", // digits/currency get more variants
  onBudgetDegrade: (e) => console.log(
    `variant shortfall: ${e.variantShortfall}/${e.totalChars} chars`,
  ),
});

// "strict": throws at construction time if any variant would be under-allocated
new FontObfuscator({ fontUrl, budgetPolicy: "strict", variantCount: 2 });
```

**`variantAllocator` strategies** (effective only with `budgetPolicy: "adaptive"`):

| Strategy | Description |
|---|---|
| `"uniform"` | Every character gets `variantCount` extra slots (default — same as legacy) |
| `"class-weighted"` | Digits, currency, and Latin characters receive proportionally more slots via a static weight table |
| `"frequency-weighted"` | Reserved for a future release; currently falls back to `"uniform"` |

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
- Unsafe selector rejection
- Strong signature format (`sig` as 64-hex)

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
- `pnpm build`
- `pnpm check`
- Reload VS Code window after install if modules are still unresolved

Common causes are missing `node_modules`, missing `dist` build output, or stale TS language service cache.

## Examples Layout

The repository contains both quick runnable entries and framework-shaped example projects.

- See [examples/README.md](examples/README.md) for the full examples map.
- Runnable entries are the files exercised by `pnpm verify:examples`.
- Standalone framework skeletons are the `examples/<framework>/package.json` projects you can enter directly and run with `pnpm install` then `pnpm dev`.
- Example source files use `import { ... } from "font-obfuscator"` consistently.
