#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Examples import the package name (font-obfuscator), so ensure dist/ exists.
pnpm build >/dev/null

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

verify_source_example() {
  local file="$1"
  local name="$2"

  if ! grep -q 'from "font-obfuscator"' "$file"; then
    echo "$name:MISSING_PACKAGE_IMPORT"
    return
  fi
  if ! grep -q "withFetchObfuscation" "$file"; then
    echo "$name:MISSING_FETCH_ADAPTER"
    return
  fi
  if ! grep -q "selectors: \[\".secret\"\]" "$file"; then
    echo "$name:MISSING_SELECTOR"
    return
  fi
  if ! grep -q "fontRoutePrefix: \"/_obf/font\"" "$file"; then
    echo "$name:MISSING_FONT_ROUTE"
    return
  fi

  echo "$name:OK"
}

verify_bun_runtime_optional() {
  # Bun runtime check is optional for local dev machines; CI enables Bun.
  if ! command -v bun >/dev/null 2>&1; then
    echo "bun:RUNTIME_SKIPPED"
    return
  fi

  pushd examples/bun >/dev/null
  bun run main.ts >/tmp/obf_bun_runtime.log 2>&1 &
  local pid=$!
  popd >/dev/null

  local html=""
  for i in {1..500}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    html="$(curl -fsS "http://127.0.0.1:3000/" 2>/dev/null || true)"
    if [[ -n "$html" ]]; then
      break
    fi
  done

  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  if [[ -z "$html" ]]; then
    echo "bun_runtime:NO_RESPONSE"
    return
  fi
  if [[ "$html" != *"@font-face"* ]]; then
    echo "bun_runtime:MISSING_FONT_FACE"
    return
  fi
  if [[ "$html" != *"_obf/font/"* ]]; then
    echo "bun_runtime:MISSING_FONT_ROUTE"
    return
  fi

  echo "bun_runtime:OK"
}

verify_workers_typecheck() {
  pnpm --dir examples/cloudflare-workers exec tsc --noEmit worker.ts >/tmp/obf_workers_tsc.log 2>&1
  echo "cloudflare-workers-tsc:OK"
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

verify_source_example examples/bun/main.ts bun
verify_source_example examples/cloudflare-workers/worker.ts cloudflare-workers
verify_workers_typecheck
verify_bun_runtime_optional
