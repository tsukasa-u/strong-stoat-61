# PUA容量調査レポート（内部開発者向け）

作成日: 2026-05-04
対象: Font Obfuscator の文字割り当て戦略（PUA上限、衝突回避、将来拡張）

注記（2026-05-06）:
- 実装コード上では Phase A（budgetPolicy/adaptive allocator）および Phase B（frequency-weighted allocator）は実装済み。
- 本文後半のチェックリストは計画時点の記録を含むため、実装完了状況の一次情報としては tests と README を優先すること。

## 1. 目的

本資料は、次の判断をチーム内で共有するための内部向け技術ドキュメントである。

- BMP PUA（U+E000-U+F8FF、6400枠）だけで運用可能か
- overflow（割り当て枠不足）が現実運用でどの程度起こるか
- どの条件を fail-fast（即時失敗）にすべきか
- 将来拡張（特に補助PUA活用）の実装可能性と設計上の論点

本資料は外部公開向けではないため、出典リンクではなく検証結果と設計判断を中心に記載する。

## 2. 要約（結論）

- 一般的な記事ページでは、ユニーク漢字数はおおむね 6400 未満に収まりやすい。
- ただし、辞書データ、行政文字基盤、文字一覧系UIでは 6400 超過は現実的かつ頻出である。
- よって、ライブラリは「利用者の事前計算」を前提にせず、内部で自動的に安全側へ倒すべきである。
- 将来は補助PUA（Plane 15/16）対応で収容力を大幅に伸ばせるが、フォント生成とレンダリング互換の検証コストが高いため段階導入が妥当である。

## 3. 調査アプローチ

今回の判断は、以下を組み合わせて行った。

1. Unicodeブロック容量の機械計算
2. 公開テキストページの実測（ユニーク漢字数）
3. 辞書データ（KANJIDIC2）の実測
4. 行政・人名系文字集合の規模情報の確認

## 4. 容量の基礎事実

### 4.1 BMP PUA容量

- BMP PUA: 6400 code points
- 現行実装の主要制約はこの6400枠

### 4.2 CJK側の規模（比較対象）

Unicodeブロックの計算結果（実行ログ値）:

| ブロック | 文字数 |
|---|---:|
| PUA BMP | 6400 |
| CJK Unified Ideographs | 20992 |
| CJK Ext A | 6592 |
| CJK Ext B | 42720 |
| CJK Ext C | 4160 |
| CJK Ext D | 224 |
| CJK Ext E | 5776 |
| CJK Ext F | 7488 |
| CJK Ext G | 4944 |
| CJK Ext H | 4192 |
| CJK Ext I | 624 |
| CJK Ext J | 4304 |

重要点:

- Ext A 単体でも 6592 であり、BMP PUA 6400 を超える。
- 「漢字を広く扱う」運用では、BMP PUA限定は構造的に窮屈。

## 5. 実測結果（今回セッション）

### 5.1 一般ページ系の粗測定

対象ページの HTML 由来ユニーク漢字数（概算）:

- 日本関連ページ: 約1456
- 常用漢字一覧ページ: 約2640
- 漢字解説ページ: 約2225

示唆:

- 一般記事や通常コンテンツは 6400 を超えにくい。
- ただし「一覧」「辞典」「表形式」に近づくほど上振れしやすい。

### 5.2 辞書データ測定（KANJIDIC2）

計測結果:

- entries: 13108
- unique literal: 12158

示唆:

- 辞書系では 6400 超過が明確。
- しかも超過幅が大きく、variant運用の余地はほぼない。

### 5.3 行政・人名系規模情報

確認した規模感:

- 常用漢字: 2136
- 人名系集合を含めた運用文字はさらに拡大
- 戸籍統一文字・MJ文字系は数万規模

示唆:

- 行政・戸籍・人名照合ユースケースでは、BMP PUAのみで「全対象にバリアント付与」は実質不可能。

## 6. overflowの定義と危険度

### 6.1 消費モデル

必要スロットの近似:

$$
required \approx \sum_{c \in chars} variants(c)
$$

全体variant一定（v）なら概ね:

$$
required \approx uniqueChars \times v
$$

### 6.2 overflowを2種類に分ける

1. 重大overflow（平文リスク）
- 1文字1枠すら確保できない
- マッピングできない文字が発生し、実装次第で平文通過リスク
- 対応: 即時失敗（throw）

2. 軽度overflow（強度低下）
- 1文字1枠は確保できる
- 追加variantだけ不足
- 対応: 自動縮退 + 明示警告（またはメトリクス）

## 7. 運用ポリシー提案（実装方針）

### 7.1 必須不変条件

- 未マップ文字を平文で素通りさせない
- 衝突（二重割当）を許可しない
- 予算不足時は安全側（失敗 or 縮退）へ必ず倒す

### 7.2 推奨モード

- strict:
  - 予算不足を起動時/構築時エラー
  - セキュリティ優先の本番向け
- adaptive（推奨デフォルト候補）:
  - 1枠/文字を保証
  - 余剰分のみvariant配分
  - 低下分はログ/メトリクス化
- legacy:
  - 既存互換のため限定提供
  - 新規プロジェクトには非推奨

## 8. 将来拡張（詳細）

本章は、実装前の設計レビュー用に詳細化している。

### 8.1 拡張の主軸

主軸は次の3段階。

1. BMP PUA最適化（短期）
2. 補助PUA対応（中期）
3. ハイブリッド配分 + 運用制御（中長期）

---

### 8.2 短期: BMP内での最適化

#### 8.2.1 目的

- 既存互換を崩さず、同じ6400枠で実効強度を最大化する。

#### 8.2.2 実装要素

- variant要求値を「希望値」として扱う
- まず全対象へ primary 1枠を配分
- 残枠を頻度重みで追加variant配分
- 文字種別重み（数字、通貨、識別子）を設定可能化

#### 8.2.3 利点

- 既存レンダリング互換を維持
- 実装差分が小さい

#### 8.2.4 限界

- 6400上限そのものは変わらない
- 辞書・行政系には不十分

---

### 8.3 中期: 補助PUA（Plane 15/16）活用

#### 8.3.1 期待効果

- 追加収容枠: 131068
- BMP 6400 と合わせて約137k規模へ拡張可能
- 大規模集合でも primary+variant 併用余地が現実化

#### 8.3.2 主要技術論点

1. UTF-16サロゲート対応
- JavaScript文字列長、slice、regexの取り扱い差異
- code pointベース処理に統一する必要

2. フォント生成系の対応
- 補助面コードポイントへの cmap 生成可否
- 変換経路（TTF/WOFF2）での欠落や正規化崩れ

3. レンダリング互換
- OS/ブラウザ組み合わせでPUA supplementary表示検証
- fallback時の想定外フォント混入確認

4. コピー・選択動作
- サロゲートペアが選択単位に与える影響
- クリップボードの正規化有無

5. パフォーマンス
- フォントサイズ増加
- 初回表示遅延（特にモバイル）

#### 8.3.3 設計案

- defaultはBMP専用のまま維持
- `puaPlaneMode`（例: `bmp` / `bmp+supplementary`）で opt-in
- 実行時 capability check を持たせ、非対応環境では自動的にBMP縮退

#### 8.3.4 互換性リスク管理

- feature flagで段階展開
- Canary環境でUA別エラーレート収集
- 異常時は即時ロールバック可能な設定駆動にする

---

### 8.4 中長期: ハイブリッド配分戦略

#### 8.4.1 目的

- 大規模文字集合と可読性・性能のバランスを両立

#### 8.4.2 案A: 二層割当

- 高頻度文字: BMP PUA優先（高速・安定）
- 低頻度文字: 補助PUAへ配置

期待効果:

- 体感性能を維持しつつ総容量を拡張

#### 8.4.3 案B: ページ/領域分割

- セレクタごとに別マップ・別フォントを使用
- 1フォント当たりの収容負荷を分散

注意点:

- `@font-face` 増加によるCSS管理複雑化
- ネットワークリクエスト増

#### 8.4.4 案C: 目的別variant配分

- 数字、価格、IDなど解析価値が高い文字に多め配分
- 文章本体は最小variantで抑制

期待効果:

- 同じ枠数でも攻撃コスト上昇効率が高い

---

### 8.5 API設計の拡張案

互換性を保ちながら導入するため、以下の新オプションを想定。

- `budgetPolicy`: `strict` | `adaptive` | `legacy`
- `puaPlaneMode`: `bmp` | `bmp+supplementary`
- `variantAllocator`: `uniform` | `frequency-weighted` | `class-weighted`
- `minPrimaryGuarantee`: boolean（既定 true）
- `onBudgetDegrade`: hook（メトリクス送出用）

設計原則:

- 既定値は安全側
- opt-inで高度化
- 既存利用者の挙動を破壊しない

---

### 8.6 テスト戦略（将来拡張向け）

