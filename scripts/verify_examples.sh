#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

verify_one() {
  local file="$1"
  local port="$2"
  local name="$3"
  pnpm exec tsx "$file" >/tmp/obf_${port}.log 2>&1 &
  local pid=$!

  local html=""
  for i in {1..500}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    html="$(curl -fsS "http://127.0.0.1:${port}/" 2>/dev/null || true)"
    if [[ -n "$html" ]]; then
      break
    fi
  done

  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  if [[ -z "$html" ]]; then
    echo "$name:NO_RESPONSE"
    return
  fi
  if [[ "$html" != *"@font-face"* ]]; then
    echo "$name:MISSING_FONT_FACE"
    return
  fi
  if [[ "$html" != *"_obf/font/"* ]]; then
    echo "$name:MISSING_FONT_ROUTE"
    return
  fi

  echo "$name:OK"
}

verify_one examples/fetch/main.ts 8003 fetch
verify_one examples/fetch/jsxExample.jsx 8014 fetch-jsx
verify_one examples/fetch/main.tsx 8015 fetch-tsx
verify_one examples/hono/main.ts 8001 hono
verify_one examples/next/main.ts 8010 next-adapter
verify_one examples/remix/main.ts 8011 remix-adapter
verify_one examples/astro/main.ts 8012 astro-adapter
verify_one examples/sveltekit/main.ts 8013 sveltekit-adapter
verify_one examples/react/main.tsx 8020 react
verify_one examples/vue/main.ts 8021 vue
verify_one examples/solid/main.tsx 8022 solid
