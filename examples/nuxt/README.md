# Nuxt Example

Minimal Nuxt project layout.

Integration style:

- interactive state demo page in `app.vue`
- protected obfuscation page in `server/routes/protected.get.ts`
- Nitro middleware for font endpoint
- Nitro render hook for HTML post-processing

Important:

- `/` is hydration-first UI and state ergonomics demo.
- `/protected` is the copy-resistance demo route.
- Keep `.secret` on server-rendered protected HTML, not hydration-managed dynamic state.

## Run

```bash
pnpm install
pnpm dev
```

Then open:

- `http://127.0.0.1:3001/` for interactive UI state demo
- `http://127.0.0.1:3001/protected` for obfuscated HTML response demo
