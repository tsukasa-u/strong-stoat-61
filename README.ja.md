# PUA Font Obfuscator

Language:

- 日本語 (このファイル)
- English: [README.md](README.md)

PUA Font Obfuscator は、サーバーサイドHTML難読化ライブラリです。
選択テキストをPUAへ再マップし、ワンタイムフォントチケットを注入することで、
画面表示を維持しながら生テキスト抽出の難易度を上げます。

## 最短導入

### Step 1: インストール

```bash
pnpm add pua-font-obfuscator
```

### Step 2: HTMLレスポンスハンドラをラップ

```ts
import { FontObfuscator, withFetchObfuscation } from "pua-font-obfuscator";

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

### Step 3: アダプタを使わない場合はフォントリクエストを先に処理

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## どこを難読化するか

- 機密性のあるサーバー描画テキストだけを `selectors` で指定
- 通常のアプリ状態はフレームワーク標準の状態管理で扱う
- hydration後や client-side DOM 更新後のクライアント表示を難読化保証として扱わない
- 動的な状態遷移は設計上の境界として扱ってください。機密な状態値を扱う場合は、サーバー側で次状態を計算し、クライアントには難読化済み文字列だけを返す構成にしてください。
- クライアント側の状態更新は UX のための非機密状態に限定し、初期HTMLを難読化したことを理由にクライアント遷移まで保護されるとみなさないでください。

## APIガイド（用途別）

一覧を覚えるより、用途ごとに選ぶ方が分かりやすいように整理しています。

### 1) まず使う基本API

- `new FontObfuscator(options)`
用途: 難読化インスタンスを作る。
- `obfuscateHtml(html, { selectors })`
用途: 1回限りのHTML難読化。
- `maybeHandleFontRequest(request)`
用途: `/_obf/font/...` のフォントチケット要求を先に処理する。

### 2) 静的テンプレートを高速配信したい

- `precomputeHtml(html, { selectors })`
用途: テンプレートを事前計算。
- `servePrecomputed(precomputedPage, options?)`
用途: リクエストごとにチケットだけ差し替えて返す。

### 3) 動的SSR（ページ本文が毎回変わる）

- `precomputeMapping(hintHtml?)`
用途: 文字マッピングだけ事前生成。
- `getRotatingMapping(hintHtml?)`
用途: ローテーション付きでマッピングを取得。
- `serveWithMapping(html, selectors, precomputedMapping, options?)`
用途: 毎回生成したHTMLを、同じマッピングで難読化して返す。

### 4) 辞書や状態データを難読化して埋め込みたい

- `encodeText(text, mapping, options?)`
用途: 単一文字列を難読化。
- `preEncodeShuffled(values, mapping, options?)`
用途: 値配列をシャッフル+デコイ混在で事前難読化。
- `obfuscateDictionary(dict, mapping, options?)`
用途: フラットな辞書（`Record<string, string>`）の値を難読化。
- `obfuscateI18nDictionary(dictionaries, mapping, options?)`
用途: `ja/en` など多言語辞書の値をまとめて難読化。
- `obfuscateStringLeaves(state, mapping, options?)`
用途: JSON-like状態の「文字列leafだけ」を難読化（数値/真偽値は保持）。

`obfuscateStringLeaves` は数値や真偽値をそのまま残します。クライアントから見える数値状態やカウンタを保護対象として扱うのは推奨しません。数値遷移を守りたい場合は、サーバー側で次状態を計算し、次の難読化済み文字列だけを返してください。

既存のi18n辞書・状態構造を保ったまま、クライアントへ渡す値だけを難読化したい場合に使います。

```ts
import {
  FontObfuscator,
  obfuscateI18nDictionary,
  obfuscateStringLeaves,
} from "pua-font-obfuscator";

const obfuscator = new FontObfuscator({ fontUrl: "https://.../font.ttf" });
const pm = await obfuscator.getRotatingMapping("<p>hint text</p>");

const obfI18n = obfuscateI18nDictionary(
  {
    ja: { title: "こんにちは" },
    en: { title: "Hello" },
  },
  pm.mapping,
  { variants: pm.variants, variantSeed: pm.seed },
);

const obfState = obfuscateStringLeaves(
  { status: "idle", phase: "review", labels: ["Start", "Done"] },
  pm.mapping,
  { variants: pm.variants, variantSeed: pm.seed },
);
```

### 5) フレームワークのレスポンスをラップしたい

- `obfuscateHtmlResponse(response, obfuscator, options)`
用途: 既存Responseを後段で難読化。
- `withFetchObfuscation(...)`
用途: 汎用Fetchハンドラをラップ。
- `withNextRouteHandlerObfuscation(...)`
用途: Next.js Route Handler向け。
- `withRemixRequestHandlerObfuscation(...)`
用途: Remix loader/action/handler向け。
- `withAstroEndpointObfuscation(...)`
用途: Astro endpoint向け。
- `withSvelteKitHandleObfuscation(...)`
用途: SvelteKit `handle` 向け。
- `withHonoObfuscation(...)`
用途: Hono handler向け。

公開されている型（`FontObfuscatorOptions` など）は TypeScript で補完されます。
完全なexport一覧を確認したい場合は `lib/index.ts` を参照してください。

## PUA容量モード

`FontObfuscator` は `puaPlaneMode` で PUA の使用範囲を選べます。

- `bmp`（既定）: BMP PUA のみ（6400）
- `bmp+supplementary`: 補助PUA（Plane 15/16）を含む（137468）

```ts
const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansJP[wght].ttf",
  fontRoutePrefix: "/_obf/font",
  puaPlaneMode: "bmp+supplementary",
});
```

補助PUAは実験的オプションです。対象デバイスで表示検証してから本番投入してください。

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
- 動的な値を守りたい場合、クライアントから見える数値カウンタや算術ベースの状態は避け、サーバーから次の難読化済み文字列を返してください。
- この注意は数値以外の状態にも当てはまります。status/flag/label なども、クライアント側で計算・露出すると遷移パターンの漏えいにつながる可能性があります。

## サンプル

[examples/README.ja.md](examples/README.ja.md) を参照してください。

- Next/Nuxt/Remix は `/` をインタラクティブデモ、`/protected` を難読化HTML確認に分離しています
- Astro は `/` を client-side DOM 更新デモ、`/pre-encoded` を難読化HTML確認に分離しています
- Vue サンプルは SSR-only です

## ローカル検証

```bash
pnpm build
pnpm verify:examples
pnpm exec tsx scripts/playwright-browser-test.ts
```

## Deno Deploy向けメモ

Deno Deployで examples 配下のworkspace依存までインストールしないように、リポジトリ直下に次の設定を置いてください。

```ini
recursive-install=false
```

その上で、Deno DeployのInstall commandは次を指定します。

```bash
pnpm install --frozen-lockfile
```
