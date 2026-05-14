# Remix Example

Minimal Remix project.

Integration style:

- interactive state demo page: `/`
- protected obfuscation page: `/protected`
- server-side response transformation: `app/entry.server.tsx`

Important:

- `/` is hydration-first UI and state ergonomics demo.
- `/protected` is the copy-resistance demo route.
- Keep `.secret` on server-rendered protected HTML, not hydration-managed dynamic state.
- Numeric counters are intentionally omitted from `/`; prefer string/object state and server-issued obfuscated transitions for protected dynamic values.

## Run

```bash
pnpm install
pnpm dev
```

Then open:

- `http://127.0.0.1:8011/` for interactive UI state demo
- `http://127.0.0.1:8011/protected` for obfuscated HTML response demo
