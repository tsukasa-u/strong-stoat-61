# Next.js Example

Minimal App Router project.

## Run

```bash
pnpm install
pnpm dev
```

Open `/protected` to see the HTML route wrapped by the adapter.

`/protected` is intentionally a Route Handler (Request/Response) example and returns static HTML.
Interactive UI patterns are shown in `app/page.tsx` for framework ergonomics only.
Client-side state updates in `app/page.tsx` are not an obfuscation guarantee.
Numeric counters are intentionally omitted from `app/page.tsx`; prefer string/object state and server-issued obfuscated transitions for protected dynamic values.