#### 8.6.1 正しさ

- 重複割当なし
- 未マップ文字なし（strict/adaptiveで条件別）
- variant下限保証

#### 8.6.2 互換性

- Node/Deno/Bun で同一結果性
- ブラウザ別レンダリング差分
- WOFF2変換往復でのcmap維持

#### 8.6.3 耐障害性

- 予算超過入力の大量テスト
- 異常フォント入力
- 長時間ローテーション運転

#### 8.6.4 性能

- フォント生成時間
- レスポンス遅延
- メモリ使用量
- 転送サイズ

## 9. 段階導入ロードマップ（提案）

### Phase 1

- adaptive配分を本実装化
- 重大overflowは fail-fast 固定
- 軽度overflowは構造化ログ化

### Phase 2

- `budgetPolicy` と配分戦略オプションを公開
- 運用メトリクス（degrade率、未使用枠率）を可視化

### Phase 3

- 補助PUAの実験的導入（feature flag）
- 限定環境で互換性検証

### Phase 4

- 補助PUAの段階的GA判断
- 問題が残る環境向けに自動縮退パスを標準化

## 10. 実装前レビューで確認すべき点

- strict/adaptive の既定値をどちらにするか
- API公開範囲（最小構成か、拡張フル公開か）
- ログとメトリクスの必須項目
- 補助PUAのサポートマトリクス定義（対象ブラウザ/OS）

## 11. 最終判断

- 6400枠は一般用途には実用的だが、辞書・行政・文字基盤系では明確に不足。
- よって、ライブラリは「利用者に容量計算させる設計」から脱却し、
  - 重大不足: 失敗
  - 軽度不足: 自動縮退
  へ標準化するのが妥当。
- 将来拡張は補助PUAが本命だが、互換性検証を伴う段階導入が必須。

## 12. フォント著作権・ライセンス問題

更新: 2026-05-05

### 12.1 現状の実装

`buildScramble`（lib/fontObfuscator.ts）の中で、生成フォントは次のように構築される。

```ts
const newFont = new Font({
  familyName: "Obfuscated",
  styleName: "Regular",
  unitsPerEm: srcFont.unitsPerEm,
  ascender: srcFont.ascender,
  descender: srcFont.descender,
  glyphs: newGlyphs,
});
```

opentype.js の `Font` コンストラクタは name table を引数で渡さない限り自動引き継ぎしない。
つまり元フォントの name table に含まれる `copyright`、`license`、`licenseURL`、`designer`、`trademark` 等の全フィールドが出力フォントから消える。
グリフの `path`（アウトラインデータ）と `advanceWidth` だけが元フォントから複製される。

### 12.2 ライセンス別の法的評価

| ライセンス種別 | 改変・再配布 | 著作権表示保持の要否 | 現状の問題 |
|---|---|---|---|
| SIL OFL 1.1（Noto Sansなど） | 許可 | 必須（§ 2） | 違反 |
| Apache 2.0（一部フォント） | 許可 | 必須（§ 4(a)） | 違反 |
| CC BY 系 | 許可（条件付き） | 必須 | 違反 |
| 商用ライセンス | 多くが改変・再配布禁止 | 問題以前に利用自体が違反 | 重大 |
| 独自保有フォント | 自由 | 任意 | 問題なし |

ライセンス条文に照らすと、現状はデモ・サンプルで使用している Noto Sans（OFL 1.1）に対してすでに違反状態にある。

### 12.3 「著作権を消してもセキュリティは変わらない」という事実

著作権情報を削除することに難読化上の利点は皆無である。理由は次のとおり。

- 元フォントのグリフアウトライン（`path` データ）はそのまま配布フォントに含まれる
- 攻撃者は難読化フォントをダウンロードし、グリフ形状と既知フォントの形状を比較照合できる
- PUAコードポイントとグリフ形状の対応を得れば、セッション内のマッピングを逆引きできる
- 結果として、name table の有無にかかわらずマッピング解析コストは同等である

著作権情報の削除は「法的リスクを追加するだけで、攻撃耐性には何も寄与しない」という判断が正確である。

### 12.4 対処方針

#### 即時対応候補（最小変更）

`buildScramble` 内で元フォントの名前テーブルから著作権フィールドを読み出し、生成フォントに転記する。
opentype.js では `font.names` に各 nameID が格納されている。

```ts
// 対応イメージ（実装案）
const newFont = new Font({
  familyName: "Obfuscated",
  styleName: "Regular",
  unitsPerEm: srcFont.unitsPerEm,
  ascender: srcFont.ascender,
  descender: srcFont.descender,
  glyphs: newGlyphs,
});
// name table に著作権関連フィールドを転記
if (srcFont.names.copyright) newFont.names.copyright = srcFont.names.copyright;
if (srcFont.names.license)    newFont.names.license    = srcFont.names.license;
if (srcFont.names.licenseURL) newFont.names.licenseURL = srcFont.names.licenseURL;
```

ただし opentype.js の name table 書き込みサポートをバージョン別に確認してから実装すること。

#### 運用側の注意事項（README への明記推奨）

- OFL/Apache 2.0 など改変・再配布を許可するフォントのみサポート対象とする
- 商用ライセンスフォントは利用者が独自に改変・配布権を確認する責任を持つ
- ライブラリは著作権表示の保持を試みるが、元フォントがそもそも改変・配布を許可しているかは利用者の確認事項

### 12.5 グリフアウトラインの著作権について（補足）

タイプフェイスの書体デザイン（レターフォームの外観）の著作権は国・地域によって解釈が異なる。

- 米国: 書体デザイン自体は著作権保護対象外（フォントプログラムとしてのソフトウェアは保護対象）
- EU: 一部の国でタイプフェイスデザインの保護制度あり
- 日本: フォントプログラムの著作権は認められている（最高裁 2000 年判決）。書体デザイン自体の保護は実務上グレー

いずれにせよ、フォントバイナリを parse して再配布する行為はフォントライセンスの制約を受けるため、
書体デザイン著作権の論点より先にライセンス条文の確認を優先する。

---

## 13. 補助PUA（Plane 15/16）の問題点（詳細）

更新: 2026-05-05

### 13.1 補助PUAの位置付け

BMP（基本多言語面）の外に、Unicode は補助私用領域を2つ持つ。

| 領域 | コードポイント範囲 | 容量 |
|---|---|---:|
| BMP PUA | U+E000–U+F8FF | 6,400 |
| Supplementary PUA-A（Plane 15） | U+F0000–U+FFFFF | 65,536 |
| Supplementary PUA-B（Plane 16） | U+100000–U+10FFFF | 65,534 |
| 合計 | | 約 137,470 |

> **注**: Plane 15 の末尾 2 点（U+FFFFE, U+FFFFF）および Plane 16 の末尾 2 点（U+10FFFE, U+10FFFF）は
> Unicode noncharacter であるため、実質的な PUA スロットは各平面で 65,534。BMP の 6,400 と合わせると合計 **137,470**。

BMP の 6,400 に対して補助PUAを加えると 137,468 まで拡張できる。辞書・行政系ユースケースでも実用範囲に入る。

### 13.2 問題点一覧

#### 問題 1: JavaScript/TypeScript の文字列処理

JavaScript は UTF-16 内部表現を持つ。BMP 外の文字（コードポイント U+10000 以上）はサロゲートペアになる。

影響箇所:

- `str.length`: コードポイント数ではなく UTF-16 コード単位数を返す
- `str[i]`: サロゲートペアを半壊させる可能性がある
- `str.slice(n, m)`: サロゲート境界を切断する場合がある
- `RegExp` の `.` マッチ: `u` フラグなしではサロゲートペアを2文字扱いにする
- `String.fromCharCode(cp)`: BMP 外コードポイントに使えない（`String.fromCodePoint` が必要）

現在の `fontObfuscator.ts` は `String.fromCodePoint` と `str.codePointAt` を混在使用しているが、
PUAコードポイント生成部分（特に `mapping` の key 生成・`encodeText` など）がコードポイントループ前提になっているか全体レビューが必要。

具体的なリスク例:

```ts
// BMP PUA の場合は安全
const pua = 0xE100;
const ch = String.fromCodePoint(pua); // length === 1

// 補助PUA の場合、length !== 1 になる
const pua2 = 0xF0100;
const ch2 = String.fromCodePoint(pua2); // length === 2（サロゲートペア）
// 既存の mapping[ch2] や text.includes(ch2) が誤動作する可能性がある
```

対策: `for...of` または `[...str]` によるコードポイント単位のループへの全面移行が必要。

#### 問題 2: opentype.js の cmap 対応

フォントの文字マッピングテーブル（cmap）には複数フォーマットがある。

| cmap format | BMP 対応 | 補助面対応 |
|---|---|---|
| 4 (Segment mapping) | ○ | ✗ |
| 12 (Segmented coverage) | ○ | ○ |

