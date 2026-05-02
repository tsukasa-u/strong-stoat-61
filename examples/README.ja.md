# Examples

このリポジトリの examples には、用途の違う 2 種類の例があります。

## 1. リポジトリ内の即実行エントリ

これは `pnpm verify:examples` など、ルート側の検証で使うエントリです。

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

## 2. 各 framework の最小プロジェクト構成

各 framework ディレクトリには、そのまま入って `pnpm install` → `pnpm dev` で確認できる最小構成も入れています。

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
- Cloudflare Workers: `cloudflare-workers/worker.ts`, `cloudflare-workers/wrangler.toml`
- Bun: `bun/main.ts`

## 補足

- 即実行エントリは、リポジトリ全体のスモークテスト向けです。
- 最小プロジェクト構成は、framework らしいファイル配置を示すためのものです。
- サンプルコードの import は `import { ... } from "font-obfuscator"` に統一しています。
- リポジトリ内で実行する場合は、先に `pnpm build` で `dist/` を生成してください。
- `pnpm verify:examples` は Cloudflare Workers 例の型検証を行い、`bun` が利用可能な環境では Bun 例の実行スモークも行います。
- CI では Cloudflare Workers に対して `wrangler deploy --dry-run` も実行し、公開せずにバンドル可否を検証します。
- SolidStart については、現行の公式情報から最終 HTML レスポンスを安定して横取りするフックが明確に確認できなかったため、現時点では「プロジェクト構成の例」を主目的にしています。
