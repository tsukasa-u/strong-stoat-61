import { expect, it } from "vitest";
import { FontObfuscator } from "../lib/index.ts";

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
  const out = await obf.obfuscateHtml(html, { selectors: [".a"], observeMutations: true });

  expect(out).toContain("@font-face");
  expect(out).toContain("_obf/font/");
  expect(out).toContain("MutationObserver");
  expect(out).toContain(".a");
});

it("obfuscateHtml includes kanji found in html text in mapping", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">感じと漢字の確認</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"], observeMutations: false });
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