opentype.js は cmap format 4 を生成するが、BMP 外コードポイントを追加した場合に format 12 に自動昇格するかは実装依存であり、バージョンによって挙動が異なる。
format 4 に BMP 外コードポイントを混入させた場合、ブラウザが黙って無視する可能性がある。

確認が必要な点:

- 使用中の opentype.js バージョンで補助コードポイントを持つグリフが生成できるか
- WOFF2 変換（wawoff2）が format 12 の cmap を正しく保持するか
- フォントバリデーターで問題なく通過するか

#### 問題 3: ブラウザ・OS のレンダリング互換

補助PUA の文字はフォントに定義されていれば理論上レンダリングできるが、実環境では問題が報告されている。

- macOS/iOS Safari: 補助PUA に対するフォント選択挙動が独自
- 一部の Android WebView: サロゲートペア扱いの差異によるトーフ（□）表示
- CSS `content:` プロパティでの補助PUA 文字使用: ブラウザ差異あり
- フォントフォールバック: PUA は定義フォントが優先されるべきだが、補助面ではフォールバック順序が乱れる実装が存在する

この問題は「補助PUAに割り当てたグリフが予期せずシステムフォントで描画される」リスクにつながる。
該当文字が平文で表示された場合、難読化が破綻する。

#### 問題 4: テキスト選択とクリップボード

難読化の目的の一つは「コピーで平文を得られないこと」である。補助PUA を使うと次の問題が生じる。

- テキスト選択時のカーソル単位: OS によりサロゲートペアを1単位として扱わない実装がある
- クリップボードへのコピー: 一部のアプリがサロゲートペアを正規化・変換する
- フォームへの貼り付け: 入力バリデーションがサロゲートペアを拒否するケース

コピーして得た文字列が正規化されてしまうと、攻撃者に扱いやすいデータを渡す可能性がある。
一方で正規化されない場合は難読化の目的は達成されるが、副作用として他のアプリとの連携が壊れる。

#### 問題 5: フォントサイズと転送遅延

補助PUA 領域まで使う場合、グリフ数が増えるため生成フォントのサイズが大きくなる。

- cmap format 12 への昇格だけでテーブルサイズが増加
- グリフ数が多い場合 WOFF2 圧縮でもサイズ増加は避けられない
- 初回ロード時の遅延が増す → `font-display: block` 時に白文字表示が延長される
- モバイル回線では体感品質の低下につながる

#### 問題 6: HTML エンティティとサーバー側エンコード

`obfuscateSelectorScopeHtml` のような HTML テキスト置換処理で補助PUA 文字を出力する場合、
HTML パーサーによる正規化やエンコードの差異が問題になる。

- HTML の数値文字参照: `&#xF0100;` のような形式（サロゲートペア形式ではなくコードポイント直接指定）
- Node.js の DOM 操作系ライブラリが内部で UTF-16 変換する際にサロゲートペアを壊す可能性
- Content-Type charset が UTF-8 のとき、サロゲートペアをそのまま出力するとエンコードエラー

#### 問題 7: devMode の unmapped 検出処理

`buildDevWarningPanel` や unmappedChars 検出は `ch.codePointAt(0)` を使っているが、
補助PUA を採用した場合にサロゲートペアを正しく扱えるかの確認が必要である。

### 13.3 まとめ: 補助PUA は「使えるが難しい」

| 問題カテゴリ | 深刻度 | 対応コスト |
|---|---|---|
| JavaScript 文字列処理 | 高（バグの原因になりやすい） | 中（全面的なコードポイントループ化） |
| opentype.js の cmap 対応 | 高（出力フォントが無効になりうる） | 中（バージョン調査・テスト） |
| ブラウザ・OS レンダリング | 中〜高（環境依存で本番バグ） | 高（多環境実機検証） |
| テキスト選択・コピー動作 | 中（難読化目的に影響） | 高（OS/ブラウザ別検証） |
| フォントサイズ・転送遅延 | 低〜中（UX影響） | 低（計測のみ） |
| HTML エンコード | 中（サーバー処理のバグ） | 中（ライブラリ内部修正） |

いずれの問題も「設計ミスではなく、本質的に BMP 外の文字を Web で扱う難しさ」に起因する。
段階導入（feature flag + Canary 環境での実機検証）なしに本番投入することは推奨しない。

---

## 14. 補助PUA実装可能性の実態調査（2026年5月）

本セクションは §8.3 および §13 の技術論点に対して、依存ライブラリとブラウザの**現状**を具体的に調査した結果を記録する。
「可能性がある」ではなく「現状どうであるか、したがって何が必要か」という形式で記述する。

### 14.1 opentype.js（フォント生成）

#### 調査対象バージョン

- インストール済み: `opentype.js@1.3.5`（`pnpm-lock.yaml` 確認済み）

#### 現状

`opentype.js@1.3.5` は npm に公開されているが、**GitHub のリリースページには「2.0.0 prerelease (Accidentally released as 1.3.5)」と公式に記載されている**。
これは正式な semver リリースではなく、v1.3.4 と v2.0.0 の間にある大量の変更を含む誤公開である。

補助面コードポイントに関する変更の経緯:

| 時期 | 出来事 |
|---|---|
| 2017年12月 | PR #315 マージ：`unicode > 65535` のグリフを検出して cmap format 12 を自動生成するロジックを追加 |
| 2021年11月 | `opentype.js@1.3.4` を npm に公開（これが最後の公式 semver リリース） |
| 2024年4月 | Issue #314 再 open：`@1.3.4` では `unicode > 0xFFFF` のグリフが正常に動作しないことを再報告 |
| 2024年（同） | 外部確認者が git HEAD（= 現在の master ブランチ）でテスト：「U+10000 超の値は意図通り動作する」と報告、issue close |
| 2024年後半 | PR #608「fix(glyph): Resolve the problem of invalid unicodes input parameters」を含む変更が master にマージ |
| 2025年（推定） | 上記を含む master が `@1.3.5` として npm に誤公開 |

インストール済みの `@1.3.5` は以下のコードを含む（`node_modules/opentype.js/src/tables/cmap.mjs` 確認済み）:

```javascript
for (i = glyphs.length - 1; i > 0; i -= 1) {
  const g = glyphs.get(i);
  if (g.unicode > 65535) {
    isPlan0Only = false;
    break;
  }
}
// isPlan0Only === false のとき、cmap format 12 セクションを自動生成する
```

#### 結論と必要な作業

- **現状**: `opentype.js@1.3.5` は `new Glyph({unicode: 0xF0000, ...})` のように補助面コードポイントを渡した場合、cmap format 12 を含むフォントを生成できると判断できる。git HEAD での動作確認も取れている。
- **リスク**: このバージョンは公式の v2.0.0 ではなく誤公開 prerelease である。内部 API の安定性保証がない。
- **必要な作業**: 実際に補助面コードポイントを持つグリフを生成し、otfinfo や fonttools で cmap format 12 テーブルの存在を確認するテストが必要。

### 14.2 wawoff2（TTF → WOFF2 変換）

#### 調査対象バージョン

- インストール済み: `wawoff2@2.0.1`（Google libwoff2 の WebAssembly ポート）

#### 現状

WOFF2 仕様（RFC 8081）は、OpenType フォントの全テーブルを構造的に変更せず Brotli 圧縮するのみである。
cmap format 12 テーブルはその他のテーブルと同様に変換対象であり、内容を書き換えるような処理は仕様上行われない。
wawoff2 は Google の参照実装（libwoff2）の WebAssembly ポートであり、仕様から逸脱した独自処理は行っていない。

#### 結論と必要な作業

- **現状**: wawoff2 は cmap format 12 を持つ TTF を WOFF2 に変換しても、テーブルを保持すると判断できる。
- **未検証**: wawoff2 が補助面 cmap を持つフォントを実際に round-trip した具体的なテスト実績は確認できなかった。
- **必要な作業**: 補助面コードポイントを持つグリフを含む TTF を wawoff2 で WOFF2 変換し、変換後のファイルに cmap format 12 が保持されていることを確認する実機検証が必要。

### 14.3 ブラウザ（Webフォントレンダリング）

#### 現状

CSS Fonts Level 4 仕様での定義:

- `@font-face` の `unicode-range` のデフォルト値は `U+0-10FFFF`（補助面を含む全 Unicode 範囲）
- OpenType cmap format 12 は BMP 外コードポイントのグリフマッピングに使用される正規フォーマットである

主要ブラウザの対応:

| ブラウザ | cmap format 12 | `@font-face` 補助面 |
|---|---|---|
| Chrome（最新） | 対応済み | 対応済み（仕様準拠） |
| Firefox（最新） | 対応済み | 対応済み（仕様準拠） |
| Safari（最新） | 対応済み | 一部挙動が独自（フォールバック順序） |
| Edge（最新） | 対応済み | 対応済み（仕様準拠） |

#### 未確認の懸念点

