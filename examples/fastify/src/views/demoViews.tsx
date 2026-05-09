import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function DemoLayout(props: { title: string; heading: string; children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>{props.title}</title>
        <style>{"body { font-family: sans-serif; margin: 0; padding: 1.2rem; line-height: 1.6; } nav a { margin-right: .8rem; } .card { border: 1px solid #e5e7eb; border-radius: .6rem; padding: .8rem; margin-top: .8rem; }"}</style>
      </head>
      <body>
        <h1>{props.heading}</h1>
        <nav>
          <a href="/">基本難読化</a>
          <a href="/counter">カウント</a>
          <a href="/pre-encoded">事前難読化状態</a>
        </nav>
        {props.children}
      </body>
    </html>
  );
}

function pageCard(pathname: string): { title: string; body: ReactNode } {
  if (pathname === "/counter") {
    return {
      title: "カウントデモ",
      body: (
        <div className="card">
          <h2>数値カウント</h2>
          <p className="secret">現在値: 42</p>
          <p>カウント表示の難読化サンプルです。</p>
        </div>
      ),
    };
  }

  if (pathname === "/pre-encoded") {
    return {
      title: "事前難読化状態デモ",
      body: (
        <div className="card">
          <h2>事前エンコード済み状態</h2>
          <p className="secret">secure-state: 17</p>
          <p>サーバー側で事前難読化した値を利用する例です。</p>
        </div>
      ),
    };
  }

  return {
    title: "基本難読化デモ",
    body: (
      <div className="card">
        <h2>通常文字列の難読化</h2>
        <p className="secret">このテキストは難読化されます。Hello World</p>
        <p>最小の HTML 変換デモです。</p>
      </div>
    ),
  };
}

export function renderDemoView(pathname: string): string {
  const content = pageCard(pathname);
  return "<!doctype html>" + renderToStaticMarkup(
    <DemoLayout title={content.title} heading="Font Obfuscator Demo (Fastify)">
      {content.body}
    </DemoLayout>,
  );
}
