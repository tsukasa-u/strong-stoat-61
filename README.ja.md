# Font Obfuscator

Language:

- 日本語 (このファイル)
- English: [README.md](README.md)

Font Obfuscator は、サーバーサイドHTML難読化ライブラリです。
選択テキストをPUAへ再マップし、ワンタイムフォントチケットを注入することで、
画面表示を維持しながら生テキスト抽出の難易度を上げます。

## 最短導入

1. インストール

```bash
pnpm add font-obfuscator
```

2. HTMLレスポンスハンドラをラップ

```ts
import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansJP[wght].ttf",
  fontRoutePrefix: "/_obf/font",
});

const handler = withFetchObfuscation(
  async () =>
    new Response("<html><head></head><body><p class='secret'>Hello</p></body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  obfuscator,
  { selectors: [".secret"] },
);
```

3. アダプタを使わない場合はフォントリクエストを先に処理

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## どこを難読化するか

- 機密性のあるサーバー描画テキストだけを `selectors` で指定
- 通常のアプリ状態はフレームワーク標準の状態管理で扱う
- hydration後や client-side DOM 更新後のクライアント表示を難読化保証として扱わない

## 主要API

- `new FontObfuscator(options)`
- `obfuscateHtml(html, { selectors })`
- `maybeHandleFontRequest(request)`
- `precomputeHtml()` + `servePrecomputed()`（テンプレートキャッシュ向け）
- `precomputeMapping()` + `serveWithMapping()`（動的SSR向け）

## アダプタ

- 汎用Fetch: `withFetchObfuscation`, `obfuscateHtmlResponse`
- Next.js: `withNextRouteHandlerObfuscation`
- Remix: `withRemixRequestHandlerObfuscation`
- Astro: `withAstroEndpointObfuscation`
- SvelteKit: `withSvelteKitHandleObfuscation`
- Hono: `withHonoObfuscation`

## 注意

- DRMではなく抽出コストを上げる仕組みです。
- サーバー描画HTMLに適用してください。
- TTLを短めにし、APIや埋め込みJSONへの平文残存を避けてください。

## サンプル

[examples/README.ja.md](examples/README.ja.md) を参照してください。

- Next/Nuxt/Remix は `/` をインタラクティブデモ、`/protected` を難読化HTML確認に分離しています
- Astro は `/` を client-side DOM 更新デモ、`/counter` と `/pre-encoded` を難読化HTML確認に分離しています
- Vue サンプルは SSR-only です

## ローカル検証

```bash
pnpm build
pnpm verify:examples
pnpm exec tsx scripts/playwright-browser-test.ts
```
