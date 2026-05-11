# SolidStart Example

Minimal SolidStart project layout.

Current integration target:

- route components in `src/routes`
- this directory shows the project shape readers would start from

Routing guidance mapping:

- `src/app.tsx` uses `@solidjs/router` + `FileRoutes` and aligns with Solid routing/navigation guidance.
- `src/routes` is the canonical place for route components and page-level state.

## Run

```bash
pnpm install
pnpm dev
```

This example already wires response transformation in `src/middleware.ts`.
Only server-rendered HTML transformed by middleware is obfuscated; client-side state updates after hydration are shown as plain text.
