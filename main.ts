import { FontObfuscator, encodeText, type PrecomputedMapping } from "./lib/index.ts";

// Server-side i18n: All UI text for both languages (encrypted after server processing)
const I18N = {
  ja: {
    title: "Font Obfuscator Library",
    lead: "スクレイパー・ヘッドレスブラウザからテキストを守ります。",
    leadSub: "HTMLのDOMを難読化し、textContent / innerText での文字列取得やコピーペーストを無効化します。ブラウザ上では人間に正しく表示されます。",
    proofTitle: "どう守るの？",
    proofSrcLabel: "① DOM テキスト（スクレイパーが取得するもの）",
    proofSrcNote: "textContent や innerText で取得すると意味不明な文字コードが返る",
    proofArrow: "→",
    proofRenderLabel: "② ブラウザの表示（人間が見るもの）",
    proofRenderNote: "専用フォントにより元の文字として正しく描画される",
    targetBadge: "🔒 保護済み",
    notTargetBadge: "⚠ 未保護",
    notTargetedLabel: "selector: 未指定（保護なし）",
    notTargetedWarn: "このテキストはDOM上に平文で存在します。スクレイパーがそのまま読み取れます。selectors にこの要素を追加すると保護されます。",
    copyDemoBtn: "📋 コピーして確認",
    copyResultLabel: "クリップボードに入った文字列（これがスクレイパーに渡るもの）",
    srcPeekBtn: "🔍 DOM内の実際の文字コードを見る",
    plain: "この段落は平文のままです。対象外要素は影響を受けません。",
    usageTitle: "導入側コード例",
    frameworkTitle: "主要フレームワーク対応",
    inspectorTitle: "仕組みを 3 ステップで確認する",
    inspectorNote: "保護済み要素の現在のDOM・難読化コード・描画結果を並べて確認できます。",
    counterNote: "ボタン操作で値が変わっても DOM に平文の数値は書き込まれません。値はサーバーサイドで事前に難読化済みです。",
    countUpBtn: "＋1",
    countResetBtn: "リセット",
    statusNote: "状態の切り替えは難読化済み要素の表示切替のみ。平文の文字列が DOM に現れることはありません。",
    statusStartBtn: "Start",
    statusDoneBtn: "Done",
    statusResetBtn: "Reset",
    detailSourceHtml: "① 配布HTML（難読化後のレスポンス）",
    detailDomText: "② DOM内テキスト（難読化済み PUA 文字コード）",
    detailRendered: "③ ブラウザ描画（人間には正しく読める）",
  },
  en: {
    title: "Font Obfuscator Library",
    lead: "Protect text from scrapers and headless browsers.",
    leadSub: "Obfuscates the DOM so textContent / innerText return unreadable PUA codes. Copy-paste yields garbage. The browser still renders normally for human readers.",
    proofTitle: "How does it protect?",
    proofSrcLabel: "① DOM text (what scrapers extract)",
    proofSrcNote: "textContent / innerText return unreadable PUA character codes",
    proofArrow: "→",
    proofRenderLabel: "② Browser render (what humans see)",
    proofRenderNote: "Custom font maps PUA codes back to the real glyphs",
    targetBadge: "🔒 Protected",
    notTargetBadge: "⚠ Unprotected",
    notTargetedLabel: "selector: none (no protection)",
    notTargetedWarn: "This text is plain in the DOM. Scrapers can read it directly. Add this element to selectors to protect it.",
    copyDemoBtn: "📋 Copy & see what you get",
    copyResultLabel: "What went to clipboard (what scrapers would receive)",
    srcPeekBtn: "🔍 View actual DOM character codes",
    plain: "This paragraph stays plain text and is not targeted.",
    usageTitle: "Integration Example",
    frameworkTitle: "Major Framework Adapters",
    inspectorTitle: "See how it works in 3 steps",
    inspectorNote: "Compare the current DOM, obfuscated text, and rendered output for protected elements.",
    counterNote: "Clicking never writes plaintext digits to the DOM. All values are pre-obfuscated server-side.",
    countUpBtn: "+1",
    countResetBtn: "Reset",
    statusNote: "State transitions only toggle visibility. No plaintext string is ever written to the DOM.",
    statusStartBtn: "Start",
    statusDoneBtn: "Done",
    statusResetBtn: "Reset",
    detailSourceHtml: "① Delivered HTML (obfuscated response)",
    detailDomText: "② DOM text (obfuscated PUA codes)",
    detailRendered: "③ Browser render (human-readable)",
  },
} as const;

