function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 1.2rem; line-height: 1.6; }
    nav a { margin-right: .8rem; }
    .card { border: 1px solid #e5e7eb; border-radius: .6rem; padding: .8rem; margin-top: .8rem; }
  </style>
</head>
<body>
  <h1>減災ポータル (Hono)</h1>
  <nav>
    <a href="/">ダッシュボード</a>
    <a href="/evacuation">避難所</a>
    <a href="/alerts">警報</a>
  </nav>
  ${body}
</body>
</html>`;
}

export function renderDisasterView(pathname: string): string {
  if (pathname === "/evacuation") {
    return layout(
      "避難所情報",
      `<div class="card"><h2>避難所の受け入れ状況</h2><p class="secret">第1中学校: 空き 120 / 200</p><p class="secret">南コミュニティセンター: 空き 40 / 80</p><p>更新時刻: 10:30</p></div>`,
    );
  }

  if (pathname === "/alerts") {
    return layout(
      "警報情報",
      `<div class="card"><h2>気象警報と対応</h2><p class="secret">土砂災害警戒レベル: 3 (高齢者等避難)</p><p class="secret">河川水位: 観測所A 2.1m</p><p>次回更新予定: 15分後</p></div>`,
    );
  }

  return layout(
    "減災ダッシュボード",
    `<div class="card"><h2>全体状況</h2><p class="secret">対象世帯: 1,284</p><p class="secret">要配慮者確認済み: 932</p><p>このページは実運用を想定した複数画面構成のサンプルです。</p></div>`,
  );
}
