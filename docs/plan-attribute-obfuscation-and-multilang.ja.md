# 属性値難読化 & 多言語対応改善 計画書

## 背景・問題提起

### 現在の実装（両言語span方式）の問題

言語切り替えを実現するために、各テキスト要素に日本語・英語の両方の `<span>` を埋め込んでいる。

```html
<!-- 現在 -->
<h1 class="secret">
  <span data-lang="ja"><!-- 難読化済みPUA --></span>
  <span data-lang="en" style="display:none"><!-- 難読化済みPUA --></span>
</h1>
```

**問題1: 開発体験（DX）の悪化**

テンプレートに同じ構造を2回書く必要がある。40箇所のテキストノードがすべて繰り返し構造になっている。

```typescript
// 現在のテンプレート記述
<h1 class="secret">
  <span data-lang="ja">${I18N.ja.title}</span>
  <span data-lang="en" style="display:none">${I18N.en.title}</span>
</h1>

// 理想のテンプレート記述
<h1 class="secret">${bi(I18N.ja.title, I18N.en.title)}</h1>
```

**問題2: クライアント描画効率**

| 観点 | 両言語span方式（現在） | data属性方式（提案） |
|------|------|------|
| DOMノード数 | 各テキストに2ノード（約80ノード増） | 通常（増加なし） |
| 転送HTMLサイズ | 日英両テキストが展開される（約1.5倍） | 属性値のみ追加（約1.2倍） |
| 初期パース | ブラウザが全言語分をパースしDOMに保持 | アクティブ言語のみDOMに存在 |
| 言語切り替え | `style.display` 変更のみ（reflow最小） | `textContent` 変更（minor reflow） |
| フォント参照 | 非表示spanもフォント解決処理が走る可能性 | アクティブ言語のみフォント処理 |

→ **パフォーマンス差は今回の規模では体感できるほどではないが、data属性方式が理論上正しい**。
→ **DX（開発体験）は明確にdata属性方式が優れている**。

---

## 改善方針

`data-obf-en` 属性に英語テキスト（平文）を格納 → ライブラリがサーバーサイドで難読化 → クライアントが `textContent` と入れ替え。

```html
<!-- 目標形式 -->
<h1 class="secret" data-obf-en="Protect text from scrapers">
  <!-- 難読化済みPUA（日本語） -->
</h1>
```

---

## HTMLエスケープについて

**結論：実質的に問題なし。**

PUA文字は Unicode U+E000–U+F8FF の範囲であり、HTML特殊文字（`&` U+0026、`<` U+003C、`>` U+003E、`"` U+0022）とは重複しない。PUA変換後のテキストを属性値にそのまま埋め込んでもパースが壊れることはない。

ただし、属性値の元テキストに `&amp;` 等のHTMLエンティティが含まれる場合は、デコード（→ `&`）してからPUA変換する必要がある。これは既存の `decodeNamedEntities=true` フラグで対応済み（`obfuscateUserVisibleAttributes` 内で使用中）。

---

## 実装計画

### Phase 1: ライブラリ拡張（`lib/fontObfuscator.ts`）

#### 1-1. `ObfuscateHtmlOptions` にオプション追加

```typescript
export interface ObfuscateHtmlOptions {
  selectors: string[];
  // ... 既存フィールド ...

  /**
   * HTML attribute names whose values should be PUA-encoded in addition to
   * the built-in set (placeholder, aria-label, aria-placeholder, title, alt).
   *
   * Typical use case: `["data-obf-en"]` to obfuscate a secondary language
   * stored as an attribute value for client-side language switching.
   *
   * @example
   * obfuscateHtml(html, {
   *   selectors: [".secret"],
   *   obfuscatedAttributes: ["data-obf-en"],
   * })
   */
  obfuscatedAttributes?: string[];
}
```

#### 1-2. `extractUserVisibleAttributeText` を拡張

```typescript
// 変更前
if (
  attr.nameLower === "placeholder" ||
  attr.nameLower === "aria-label" ||
  // ...
)

// 変更後
const BUILTIN_VISIBLE_ATTRS = new Set(["placeholder", "aria-label", "aria-placeholder", "title", "alt"]);

if (BUILTIN_VISIBLE_ATTRS.has(attr.nameLower) || extraAttrs.has(attr.nameLower)) {
  out += `${attr.value} `;
}
```

この関数のシグネチャ変更：

```typescript
function extractUserVisibleAttributeText(
  fragment: string,
  extraAttributes?: Set<string>,  // 追加
): string
```

#### 1-3. `obfuscateUserVisibleAttributes` を拡張

同様に `extraAttributes?: Set<string>` パラメータを追加し、カスタム属性も難読化対象にする。

#### 1-4. 内部パイプラインへの伝播

`obfuscatedAttributes` オプションが呼び出しチェーン全体に伝わるよう、以下の関数群に `extraAttributes` を追加：

- `extractTextDataFromSelectorScopeHtml()`
- `obfuscateSelectorScopeHtml()`
- `FontObfuscator.obfuscateHtml()`
- `FontObfuscator.precomputeHtml()`
- `FontObfuscator.getRotatingPrecomputedPage()`

