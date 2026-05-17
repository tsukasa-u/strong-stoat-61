/** @jsxRuntime automatic */

type ReactPageProps = {
  pathname: string;
};

function bodyFor(pathname: string) {
  if (pathname === "/pre-encoded") {
    return (
      <section>
        <h2>事前エンコード済み状態</h2>
        <p className="secret">workflow-state: cedar</p>
        <p>サーバー側で事前難読化した文字列状態を利用する例です。</p>
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
        <title>PUA Font Obfuscator Demo (React SSR)</title>
      </head>
      <body>
        <h1>PUA Font Obfuscator Demo (React SSR)</h1>
        <nav>
          <a href="/">基本難読化</a> | <a href="/pre-encoded">事前難読化状態</a>
        </nav>
        {bodyFor(props.pathname)}
      </body>
    </html>
  );
}
