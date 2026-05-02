/** @jsx h */
/**
 * Generic Fetch adapter runnable example (TSX)
 *
 * Run:
 *   pnpm example:fetch:tsx
 */

import { FontObfuscator, withFetchObfuscation } from "font-obfuscator";
import { serveFetch } from "../../lib/nodeServer.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

const obfuscator = new FontObfuscator({
  fontUrl: FONT_URL,
  fontRoutePrefix: "/_obf/font",
});

type Child = VNode | string | number | boolean | null | undefined;

type VNode = {
  tag: string | ((props: Record<string, unknown>) => VNode);
  props: Record<string, unknown>;
  children: Child[];
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: unknown;
    }
  }
}

function h(tag: VNode["tag"], props: Record<string, unknown> | null, ...children: Child[]): VNode {
  return { tag, props: props ?? {}, children };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render(node: Child | Child[]): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }
  if (Array.isArray(node)) {
    return node.map(render).join("");
  }
  if (typeof node.tag === "function") {
    return render(node.tag({ ...(node.props ?? {}), children: node.children }));
  }

  const attrs = Object.entries(node.props ?? {})
    .filter(([_, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => {
      const attr = key === "className" ? "class" : key;
      if (value === true) return ` ${attr}`;
      return ` ${attr}="${escapeHtml(value)}"`;
    })
    .join("");

  const content = (node.children ?? []).map(render).join("");
  return `<${node.tag}${attrs}>${content}</${node.tag}>`;
}

function Page(): VNode {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>Fetch Adapter TSX Example</title>
      </head>
      <body>
        <h1>withFetchObfuscation (TSX)</h1>
        <p className="secret">このテキストは難読化されます。Hello World</p>
        <p className="plain">このテキストは通常表示です。</p>
      </body>
    </html>
  );
}

function baseHandler(_req: Request): Response {
  const html = "<!doctype html>" + render(<Page />);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const handler = withFetchObfuscation(baseHandler, obfuscator, {
  selectors: [".secret"],
});

console.log("[fetch-tsx-example] http://localhost:8015/");
serveFetch(handler, 8015);
