# Examples

This repository now contains two kinds of examples.

## 1. Repository runnable entries

These are the examples used by the root validation commands such as `pnpm verify:examples`.

- Fetch: `fetch/main.ts`
- Fetch JSX: `fetch/jsxExample.jsx`
- Fetch TSX: `fetch/main.tsx`
- Hono: `hono/main.ts`
- Express: `express/src/index.ts`
- Fastify: `fastify/src/index.ts`
- Next adapter runner: `next/main.ts`
- Remix adapter runner: `remix/main.ts`
- Astro adapter runner: `astro/main.ts`
- SvelteKit adapter runner: `sveltekit/main.ts`
- React SSR runner: `react/main.tsx`
- Vue SSR runner: `vue/main.ts`

## 2. Standalone framework project skeletons

Each framework directory also contains a minimal project layout that can be entered directly and run with `pnpm install` then `pnpm dev`.

- Hono: `hono/package.json`, `hono/src/index.ts`
- Express: `express/package.json`, `express/src/index.ts`
- Fastify: `fastify/package.json`, `fastify/src/index.ts`
- Astro: `astro/package.json`, `astro/src/middleware.ts`, `astro/src/pages/index.astro`
- Next: `next/package.json`, `next/app/page.tsx`, `next/app/protected/route.ts`
- Remix: `remix/package.json`, `remix/app/root.tsx`, `remix/app/routes/_index.tsx`, `remix/app/entry.server.tsx`
- SvelteKit: `sveltekit/package.json`, `sveltekit/src/hooks.server.ts`, `sveltekit/src/routes/+page.svelte`
- React SSR: `react/package.json`, `react/main.tsx`
- Vue SSR: `vue/package.json`, `vue/main.ts`
- Nuxt: `nuxt/package.json`, `nuxt/app.vue`, `nuxt/server/plugins/font-obfuscator.ts`, `nuxt/server/middleware/font-obfuscator.ts`
- SolidStart: `solidstart/package.json`, `solidstart/src/app.tsx`, `solidstart/src/routes/index.tsx`, `solidstart/src/middleware.ts`, `solidstart/src/nitro-plugin.ts`, `solidstart/src/entry-client.tsx`, `solidstart/src/entry-server.tsx`
- Cloudflare Workers: `cloudflare-workers/worker.ts`, `cloudflare-workers/wrangler.toml`
- Bun: `bun/main.ts`

## Notes

- The runnable entries are optimized for fast repository-level smoke tests.
- The standalone skeletons are optimized to show the framework-native file placement.
- All example source files consistently use `import { ... } from "font-obfuscator"`.
- For repository-local runs, build once first (`pnpm build`) so `dist/` is available.
- `pnpm verify:examples` now also validates Cloudflare Workers example typecheck and runs Bun runtime smoke when `bun` is available.
- CI additionally runs `wrangler deploy --dry-run` for Cloudflare Workers to validate bundling without publishing.
- SolidStart is included as a project shape example. A stable framework-level final HTML response hook was not clearly documented in the current official docs, so this skeleton currently focuses on the app structure rather than a completed response-transform integration.

## Framework-native policy

- React / Vue / Nuxt / SolidStart examples use each framework's primary UI authoring style (components, template syntax, and framework event handlers) rather than inline HTML strings with string-based `onclick` handlers.
- Solid's framework-native JSX state examples are represented in the SolidStart project.
- This follows Solid's official TypeScript guidance (`jsx: preserve`) and current `tsx` (esbuild) compiler limitations; runner examples prioritize stable verification and clear layering.
- Middleware/plugins are responsible for obfuscation concerns. Application components/pages should use framework-native state management directly.
- Framework state examples explicitly include non-numeric state (string, array, object) in addition to numeric counters.
- Server-side runner examples demonstrate SSR-first adapter integration and keep interactive state demos in framework project pages.
- Fetch JSX / TSX examples are explicitly documented as custom JSX runtime demonstrations (framework-agnostic), so users do not confuse them with official React / Solid / Vue usage.
- Next App Router examples keep UI in `app/page.tsx` and use `app/**/route.ts` for Request/Response oriented handler examples.
- Concrete framework-native state examples: `next/app/page.tsx`, `nuxt/app.vue`, `solidstart/src/routes/index.tsx`, `sveltekit/src/routes/+page.svelte`, `remix/app/routes/_index.tsx`.

## Routing and View separation

- For server frameworks (Express/Fastify/Hono), examples separate route registration (`routes/`) and page rendering (`views/`) so operational flows are easier to extend.
- These examples now use library-focused demo pages (`/`, `/counter`, `/pre-encoded`) instead of an unrelated domain scenario.
- Route middleware and obfuscation logic remain in route/handler layers; page content stays in view modules.
