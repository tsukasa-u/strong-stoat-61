import * as fs from "node:fs";
import * as path from "node:path";
import * as opentypeModule from "opentype.js";
import * as wawoff2Module from "wawoff2";

const opentype = (opentypeModule as { default?: unknown }).default ?? opentypeModule;
const wawoff2 = (wawoff2Module as { default?: unknown }).default ?? wawoff2Module;

const Glyph = (opentype as any).Glyph;
const Path = (opentype as any).Path;
const Font = (opentype as any).Font;

const TMP_DIR = "/tmp";
const TTF_PATH = path.join(TMP_DIR, "supp-test.ttf");
const WOFF2_PATH = path.join(TMP_DIR, "supp-test.woff2");
const ROUNDTRIP_TTF_PATH = path.join(TMP_DIR, "supp-test-roundtrip.ttf");
const HTML_PATH = path.join(TMP_DIR, "supp-test.html");
const SUPP_CODEPOINT = 0xf0100;

function createRectPath(size: number): InstanceType<typeof Path> {
  const p = new Path();
  p.moveTo(100, 0);
  p.lineTo(100, size);
  p.lineTo(size, size);
  p.lineTo(size, 0);
  p.close();
  return p;
}

function buildSuppTestFont(): ArrayBuffer {
  const notdef = new Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: 1000,
    path: createRectPath(900),
  });

  const suppGlyph = new Glyph({
    name: "test_supp",
    unicode: SUPP_CODEPOINT,
    advanceWidth: 1000,
    path: createRectPath(850),
  });

  const font = new Font({
    familyName: "SuppTest",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [notdef, suppGlyph],
  });

  return font.toArrayBuffer();
}

function ensureWawoff2Available(): void {
  const moduleCandidate = wawoff2 as Record<string, unknown>;
  if (typeof moduleCandidate.compress !== "function" || typeof moduleCandidate.decompress !== "function") {
    throw new Error("wawoff2 module does not expose compress/decompress functions");
  }
}

function writeHtmlFixture(): void {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>Supplementary PUA Font Test</title>
<style>
@font-face {
  font-family: "SuppTest";
  src: url("./supp-test.woff2") format("woff2");
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
<p class="target">&#xF0100;</p>
<p id="result"></p>
<script>
document.fonts.ready.then(() => {
  const el = document.querySelector(".target");
  if (!el) {
    return;
  }
  const style = getComputedStyle(el).fontFamily;
  const result = document.getElementById("result");
  if (result) {
    result.textContent = "computed font-family: " + style;
  }
});
</script>
</body>
</html>
`;

  fs.writeFileSync(HTML_PATH, html, "utf8");
}

async function main(): Promise<void> {
  ensureWawoff2Available();

  const ttfBuffer = buildSuppTestFont();
  fs.writeFileSync(TTF_PATH, Buffer.from(ttfBuffer));

  const woff2Bytes: Uint8Array = await (wawoff2 as any).compress(new Uint8Array(ttfBuffer));
  fs.writeFileSync(WOFF2_PATH, Buffer.from(woff2Bytes));

  const roundtripTtf: Uint8Array = await (wawoff2 as any).decompress(woff2Bytes);
  fs.writeFileSync(ROUNDTRIP_TTF_PATH, Buffer.from(roundtripTtf));

  writeHtmlFixture();

  console.log("Generated:");
  console.log(`- ${TTF_PATH}`);
  console.log(`- ${WOFF2_PATH}`);
  console.log(`- ${ROUNDTRIP_TTF_PATH}`);
  console.log(`- ${HTML_PATH}`);
  console.log(`Target codepoint: U+${SUPP_CODEPOINT.toString(16).toUpperCase()}`);
  console.log("Next: run fonttools checks and browser checks (Playwright/manual).");
}

await main();
