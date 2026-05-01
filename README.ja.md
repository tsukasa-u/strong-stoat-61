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
5. [React/Vue/Astro/Solid/Hono での適用](#reactvueastrosolidhono-での適用)
6. [GitHub Pages を考慮した構成](#github-pages-を考慮した構成)
7. [最小導入例](#最小導入例)
8. [限界と注意](#限界と注意)
9. [テスト](#テスト)
10. [ランタイム選定: Node/pnpm](#ランタイム選定-nodepnpm)
11. [トラブルシュート: Cannot find module](#トラブルシュート-cannot-find-module)
12. [Examples の見方](#examples-の見方)

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

### 4) HTML注入

`obfuscateHtml()` が次を注入します。

- `@font-face` と対象セレクタへのフォント適用
- base64+xor で埋め込んだマッピング
- 対象テキストノードを書き換えるクライアントスクリプト

### 5) 動的DOM追従

- `observeMutations: true` のとき、`MutationObserver` で追加ノードにも適用

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

### `new FontObfuscator(options)`

- `fontUrl: string` (必須)
- `fontRoutePrefix?: string` (既定 `/_obf/font`)
- `sessionTtlMs?: number`
- `alphabet?: string[]`

### `await obfuscator.obfuscateHtml(html, options)`

- `selectors: string[]` (必須)
- `fontFamilyName?: string`
- `observeMutations?: boolean` (既定 `true`)
- `pageKey?: string`
- `clientFingerprint?: string`

### `await obfuscator.maybeHandleFontRequest(request)`

- フォント配信対象なら `Response`
- それ以外は `null`

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

### SvelteKit

- `withSvelteKitHandleObfuscation`

`handle({ event, resolve })` 形式に合わせた専用ラッパです。

## React/Vue/Astro/Solid/Hono での適用

- React / Vue / Solid:
  SSR層 (Next/Nuxt/SolidStart など) で最終 HTML レスポンスを触れるなら適用可能
- Astro:
  通常の `.astro` ページでは middleware が第一候補。endpoint ラップは局所用途向け
- Hono:
  `new Hono()` で定義した通常の app の fetch ハンドラを包むのが自然

注意:

- 完全CSRのみの構成でも動作は可能ですが、耐性はサーバー適用より弱くなります。

## GitHub Pages を考慮した構成

GitHub Pages は静的ホスティングのため、token付きフォント配信の実行環境にはなりません。

推奨構成:

1. GitHub Pages

- ドキュメント/静的説明ページを公開 (`docs/`)

1. 別の実行環境

- Node/Edge で難読化サーバーを運用

1. Pages からランタイムデモへリンク

このリポジトリには次を用意しています。

- `docs/index.html` (日英切替可能な静的ドキュメントページ)
- `.github/workflows/deploy-pages.yml` (Pages デプロイ)

## 最小導入例

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
  { selectors: [".secret"], observeMutations: true },
);
```

フォント配信分岐を明示する場合:

```ts
const fontRes = await obfuscator.maybeHandleFontRequest(req);
if (fontRes) return fontRes;
```

## 限界と注意

- 暗号学的保護ではない
- 高度な解析で復元される可能性はある
- OCR 対策は別途必要
- API設計・アクセス制御・監視との併用が前提

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
- `pnpm check`
- それでも残る場合は VS Code を再読み込み

## Examples の見方

このリポジトリには、すぐ動かすための実行エントリと、framework ごとの最小プロジェクト構成の両方があります。

- 全体一覧は [examples/README.ja.md](examples/README.ja.md) を参照してください。
- 即実行エントリは `pnpm verify:examples` で使うファイル群です。
- 最小プロジェクト構成は `examples/<framework>/package.json` を起点に `pnpm install` → `pnpm dev` で確認できます。