**OTS（OpenType Sanitizer）**: 全主要ブラウザは Webフォントを OTS でバリデートしてから適用する。
補助 PUA 専用の小規模フォント（グリフが少ない、`OS/2` テーブルの設定など）が OTS を通過するかは、
BMP PUA フォントでは問題ない実績があるが、補助面コードポイントのみを持つ場合については**実機での確認が必要**。

**Safari / macOS のフォントフォールバック**: §13.2 問題3 に記載の通り、補助面 PUA でフォールバックが乱れる実装が存在する。
これは「補助 PUA で割り当てたグリフがシステムフォントで描画される」リスクにつながるため、最も優先度の高い実機検証項目である。

#### 結論と必要な作業

- **現状**: 仕様レベルでは補助面 PUA のウェブフォントレンダリングは対応しているが、OTS バリデーションと Safari のフォールバック動作は実機検証なしに「動作する」とは断言できない。
- **必要な作業**: Chrome / Firefox / Safari に対して、補助面コードポイント（例: U+F0100）にグリフを割り当てた WOFF2 を `@font-face` で読み込み、実際に描画されるかを実機テストする。

### 14.4 現行コードのサロゲートペア処理（実態確認）

#### 確認箇所

`lib/fontObfuscator.ts` の主要処理を確認した結果:

| 処理 | コード | 補助面への対応状況 |
|---|---|---|
| PUA コードポイントのプール生成 | `puaPool.push(PUA_START + i)` | 整数として管理、補助面コードポイントも整数なので構造的に問題なし |
| Glyph への unicode 渡し | `new Glyph({unicode: pua, ...})` | 整数を直接渡す形式、補助面コードポイントも整数なので問題なし |
| テキスト文字ループ | `i += cp > 0xffff ? 2 : 1` | **既に正しく実装済み**：補助面文字でインデックスを 2 進める |
| 数値文字参照のデコード | `cp <= 0x10ffff` チェックあり | 補助面コードポイントも対象に含まれる |
| PUA 文字列の出力 | `String.fromCodePoint(mapped)` | 補助面コードポイントでも正しくサロゲートペアを生成する |

#### 変更が必要な箇所

補助面を有効にする場合に変更が必要な定数・ロジック:

```typescript
// 現在（BMP PUA のみ）
const PUA_START = 0xE000;
const PUA_END   = 0xF8FF;
const MAX_MAPPABLE_CHARS = PUA_END - PUA_START + 1; // 6400

// 補助PUA-A まで拡張する場合の例
const SUPP_PUA_A_START = 0xF0000;
const SUPP_PUA_A_END   = 0xFFFFF;
// プール生成ループ、CSS の unicode-range 出力、MAX_MAPPABLE_CHARS の定義も要変更
```

また、CSS の `unicode-range` を動的に出力している箇所（`@font-face` ブロック生成）が補助面範囲を含むよう変更する必要がある。

#### 結論

- **現状**: 文字列処理のコアロジック（ループ・エンコード・デコード）は補助面コードポイントに対応済みである。
- **必要な作業**: `PUA_START` / `PUA_END` 定数の拡張と CSS `unicode-range` 出力の修正が主な変更点。コア処理の書き直しは不要。

### 14.5 総括：何が実装前に必要か

| 論点 | 現状の評価 | 実装前に必要な作業 |
|---|---|---|
| opentype.js の cmap format 12 生成 | v1.3.5（2.0.0 prerelease）で対応済みと判断できる | 実際に補助面グリフを含む TTF を生成し otfinfo 等で cmap 確認 |
| wawoff2 の format 12 保持 | 仕様上は問題なし、実績は未確認 | 補助面グリフ入り TTF → WOFF2 round-trip テスト |
| ブラウザの補助面 PUA 描画 | 仕様準拠ブラウザは対応済み、OTS 通過と Safari フォールバックは未確認 | Chrome / Firefox / Safari での実機描画テスト |
| JavaScript の文字列処理 | コアループは対応済み | 定数変更と CSS 出力修正のみ（コア処理は変更不要） |
| テキスト選択・コピー動作 | OS 依存、実績なし | Windows / macOS / iOS / Android 実機での選択・コピー検証 |
| opentype.js の安定性 | 誤公開 prerelease のため正式保証なし | 公式 v2.0.0 リリース待ち、またはリポジトリ直接参照への切り替え検討 |

**実装に踏み切る前の最低限の前提条件**:

1. 補助面グリフを持つ WOFF2 を Chrome/Firefox/Safari で実際に読み込み、意図したコードポイントにグリフが表示されることを確認する。
2. OTS がこのフォントを拒否しないことを確認する（ブラウザの DevTools で `Failed to load font` エラーがないことを確認する）。
3. Safari で補助面 PUA にカスタムグリフが割り当てられた文字が、意図しないシステムフォントで描画されないことを確認する。

上記3点が未確認の段階で実装コストをかけることは推奨しない。

---

## 15. 拡張APIの型設計（TypeScript 詳細）

更新: 2026-05-05

### 15.1 新規型定義

```typescript
/** PUA予算超過時の挙動ポリシー */
export type BudgetPolicy = "strict" | "adaptive" | "legacy";

/**
 * PUA割り当て平面の選択
 * - "bmp": BMP PUAのみ（U+E000–U+F8FF、6400スロット）
 * - "bmp+supplementary": Plane 15/16も使用（合計 ≈137k スロット）— 実験的
 */
export type PuaPlaneMode = "bmp" | "bmp+supplementary";

/**
 * variantスロットの配分戦略
 * - "uniform": 全文字に同数配分（現行動作）
 * - "frequency-weighted": ページ内出現頻度が高い文字ほど多く配分
 * - "class-weighted": 数字・通貨・識別子クラスに優先配分
 */
export type VariantAllocator = "uniform" | "frequency-weighted" | "class-weighted";

/** onBudgetDegrade フックが受け取るイベントオブジェクト */
export interface BudgetDegradeEvent {
  /** マッピング対象の全文字数（usable.length と等しい） */
  totalChars: number;
  /** プライマリスロットに成功した文字数（adaptive では totalChars と一致する） */
  primaryMapped: number;
  /** 要求 variant 数に対してスロットが不足した文字数 */
  variantShortfall: number;
  /**
   * strict モード以外でプライマリも割り当てられなかった文字数。
   * adaptive モードでは常に 0 であることが保証される。
   */
  droppedChars: number;
  /** 使用した PUA スロット数（Primary + Variant の合計） */
  slotsUsed: number;
  /** 利用可能だった PUA スロット数 */
  slotsAvailable: number;
}
```

### 15.2 FontObfuscatorOptions への追加フィールド

```typescript
export interface FontObfuscatorOptions {
  // --- 既存フィールド（省略） ---

  /**
   * PUA 予算超過時の挙動ポリシー。
   *
   * - `"strict"`: variantスロット不足でも即時エラー。セキュリティ優先の本番向け。
   * - `"adaptive"`: 1文字1スロットを保証。余剰スロットをvariantAllocatorで配分。
   *   予算超過ログを `onBudgetDegrade` に渡す。
   * - `"legacy"`: 現行動作（プライマリ保証・variant不足はconsole.warn）。
   *   新規プロジェクトでは "adaptive" を推奨。
   *
   * @default "legacy"
   */
  budgetPolicy?: BudgetPolicy;

  /**
   * variantスロットの配分戦略。budgetPolicy が "adaptive" のときのみ有効。
   * "legacy" / "strict" では variantCount / digitVariantCount がそのまま使われる。
   *
   * @default "uniform"
   */
  variantAllocator?: VariantAllocator;

  /**
   * 1文字あたりの最低保証スロット数。
   * adaptive モードで予算がこの閾値を下回った場合はエラーを投げる。
   * 通常は 1 のまま変更不要。
   *
   * @default 1
   */
  minPrimaryGuarantee?: number;

  /**
   * PUA平面モード。
   * "bmp+supplementary" は実験段階であり、ブラウザ実機検証完了後に有効化すること。
   * （§14.3 参照）
   *
   * @default "bmp"
   */
  puaPlaneMode?: PuaPlaneMode;

  /**
   * variant予算が不足したときに呼ばれるフック。
   * Prometheus カウンター増加・構造化ログ出力などに使用する。
   * "strict" モードではエラーになるため呼ばれない。
   *
   * @example
   * onBudgetDegrade: (e) => metrics.increment("font_obf.degrade", {
   *   shortfall: e.variantShortfall,
   * })
   */
  onBudgetDegrade?: (event: BudgetDegradeEvent) => void;
}
```

### 15.3 後方互換性の保証方針

