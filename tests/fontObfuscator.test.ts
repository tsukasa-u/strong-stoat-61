import { expect, it } from "vitest";
import { FontObfuscator, encodeText, preEncodeShuffled } from "../lib/index.ts";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extractMappingFromInjectedScript(html: string): Record<string, number> {
  const encMatch = html.match(/_enc=atob\("([^"]+)"\)/);
  const seedMatch = html.match(/var _seed=(\d+);/);
  if (!encMatch || !seedMatch) {
    throw new Error("failed to parse encoded mapping from injected script");
  }

  const enc = atob(encMatch[1]);
  const seed = Number(seedMatch[1]);
  const rng = mulberry32(seed);

  const decoded = new Uint8Array(enc.length);
  for (let i = 0; i < enc.length; i++) {
    decoded[i] = enc.charCodeAt(i) ^ (Math.floor(rng() * 256) & 0xff);
  }

  const mapping: Record<string, number> = {};
  for (let i = 0; i + 7 < decoded.length; i += 8) {
    const src = (decoded[i] << 24) | (decoded[i + 1] << 16) | (decoded[i + 2] << 8) | decoded[i + 3];
    const dst = (decoded[i + 4] << 24) | (decoded[i + 5] << 16) | (decoded[i + 6] << 8) | decoded[i + 7];
    if (src > 0 && dst > 0) {
      mapping[String.fromCodePoint(src)] = dst;
    }
  }
  return mapping;
}

it("maybeHandleFontRequest returns null for unrelated path", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  const req = new Request("http://localhost:8000/");
  const res = await obf.maybeHandleFontRequest(req);
  expect(res).toBeNull();
});

it("maybeHandleFontRequest returns 404 for invalid token path", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  const req = new Request("http://localhost:8000/_obf/font/not-a-token");
  const res = await obf.maybeHandleFontRequest(req);
  expect(res?.status).toBe(404);
});

it("maybeHandleFontRequest rejects non-GET/HEAD methods", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  const req = new Request("http://localhost:8000/_obf/font/not-a-token", { method: "POST" });
  const res = await obf.maybeHandleFontRequest(req);
  expect(res?.status).toBe(405);
  expect(res?.headers.get("allow")).toBe("GET, HEAD");
});

it("obfuscateHtml keeps html unchanged when selectors are empty", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  const html = "<html><head></head><body><p>Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [] });
  expect(out).toBe(html);
});

it("obfuscateHtml injects style/script for configured selectors", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, {
    selectors: [".a"],
    observeMutations: true,
    sendClientMapping: true,
  });

  expect(out).toContain("@font-face");
  expect(out).toContain("_obf/font/");
  expect(out).toContain("MutationObserver");
  expect(out).toContain(".a");
});

it("obfuscateHtml does not inject client mapping by default", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  expect(out).not.toContain("MutationObserver");
  expect(out).not.toContain("_enc=atob");
});

it("obfuscateHtml includes kanji found in html text in mapping", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">感じと漢字の確認</p></body></html>";
  const out = await obf.obfuscateHtml(html, {
    selectors: [".a"],
    observeMutations: false,
    sendClientMapping: true,
  });
  const mapping = extractMappingFromInjectedScript(out);

  expect(mapping["感"]).toBeDefined();
  expect(mapping["じ"]).toBeDefined();
  expect(mapping["漢"]).toBeDefined();
});

it("obfuscateHtml removes protected plaintext from delivered html", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class='a'>Sensitive123</p><p id='secret'>TopSecret!</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a", "#secret"], observeMutations: true });

  expect(out).not.toContain("Sensitive123");
  expect(out).not.toContain("TopSecret!");
});

it("obfuscateHtml rejects unsafe selectors", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  await expect(
    obf.obfuscateHtml("<html><head></head><body><p>x</p></body></html>", {
      selectors: [".ok", "</style><script>alert(1)</script>"],
    }),
  ).rejects.toThrow(/unsafe selector/);
});

it("obfuscateHtml rejects unsupported complex selectors", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  await expect(
    obf.obfuscateHtml("<html><head></head><body><p class='a'>x</p></body></html>", {
      selectors: [".a .b"],
    }),
  ).rejects.toThrow(/unsupported selector/);
});

it("obfuscateHtml emits strong 64-hex signature in font URL", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const out = await obf.obfuscateHtml("<html><head></head><body><p class='a'>Hello</p></body></html>", {
    selectors: [".a"],
  });

  const m = out.match(/sig=([0-9a-f]{64})/i);
  expect(m).toBeTruthy();
  expect(m?.[1].length).toBe(64);
});

it("devMode option accepts boolean flag", async () => {
  const obfWithDevMode = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    devMode: true,
  });

  const obfWithoutDevMode = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    devMode: false,
  });

  const html = "<html><head></head><body><p>Test</p></body></html>";

  const out1 = await obfWithDevMode.obfuscateHtml(html, { selectors: [] });
  const out2 = await obfWithoutDevMode.obfuscateHtml(html, { selectors: [] });

  expect(out1).toBe(html);
  expect(out2).toBe(html);
});

it("getRotatingMapping(hintHtml) includes kanji found in hint html", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const hintHtml = "<html><head></head><body><p>このテキストは難読化されます</p></body></html>";
  const pm = await obf.getRotatingMapping(hintHtml);

  expect(pm.mapping["難"]).toBeDefined();
  expect(pm.mapping["読"]).toBeDefined();
  expect(pm.mapping["化"]).toBeDefined();
});

it("preEncodeShuffled keeps deterministic lookup via indices", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>0123456789</p></body></html>");
  const values = Array.from({ length: 100 }, (_, i) => String(i));
  const { encoded, indices } = preEncodeShuffled(values, pm.mapping, {
    variants: pm.variants,
  });

  expect(encoded).toHaveLength(values.length);
  expect(indices).toHaveLength(values.length);

  const indexSet = new Set(indices);
  expect(indexSet.size).toBe(values.length);
  expect(Math.min(...indices)).toBe(0);
  expect(Math.max(...indices)).toBe(values.length - 1);

  for (let i = 0; i < values.length; i++) {
    expect(encoded[indices[i]].length).toBeGreaterThan(0);
  }
});

it("encodeText can emit multiple variants for same digit when variants are provided", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>0123456789</p></body></html>");
  const out = new Set<string>();
  for (let i = 0; i < 20; i++) {
    out.add(encodeText("0", pm.mapping, { variants: pm.variants, variantSeed: i + 1 }));
  }

  expect(out.size).toBeGreaterThan(1);
});

it("obfuscateSelectorScopeHtml does not corrupt text after void elements with target class", async () => {
  // Regression test for void element stack corruption bug:
  // <img class="obf-target"> should NOT push onto the stack, so sibling text
  // in the same parent element must NOT be obfuscated.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = `<html><head></head><body>
<div>
  <img class="obf-target" src="logo.png">
  <p id="safe">This text must NOT be obfuscated</p>
</div>
</body></html>`;

  const out = await obf.obfuscateHtml(html, { selectors: [".obf-target"] });
  // The <p id="safe"> text should pass through unchanged because <img> is a void element
  expect(out).toContain("This text must NOT be obfuscated");
});

it("FontObfuscator constructor rejects invalid fontRoutePrefix", () => {
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    fontRoutePrefix: '/_obf/font"; } body { color: red; } @font-face { src: url("',
  })).toThrow(/fontRoutePrefix/);

  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    fontRoutePrefix: "/_obf/font?evil=true",
  })).toThrow(/fontRoutePrefix/);

  // Valid prefix should not throw
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    fontRoutePrefix: "/_obf/font",
  })).not.toThrow();
});

