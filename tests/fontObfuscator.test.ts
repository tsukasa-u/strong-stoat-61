import { expect, it } from "vitest";
import * as opentypeModule from "opentype.js";
import { FontObfuscator, encodeText, preEncodeShuffled } from "../lib/index.ts";

const opentype = (opentypeModule as { default?: unknown }).default ?? opentypeModule;

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

it("maybeHandleFontRequest rejects non-GET methods (including HEAD)", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
    const req = new Request("http://localhost:8000/_obf/font/not-a-token", { method });
    const res = await obf.maybeHandleFontRequest(req);
    expect(res?.status).toBe(405);
    expect(res?.headers.get("allow")).toBe("GET");
  }
});

it("obfuscateHtml keeps html unchanged when selectors are empty", async () => {
  const obf = new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
  });

  const html = "<html><head></head><body><p>Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [] });
  expect(out).toBe(html);
});

it("obfuscateHtml injects @font-face style for configured selectors", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  expect(out).toContain("_obf/font/");
  expect(out).not.toContain("MutationObserver");
  expect(out).toContain(".a");
});

it("obfuscateHtml never injects client mapping script", async () => {
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

it("obfuscateHtml PUA-encodes kanji found in html text (server-side only)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class=\"a\">感じと漢字の確認</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  // Original characters must not appear in the output (replaced by PUA codepoints).
  expect(out).not.toContain("感");
  expect(out).not.toContain("漢");
  // No mapping script should be present.
  expect(out).not.toContain("_enc=atob");
});

it("obfuscateHtml removes protected plaintext from delivered html", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><p class='a'>Sensitive123</p><p id='secret'>TopSecret!</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a", "#secret"] });

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

  // Decoys inflate the array: encoded.length > values.length.
  expect(encoded.length).toBeGreaterThan(values.length);
  expect(indices).toHaveLength(values.length);

  // All indices must be valid positions within the (larger) encoded array.
  const indexSet = new Set(indices);
  expect(indexSet.size).toBe(values.length);
  expect(Math.min(...indices)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...indices)).toBeLessThan(encoded.length);

  // Every real value is retrievable via its index.
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

it("variantCount allocates multiple PUA variants for non-digit characters", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    variantCount: 4,
  });

  const pm = await obf.precomputeMapping("<html><body><p>Hello</p></body></html>");
  // Non-digit character "H" should have 4 variants when variantCount=4
  expect(pm.variants["H"]).toBeDefined();
  expect(pm.variants["H"].length).toBe(4);

  // Each variant must be a unique PUA codepoint
  const set = new Set(pm.variants["H"]);
  expect(set.size).toBe(4);

  // encodeText should emit different PUA codepoints for the same char with different seeds
  const encoded = new Set<string>();
  for (let i = 1; i <= 20; i++) {
    encoded.add(encodeText("H", pm.mapping, { variants: pm.variants, variantSeed: i }));
  }
  expect(encoded.size).toBeGreaterThan(1);
});

it("variantCount and digitVariantCount are independent: digits use max", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    variantCount: 2,
    digitVariantCount: 6,
  });

  const pm = await obf.precomputeMapping("<html><body><p>A0</p></body></html>");
  // Non-digit "A" gets variantCount (2) variants
  expect(pm.variants["A"].length).toBe(2);
  // Digit "0" gets max(variantCount=2, digitVariantCount=6) = 6 variants
  expect(pm.variants["0"].length).toBe(6);
});

it("variantCount and digitVariantCount are independent: larger variantCount still applies to digits", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    variantCount: 5,
    digitVariantCount: 2,
  });

  const pm = await obf.precomputeMapping("<html><body><p>A0０</p></body></html>");
  expect(pm.variants["A"].length).toBe(5);
  expect(pm.variants["0"].length).toBe(5);
  expect(pm.variants["０"].length).toBe(5);
});

it("generated font preserves source legal/attribution name records", async () => {
  const fontUrl =
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
  const obf = new FontObfuscator({ fontUrl });

  const html = "<html><head></head><body><p class=\"a\">A0漢字</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });
  const pathMatch = out.match(/url\(([^)]+)\)/);
  expect(pathMatch).toBeTruthy();
  const fontPath = pathMatch![1].trim().replace(/^['\"]|['\"]$/g, "");

  const served = await obf.maybeHandleFontRequest(new Request(`http://localhost:8000${fontPath}`));
  expect(served?.status).toBe(200);
  const generatedBytes = await served!.arrayBuffer();
  const generatedFont = (opentype as any).parse(generatedBytes);

  const srcRes = await fetch(fontUrl);
  expect(srcRes.ok).toBe(true);
  const srcBytes = await srcRes.arrayBuffer();
  const sourceFont = (opentype as any).parse(srcBytes);

  const fields = [
    "copyright",
    "license",
    "licenseURL",
    "trademark",
    "manufacturer",
    "manufacturerURL",
    "designer",
    "designerURL",
    "description",
    "version",
  ];

  // font.names structure: { windows: { copyright: { en: "..." }, ... }, macintosh: {...} }
  // Use the windows platform record as the canonical source for comparison.
  const srcWindowsNames = sourceFont.names?.windows ?? {};
  const genWindowsNames = generatedFont.names?.windows ?? {};

  let comparedAtLeastOne = false;
  for (const field of fields) {
    const srcRecord = srcWindowsNames[field];
    if (srcRecord === undefined) continue;
    comparedAtLeastOne = true;
    expect(genWindowsNames[field]).toEqual(srcRecord);
  }
  expect(comparedAtLeastOne).toBe(true);
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