#### 1-5. テスト追加（`tests/fontObfuscator.test.ts`）

```typescript
test("obfuscatedAttributes: data-obf-en attribute value is PUA-encoded", async () => {
  // ...
});

test("obfuscatedAttributes: data-obf-en value is not plaintext in output HTML", async () => {
  // ...
});
```

---

### Phase 2: `main.ts` テンプレート変更

#### 2-1. ヘルパー関数追加

```typescript
/**
 * Generates a bilingual text node that will be server-side obfuscated.
 * The initial language (ja) is the text content; the alternate language (en)
 * is stored in data-obf-en for client-side swap without plaintext exposure.
 */
function bi(ja: string, en: string): string {
  return `<span data-obf-en="${en}">${ja}</span>`;
}
```

#### 2-2. テンプレートの変更

```typescript
// 変更前（繰り返し構造・40箇所）
<h1 class="secret">
  <span data-lang="ja">${I18N.ja.title}</span>
  <span data-lang="en" style="display:none">${I18N.en.title}</span>
</h1>

// 変更後（ヘルパー使用・簡潔）
<h1 class="secret">${bi(I18N.ja.title, I18N.en.title)}</h1>
```

#### 2-3. `PAGE_SELECTORS` と `obfuscatedAttributes` に `data-obf-en` を追加

```typescript
const PAGE_SELECTORS = [".secret", "#secret", ".obf-target", ".obf-dynamic"];

// ライブラリ呼び出し時にカスタム属性難読化を指定
const page = await obfuscator.getRotatingPrecomputedPage(PAGE_HTML, PAGE_SELECTORS, {
  obfuscatedAttributes: ["data-obf-en"],
});
```

---

### Phase 3: クライアントサイド言語切り替え変更（`main.ts` script部）

```javascript
// 初期テキスト退避用（切り替え前の値を保持）
const obfJaStore = new WeakMap();

function applyLanguage(lang) {
  currentLang = lang;

  document.querySelectorAll("[data-obf-en]").forEach((el) => {
    if (lang === "en") {
      // ja テキスト（難読化済みPUA）を退避してから en に切り替え
      if (!obfJaStore.has(el)) obfJaStore.set(el, el.textContent);
      el.textContent = el.getAttribute("data-obf-en");
    } else {
      // ja に戻す
      const orig = obfJaStore.get(el);
      if (orig !== undefined) el.textContent = orig;
    }
  });

  document.documentElement.lang = lang;
  setLangButtons();
  setTimeout(refreshInspector, 0);
}
```

**なぜ `textContent` 代入でも安全か**：
- `el.getAttribute("data-obf-en")` の値はPUA文字（難読化済み）
- `el.textContent = [PUA文字]` でDOMに書き込まれるのはPUA文字のみ
- スクレイパーが `textContent` を読んでもPUA文字（意味不明な文字コード）しか得られない

---

## 実装前後の比較

### HTMLテンプレート（40箇所）

```
変更前: 3行 × 40箇所 = 120行
変更後: 1行 × 40箇所 =  40行
```

### クライアントJS

```
変更前: data-lang span の display トグル（applyLanguage は7行）
変更後: data-obf-en の textContent 入れ替え（applyLanguage は10行）
```

### セキュリティ

| 確認項目 | 両言語span方式（現在） | data属性方式（提案） |
|------|------|------|
| 初期ロード時のDOMに平文なし | ✅ | ✅ |
| 言語切り替え後のDOMに平文なし | ✅ | ✅（PUAのみ書き込み） |
| JS変数に平文なし | ✅ | ✅ |
| HTML属性値に平文なし | ✅ | ✅（ライブラリがPUA変換） |
| スクレイパーから保護 | ✅ | ✅ |

---

## 作業順序

```
[ ] Phase 1-1: ObfuscateHtmlOptions に obfuscatedAttributes 追加
[ ] Phase 1-2: extractUserVisibleAttributeText を拡張
[ ] Phase 1-3: obfuscateUserVisibleAttributes を拡張
[ ] Phase 1-4: 内部パイプラインへの伝播
[ ] Phase 1-5: テスト追加・確認（vitest pass）
[ ] Phase 2-1: bi() ヘルパー関数追加
[ ] Phase 2-2: HTMLテンプレート全40箇所を bi() に変換
[ ] Phase 2-3: getRotatingPrecomputedPage に obfuscatedAttributes 指定
[ ] Phase 3:   クライアントJSの applyLanguage() を textContent 方式に変更
[ ] 結合テスト: ローカルサーバーで日英切り替えが正しく機能することを確認
[ ] E2Eチェック: DOMに平文が一切ないことを検証
```

---

## 注意事項

- `bi()` ヘルパーが返す `<span>` は親要素の `class="secret"` の難読化スコープ内に入る。`bi()` 自体に `class="secret"` は不要。
- `WeakMap` を使うことでメモリリークを防ぐ（対象要素がDOMから削除されると自動的にGC対象になる）。
- `getRotatingPrecomputedPage` の現在のシグネチャを確認し、第3引数でオプションを渡せるか確認すること。渡せない場合は `precomputeHtml` の呼び出しパスを調整する。