type UiLang = keyof typeof I18N;
type I18nDict = Record<UiLang, Record<string, string>>;

const I18N_KEYS = Object.keys(I18N.ja) as Array<keyof (typeof I18N)["ja"]>;

function buildObfuscatedI18n(precomputed: PrecomputedMapping): I18nDict {
  const out = { ja: {}, en: {} } as I18nDict;
  for (const lang of Object.keys(I18N) as UiLang[]) {
    for (const key of I18N_KEYS) {
      out[lang][key] = encodeText(I18N[lang][key], precomputed.mapping, {
        variants: precomputed.variants,
        variantSeed: precomputed.seed,
      });
    }
  }
  return out;
}

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
  // First-load readability hardening: avoid short-lived URL expiry and
  // prefer blocking fallback while the protected font is loading.
  fontUrlTtlMs: 45_000,
  fontDisplay: "block",
  // Extend polymorphic (multi-variant) PUA mapping to all characters, not
  // just digits. Every character gets 4 PUA variants so frequency analysis
  // across a single page snapshot reveals nothing.
  variantCount: 4,
  // Local Deno demo has no trusted reverse proxy.
  trustedProxies: [],
  devMode: Deno.env.get("DENO_ENV") === "development",
});

function basePageHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Font Obfuscator Library Demo</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap");

    :root {
      --bg: #f5f6f8;
      --ink: #1e2532;
      --ink-muted: #64748b;
      --line: #e2e8f0;
      --card: #ffffff;
      --accent: #0891b2;
      --accent-soft: #ecfeff;
      --accent-line: #a5f3fc;
      --ok: #059669;
      --ok-bg: #ecfdf5;
      --ok-line: #6ee7b7;
      --warn: #b45309;
      --warn-bg: #fffbeb;
      --warn-line: #fcd34d;
      --code-bg: #1e293b;
      --code-line: #334155;
      --code-ink: #e2e8f0;
      --code-accent: #7dd3fc;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      font-family: "Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif;
      line-height: 1.7;
      background: var(--bg);
      min-height: 100vh;
      padding: 2rem 1.25rem 3rem;
    }

    .app {
      max-width: 1020px;
      margin: 0 auto;
      display: grid;
      gap: 1rem;
    }

    .hero,
    .card,
    .proof,
    .cards-grid,
    .usage,
    .inspect {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--card);
      opacity: 0;
      animation: reveal 300ms ease-out forwards;
    }

    .hero { padding: 1.25rem 1.35rem; }
    .card { padding: 1rem 1rem 1.1rem; }

    .proof {
      padding: 1rem 1.2rem 1.2rem;
      animation-delay: 60ms;
    }

    .cards-grid {
      background: transparent;
      border: none;
      border-radius: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
      animation: none;
      opacity: 1;
    }

    .usage {
      background: var(--code-bg);
      border: 1px solid var(--code-line);
      color: var(--code-ink);
      padding: 0.9rem 1rem;
      animation-delay: 320ms;
    }

    .inspect {
      padding: 0.9rem 1rem;
      animation-delay: 280ms;
    }

    .card:nth-child(1) { animation-delay: 90ms; }
    .card:nth-child(2) { animation-delay: 120ms; }
    .card:nth-child(3) { animation-delay: 150ms; }

    h1 {
      margin: 0 0 0.3rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: clamp(1.5rem, 2.8vw, 2.3rem);
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .lead {
      margin: 0;
      color: var(--ink);
      font-size: 1.05rem;
      font-weight: 500;
    }

    .lead-sub {
      margin: 0.3rem 0 0;
      color: var(--ink-muted);
      font-size: 0.9rem;
    }

    .lang-switch {
      margin-top: 0.85rem;
      display: inline-flex;
      gap: 0.45rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.28rem;
      background: #fff;
    }

    .lang-btn {
      border: 0;
      border-radius: 999px;
      padding: 0.38rem 0.65rem;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      font-size: 0.78rem;
      cursor: pointer;
      color: var(--ink-muted);
      background: transparent;
      margin: 0;
      transition: background-color 120ms ease, color 120ms ease;
    }

    .lang-btn.active {
      background: var(--accent);
      color: #fff;
    }

    /* PROOF SECTION */
    .proof-heading {
      margin: 0 0 0.7rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 0.96rem;
      font-weight: 700;
    }

    .proof-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0.6rem;
      align-items: center;
    }

    .proof-col-title {
      font-size: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 0.35rem;
    }

    .proof-col-title.bad  { color: var(--danger-ink); }
    .proof-col-title.good { color: var(--ok); }

    .proof-box {
      border-radius: 10px;
      padding: 0.65rem 0.75rem;
      font-size: 0.84rem;
      line-height: 1.5;
      min-height: 3rem;
      max-height: 6rem;
      overflow: auto;
      word-break: break-all;
      overflow-wrap: break-word;
    }

    .proof-box.proof-garbled {
      background: var(--code-bg);
      border: 1px solid var(--code-line);
      color: var(--code-ink);
      font-family: ui-monospace, monospace;
    }

    .proof-box.proof-rendered {
      background: var(--ok-bg);
      border: 1px solid var(--ok-line);
      color: var(--ink);
      font-size: 1rem;
      word-break: normal;
      overflow-wrap: break-word;
    }

    .proof-note {
      margin: 0.3rem 0 0;
      font-size: 0.76rem;
      color: var(--ink-muted);
    }

    .proof-arrow {
      text-align: center;
      font-size: 1.3rem;
      color: var(--ink-muted);
      padding: 0 0.25rem;
      padding-top: 1.4rem;
    }

    /* CARD LAYOUT */
    .card-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--accent-soft);
      border: 1px solid #bee3dd;
      color: #0e5b56;
      border-radius: 999px;
      padding: 0.2rem 0.65rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 0.78rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.16rem 0.52rem;
      font-size: 0.74rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
    }

    .badge-ok {
      background: #d1fae5;
      border: 1px solid var(--ok-line);
      color: #065f46;
    }

    .badge-warn {
      background: #fef3c7;
      border: 1px solid var(--warn-line);
      color: var(--warn);
    }

    p { margin: 0.72rem 0 0; }

    .plain { color: var(--ink-muted); }

    .not-targeted-note {
      margin: 0.6rem 0 0;
      padding: 0.5rem 0.65rem;
      background: var(--warn-bg);
      border: 1px solid var(--warn-line);
      border-radius: 8px;
      font-size: 0.82rem;
      color: var(--warn);
      line-height: 1.5;
    }

    /* SOURCE PEEK */
    .src-peek {
      margin-top: 0.75rem;
    }

    .src-peek summary {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.8rem;
      color: var(--ink-muted);
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      letter-spacing: 0.01em;
      padding: 0.22rem 0;
      border-bottom: 1px dashed var(--line);
      list-style: none;
      user-select: none;
    }

    .src-peek summary::-webkit-details-marker { display: none; }

    .src-peek-code {
      margin: 0.4rem 0 0;
      padding: 0.5rem 0.6rem;
      background: var(--code-bg);
      border: 1px solid var(--code-line);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.76rem;
      line-height: 1.5;
      color: var(--code-ink);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 8rem;
      overflow: auto;
    }

    /* COPY DEMO */
    .copy-demo-row {
      margin-top: 0.75rem;
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      flex-wrap: wrap;
    }

    .copy-result-label {
      font-size: 0.72rem;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--ink-muted);
      margin-bottom: 0.2rem;
      margin-top: 0.5rem;
    }

    button {
      margin-top: 0.85rem;
      border: 0;
      border-radius: 12px;
      padding: 0.6rem 0.92rem;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      font-size: 0.86rem;
      letter-spacing: 0.02em;
      color: #fff;
      background: var(--accent);
      cursor: pointer;
      transition: background-color 120ms ease;
    }

    button:hover { background: #0d665f; }

    .btn-sm {
      padding: 0.38rem 0.7rem;
      font-size: 0.78rem;
      margin-top: 0;
      border-radius: 10px;
    }

    .btn-ghost {
      background: transparent;
      border: 1px solid var(--line);
      color: var(--ink-muted);
    }

    .btn-ghost:hover { background: #f3f4f6; }

    #dynamic p {
      margin: 0.55rem 0 0;
      color: var(--ok);
      font-size: 0.94rem;
    }

    code {
      display: block;
      overflow-x: auto;
      white-space: pre;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86rem;
      line-height: 1.55;
      margin-top: 0.45rem;
      color: var(--code-accent);
    }

    .inspect-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
    }

    .inspect-title {
      margin: 0;
      font-size: 0.96rem;
      font-weight: 700;
      color: var(--ink);
    }

    .inspect-note {
      margin: 0 0 0.7rem;
      font-size: 0.86rem;
      color: var(--ink-muted);
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.6rem;
    }

    .detail-card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.6rem;
      background: #ffffff;
    }

    .detail-title {
      margin: 0 0 0.5rem;
      font-size: 0.84rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #36566d;
    }

    .detail-row {
      margin-top: 0.48rem;
      display: grid;
      gap: 0.3rem;
    }

    .detail-label {
      font-size: 0.72rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6d7a86;
      font-weight: 700;
    }

    .detail-value,
    .detail-code {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0.45rem 0.5rem;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      min-height: 2.4rem;
      font-size: 0.8rem;
    }

    .detail-code {
      background: var(--code-bg);
      border-color: var(--code-line);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--code-ink);
    }

    .detail-dom {
      background: var(--code-bg);
      border-color: var(--code-line);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--code-ink);
      margin: 0;
      border: 1px solid var(--code-line);
      border-radius: 8px;
      padding: 0.45rem 0.5rem;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      min-height: 2.4rem;
      font-size: 0.8rem;
    }

    .detail-value {
      background: var(--ok-bg);
      border-color: var(--ok-line);
      color: var(--ink);
    }

    @keyframes reveal {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dynamic-note {
      margin: 0.45rem 0 0;
      font-size: 0.78rem;
      color: var(--ink-muted);
      line-height: 1.5;
    }

    .dynamic-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    @media (max-width: 850px) {
      .cards-grid { grid-template-columns: 1fr; }
      .dynamic-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: 1fr; }
      .proof-grid { grid-template-columns: 1fr; }
      body { padding: 1rem 0.85rem 1.8rem; }
    }
  </style>