- `budgetPolicy` のデフォルトは `"legacy"` とする。既存コードが警告なしに動作し続けることを保証する。
- `puaPlaneMode` のデフォルトは `"bmp"` のまま。opt-in でのみ補助PUAを有効化する。
- `variantAllocator` は `budgetPolicy: "adaptive"` のときだけ動作する。他のポリシーでは無視する。
- `onBudgetDegrade` は既存の `console.warn` の代替になることを意図するが、両方を呼ぶことも可能（`"legacy"` では console.warn も出し続ける）。

---

## 16. adaptive配分アルゴリズムの詳細仕様

更新: 2026-05-05

### 16.1 フェーズ構成

adaptive配分は3フェーズで動作する。

```
Phase 1: プライマリ保証チェック
  if usable.length > totalPool:
    → throw ("重大overflow: プライマリ割り当てが不可能")
  // minPrimaryGuarantee は「1文字あたり最低この数のスロットを保証」なので
  // 必要スロット数 = usable.length * minPrimaryGuarantee と比較する
  if usable.length * minPrimaryGuarantee > totalPool:
    → throw ("minPrimaryGuarantee を下回る")

Phase 2: プライマリ1対1割り当て
  for each ch in usable:
    mapping[ch] = puaPool[puaIdx++]
    variants[ch] = [mapping[ch]]
  remainingBudget = totalPool - usable.length

Phase 3: 余剰バジェットをvariantAllocatorで配分
  targetVariants = allocator.compute(usable, remainingBudget, options)
  // targetVariants[ch] = chに割り当てる追加variant数（0以上）
  for each ch in usable:
    for 0..targetVariants[ch]:
      variants[ch].push(puaPool[puaIdx++])

Post: shortfall集計 → onBudgetDegrade / console.warn
```

### 16.2 各ポリシーの allocate コール前分岐

`adaptiveAllocate` が受け取る `options` の型:

```typescript
interface AdaptiveAllocateOptions {
  budgetPolicy: BudgetPolicy;
  variantAllocator: VariantAllocator;
  variantCount: number;
  digitVariantCount: number;
  minPrimaryGuarantee: number;
  onBudgetDegrade?: (event: BudgetDegradeEvent) => void;
  /** frequency-weighted 用の頻度マップ（省略時は均等とみなす） */
  freqs?: Map<string, number>;
  allocator: {
    distribute(
      chars: string[],
      remaining: number,
      opts: AdaptiveAllocateOptions,
    ): Record<string, number>;
  };
}
```

```typescript
function buildPuaPool(
  puaPlaneMode: PuaPlaneMode,
  seed: number,
): number[] {
  const pool: number[] = [];
  // BMP PUA: U+E000–U+F8FF (6400 スロット)
  for (let i = 0xE000; i <= 0xF8FF; i++) pool.push(i);
  if (puaPlaneMode === "bmp+supplementary") {
    // Supplementary PUA-A: U+F0000–U+FFFFD (noncharacter U+FFFFE/U+FFFFF を除く)
    for (let i = 0xF0000; i <= 0xFFFFD; i++) pool.push(i);
    // Supplementary PUA-B: U+100000–U+10FFFD (noncharacter U+10FFFE/U+10FFFF を除く)
    for (let i = 0x100000; i <= 0x10FFFD; i++) pool.push(i);
  }
  return shuffle(pool, mulberry32(seed));
}

function adaptiveAllocate(
  usable: string[],
  pool: number[],
  options: AdaptiveAllocateOptions,
): { mapping: Record<string, number>; variants: Record<string, number[]> } {
  const totalPool = pool.length;

  // Phase 1
  if (usable.length > totalPool) {
    throw new Error(
      `[FontObfuscator] 重大overflow: ${usable.length}文字に対してPUAスロットは${totalPool}しかない。` +
      `プライマリ割り当て不可能。alphabetを減らすか、puaPlaneMode: "bmp+supplementary" を検討。`
    );
  }

  const mapping: Record<string, number> = {};
  const variants: Record<string, number[]> = {};
  let idx = 0;

  // Phase 2: プライマリ1対1
  for (const ch of usable) {
    mapping[ch] = pool[idx++];
    variants[ch] = [mapping[ch]];
  }

  // Phase 3: 余剰配分
  const remaining = totalPool - usable.length;
  const extra = options.allocator.distribute(usable, remaining, options);
  let shortfall = 0;
  for (const ch of usable) {
    const want = extra[ch] ?? 0;
    let got = 0;
    while (got < want && idx < pool.length) {
      variants[ch].push(pool[idx++]);
      got++;
    }
    if (got < want) shortfall++;
  }

  if (shortfall > 0) {
    const event: BudgetDegradeEvent = {
      totalChars: usable.length,
      primaryMapped: usable.length,
      variantShortfall: shortfall,
      droppedChars: 0,
      slotsUsed: idx,
      slotsAvailable: totalPool,
    };
    options.onBudgetDegrade?.(event);
    if (options.budgetPolicy === "strict") {
      throw new Error(`[FontObfuscator] strict モード: ${shortfall}文字のvariant割り当てが不足。`);
    }
  }

  return { mapping, variants };
}
```

### 16.3 strict モードの精密な定義

strict モードは「要求 variant 数が満たされなければ即時失敗」である。

```
strictの失敗条件:
  (1) usable.length > poolSize              → プライマリ不足（常に失敗）
  (2) usable.length * variantCount > poolSize → variant不足（strictのみ失敗）
```

条件 (2) は現行の `estimatedSlots > MAX_MAPPABLE_CHARS` の console.warn を throw に変える形で実装できる。
strict モードを有効にした場合の構築時チェックロジック:

```typescript
if (budgetPolicy === "strict") {
  if (estimatedSlots > poolSize) {
    throw new Error(
      `[FontObfuscator] strict モード: 予算 ${estimatedSlots} スロットが必要だが ${poolSize} しかない。` +
      `variantCount を ${Math.floor(poolSize / alphabet.length)} 以下に下げるか、alphabetを縮小してください。`
    );
  }
}
```

---

## 17. variant配分戦略の詳細設計

更新: 2026-05-05

### 17.1 uniform（現行互換）

全文字に均等に追加 variant を配分する。

```typescript
function uniformDistribute(
  chars: string[],
  remaining: number,
  opts: { variantCount: number; digitVariantCount: number },
): Record<string, number> {
  const extra: Record<string, number> = {};
  for (const ch of chars) {
    const target = DIGIT_VARIANT_TARGETS.has(ch)
      ? Math.max(opts.variantCount, opts.digitVariantCount)
      : opts.variantCount;
    // マイナス1しているのはプライマリ1枠を既に確保しているため
    extra[ch] = Math.max(0, target - 1);
  }
  return extra;
}
```

### 17.2 frequency-weighted

HTMLページ内の文字出現頻度に比例して variant を配分する。
頻出文字は頻度解析攻撃のターゲットになりやすいため、より多くの variant が防御的に有効である。

#### 頻度計測関数（追加実装が必要）

```typescript
function extractTextCharFreqs(html: string): Map<string, number> {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeNumericCharRefs(stripped);
  const freqs = new Map<string, number>();
  for (const ch of decoded) {
    if (/\s/u.test(ch)) continue;
    freqs.set(ch, (freqs.get(ch) ?? 0) + 1);
  }
  return freqs;
}
```

#### 配分アルゴリズム

```typescript
function frequencyWeightedDistribute(
  chars: string[],
  remaining: number,
  freqs: Map<string, number>,
  opts: { minVariant: number; maxVariant: number },
): Record<string, number> {
  const extra: Record<string, number> = {};

  // 頻度が不明な文字にはページ全体の平均頻度を与える
  const totalFreq = chars.reduce((s, ch) => s + (freqs.get(ch) ?? 1), 0);

  // まず各文字の「重み比例配分の理想値」を計算
  let idealTotal = 0;
  for (const ch of chars) {
    const freq = freqs.get(ch) ?? 1;
    // min..max の範囲でクリップ
    const ideal = Math.min(
      opts.maxVariant - 1,
      Math.max(opts.minVariant - 1, Math.round((freq / totalFreq) * remaining))
    );
    extra[ch] = ideal;
    idealTotal += ideal;
  }

  // idealTotal が remaining を超えた場合は均等に削る
  if (idealTotal > remaining) {
    const scale = remaining / idealTotal;
    let used = 0;
    for (const ch of chars) {
      extra[ch] = Math.floor(extra[ch] * scale);
      used += extra[ch];
    }
    // 端数をランダム文字に配布
    let leftover = remaining - used;
    for (let i = 0; i < chars.length && leftover > 0; i++) {
      extra[chars[i]]++;
      leftover--;
    }
  }

  return extra;
}
```

**注意**: 頻度情報を取得するには `buildCandidateAlphabet` の時点でHTMLを2回スキャンすることになる。
大きなHTMLでは `extractTextCharsFromHtml` と `extractTextCharFreqs` を1パスに統合すべきである。

### 17.3 class-weighted

文字の「意味的クラス」に基づいて重みを付ける。頻度情報が不要なため実装コストが低い。

