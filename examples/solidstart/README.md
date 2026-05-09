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

If you want full HTML response obfuscation in SolidStart, the next step is wiring the adapter into the server rendering pipeline used by your chosen SolidStart deployment target.
