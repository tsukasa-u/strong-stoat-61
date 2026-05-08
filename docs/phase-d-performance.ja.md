# Phase D-5 統合テスト・性能計測結果

実施日: 2026-05-08

## 1. ランタイム互換性（Node / Deno / Bun）

検証スクリプト:
- `scripts/phase-d-runtime-compat.mjs`

実行結果:
- Node: 実行成功
- Deno: 実行成功
- Bun: 未導入のため本環境では未実施

確認項目:
- BMP 容量: 6400
- BMP+Supplementary 容量: 137468
- 非文字除外: U+FFFFE / U+FFFFF / U+10FFFE / U+10FFFF を含まない
- シード固定時のシャッフル結果（サンプル配列）が Node と Deno で一致

補足:
- Bun は CI/検証環境に導入後、同スクリプトを実行して 3 ランタイム一致を確認してください。

## 2. 性能計測（TTF 生成・WOFF2 圧縮・WOFF2 復号）

計測スクリプト:
- `scripts/phase-d-benchmark.ts`

計測条件:
- フォント: NotoSansCJKjp-Regular.otf
- サイズシナリオ: 500 / 1000 / 5000
- 比較モード: `bmp` / `bmp+supplementary`
- 出力生データ: `docs/phase-d-benchmark-results.json`

### 計測結果（抜粋）

| mode | size | uniqueAlphabet | TTF生成(ms) | TTFサイズ(B) | WOFF2圧縮(ms) | WOFF2サイズ(B) | WOFF2復号(ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| bmp | 500 | 833 | 94.42 | 156384 | 516.05 | 91224 | 4.59 |
| bmp | 1000 | 1333 | 135.65 | 305056 | 875.64 | 175440 | 3.07 |
| bmp | 5000 | 5333 | 558.80 | 1478844 | 3313.48 | 815688 | 12.87 |
| bmp+supplementary | 500 | 833 | 80.80 | 160052 | 387.71 | 93268 | 1.20 |
| bmp+supplementary | 1000 | 1333 | 131.92 | 310948 | 656.20 | 178180 | 1.94 |
| bmp+supplementary | 5000 | 5333 | 654.21 | 1502040 | 2979.40 | 828956 | 8.87 |

## 3. 所見

- 同一入力サイズにおいて `bmp+supplementary` は `bmp` 比でフォントサイズがわずかに増加（おおむね 1%〜3% 程度）。
- 本計測では `bmp+supplementary` の TTF 生成時間が `size=5000` で増加（約 +95ms）する一方、WOFF2 圧縮時間は同等または短縮するケースがあった。
- WOFF2 復号時間はいずれのケースも 13ms 未満で、実用上大きな差は見られなかった。

## 4. 未実施項目と代替

- Bun 実行: 本環境に Bun が未導入のため未実施。
  - 代替: Bun 導入後に `bun scripts/phase-d-runtime-compat.mjs` を実行し、Node/Deno と同一結果を確認。
- Slow 3G レンダリング遅延: 本ドキュメントでは未計測。
  - 代替: Chromium DevTools あるいは Playwright + CDP ネットワークエミュレーションで `document.fonts.ready` までの時間を別途収集。