```typescript
const CLASS_WEIGHTS: Record<string, number> = {
  digit:    4.0,   // 0-9, ０-９ (数字・価格で頻出かつ高価値)
  currency: 3.0,   // ¥ $ € £ など
  symbol:   2.0,   // @ # % & など識別子系
  latin:    1.5,   // ASCII アルファベット
  kana:     1.0,   // ひらがな・カタカナ（デフォルト）
  kanji:    1.2,   // 漢字（個数が多いためスロット消費は自然に分散）
  other:    1.0,
};

function charClass(ch: string): keyof typeof CLASS_WEIGHTS {
  const cp = ch.codePointAt(0)!;
  if (DIGIT_VARIANT_TARGETS.has(ch)) return "digit";
  if ("¥$€£¢₩₹".includes(ch)) return "currency";
  if (cp >= 0x21 && cp <= 0x2F || cp >= 0x3A && cp <= 0x40) return "symbol";
  if (cp >= 0x41 && cp <= 0x7E) return "latin";
  if ((cp >= 0x3041 && cp <= 0x309F) || (cp >= 0x30A0 && cp <= 0x30FF)) return "kana";
  if (cp >= 0x4E00 && cp <= 0x9FFF) return "kanji";
  return "other";
}

function classWeightedDistribute(
  chars: string[],
  remaining: number,
  opts: { maxVariant: number },
): Record<string, number> {
  const weights = chars.map((ch) => CLASS_WEIGHTS[charClass(ch)]);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const extra: Record<string, number> = {};
  let used = 0;
  for (let i = 0; i < chars.length; i++) {
    const share = Math.min(
      opts.maxVariant - 1,
      Math.floor((weights[i] / totalWeight) * remaining)
    );
    extra[chars[i]] = share;
    used += share;
  }
  // 端数を重み順に配布
  const sorted = chars
    .map((ch, i) => ({ ch, w: weights[i] }))
    .sort((a, b) => b.w - a.w);
  let leftover = remaining - used;
  for (const { ch } of sorted) {
    if (leftover <= 0) break;
    if (extra[ch] < opts.maxVariant - 1) {
      extra[ch]++;
      leftover--;
    }
  }
  return extra;
}
```

### 17.4 各戦略の比較

| 戦略 | 実装コスト | 防御効果 | 向いているユースケース |
|---|---|---|---|
| uniform | 低（現行） | 中 | 一般コンテンツ、予算に余裕あり |
| frequency-weighted | 中（HTML二重スキャン） | 高 | ページ内容が多様、頻度解析リスクが高い |
| class-weighted | 低（静的ルール） | 中〜高 | ECサイト価格、数字・記号が重要 |

---

## 18. 補助PUA実装検証の具体的手順

更新: 2026-05-05

§14.5 の「実装前に必要な作業」を具体的なコマンドと合否基準に落とし込む。

### 18.1 Step 1: opentype.js での補助面グリフ生成テスト

**目的**: `opentype.js@1.3.5` が cmap format 12 を含むフォントを実際に生成できるか確認。

```typescript
// scripts/test-supp-pua.ts（Node.js/Deno で実行）
import * as opentype from "opentype.js";

const Glyph = (opentype as any).Glyph;
const Path  = (opentype as any).Path;
const Font  = (opentype as any).Font;

const notdef = new Glyph({ name: ".notdef", unicode: 0,
  advanceWidth: 500, path: new Path() });

// 補助PUA-A のコードポイント（U+F0100）
const suppGlyph = new Glyph({ name: "test_supp",
  unicode: 0xF0100, advanceWidth: 500, path: new Path() });

const font = new Font({
  familyName: "SuppTest",
  styleName: "Regular",
  unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [notdef, suppGlyph],
});

import { writeFileSync } from "node:fs";
writeFileSync("/tmp/supp-test.ttf", Buffer.from(font.toArrayBuffer()));
console.log("生成完了: /tmp/supp-test.ttf");
```

**確認コマンド（fonttools が必要: `pip install fonttools`）**:

```bash
python3 - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont("/tmp/supp-test.ttf")
cmap = f["cmap"]
print("cmap テーブル一覧:")
for t in cmap.tables:
    print(f"  format={t.format} platformID={t.platformID}")
    if t.format == 12:
        keys = sorted(t.cmap.keys())
        print(f"  → format 12 存在。収録コードポイント数={len(keys)}, 先頭={hex(keys[0])}")
EOF
```

**合格条件**: `format=12` のテーブルが出力され、`0xF0100` が含まれること。

---

### 18.2 Step 2: wawoff2 での WOFF2 変換 round-trip テスト

**目的**: cmap format 12 が WOFF2 変換後も保持されるか確認。

```typescript
// Step 1 の生成後に実行
import * as wawoff2Module from "wawoff2";
const wawoff2 = (wawoff2Module as any).default ?? wawoff2Module;
import { readFileSync, writeFileSync } from "node:fs";

const ttfBytes = new Uint8Array(readFileSync("/tmp/supp-test.ttf"));
const woff2Bytes: Uint8Array = await (wawoff2 as any).compress(ttfBytes);
writeFileSync("/tmp/supp-test.woff2", woff2Bytes);

// WOFF2 → TTF に戻して cmap を再確認
const ttfRoundtrip: Uint8Array = await (wawoff2 as any).decompress(woff2Bytes);
writeFileSync("/tmp/supp-test-roundtrip.ttf", ttfRoundtrip);
console.log("round-trip 完了: /tmp/supp-test-roundtrip.ttf");
```

**確認コマンド**:

```bash
python3 - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont("/tmp/supp-test-roundtrip.ttf")
for t in f["cmap"].tables:
    if t.format == 12 and 0xF0100 in t.cmap:
        print("✅ round-trip 後も format 12 に U+F0100 が存在する")
        break
else:
    print("❌ round-trip 後に U+F0100 が消えた")
EOF
```

**合格条件**: ✅ メッセージが出ること。

---

### 18.3 Step 3: OTS バリデーション + ブラウザ実機テスト

**目的**: ブラウザが実際に補助PUA フォントを読み込み描画するか、OTS で拒否されないかを確認。

#### テスト用 HTML を生成する

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>補助PUA フォントテスト</title>
<style>
@font-face {
  font-family: "SuppTest";
  /* woff2 を /tmp/supp-test.woff2 からローカルサーバで配信 */
  src: url("http://localhost:8888/supp-test.woff2") format("woff2");
  unicode-range: U+F0100;
  font-display: block;
}
.target {
  font-family: "SuppTest", serif;
  font-size: 48px;
  border: 1px solid #ccc;
  padding: 8px;
}
</style>
</head>
<body>
<!-- U+F0100 を直接出力する -->
<p class="target">&#xF0100;</p>
<p id="result"></p>
<script>
document.fonts.ready.then(() => {
  const el = document.querySelector(".target");
  const txt = el.textContent;
  // フォントが適用されていれば getComputedStyle に "SuppTest" が現れる
  const style = getComputedStyle(el).fontFamily;
  document.getElementById("result").textContent =
    "computed font-family: " + style;
});
</script>
</body>
</html>
```

**ローカルサーバ起動**:

```bash
cd /tmp && python3 -m http.server 8888
```

#### 確認項目（DevTools で確認）

| 確認項目 | 確認方法 | 合格条件 |
|---|---|---|
| OTS 拒否なし | DevTools Console にフォントエラーなし | `Failed to load font` なし |
| グリフが描画される | `.target` 要素がトーフ（□）でない | 視覚的にグリフが表示される |
| システムフォントにフォールバックしない | Network タブでフォントが 200 で取得される | `supp-test.woff2` が 200 OK |
| Safari フォールバック確認 | macOS Safari で同じページを開く | グリフがシステムフォントで上書きされない |

#### 自動確認（Playwright）

```typescript
// scripts/test-supp-pua-browser.ts
import { chromium, firefox, webkit } from "playwright";

const BROWSERS = [chromium, firefox, webkit];
// NOTE: 'URL' はグローバルコンストラクタと衝突するため TEST_URL を使用する
const TEST_URL = "http://localhost:8888/supp-test.html";

