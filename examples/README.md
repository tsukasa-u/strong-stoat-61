# Examples

This directory contains practical integration samples.

## Quick Use

1. Build once from repository root:

```bash
pnpm build
```

1. Run full smoke verification:

```bash
pnpm verify:examples
pnpm exec tsx scripts/playwright-browser-test.ts
```

## Framework Examples

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

## Important Boundary

Obfuscation applies to server-rendered HTML transformed by middleware/adapters.

When hydration or client-side DOM updates happen after the initial response, those updates are outside the server-side obfuscation guarantee.
Interactive samples intentionally avoid numeric counters because client-side arithmetic makes those relationships too easy to infer.

- Next/Nuxt/Remix: `/` is the interactive UI/state demo and `/protected` is the obfuscated HTML demo
- Astro: `/` is the client-side DOM update demo, while `/pre-encoded` is the obfuscated HTML demo
- Vue: this sample is SSR-only and does not hydrate client state

## Enabling Supplementary PUA

Examples use the default `puaPlaneMode: "bmp"` (6400 slots).
If your character set is large and you hit PUA capacity limits, set `puaPlaneMode: "bmp+supplementary"` (137468 slots) where each example creates `FontObfuscator`.

```ts
const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansJP[wght].ttf",
  fontRoutePrefix: "/_obf/font",
  puaPlaneMode: "bmp+supplementary",
});
```

Main integration points:

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

Supplementary mode is experimental. Validate rendering on target browsers before production rollout.
