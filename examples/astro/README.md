# Astro Example

Minimal Astro project layout using middleware, which is the preferred integration point for regular `.astro` pages.

Canonical Astro app files in this directory:

- `src/pages/index.astro`
- `src/middleware.ts`

Note:

- `main.ts` is not part of Astro file-based routing. It is a repository-level runnable adapter entry used by `pnpm verify:examples`.

## Run

```bash
pnpm install
pnpm dev
```
