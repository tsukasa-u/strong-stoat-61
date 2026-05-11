# Examples

This directory contains practical integration samples.

## Quick Use

1. Build once from repository root:

```bash
pnpm build
```

2. Run full smoke verification:

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

For hydration-based frameworks (Next/Nuxt/Remix):

- `/` is interactive UI state demo
- `/protected` is obfuscated HTML demo