</head>
<body>
  <main class="app">

    <section class="hero">
      <h1 class="secret" data-i18n="title">${I18N.ja.title}</h1>
      <p class="lead secret" data-i18n="lead">${I18N.ja.lead}</p>
      <p class="lead-sub secret" data-i18n="leadSub">${I18N.ja.leadSub}</p>
      <div class="lang-switch" role="group" aria-label="Language Switch">
        <button id="lang-ja" class="lang-btn active" type="button">日本語</button>
        <button id="lang-en" class="lang-btn" type="button">English</button>
      </div>
    </section>

    <section class="proof">
      <p class="proof-heading secret" data-i18n="proofTitle">${I18N.ja.proofTitle}</p>
      <div class="proof-grid">
        <div>
          <div class="proof-col-title bad secret" data-i18n="proofSrcLabel">${I18N.ja.proofSrcLabel}</div>
          <div class="proof-box proof-garbled" id="proof-source"></div>
          <p class="proof-note secret" data-i18n="proofSrcNote">${I18N.ja.proofSrcNote}</p>
        </div>
        <div class="proof-arrow secret" data-i18n="proofArrow">${I18N.ja.proofArrow}</div>
        <div>
          <div class="proof-col-title good secret" data-i18n="proofRenderLabel">${I18N.ja.proofRenderLabel}</div>
          <div class="proof-box proof-rendered" id="proof-rendered"></div>
          <p class="proof-note secret" data-i18n="proofRenderNote">${I18N.ja.proofRenderNote}</p>
        </div>
      </div>
    </section>

    <div class="cards-grid">

      <article class="card">
        <div class="card-head">
          <div class="tag">selector: .obf-target</div>
          <span class="badge badge-ok secret" data-i18n="targetBadge">${I18N.ja.targetBadge}</span>
        </div>
        <p id="target-1" class="obf-target">この文章は難読化されます: Hello, world! こんにちは 12345</p>
        <p id="target-2" class="obf-target">同じセレクタの別要素も難読化されます。</p>
        <div class="copy-demo-row">
          <button id="copy-demo-obf" type="button" class="btn-sm btn-ghost secret" data-i18n="copyDemoBtn">${I18N.ja.copyDemoBtn}</button>
        </div>
        <div id="copy-result-obf" style="display:none">
          <p class="copy-result-label secret" data-i18n="copyResultLabel">${I18N.ja.copyResultLabel}</p>
          <pre class="src-peek-code" id="copy-result-obf-text"></pre>
        </div>
        <details class="src-peek">
          <summary class="secret" data-i18n="srcPeekBtn">${I18N.ja.srcPeekBtn}</summary>
          <pre class="src-peek-code" id="src-peek-obf-text"></pre>
        </details>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="tag">selector: #secret</div>
          <span class="badge badge-ok secret" data-i18n="targetBadge">${I18N.ja.targetBadge}</span>
        </div>
        <p id="secret">この要素も難読化されます。</p>
        <div class="copy-demo-row">
          <button id="copy-demo-secret" type="button" class="btn-sm btn-ghost secret" data-i18n="copyDemoBtn">${I18N.ja.copyDemoBtn}</button>
        </div>
        <div id="copy-result-secret" style="display:none">
          <p class="copy-result-label secret" data-i18n="copyResultLabel">${I18N.ja.copyResultLabel}</p>
          <pre class="src-peek-code" id="copy-result-secret-text"></pre>
        </div>
        <details class="src-peek">
          <summary class="secret" data-i18n="srcPeekBtn">${I18N.ja.srcPeekBtn}</summary>
          <pre class="src-peek-code" id="src-peek-secret-text"></pre>
        </details>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="tag secret" style="background:#fef3c7;border-color:#fcd34d;color:#92400e;" data-i18n="notTargetedLabel">${I18N.ja.notTargetedLabel}</div>
          <span class="badge badge-warn secret" data-i18n="notTargetBadge">${I18N.ja.notTargetBadge}</span>
        </div>
        <p class="plain secret" data-i18n="plain">${I18N.ja.plain}</p>
        <p class="not-targeted-note secret" data-i18n="notTargetedWarn">${I18N.ja.notTargetedWarn}</p>
      </article>

    </div>

    <div class="dynamic-grid">

      <article class="card">
        <div class="card-head">
          <div class="tag">selector: .obf-dynamic</div>
          <span class="badge badge-ok secret" data-i18n="targetBadge">${I18N.ja.targetBadge}</span>
        </div>
        <p class="dynamic-note secret" data-i18n="counterNote">${I18N.ja.counterNote}</p>
        <div id="counter-display" style="font-size:1.6rem;font-weight:700;min-height:2.4rem;margin:0.5rem 0 0;">
          <span id="count-0" class="obf-dynamic">0</span>
          <span id="count-1" class="obf-dynamic" style="display:none">1</span>
          <span id="count-2" class="obf-dynamic" style="display:none">2</span>
          <span id="count-3" class="obf-dynamic" style="display:none">3</span>
          <span id="count-4" class="obf-dynamic" style="display:none">4</span>
          <span id="count-5" class="obf-dynamic" style="display:none">5</span>
          <span id="count-6" class="obf-dynamic" style="display:none">6</span>
          <span id="count-7" class="obf-dynamic" style="display:none">7</span>
          <span id="count-8" class="obf-dynamic" style="display:none">8</span>
          <span id="count-9" class="obf-dynamic" style="display:none">9</span>
        </div>
        <div class="copy-demo-row">
          <button id="btn-count-up" type="button" class="btn-sm secret" data-i18n="countUpBtn">${I18N.ja.countUpBtn}</button>
          <button id="btn-count-reset" type="button" class="btn-sm btn-ghost secret" data-i18n="countResetBtn">${I18N.ja.countResetBtn}</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="tag">selector: .obf-dynamic</div>
          <span class="badge badge-ok secret" data-i18n="targetBadge">${I18N.ja.targetBadge}</span>
        </div>
        <p class="dynamic-note secret" data-i18n="statusNote">${I18N.ja.statusNote}</p>
        <div id="status-display" style="font-size:1.1rem;font-weight:600;min-height:2.4rem;margin:0.5rem 0 0;">
          <span id="status-idle" class="obf-dynamic">idle</span>
          <span id="status-working" class="obf-dynamic" style="display:none">working</span>
          <span id="status-done" class="obf-dynamic" style="display:none">done</span>
        </div>
        <div class="copy-demo-row">
          <button id="btn-status-working" type="button" class="btn-sm secret" data-i18n="statusStartBtn">${I18N.ja.statusStartBtn}</button>
          <button id="btn-status-done" type="button" class="btn-sm secret" data-i18n="statusDoneBtn">${I18N.ja.statusDoneBtn}</button>
          <button id="btn-status-reset" type="button" class="btn-sm btn-ghost secret" data-i18n="statusResetBtn">${I18N.ja.statusResetBtn}</button>
        </div>
      </article>

    </div>

    <section class="inspect">
      <div class="inspect-head">
        <h2 class="inspect-title secret" data-i18n="inspectorTitle">${I18N.ja.inspectorTitle}</h2>
      </div>
      <p class="inspect-note secret" data-i18n="inspectorNote">${I18N.ja.inspectorNote}</p>
      <div class="detail-grid">
        <section class="detail-card">
          <h3 class="detail-title">selector: .obf-target</h3>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailSourceHtml">${I18N.ja.detailSourceHtml}</span>
            <pre class="detail-code" id="detail-obf-source"></pre>
          </div>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailDomText">${I18N.ja.detailDomText}</span>
            <pre class="detail-dom" id="detail-obf-dom"></pre>
          </div>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailRendered">${I18N.ja.detailRendered}</span>
            <p class="detail-value" id="detail-obf-render"></p>
          </div>
        </section>
        <section class="detail-card">
          <h3 class="detail-title">selector: #secret</h3>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailSourceHtml">${I18N.ja.detailSourceHtml}</span>
            <pre class="detail-code" id="detail-secret-source"></pre>
          </div>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailDomText">${I18N.ja.detailDomText}</span>
            <pre class="detail-dom" id="detail-secret-dom"></pre>
          </div>
          <div class="detail-row">
            <span class="detail-label secret" data-i18n="detailRendered">${I18N.ja.detailRendered}</span>
            <p class="detail-value" id="detail-secret-render"></p>
          </div>
        </section>
      </div>
    </section>

    <section class="usage">
      <span class="secret" data-i18n="usageTitle">${I18N.ja.usageTitle}</span>
      <code>obfuscateHtml(html, {
  selectors: [".secret", "#secret"],
});</code>
    </section>

    <section class="usage">
      <span class="secret" data-i18n="frameworkTitle">${I18N.ja.frameworkTitle}</span>
      <code>withNextRouteHandlerObfuscation(handler, obfuscator, { selectors })
