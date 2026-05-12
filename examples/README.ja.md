# Examples

このディレクトリには実運用に近い統合サンプルがあります。

## すぐ試す

1. ルートで一度ビルド:

```bash
pnpm build
```

2. スモーク検証を実行:

```bash
pnpm verify:examples
pnpm exec tsx scripts/playwright-browser-test.ts
```

## フレームワーク別サンプル

- Next: [next](next)
- Nuxt: [nuxt](nuxt)
- Remix: [remix](remix)
- SvelteKit: [sveltekit](sveltekit)
- SolidStart: [solidstart](solidstart)
- Express: [express](express)
- Fastify: [fastify](fastify)
- Hono: [hono](hono)
- Astro: [astro](astro)
- Fetch/React/Vue: [fetch](fetch), [react](react), [vue](vue)

## 重要な境界

難読化は middleware / adapter が変換したサーバーHTMLに適用されます。

hydration や client-side DOM 更新がある場合、その後の再描画は難読化保証の外です。

- Next/Nuxt/Remix の `/` はインタラクティブ状態管理デモ、`/protected` は難読化HTML確認デモ
- Astro の `/` は client-side DOM 更新デモ、`/counter` と `/pre-encoded` は難読化HTML確認デモ
- Vue サンプルは SSR-only で、クライアント hydration は行いません

## 補助PUAを有効化する

各サンプルは既定で `puaPlaneMode: "bmp"`（6400）です。
文字種が多く PUA 容量不足になる場合は、`FontObfuscator` の生成箇所で `puaPlaneMode: "bmp+supplementary"`（137468）を指定してください。

```ts
const obfuscator = new FontObfuscator({
	fontUrl: "https://.../NotoSansJP[wght].ttf",
	fontRoutePrefix: "/_obf/font",
	puaPlaneMode: "bmp+supplementary",
});
```

主要サンプルの設定箇所:

- Next: `next/app/protected/route.ts`
- Nuxt: `nuxt/server/utils/obfuscator.ts`
- Remix: `remix/app/obfuscator.server.ts`
- SvelteKit: `sveltekit/src/hooks.server.ts`
- SolidStart: `solidstart/src/utils/obfuscator.ts`
- Astro: `astro/src/middleware.ts`
- Vue: `vue/main.ts`
- Express: `express/src/index.ts`
- Fastify: `fastify/src/index.ts`
- Hono: `hono/src/index.ts`

補助PUAは実験的オプションです。対象ブラウザで表示検証してから本番投入してください。
