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
- Solid SSR runner: `solid/main.tsx`

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
- Solid SSR: `solid/package.json`, `solid/main.tsx`
- Nuxt: `nuxt/package.json`, `nuxt/app.vue`, `nuxt/server/plugins/font-obfuscator.ts`, `nuxt/server/middleware/font-obfuscator.ts`
- SolidStart: `solidstart/package.json`, `solidstart/src/app.tsx`, `solidstart/src/routes/index.tsx`, `solidstart/src/middleware.ts`, `solidstart/src/nitro-plugin.ts`, `solidstart/src/entry-client.tsx`, `solidstart/src/entry-server.tsx`

## Notes

- The runnable entries are optimized for fast repository-level smoke tests.
- The standalone skeletons are optimized to show the framework-native file placement.
- SolidStart is included as a project shape example. A stable framework-level final HTML response hook was not clearly documented in the current official docs, so this skeleton currently focuses on the app structure rather than a completed response-transform integration.