for (const browserType of BROWSERS) {
  const browser = await browserType.launch();
  const page = await browser.newPage();

  const fontErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("font")) {
      fontErrors.push(msg.text());
    }
  });

  await page.goto(TEST_URL);
  await page.waitForFunction(() => document.fonts.status === "loaded");

  const boundingBox = await page.locator(".target").boundingBox();
  // グリフが描画されていれば width > 0
  const hasGlyph = boundingBox && boundingBox.width > 10;

  console.log(`${browserType.name()}: glyph=${hasGlyph ? "✅" : "❌"} errors=${fontErrors.length}`);
  await browser.close();
}
```

---

### 18.4 Step 4: テキスト選択・クリップボード検証

**目的**: 補助PUA 文字のコピーが OS 側で正規化・変換されないか確認。
（正規化されると攻撃者が扱いやすい平文や標準文字に変換されるリスクがある）

#### 手動確認手順（OS 別）

| OS | 手順 | 合格条件 |
|---|---|---|
| macOS | `.target` 要素のテキストを選択 → Cmd+C → テキストエディタに貼り付け | U+F0100 相当の文字がそのまま貼り付けられる（□でも可） |
| Windows | 同様に Ctrl+C → メモ帳に貼り付け | 変換・消失しない |
| iOS Safari | 長押し → コピー → メモに貼り付け | 同上 |
| Android Chrome | 長押し → コピー → 任意アプリに貼り付け | 同上 |

**注意**: クリップボードの内容が空になったり、別の文字に変換された場合は「コピーで平文漏洩」リスクがある。
この場合は補助PUAの実用化を見送り、BMP PUA のみの運用を継続すべきである。

---

### 18.5 検証結果の記録テンプレート

```markdown
## 補助PUA検証結果 (YYYY-MM-DD)

### 環境
- opentype.js: x.x.x
- wawoff2: x.x.x
- Node.js: x.x.x

### Step 1: cmap format 12 生成
- [ ] format 12 が存在する
- [ ] U+F0100 がマップされている

### Step 2: WOFF2 round-trip
- [ ] round-trip 後も format 12 が保持される

### Step 3: ブラウザ描画
| ブラウザ | OTS通過 | グリフ描画 | フォールバックなし |
|---|---|---|---|
| Chrome xxx | | | |
| Firefox xxx | | | |
| Safari xxx | | | |

### Step 4: クリップボード
| OS | コピー後の内容 |
|---|---|
| macOS | |
| Windows | |
| iOS | |
| Android | |

### 判定
- [ ] 全ステップ合格 → 補助PUA実装着手可
- [ ] 不合格あり → 課題: (記入)
```

### 18.6 補助PUA検証結果 (2026-05-07)

### 環境
- opentype.js: 1.3.5
- wawoff2: 2.0.1
- Node.js: 22.21.1
- fonttools: 4.62.1（`/tmp/fonttools-venv`）
- OS: Linux

### Step 1: cmap format 12 生成
- [x] format 12 が存在する（`/tmp/supp-test.ttf`）
- [x] U+F0100 がマップされている

### Step 2: WOFF2 round-trip
- [x] round-trip 後も format 12 が保持される（`/tmp/supp-test-roundtrip.ttf`）

### Step 3: ブラウザ描画
| ブラウザ | OTS通過 | グリフ描画 | フォールバックなし |
|---|---|---|---|
| Chromium 147 (Playwright) | ✅ | ✅ | ✅ |
| Firefox 148 (Playwright) | ✅ | ✅ | ✅ |
| WebKit 26.4 (Playwright) | ✅ | ✅ | ✅ |
| Safari (macOS 実機) | 未実施 | 未実施 | 未実施 |

補足:
- Safari 実機は macOS 環境での確認が必須。

### Step 4: クリップボード
| OS | コピー後の内容 |
|---|---|
| macOS | 未実施 |
| Windows | 未実施 |
| iOS | 未実施 |
| Android | 未実施 |

事前自動検証（ブラウザ内 copy イベント捕捉。OS クリップボード実機検証の代替にはならない）:
- Chromium 147 (Playwright): U+F0100 を保持（OK）
- Firefox 148 (Playwright): U+F0100 を保持（OK）
- WebKit 26.4 (Playwright): U+F0100 を保持（OK）

### 判定
- [ ] 全ステップ合格 → 補助PUA実装着手可
- [x] 不合格あり（未実施を含む） → 課題: Safari/macOS 実機と各 OS クリップボード実機検証が未完了

---

## 19. 実装計画（タスクリスト）

更新: 2026-05-05

本節は §9 ロードマップと §15–§18 の詳細仕様に基づき、着実に進めるための具体的なタスクを整理する。
各フェーズは依存関係順に並んでいる。フェーズ間の依存を守り、前フェーズが完了してから次フェーズへ進むこと。

> **凡例**: `[ ]` = 未着手 / `[x]` = 完了 / ⚠️ = ブロッカー（必須前提条件あり）

---

### Phase A — BMP adaptive配分（ブラウザ検証不要・即着手可能）

BMP PUA 6400 枠の範囲内で配分ロジックを改善する。補助PUAへの依存はゼロなので、Phase B/C の結果に関係なく独立して実装できる。

#### A-1: 型定義の追加

- [ ] `BudgetPolicy` 型（`"strict" | "adaptive" | "legacy"`）を `lib/fontObfuscator.ts` に追加する（§15.1）
- [ ] `VariantAllocator` 型（`"uniform" | "frequency-weighted" | "class-weighted"`）を追加する（§15.1）
- [ ] `BudgetDegradeEvent` インターフェースを追加する（§15.1）
- [ ] `FontObfuscatorOptions` に `budgetPolicy`、`variantAllocator`、`minPrimaryGuarantee`、`onBudgetDegrade` の4フィールドを追加する（§15.2）
- [ ] 既存のデフォルト値を確認し、後方互換性（`budgetPolicy` デフォルト `"legacy"`）を保証する（§15.3）

#### A-2: `adaptiveAllocate` 関数の実装

- [ ] `AdaptiveAllocateOptions` インターフェースを `lib/fontObfuscator.ts` 内（非公開）に定義する（§16.2）
- [ ] `buildPuaPool(puaPlaneMode, seed)` 関数を実装する（BMP のみモード。§16.2）
  - BMP PUA: `for (let i = 0xE000; i <= 0xF8FF; i++)` で生成
  - noncharacter 除外は BMP 範囲内には存在しないため不要
  - shuffle ロジックは既存の `mulberry32` をそのまま流用
- [ ] `adaptiveAllocate(usable, pool, options)` 関数を実装する（§16.1 の3フェーズ）
  - Phase 1: `usable.length > pool.length` → throw（重大overflow）
  - Phase 1: `usable.length * minPrimaryGuarantee > pool.length` → throw
  - Phase 2: プライマリ1対1割り当てループ
  - Phase 3: `options.allocator.distribute()` を呼び出して余剰配分
  - Post: shortfall 集計 → `onBudgetDegrade` 呼び出し（strict なら throw）

#### A-3: variant配分戦略の実装

- [ ] `uniform` allocator の `distribute()` を実装する（§17.1）
  - 現行の2パス配分ロジックをそのまま移植
  - `DIGIT_VARIANT_TARGETS` の扱いは現行と同一
- [ ] `class-weighted` allocator の `distribute()` を実装する（§17.3）
  - `CLASS_WEIGHTS` 定数テーブルを定義
  - `charClass()` ヘルパー関数を実装
  - 端数は重み順に配布

#### A-4: `buildScramble` への組み込み

- [ ] `buildScramble` の現行2パス配分ロジックを `adaptiveAllocate()` 呼び出しに置き換える
  - `budgetPolicy === "legacy"` の分岐でのみ現行 `console.warn` を残す
  - `budgetPolicy === "strict"` の場合は構築時チェックを throw に変更する（§16.3）
- [ ] `puaPool` 生成部分を `buildPuaPool("bmp", seed)` 呼び出しに置き換える

#### A-5: ユニットテスト

- [ ] `adaptiveAllocate` のテストを `tests/fontObfuscator.test.ts` に追加する
  - 正常ケース: プライマリ全数割り当て確認
  - 正常ケース: uniform allocator による variant 配分確認
  - 縮退ケース: プール不足時に `onBudgetDegrade` が呼ばれることを確認
  - 縮退ケース: `budgetPolicy: "strict"` でプール不足時に throw することを確認
  - 境界値: `usable.length === pool.length`（variant なし）で重大エラーにならないことを確認
- [ ] `classWeightedDistribute` の単体テストを追加する
  - 数字・通貨クラスが他クラスより多くの配分を受けることを確認
  - 配分合計が `remaining` を超えないことを確認

#### A-6: ドキュメント更新

- [ ] `README.md` / `README.ja.md` の `FontObfuscatorOptions` 説明に `budgetPolicy` を追記する
- [ ] `onBudgetDegrade` の使用例（Prometheus カウンター増加パターン）を README に追加する
- [ ] `CHANGELOG` に Phase A の変更内容を記載する

---

### Phase B — frequency-weighted allocator（Phase A 完了後）

Phase A の allocator インターフェースに乗せる形で frequency-weighted を追加する。Phase A が完了していれば単独で追加可能。

#### B-1: 頻度計測の実装

- [ ] `extractTextCharFreqs(html: string): Map<string, number>` を実装する（§17.2）
  - `<script>`、`<style>`、`<textarea>` タグ内のテキストを除外する
  - タグをストリップして本文テキストを抽出する
  - 空白文字はカウント対象外にする
  - 数値文字参照（`&#xXXXX;`）をデコードしてからカウントする

