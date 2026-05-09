/** @jsxRuntime automatic */

type ReactPageProps = {
  pathname: string;
};

function bodyFor(pathname: string) {
  if (pathname === "/counter") {
    return (
      <section>
        <h2>数値カウント</h2>
        <p className="secret">現在値: 42</p>
        <p>カウント表示の難読化サンプルです。</p>
      </section>
    );
  }
  if (pathname === "/pre-encoded") {
    return (
      <section>
        <h2>事前エンコード済み状態</h2>
        <p className="secret">secure-state: 17</p>
        <p>サーバー側で事前難読化した値を利用する例です。</p>
      </section>
    );
  }
  return (
    <section>
      <h2>通常文字列の難読化</h2>
      <p className="secret">このテキストは難読化されます。Hello World</p>
      <p>最小の HTML 変換デモです。</p>
    </section>
  );
}

export function ReactPage(props: ReactPageProps) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>Font Obfuscator Demo (React SSR)</title>
      </head>
      <body>
        <h1>Font Obfuscator Demo (React SSR)</h1>
        <nav>
          <a href="/">基本難読化</a> | <a href="/counter">カウント</a> | <a href="/pre-encoded">事前難読化状態</a>
        </nav>
        {bodyFor(props.pathname)}
      </body>
    </html>
  );
}
