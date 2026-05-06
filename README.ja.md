# Font Obfuscator (日本語版)

Language:

- 日本語 (このファイル)
- English: [README.md](README.md)

Font Obfuscator は、HTMLレスポンスに難読化処理を注入するライブラリです。

- 画面上では読める
- コピー結果や DOM 文字列は読みにくくなる

という状態を作り、機械的取得のコストを上げます。

## 目次

1. [仕組み](#仕組み)
2. [コピー耐性を維持する運用](#コピー耐性を維持する運用)
3. [Core API](#core-api)
4. [アダプタは何をしているか](#アダプタは何をしているか)
5. [React/Vue/Astro/Solid/Hono/Bun/Cloudflare Workers での適用](#reactvueastrosolidhonobuncloudflare-workers-での適用)
6. [最小導入例](#最小導入例)
7. [限界と注意](#限界と注意)
8. [テスト](#テスト)
9. [ランタイム選定: Node/pnpm](#ランタイム選定-nodepnpm)
10. [トラブルシュート: Cannot find module](#トラブルシュート-cannot-find-module)
11. [Examples の見方](#examples-の見方)

## 仕組み

### 1) フォント取得・解析

- `fontUrl` を取得
- WOFF2 (`wOF2`) は TTF に解凍
- `opentype.js` で解析

### 2) 文字 -> PUA への再マップ

- `alphabet` 内で、元フォントに存在するグリフだけを対象化
- `U+E000` 以降の PUA コードポイントを seed ベースでシャッフル割当

### 3) 難読化フォント生成

- 再割当済みグリフで新しい TTF を生成
- セッションごと token を発行し `fontRoutePrefix/<token>` で配信

### 4) HTML注入（サーバーサイドのみ）

`obfuscateHtml()`（または `servePrecomputed()`）はすべての処理をサーバー側で行います。

- 対象セレクタ内のテキストノードを PUA 文字に置換
- `@font-face` ルールとセレクタへのフォント適用を `<head>` に注入
- マッピングやデコードロジックはクライアントに一切送信しない

### 5) 動的な値（カウンター・価格）

[`preEncodeShuffled`](#preencodeShuffled) を使ってサーバーサイドで値の配列を事前エンコードします。
クライアントには PUA 文字列の配列とインデックスのみが届き、マッピングは渡されません。

## コピー耐性を維持する運用

本ライブラリは DRM ではありません。以下の運用が重要です。

1. サーバー側で適用

- SSR やレスポンス変換層で `obfuscateHtml` を実行

1. セッション短命化

- `sessionTtlMs` を短くして token の使い回しを減らす

1. 対象最小化

- `selectors` は守るべき箇所に限定

1. 平文漏えい経路の削減

- API/埋め込み JSON に平文を残さない

1. 防御の併用

- WAF、レート制限、Bot判定などを併用

1. `x-forwarded-for` の信頼境界を明確化

- 信頼できるリバースプロキシ/CDN 配下でのみ `x-forwarded-for` を信頼し、それ以外ではユーザー入力として扱う

現行実装のハードニング:

- フォントURLはワンタイムチケット
- フォントURLは短命TTL
- チケット署名は HMAC-SHA256
- インライン注入安全性のための selector 入力バリデーション

## Core API

### どのパターンを使うか

| シナリオ | パターン |
|---|---|
| シンプル・低トラフィック・完全動的 HTML | `obfuscateHtml()` |
| 静的 HTML テンプレート (Express, Fastify, Hono) | `precomputeHtml()` + `getRotatingPrecomputedPage()` + `servePrecomputed()` |
| 動的 SSR ボディ (Nuxt, SolidStart Nitro) | `precomputeMapping()` + `getRotatingMapping()` + `serveWithMapping()` |
| Next.js / Remix / Astro / SvelteKit / Hono / Bun / Cloudflare Workers | アダプタヘルパーを使用（[アダプタは何をしているか](#アダプタは何をしているか)を参照）|

### `new FontObfuscator(options)`

| オプション | 既定値 | 説明 |
|---|---|---|
| `fontUrl` | (必須) | 元フォント（TTF/WOFF2）の `http`/`https` URL |
| `fontRoutePrefix` | `/_obf/font` | フォントトークンエンドポイントのパスプレフィックス |
| `fontUrlTtlMs` | `30_000` | トークン有効期限（ms）。低速回線では延長を検討 |
| `fontDisplay` | `"block"` | `@font-face` の `font-display` 戦略 |
| `variantCount` | `1` | **全文字**への PUA バリアント数。頻度分析を無効化（[PUA バジェット](#pua-バジェット)参照）|
| `digitVariantCount` | `4` | 数字は `max(variantCount, digitVariantCount)` バリアントを割り当て |
| `mappingRotationIntervalMs` | `120_000` | PUA シャッフルマッピングのローテーション間隔（ms）|
| `alphabet` | ASCII + ひらがな + カタカナ + 全角 | スクランブル対象文字セット |
| `trustedProxies` | `undefined` | XFF 解析で信頼するリバースプロキシ IP リスト |
| `devMode` | `false` | マッピングされていない文字を示すパネルを表示 |
| `budgetPolicy` | `"legacy"` | PUA 予算超過時のポリシー: `"legacy"`（警告）/ `"adaptive"`（優雅な劇化＋フック）/ `"strict"`（throw）|
| `variantAllocator` | `"uniform"` | `"adaptive"` 時のバリアント配分戦略: `"uniform"`（均一）または `"class-weighted"`（文字種別重み）|
| `minPrimaryGuarantee` | `1` | `"adaptive"` 時に各文字へ保証する最小 PUA スロット数 |
| `onBudgetDegrade` | `undefined` | `"adaptive"` 時にバリアント予算が不足した際に呼び出されるコールバック（メトリクス収集用途等）|

### `await obfuscator.obfuscateHtml(html, { selectors })`

リクエストごとにフォントとマッピングを構築するオールインワン関数です。

- `selectors: string[]` — 必須。`.class` や `#id` 形式のセレクタ
- `fontFamilyName?: string` — CSS ファミリ名を上書き
- `pageKey?: string` — フォントチケットの名前空間（既定 `/`）
- `clientFingerprint?: string` — トークンをこのクライアントに紐付け
- `devMode?: boolean` — インスタンスレベルの devMode をこの呼び出しのみ上書き

### `await obfuscator.maybeHandleFontRequest(request)`

- フォント配信対象なら `Response`
- それ以外は `null`

### `await obfuscator.precomputeHtml(html, selectors)` → `PrecomputedPage`

マッピングを一度だけ構築します。結果をキャッシュし、リクエストごとに `servePrecomputed` を呼び出します。
`preEncodeShuffled` の配列を注入する場合は、キャッシュ前に `page.rawHtml` を書き換えてください。

```ts
const page = await obfuscator.precomputeHtml(BASE_HTML, [".secret"]);
const { encoded, indices } = preEncodeShuffled(values, page.mapping);
page.rawHtml = page.rawHtml
  .replace('var _pre=[]', `var _pre=${JSON.stringify(encoded)}`)
  .replace('_preIdx=[]',  `_preIdx=${JSON.stringify(indices)}`);
```

### `obfuscator.getRotatingPrecomputedPage(html, selectors, key?)` → `Promise<PrecomputedPage>`

`precomputeHtml` と同様ですが、`mappingRotationIntervalMs` 経過後に自動で再構築します。

### `await obfuscator.servePrecomputed(page, options?)` → `string`

`PrecomputedPage` にリクエストごとの新しいフォントチケットを注入します。
数字バリアントのシードを毎回変えるため、同一ローテーション内でも各レスポンスが異なって見えます。

### `await obfuscator.precomputeMapping(hintHtml?)` → `PrecomputedMapping`

最終的な HTML ボディなしで、安定したシード＋マッピングを構築します。
動的 SSR（Nuxt, SolidStart）向けです。

### `obfuscator.getRotatingMapping(hintHtml?)` → `Promise<PrecomputedMapping>`

`precomputeMapping` と同様ですが自動ローテーションします。**リクエストごとに呼び出してください。**

### `await obfuscator.serveWithMapping(html, selectors, mapping, options?)` → `string`

プリコンピューティングされたマッピングで `html` を PUA エンコードし、新しいフォントチケットを注入します。

### `encodeText(text, mapping, options?)`

単一文字列をサーバーサイドで PUA 文字にエンコードします。

### `preEncodeShuffled(values, mapping, options?)`

値の配列をシャッフル位置とデコイエントリ付きで事前エンコードします。

## アダプタは何をしているか

すべて共通で、以下の処理です。

1. `maybeHandleFontRequest` を先に判定
2. 元ハンドラを実行して `Response` 取得
3. `content-type` が `text/html` のときのみ注入
4. 非HTMLはそのまま返す

### 汎用

- `withFetchObfuscation`
- `obfuscateHtmlResponse`

### Next / Remix / Astro

- `withNextRouteHandlerObfuscation`
- `withRemixRequestHandlerObfuscation`
- `withAstroEndpointObfuscation`

上記は fetch 互換ラッパの別名です。

### Hono

- `withHonoObfuscation`

これも fetch 互換ラッパの別名です。
`Request -> Response` を扱うミドルウェア層に適用します。

### Bun / Cloudflare Workers / Deno

- `withFetchObfuscation`

これらのランタイムは Fetch ネイティブなので、汎用 fetch アダプタをそのまま使えます。
- Bun: `Bun.serve({ fetch: handler })`
- Cloudflare Workers: `export default { fetch: handler }`
- Deno: `Deno.serve(handler)`

### SvelteKit

- `withSvelteKitHandleObfuscation`

`handle({ event, resolve })` 形式に合わせた専用ラッパです。

## React/Vue/Astro/Solid/Hono/Bun/Cloudflare Workers での適用

- React / Vue / Solid:
  SSR層 (Next/Nuxt/SolidStart など) で最終 HTML レスポンスを触れるなら適用可能
- Astro:
  通常の `.astro` ページでは middleware が第一候補。endpoint ラップは局所用途向け
- Hono:
  `new Hono()` で定義した通常の app の fetch ハンドラを包むのが自然
- Bun:
  `Bun.serve()` にラップ済み fetch ハンドラを渡す形が最もシンプル
- Cloudflare Workers:
  `export default { fetch }` で適用。メモリ状態は isolate ごとに分離される点に注意

注意:

- 完全CSRのみの構成でも動作は可能ですが、耐性はサーバー適用より弱くなります。

## 最小導入例

### 汎用 fetch 互換

```ts
import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";

const obfuscator = new FontObfuscator({
  fontUrl: "https://.../NotoSansCJKjp-Regular.otf",
  fontRoutePrefix: "/_obf/font",
});

const handler = withFetchObfuscation(
  async () => new Response("<html><head></head><body><p class='secret'>Hello</p></body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  }),
  obfuscator,
  { selectors: [".secret"] },
);
```

### フォントエンドポイントの明示分岐

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## 限界と注意

- 暗号学的保護ではない
- 高度な解析で復元される可能性はある
- OCR 対策は別途必要
- API設計・アクセス制御・監視との併用が前提

### PUA バジェット

BMP 私用領域は **6,400 コードポイント**（U+E000–U+F8FF）を持ちます。  
消費スロット数 = `ユニーク文字数 × variantCount`（数字は `max(variantCount, digitVariantCount)`）。  

| シナリオ | 文字数 | `variantCount` | 消費スロット |
|---|---|---|---|
| デフォルト、既定値 | 紏333 | 1（数字の㑳4） | 紏393 |
| デフォルト、`variantCount: 4` | 紏333 | 4 | 紏1,332 |
| + 漢字500字、`variantCount: 4` | 紏833 | 4 | 紏3,332 |
| 常用漢字全部、`variantCount: 4` | 紏2,469 | 4 | 紏9,876 ← **超過** |

漢字が多いページで高バリアント数を使う場合は `variantCount: 2` か、ローテーション間隔を短くする方法を推奨します。

#### バジェット超過ポリシー

`budgetPolicy` でバジェット超過時の挙動を制御できます。

```ts
// "legacy" （デフォルト）: 超過時に console.warn。既存の挙動を維持
new FontObfuscator({ fontUrl, budgetPolicy: "legacy" });

// "adaptive": 各文字のプライマリスロットを必ず保証。予算を超えたバリアント分は剤複。
// プレーンテキストの漏洩はなし
new FontObfuscator({
  fontUrl,
  budgetPolicy: "adaptive",
  variantAllocator: "class-weighted", // 数字・通貨記号により多く割り当て
  onBudgetDegrade: (e) => console.log(
    `バリアント不足: ${e.variantShortfall}/${e.totalChars} 文字`,
  ),
});

// "strict": 概算スロットが不足する場合はコンストラクタで throw
new FontObfuscator({ fontUrl, budgetPolicy: "strict", variantCount: 2 });
```

**`variantAllocator` 戦略**（`budgetPolicy: "adaptive"` 時のみ有効）：

| 戦略 | 説明 |
|---|---|
| `"uniform"` | 全文字に均一に `variantCount` スロットを配分（デフォルト）|
| `"class-weighted"` | 数字・通貨記号・ラテン文字に静的重みでより多く配分 |
| `"frequency-weighted"` | 将来のリリースで対応予定。現在は `"uniform"` にフォールバック |

## テスト

```bash
pnpm check
pnpm test
```

テスト対象:

- Core 動作
- Adapter 動作 (Next/Remix/Astro/Hono/SvelteKit)
- HTML のみ注入されること
- 無効 token のハンドリング
- unsafe selector の拒否
- 強い署名形式 (`sig` が 64 hex)

## ランタイム選定: Node/pnpm

このリポジトリは Node/pnpm ファーストに移行しました。

移行理由:

- 一般的な TypeScript/Node 開発環境で警告が出にくい
- 本番の Node 中心スタックと合わせやすい
- `pnpm` による依存管理とスクリプト実行が明確

実運用の推奨:

- ローカル開発・テスト・サンプル実行は `pnpm` スクリプトを利用
- 既存の Node フレームワーク層で adapter を適用
- adapter は fetch 互換設計なので構成は維持しやすい

## トラブルシュート: Cannot find module

VS Code で `Cannot find module ...` が出る場合は、
依存未インストールか TypeScript サービスのキャッシュが原因であることが多いです。

確認手順:

- `pnpm install`
- `pnpm build`
- `pnpm check`
- それでも残る場合は VS Code を再読み込み

## Examples の見方

このリポジトリには、すぐ動かすための実行エントリと、framework ごとの最小プロジェクト構成の両方があります。

- 全体一覧は [examples/README.ja.md](examples/README.ja.md) を参照してください。
- 即実行エントリは `pnpm verify:examples` で使うファイル群です。
- 最小プロジェクト構成は `examples/<framework>/package.json` を起点に `pnpm install` → `pnpm dev` で確認できます。
- サンプルコード内の import は `import { ... } from "font-obfuscator"` に統一しています。
