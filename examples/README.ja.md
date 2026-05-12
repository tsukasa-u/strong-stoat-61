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