#### B-2: 1パス化への統合

- [ ] `buildCandidateAlphabet` と `extractTextCharFreqs` を1パスに統合する（§17.2 注意事項）
  - 大きな HTML で2回スキャンを避けるため、ユニーク文字収集と頻度カウントを同一ループで行う
  - 戻り値: `{ alphabet: string[]; freqs: Map<string, number> }`

#### B-3: frequency-weighted allocator の実装

- [ ] `frequencyWeightedDistribute()` を実装する（§17.2）
  - 頻度が不明な文字には平均頻度を与える
  - min/max クリップを適用する
  - 理想配分の合計が `remaining` を超えた場合はスケールダウンする
  - 端数を先頭から順に配布する

#### B-4: テストと更新

- [ ] `frequencyWeightedDistribute` の単体テスト
  - 頻出文字が低頻度文字より多く配分されることを確認
  - 配分合計が `remaining` を超えないことを確認
- [ ] README に `variantAllocator: "frequency-weighted"` の使用例を追記する

---

### Phase C — 補助PUA検証（Phase A と並行実施可能・Phase D の前提）

Phase A の実装と並行して進める。Phase D（補助PUA実装）に進む前に必ず完了させること。

> ⚠️ **このフェーズが合格しない限り Phase D には進まないこと。**
> Safari でのフォールバック不具合が確認された場合は Phase D を無期限延期し、Phase A/B のみをリリースする。

#### C-1: opentype.js の cmap format 12 生成確認（§18.1）

- [x] `scripts/test-supp-pua.ts` を作成する
  - `new Glyph({ unicode: 0xF0100, ... })` で補助面グリフを含む TTF を生成する
  - 出力: `/tmp/supp-test.ttf`
- [x] `pip install fonttools` で fonttools をインストールする
- [x] fonttools の python スクリプトで cmap テーブルを確認する
  - 合格条件: `format=12` のテーブルが存在し、`0xF0100` がマップされていること
- [x] 結果を §18.5 のテンプレートの「Step 1」欄に記入する

#### C-2: wawoff2 round-trip テスト（§18.2）

- [x] `scripts/test-supp-pua.ts` に WOFF2 変換・逆変換のコードを追加する
  - wawoff2 で TTF → WOFF2 変換する
  - 続けて WOFF2 → TTF に戻す（round-trip）
  - 出力: `/tmp/supp-test-roundtrip.ttf`
- [x] fonttools で round-trip 後の TTF に `format 12` と `U+F0100` が保持されているか確認する
  - 合格条件: ✅ メッセージが出ること
- [x] 結果を §18.5 のテンプレートの「Step 2」欄に記入する

#### C-3: ブラウザ実機テスト（§18.3）

- [x] テスト用 HTML（`/tmp/supp-test.html`）を作成する（§18.3 の HTML テンプレートを使用）
- [ ] `/tmp` でローカル HTTP サーバを起動し、Chrome/Firefox/Safari で HTML を開く
- [ ] 各ブラウザで以下を確認する
  - DevTools Console に `Failed to load font` が出ないこと
  - `.target` 要素がトーフ（□）でなく何らかのグリフが描画されること
  - Network タブで `supp-test.woff2` が 200 OK で取得されること
- [ ] Safari（macOS）で特にフォントフォールバックが発生しないことを確認する（最優先）
- [x] `scripts/test-supp-pua-browser.ts` を作成して Playwright 自動テストを実行する（§18.3）
- [x] 結果を §18.5 のテンプレートの「Step 3」欄に記入する

#### C-4: 検証の判定

**注記（2026-05-08）**: クリップボード検証（旧 C-4）は削除されました。
理由：PUA をコピーするビジネスユースケースが存在しません。むしろユーザーが PUA を自由に扱える環境の拡大は、セキュリティ的に望ましくありません。本当に必要な場合は API + 認証 + 暗号化フレームワークで実装すべきです。

Phase C は C-1/C-2/C-3（生成・圧縮・レンダリング）の技術的検証に集約されました。

- [x] §18.5 の検証結果テンプレートに全ステップの結果を記入する
- [ ] 全ステップ合格 → Phase D へ進む判断を下す
- [x] 不合格あり → 課題を記録し、Phase D を保留する（Phase A/B のみでリリースを進める）

---

### Phase D — 補助PUA実装（Phase C の全ステップ合格後のみ着手）

> ⚠️ **Phase C（検証）が全ステップ合格した場合にのみ着手すること。**

#### D-1: `PuaPlaneMode` 型と `buildPuaPool` の完成

- [ ] `PuaPlaneMode` 型（`"bmp" | "bmp+supplementary"`）を公開型として追加する（§15.1）
- [ ] `buildPuaPool()` に `"bmp+supplementary"` モードを追加する（§16.2）
  - Supplementary PUA-A: `for (let i = 0xF0000; i <= 0xFFFFD; i++)` で生成（U+FFFFE/U+FFFFF を除外）
  - Supplementary PUA-B: `for (let i = 0x100000; i <= 0x10FFFD; i++)` で生成（U+10FFFE/U+10FFFF を除外）
  - プール生成後に既存の shuffle ロジックを適用する
- [ ] `FontObfuscatorOptions` の `puaPlaneMode` フィールドをアクティブにする（Phase A で追加済みのはず）
- [ ] `buildScramble` の `MAX_MAPPABLE_CHARS` チェックを `buildPuaPool()` 返値の長さを基準に動的化する

#### D-2: CSS `unicode-range` 出力の拡張

- [ ] `@font-face` の `unicode-range` 生成ロジックを特定する
- [ ] `puaPlaneMode === "bmp+supplementary"` のとき、`U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD` を出力するよう変更する
- [ ] BMP のみモードでは既存の `U+E000-F8FF` のみを出力する（後方互換）

#### D-3: 重大overflow エラーメッセージの更新

- [ ] プライマリ不足時のエラーメッセージに `puaPlaneMode: "bmp+supplementary"` の提案を含める（§16.2 の `adaptiveAllocate` throw メッセージ参照）

#### D-4: ユニットテスト

- [ ] `buildPuaPool("bmp+supplementary", seed)` のテストを追加する
  - 容量が 137,470 であることを確認する
  - U+FFFFE、U+FFFFF、U+10FFFE、U+10FFFF が含まれないことを確認する
  - 同一シードで同一順序になること（再現性）を確認する
- [ ] `buildPuaPool("bmp", seed)` が 6,400 スロットのみを返すことを確認する
- [ ] `adaptiveAllocate` に 7,000 文字を渡したとき、`"bmp"` では throw・`"bmp+supplementary"` では成功することを確認する

#### D-5: 統合テスト・性能計測

- [ ] Node.js / Deno / Bun での同一結果性テストに `puaPlaneMode: "bmp+supplementary"` ケースを追加する
- [ ] 補助PUA モードでのフォント生成時間・WOFF2 サイズを計測する
  - 目安: 500文字 / 1000文字 / 5000文字のシナリオで計測
- [ ] モバイル回線シミュレーション（Chrome DevTools: Slow 3G）で `font-display: block` 時の白文字表示遅延を確認する

#### D-6: feature flag でのリリース

- [ ] `puaPlaneMode` のデフォルトを `"bmp"` のまま維持する（既存の動作を保つ）
- [ ] README に補助PUA の実験的ステータスを明記する
  - 「`puaPlaneMode: "bmp+supplementary"` は実験的オプションです。本番環境での使用前に十分な検証を行ってください。」
- [ ] README にサポートマトリクスを追記する（§18.5 の検証結果を元に作成）
  - ブラウザ列: Chrome / Firefox / Safari / Edge
  - OS列: Windows / macOS / iOS / Android
  - 確認済み項目と未確認項目を明示する
- [ ] `CHANGELOG` に Phase D の変更内容と実験的ステータスを記載する

---

### フェーズ間の依存関係まとめ

```
Phase A（BMP adaptive配分）
  ↓ 完了後
Phase B（frequency-weighted）
  ※ Phase C と並行可能

Phase C（補助PUA検証）
  ↓ 全ステップ合格のみ
Phase D（補助PUA実装）
```

- Phase A と Phase C は**並行して進められる**。
- Phase B は Phase A 完了後であれば Phase C/D と無関係に進められる。
- Phase D は Phase C の合格判定なしに着手してはならない。

---

### 着手優先順位の推奨

| 優先度 | タスク | 理由 |
|---|---|---|
| 最優先 | Phase A-1〜A-4 | 後方互換を保ちつつ即座に実装価値あり |
| 高 | Phase C-1〜C-3 | Safari検証はブロッカーになりうる。早期に知る必要がある |
| 中 | Phase A-5〜A-6 | テストとドキュメントはリリース前に必須 |
| 中 | Phase B | Phase A 完了後に自然な追加 |
| 低（条件付き） | Phase D | Phase C 合格が前提。不合格なら保留 |