withRemixRequestHandlerObfuscation(handler, obfuscator, { selectors })
withAstroEndpointObfuscation(handler, obfuscator, { selectors })
withSvelteKitHandleObfuscation(handle, obfuscator, { selectors })
withHonoObfuscation(handler, obfuscator, { selectors })
withFetchObfuscation(handler, obfuscator, { selectors })</code>
    </section>

  </main>

  <script id="obf-i18n" type="application/json">__OBF_I18N_JSON__</script>
  <script>
    const obfI18n = (() => {
      try {
        const node = document.getElementById("obf-i18n");
        return JSON.parse(node?.textContent || "{}");
      } catch {
        return {};
      }
    })();

    let currentLang = "ja";

    function setLangButtons() {
      const isJa = currentLang === "ja";
      document.getElementById("lang-ja")?.classList.toggle("active", isJa);
      document.getElementById("lang-en")?.classList.toggle("active", !isJa);
      document.documentElement.lang = currentLang;
    }

    function applyLanguage(lang) {
      currentLang = lang;
      const dict = obfI18n[lang] || {};
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;
        const value = dict[key];
        if (typeof value === "string") {
          el.textContent = value;
        }
      });
      setLangButtons();
      setTimeout(refreshInspector, 0);
    }

    function collectSelectorText(selector) {
      return Array.from(document.querySelectorAll(selector))
        .map((el) => (el.textContent || "").trim())
        .filter((t) => t.length > 0)
        .join("\\n---\\n");
    }

    function sourceHtmlForSelector(selector) {
      if (selector === "#secret") {
        return "<p id='secret'>" + escapeCodePoints(collectSelectorText("#secret")) + "</p>";
      }
      if (selector === ".obf-target") {
        return Array.from(document.querySelectorAll(".obf-target"))
          .map((el) => {
            const id = el.id ? " id='" + el.id + "'" : "";
            return "<p" + id + " class='obf-target'>" + escapeCodePoints((el.textContent || "").trim()) + "</p>";
          })
          .join("\n");
      }
      return "";
    }

    function syncRenderPreview(selector, outputId) {
      const out = document.getElementById(outputId);
      if (!out) return;
      const text = collectSelectorText(selector);
      out.textContent = text;

      const sample = document.querySelector(selector);
      if (sample) {
        out.style.fontFamily = getComputedStyle(sample).fontFamily;
      }
    }

    function escapeCodePoints(s) {
      let out = "";
      for (let i = 0; i < s.length;) {
        const cp = s.codePointAt(i);
        if (cp >= 0xe000 && cp <= 0xf8ff) {
          out += "\\\\u{" + cp.toString(16).toUpperCase() + "}";
        } else {
          out += String.fromCodePoint(cp);
        }
        i += cp > 0xffff ? 2 : 1;
      }
      return out;
    }

    function refreshProof() {
      const firstObf = document.querySelector(".obf-target");
      if (!firstObf) return;
      const domText = firstObf.textContent || "";

      const proofSrcEl = document.getElementById("proof-source");
      if (proofSrcEl) proofSrcEl.textContent = escapeCodePoints(domText);

      const proofRenderEl = document.getElementById("proof-rendered");
      if (proofRenderEl) {
        proofRenderEl.textContent = domText;
        proofRenderEl.style.fontFamily = getComputedStyle(firstObf).fontFamily;
      }

      const obfPeek = document.getElementById("src-peek-obf-text");
      if (obfPeek) {
        const lines = Array.from(document.querySelectorAll(".obf-target"))
          .map((el) => escapeCodePoints(el.textContent || ""))
          .filter((s) => s.length > 0);
        obfPeek.textContent = lines.join("\\n");
      }

      const secretEl = document.getElementById("secret");
      const secretPeek = document.getElementById("src-peek-secret-text");
      if (secretEl && secretPeek) {
        secretPeek.textContent = escapeCodePoints(secretEl.textContent || "");
      }
    }

    function refreshInspector() {
      const detailObfSource = document.getElementById("detail-obf-source");
      const detailObfDom = document.getElementById("detail-obf-dom");
      const detailSecretSource = document.getElementById("detail-secret-source");
      const detailSecretDom = document.getElementById("detail-secret-dom");

      if (detailObfSource) detailObfSource.textContent = sourceHtmlForSelector(".obf-target");
      if (detailObfDom) detailObfDom.textContent = escapeCodePoints(collectSelectorText(".obf-target"));
      if (detailSecretSource) detailSecretSource.textContent = sourceHtmlForSelector("#secret");
      if (detailSecretDom) detailSecretDom.textContent = escapeCodePoints(collectSelectorText("#secret"));

      syncRenderPreview(".obf-target", "detail-obf-render");
      syncRenderPreview("#secret", "detail-secret-render");

      refreshProof();
    }

    document.getElementById("lang-ja")?.addEventListener("click", () => applyLanguage("ja"));
    document.getElementById("lang-en")?.addEventListener("click", () => applyLanguage("en"));

    function showCopyResult(resultContainerId, resultTextId, text) {
      const container = document.getElementById(resultContainerId);
      const pre = document.getElementById(resultTextId);
      if (!container || !pre) return;
      container.style.display = "block";
      pre.textContent = escapeCodePoints(text);
    }

    document.getElementById("copy-demo-obf")?.addEventListener("click", () => {
      const els = Array.from(document.querySelectorAll(".obf-target"));
      const text = els.map((el) => el.textContent || "").join(" ");
      navigator.clipboard?.writeText(text).catch(() => {});
      showCopyResult("copy-result-obf", "copy-result-obf-text", text);
    });

    document.getElementById("copy-demo-secret")?.addEventListener("click", () => {
      const el = document.getElementById("secret");
      const text = el?.textContent || "";
      navigator.clipboard?.writeText(text).catch(() => {});
      showCopyResult("copy-result-secret", "copy-result-secret-text", text);
    });

    var _countVal = 0;
    var _COUNT_MAX = 9;
    function _showCount(n) {
      for (var i = 0; i <= _COUNT_MAX; i++) {
        var el = document.getElementById("count-" + i);
        if (el) el.style.display = i === n ? "" : "none";
      }
    }
    document.getElementById("btn-count-up")?.addEventListener("click", function() {
      _countVal = Math.min(_countVal + 1, _COUNT_MAX);
      _showCount(_countVal);
    });
    document.getElementById("btn-count-reset")?.addEventListener("click", function() {
      _countVal = 0;
      _showCount(0);
    });

    var _statusStates = ["idle", "working", "done"];
    function _showStatus(s) {
      _statusStates.forEach(function(st) {
        var el = document.getElementById("status-" + st);
        if (el) el.style.display = st === s ? "" : "none";
      });
    }
    document.getElementById("btn-status-working")?.addEventListener("click", function() {
      _showStatus("working");
    });
    document.getElementById("btn-status-done")?.addEventListener("click", function() {
      _showStatus("done");
    });
    document.getElementById("btn-status-reset")?.addEventListener("click", function() {
      _showStatus("idle");
    });

    applyLanguage("ja");
  </script>
