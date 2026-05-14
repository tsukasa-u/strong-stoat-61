# Astro Example

Minimal Astro project layout using middleware, which is the preferred integration point for regular `.astro` pages.

Routes in this sample:

- `/`: interactive client-side DOM update demo shown as plain text
- `/pre-encoded`: obfuscated server-rendered pre-encoded state example

Note:

- `main.ts` is not part of Astro file-based routing. It is a repository-level runnable adapter entry used by `pnpm verify:examples`.
- Client-side DOM updates after the initial response are outside the server-side obfuscation guarantee.
- Numeric counters are intentionally omitted because client-side arithmetic makes those relationships too obvious.

## Run

```bash
pnpm install
pnpm dev
```