</body>
</html>`;
}

const PAGE_TEMPLATE_HTML = basePageHtml();
const PAGE_SELECTORS = [".secret", "#secret", ".obf-target", ".obf-dynamic"];
const I18N_HINT_TEXT = `${Object.values(I18N.ja).join(" ")} ${Object.values(I18N.en).join(" ")}`;

// Warm up source-font fetch/parse before serving traffic to reduce first-hit tofu risk.
const prewarmPromise = obfuscator.getRotatingMapping(I18N_HINT_TEXT).then(() => undefined).catch(() => undefined);

async function handler(req: Request): Promise<Response> {
  const fontResponse = await obfuscator.maybeHandleFontRequest(req);
  if (fontResponse) return fontResponse;

  const url = new URL(req.url);
  if (url.pathname !== "/" && url.pathname !== "/index.html") {
    return new Response("Not Found", { status: 404 });
  }

  await prewarmPromise;

  const precomputed = await obfuscator.getRotatingMapping(I18N_HINT_TEXT);
  const obfI18n = buildObfuscatedI18n(precomputed);
  const rawHtml = PAGE_TEMPLATE_HTML.replace("__OBF_I18N_JSON__", JSON.stringify(obfI18n));
  const html = await obfuscator.serveWithMapping(rawHtml, PAGE_SELECTORS, precomputed, {
    pageKey: url.pathname,
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

type DenoServe = (options: { port: number }, handler: (req: Request) => Response | Promise<Response>) => void;

const denoServe = (globalThis as { Deno?: { serve?: DenoServe } }).Deno?.serve;

if (!denoServe) {
  throw new Error("Deno runtime is required. Run with: deno run --allow-net main.ts");
}

denoServe({ port: 8000 }, handler);
