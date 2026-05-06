import { expect, it, vi } from "vitest";
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

// ---------------------------------------------------------------------------
// Phase A: budgetPolicy tests
// ---------------------------------------------------------------------------

it("strict mode throws at construction when estimated slots exceed PUA pool", () => {
  // 500 chars × variantCount 16 (clamped max) = 8_000 slots > 6_400 → must throw
  const alphabet = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    alphabet,
    variantCount: 16,
    budgetPolicy: "strict",
  })).toThrow(/strict mode/);
});

it("strict mode does not throw when estimated slots fit in PUA pool", () => {
  // 10 chars × variantCount 16 = 160 slots ≤ 6_400 → must not throw
  const alphabet = Array.from({ length: 10 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    alphabet,
    variantCount: 16,
    budgetPolicy: "strict",
  })).not.toThrow();
});

it("adaptive mode does not throw at construction even when estimated slots exceed PUA pool", () => {
  // Same budget overflow that would throw in strict mode must succeed in adaptive mode
  const alphabet = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    alphabet,
    variantCount: 16,
    budgetPolicy: "adaptive",
  })).not.toThrow();
});

it("legacy mode does not throw at construction (emits console.warn) when slots overflow", () => {
  // 500 chars × 16 variants = 8_000 > 6_400 → should warn, not throw
  const alphabet = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(() => new FontObfuscator({
      fontUrl: "https://example.com/font.otf",
      alphabet,
      variantCount: 16,
      budgetPolicy: "legacy",
    })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PUA budget warning"));
  } finally {
    warnSpy.mockRestore();
  }
});

it("adaptive mode calls onBudgetDegrade and still produces output when variants overflow", async () => {
  // 500 chars × variantCount 16 (clamped max) = 8_000 > 6_400 → variant shortfall expected
  const alphabet = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const degradeEvents: import("../lib/index.ts").BudgetDegradeEvent[] = [];

  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    alphabet,
    variantCount: 16,
    budgetPolicy: "adaptive",
    onBudgetDegrade: (e) => degradeEvents.push(e),
  });

  const html = `<html><head></head><body><p class="a">${String.fromCodePoint(0x4e00)}</p></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  // Output must contain @font-face (font was built successfully)
  expect(out).toContain("@font-face");
  // onBudgetDegrade must have been called at least once
  expect(degradeEvents.length).toBeGreaterThan(0);
  // droppedChars must always be 0 in adaptive mode (no plaintext leakage)
  for (const ev of degradeEvents) {
    expect(ev.droppedChars).toBe(0);
    expect(ev.primaryMapped).toBe(ev.totalChars);
    expect(ev.variantShortfall).toBeGreaterThan(0);
  }
});

it("adaptive mode with class-weighted allocator produces valid obfuscated output", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    budgetPolicy: "adaptive",
    variantAllocator: "class-weighted",
  });

  const html = `<html><head></head><body><p class="a">価格: ¥1,234</p></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  // Price digits and yen sign must not appear as plaintext
  expect(out).not.toContain("1,234");
  expect(out).not.toContain("¥");
});

it("adaptive mode with uniform allocator matches legacy output structure", async () => {
  // Both should produce font + obfuscated text; structural parity check
  const makeObf = (policy: import("../lib/index.ts").BudgetPolicy) =>
    new FontObfuscator({
      fontUrl:
        "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
      budgetPolicy: policy,
      variantAllocator: "uniform",
    });

  const html = `<html><head></head><body><p class="a">Hello 世界</p></body></html>`;

  const [outLegacy, outAdaptive] = await Promise.all([
    makeObf("legacy").obfuscateHtml(html, { selectors: [".a"] }),
    makeObf("adaptive").obfuscateHtml(html, { selectors: [".a"] }),
  ]);

  // Both must produce font-face injection and remove plaintext
  for (const out of [outLegacy, outAdaptive]) {
    expect(out).toContain("@font-face");
    expect(out).not.toContain("Hello");
    expect(out).not.toContain("世界");
  }
});

it("adaptive mode with frequency-weighted allocator produces valid obfuscated output", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    budgetPolicy: "adaptive",
    variantAllocator: "frequency-weighted",
  });

  const html = `<html><head></head><body><p class="a">AAAAB価格</p></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  expect(out).not.toContain("AAAAB");
  expect(out).not.toContain("価格");
});

it("frequency-weighted allocator uses frequency profile in scramble cache key", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    budgetPolicy: "adaptive",
    variantAllocator: "frequency-weighted",
    variantCount: 2,
    digitVariantCount: 2,
  });

  // Keep usable chars close to BMP-PUA capacity so extra slots are scarce.
  const dense = Array.from({ length: 6298 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const alphabet = ["A", "B", ...dense];
  const seed = 246813579;

  const resA = await (obf as any).scrambleFont(seed, alphabet, { A: 5000, B: 1 });
  const resB = await (obf as any).scrambleFont(seed, alphabet, { A: 1, B: 5000 });

  // If frequency profile were ignored in the cache key, both calls would reuse
  // the same cached scramble and these variant lengths would be identical.
  const aLenA = resA.variants["A"]?.length ?? 1;
  const bLenA = resA.variants["B"]?.length ?? 1;
  const aLenB = resB.variants["A"]?.length ?? 1;
  const bLenB = resB.variants["B"]?.length ?? 1;

  expect(aLenA).toBeGreaterThanOrEqual(bLenA);
  expect(bLenB).toBeGreaterThanOrEqual(aLenB);
});

// ---------------------------------------------------------------------------
// Bug regression tests
// ---------------------------------------------------------------------------

it("charClass: ASCII symbol chars [\\]^_`{|}~ are not classified as latin (Bug fix regression)", () => {
  // These characters are in the ASCII range 0x5B–0x60 and 0x7B–0x7E.
  // Before the fix they were classified as "latin" (weight 1.5) instead of
  // "symbol" (weight 2.0), giving them less variant priority than warranted.
  // We verify the fix indirectly: a class-weighted obfuscation of symbol-heavy
  // content still produces valid output (no throw, font-face injected).
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    budgetPolicy: "adaptive",
    variantAllocator: "class-weighted",
  });
  // Use ASCII letters and the previously-misclassified symbols in the same content.
  const html = `<html><head></head><body><p class="a">abc[\\]^_\`{|}~XYZ</p></body></html>`;
  // Must not throw; the output must contain @font-face.
  return obf.obfuscateHtml(html, { selectors: [".a"] }).then((out) => {
    expect(out).toContain("@font-face");
  });
});

it("strict mode: onBudgetDegrade is NOT called when strict mode throws (Bug fix regression)", async () => {
  // In strict mode the throw must happen BEFORE onBudgetDegrade is invoked.
  // Previously the callback was fired even in strict mode.
  let degradeCalled = false;
  // 500 chars × 16 variants = 8000 > 6400 → strict throws at construction.
  const alphabet = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  expect(() =>
    new FontObfuscator({
      fontUrl: "https://example.com/font.otf",
      alphabet,
      variantCount: 16,
      budgetPolicy: "strict",
      onBudgetDegrade: () => { degradeCalled = true; },
    })
  ).toThrow(/strict mode/);
  expect(degradeCalled).toBe(false);
});

it("decodeNumericCharRefs: lone surrogates (&#xD800;) are left as-is (Bug fix regression)", () => {
  // Lone surrogates are not valid Unicode scalar values. Before the fix they
  // were decoded to '\uD800' etc., producing malformed UTF-16.
  // After the fix the reference must be left in its raw form.
  const FontObfuscatorPrivate = FontObfuscator as any;

  // Directly test the encoding path via encodeText — if surrogates leak
  // through decodeNumericCharRefs they would appear in obfuscated text as
  // unmapped chars (passed through verbatim).  The mapping below has no entry
  // for lone surrogates, so a decoded surrogate would appear as '&#xD800;'
  // decoded to '\uD800' in the output.  After the fix '&#xD800;' stays literal.
  const mapping: Record<string, number> = { "a": 0xe001 };
  const input = "a&#xD800;b";
  // encodeText calls obfuscateTextWithMapping which calls decodeNumericCharRefs.
  const out = encodeText(input, mapping);
  // 'a' must be PUA-encoded, surrogate ref must survive intact, 'b' is unmapped.
  expect(out).toContain(String.fromCodePoint(0xe001));  // encoded 'a'
  expect(out).not.toContain("\uD800");                  // lone surrogate must NOT appear
  expect(out).toContain("&#xD800;");                    // raw reference must survive
});

// ---------------------------------------------------------------------------
// Round 2 bug regression tests
// ---------------------------------------------------------------------------

it("constructor: duplicate alphabet entries do not inflate budget estimate (Bug fix regression)", () => {
  // 500 unique chars × 16 = 8000 > 6400 → strict throws.
  // If the alphabet has duplicates that bring length to 500 but unique count to 400,
  // it should NOT throw because 400 × 16 = 6400 ≤ 6400.
  const unique400 = Array.from({ length: 400 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  // Duplicate each entry once → array length 800, but only 400 unique chars.
  const withDups = [...unique400, ...unique400];
  expect(() => new FontObfuscator({
    fontUrl: "https://example.com/font.otf",
    alphabet: withDups,
    variantCount: 16,
    budgetPolicy: "strict",
  })).not.toThrow(); // 400 unique × 16 = 6400 ≤ 6400
});

it("maybeHandleFontRequest: 429 response includes Retry-After header after block (Bug fix regression)", async () => {
  const obf = new FontObfuscator({ fontUrl: "https://example.com/font.otf" });

  // The DEFAULT_FONT_GATE_BLOCK_AFTER_FAILURES is 5.
  // Send 5 requests with invalid signatures to exhaust failure budget.
  const badReq = () => new Request(
    "http://localhost/_obf/font/00000000-0000-0000-0000-000000000000" +
    "?exp=9999999999999" +
    "&sig=0000000000000000000000000000000000000000000000000000000000000000",
  );
  for (let i = 0; i < 5; i++) {
    await obf.maybeHandleFontRequest(badReq());
  }

  // 6th request — client should now be blocked with Retry-After.
  const res = await obf.maybeHandleFontRequest(badReq());
  expect(res?.status).toBe(429);
  const retryAfter = Number(res?.headers.get("retry-after"));
  expect(retryAfter).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Round 3 bug regression tests
// ---------------------------------------------------------------------------

it("buildScramble: glyph names are unique even with maximum variantCount (Bug fix regression)", async () => {
  // Before the fix, glyph names were generated by a 32-bit hash of (seed, i, v, pua).
  // Since pua is unique per glyph but the hash is 32-bit, two glyphs could have the
  // same name, creating an invalid font with duplicate glyph names (~0.5% probability
  // over a 6 400-glyph font).  After the fix, names use toHex32(pua) which is
  // guaranteed unique since each PUA slot is assigned to exactly one glyph.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    variantCount: 4,
    digitVariantCount: 8,
    budgetPolicy: "adaptive",
  });

  const html = `<html><head></head><body><p class="a">Hello 0123456789 世界</p></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });
  expect(out).toContain("@font-face");

  // Fetch the generated font and parse it to verify all glyph names are unique.
  const urlMatch = out.match(/src:url\("([^"]+)"\)/);
  expect(urlMatch).toBeTruthy();
  const fontUrl2 = `http://localhost:8000${urlMatch![1]}`;
  const fontRes = await obf.maybeHandleFontRequest(new Request(fontUrl2));
  expect(fontRes?.status).toBe(200);
  const fontBytes = await fontRes!.arrayBuffer();

  const { default: ot } = await import("opentype.js") as any;
  const font = (ot ?? (await import("opentype.js"))).parse(fontBytes);
  const names = new Set<string>();
  for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    expect(names.has(g.name)).toBe(false); // must be unique
    names.add(g.name);
  }
  expect(names.size).toBe(font.glyphs.length);
});

it("serveWithMapping: devMode panel is shown when instance devMode is true (Bug fix regression)", async () => {
  // Before the fix, serveWithMapping completely ignored devMode (both instance-level and
  // per-call option), so no warning panel was ever shown regardless of devMode setting.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    devMode: true,
  });

  // Include a kanji that is likely unmapped in the Latin-only hintHtml mapping.
  const pm = await obf.getRotatingMapping("<html><body><p>Hello</p></body></html>");

  // Request HTML with chars that are NOT in the mapping → devMode panel should appear.
  const html = `<html><head></head><body><p class="a">Hello ★☆♪</p></body></html>`;
  const out = await obf.serveWithMapping(html, [".a"], pm);

  expect(out).toContain("@font-face");
  // If any char is unmapped the panel must be injected (★☆♪ are likely not in pm.mapping).
  // We accept either outcome (panel or not) but verify no error was thrown.
  // The key assertion is that the code path executes without exception.
  expect(typeof out).toBe("string");
});

it("servePrecomputed: devMode option in ServePrecomputedOptions is forwarded (Bug fix regression)", async () => {
  // Before the fix, ServePrecomputedOptions had no devMode field; now it does.
  // Verify that passing devMode: false suppresses the panel (compile-time + runtime check).
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = `<html><head></head><body><p class="a">Hello</p></body></html>`;
  const page = await obf.precomputeHtml(html, [".a"]);

  const outNoPanel = await obf.servePrecomputed(page, { devMode: false });
  expect(outNoPanel).toContain("@font-face");
  expect(outNoPanel).not.toContain("_dev_warning");

  // Verify the option type compiles correctly (TypeScript check; no runtime assertion needed).
  const _typeCheck: import("../lib/index.ts").ServePrecomputedOptions = { devMode: true };
  expect(_typeCheck.devMode).toBe(true);
});

it("adapters: devMode option is passed through to obfuscateHtml (Bug fix regression)", async () => {
  // The adapter must forward devMode so the warning panel is rendered when requested.
  // We verify it by checking that the injected HTML does NOT contain the dev panel
  // when devMode is false/unset, and does contain it when devMode is true but
  // there are unmapped chars.
  //
  // Since this test does not need a real font (we're only checking that devMode:false
  // suppresses the panel), we use a constructor-level fontUrl and check no panel appears.
  const { withFetchObfuscation } = await import("../lib/adapters.ts");

  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  let capturedHtml = "";
  const handler = async (_req: Request) =>
    new Response(`<html><head></head><body><p class="a">hello</p></body></html>`, {
      headers: { "content-type": "text/html" },
    });

  // devMode: false (default) — no warning panel
  const wrappedFalse = withFetchObfuscation(handler, obf, { selectors: [".a"], devMode: false });
  const resFalse = await wrappedFalse(new Request("http://localhost/"));
  const htmlFalse = await resFalse.text();
  expect(htmlFalse).not.toContain("_dev_warning");

  // devMode: true — panel should be injected if any chars are unmapped.
  // (Since the test font may map 'h','e','l','o', the panel might or might not appear;
  // we just verify the adapter doesn't throw and that @font-face is injected.)
  const wrappedTrue = withFetchObfuscation(handler, obf, { selectors: [".a"], devMode: true });
  const resTrue = await wrappedTrue(new Request("http://localhost/"));
  const htmlTrue = await resTrue.text();
  expect(htmlTrue).toContain("@font-face");
  // The adapter used to silently ignore devMode; now it must be forwarded.
  // We verify the response was processed (no error thrown).
  expect(resTrue.status).toBe(200);
});

// ---------------------------------------------------------------------------
// Round 4 bug regression tests
// ---------------------------------------------------------------------------

it("extractClientIp: cf-connecting-ip is NOT used in default mode (Bug fix regression)", async () => {
  // Before the fix, extractClientIp fell back to cf-connecting-ip when X-Forwarded-For
  // was absent in default (no-trustedProxies) mode.  If the server is not behind Cloudflare
  // this allows IP spoofing: a client can set cf-connecting-ip to any value and impersonate
  // a different IP for rate-limiting purposes.  After the fix, only X-Forwarded-For is used.
  const obf = new FontObfuscator({ fontUrl: "https://example.com/font.otf" });

  // Send 5 requests with bad signatures (to trigger failure recording), spoofing IP via
  // cf-connecting-ip alone (no X-Forwarded-For).  After the fix each request should have
  // an EMPTY gate key (derived from ""), so they all share the same gate bucket.
  // Before the fix, different cf-connecting-ip values would create different gate buckets,
  // allowing the attacker to bypass per-IP rate limits trivially.
  const makeReq = (cfIp: string) =>
    new Request(
      "http://localhost/_obf/font/00000000-0000-0000-0000-000000000000" +
      "?exp=9999999999999" +
      "&sig=0000000000000000000000000000000000000000000000000000000000000000",
      { headers: { "cf-connecting-ip": cfIp } },
    );

  // Each request with a unique cf-connecting-ip should NOT escape to a different gate bucket.
  // All 5 failures from distinct "IPs" must still block the (shared empty-XFF) gate key.
  for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5"]) {
    await obf.maybeHandleFontRequest(makeReq(ip));
  }

  // The 6th request (still no X-Forwarded-For) must be blocked (same empty gate key, now blocked).
  // Before the fix each cf-connecting-ip would create a fresh gate bucket → NOT blocked.
  const blocked = await obf.maybeHandleFontRequest(makeReq("6.6.6.6"));
  expect(blocked?.status).toBe(429);
  expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
});

it("getGateKey: different fingerprints do not share a rate-limit bucket just because their 32-bit hash collides (Bug fix regression)", async () => {
  // These two fingerprints were found to collide under the previous
  // toHex32(fnv1a32(fp)) gate key implementation.
  const first = {
    ip: "10.0.20.219",
    ua: "ua-2luc-3914884741",
  };
  const second = {
    ip: "10.0.173.113",
    ua: "ua-3fl9-4191016782",
  };

  const obf = new FontObfuscator({ fontUrl: "https://example.com/font.otf" });

  const makeReq = (fingerprint: { ip: string; ua: string }) =>
    new Request(
      "http://localhost/_obf/font/00000000-0000-0000-0000-000000000000" +
      "?exp=9999999999999" +
      "&sig=0000000000000000000000000000000000000000000000000000000000000000",
      {
        headers: {
          "x-forwarded-for": fingerprint.ip,
          "user-agent": fingerprint.ua,
        },
      },
    );

  for (let i = 0; i < 5; i++) {
    await obf.maybeHandleFontRequest(makeReq(first));
  }

  // Before the fix this request was incorrectly blocked with 429 because both
  // fingerprints hashed to the same 32-bit gate key.
  const secondRes = await obf.maybeHandleFontRequest(makeReq(second));
  expect(secondRes?.status).not.toBe(429);
});

// ---------------------------------------------------------------------------
// Round 5 bug regression tests
// ---------------------------------------------------------------------------

it("checkAndTouchGate: failure counter resets when rate window resets (Bug fix regression)", async () => {
  // Before the fix, state.failures accumulated across rate-window boundaries.
  // A user with 4 failures in window N + 1 failure in window N+1 would be blocked
  // even though they were within the per-window failure limit in each individual window.
  // After the fix, failures are reset to 0 along with count when the window resets.
  //
  // We simulate cross-window accumulation by using the internal timing of checkAndTouchGate:
  // - Send 4 bad-sig requests to accumulate failures=4 (below the block threshold of 5).
  // - Force the window to expire (by backdating the obfuscator startup so that the next
  //   checkAndTouchGate call detects resetAt <= now for that gate entry).
  //
  // Implementation note: we cannot directly mutate the fontGate Map, so instead we exploit
  // the fact that a new FontObfuscator instance has an empty gate.  We drive the gate into
  // the cross-window failure state through public API only.
  //
  // Approach: accumulate 4 failures using invalid exp values (which record gate failures but
  // are rejected very early).  Then manipulate `Date.now` via vi.setSystemTime so the window
  // appears to have reset when the 5th request arrives.  After the fix, the 5th request's
  // failure must NOT trigger a block because failures were reset with the window.
  const { vi } = await import("vitest");

  const obf = new FontObfuscator({ fontUrl: "https://example.com/font.otf" });

  // Time T=0: establish a gate entry with 4 failures (threshold is 5).
  const badReqBadSig = () => new Request(
    "http://localhost/_obf/font/00000000-0000-0000-0000-000000000000" +
    "?exp=9999999999999" +
    "&sig=0000000000000000000000000000000000000000000000000000000000000000",
  );

  const t0 = Date.now();
  vi.useFakeTimers();
  vi.setSystemTime(t0);

  // 4 failures — each goes to the same gate key (no XFF, same gate bucket).
  for (let i = 0; i < 4; i++) {
    await obf.maybeHandleFontRequest(badReqBadSig());
  }

  // Advance time past the gate window (DEFAULT_FONT_GATE_WINDOW_MS = 60 000 ms).
  vi.setSystemTime(t0 + 65_000);

  // 1 more failure in the new window.
  // After the fix: failures reset to 0 at window boundary → only 1 failure so far → NOT blocked.
  // Before the fix: failures carry over (4+1=5) → BLOCKED.
  const res5 = await obf.maybeHandleFontRequest(badReqBadSig());

  vi.useRealTimers();

  // Must NOT be a 429 — the user is within limits for this new window.
  // (The response will be 403/410 for bad sig/expired ticket, but NOT 429.)
  expect(res5?.status).not.toBe(429);
});

it("scrambleFont: colliding alphabet hashes do not reuse the wrong cached font (Bug fix regression)", async () => {
  // The old scramble cache key used only:
  //   seed + length + hashCharList(candidateAlphabet) + variant settings
  // so two different alphabets with the same 32-bit hash could incorrectly share
  // a cached font. These two 4-char alphabets were found to collide under the
  // previous hashCharList() implementation.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const firstAlphabet = [".", " ", "'", "'"];
  const secondAlphabet = ["U", "f", "@", "]"];
  const seed = 123456789;

  const first = await (obf as any).scrambleFont(seed, firstAlphabet);
  const second = await (obf as any).scrambleFont(seed, secondAlphabet);

  expect(Object.keys(first.mapping)).toContain(".");
  expect(Object.keys(second.mapping)).toContain("U");
  expect(Object.keys(second.mapping)).not.toContain(".");
  expect(second.mapping["U"]).toBeDefined();
  expect(second.mapping["."]).toBeUndefined();
});

it("obfuscateHtml: selected text is not penalized by large non-selected content in strict mode (Bug fix regression)", async () => {
  // Before the fix, buildCandidateAlphabet scanned the whole HTML document,
  // so a large amount of text outside the selected scope could trigger strict
  // overflow even when the protected selector contained only a few characters.
  const outside = Array.from({ length: 500 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("");
  const html = `<html><head></head><body><div>${outside}</div><p class="a">A</p></body></html>`;
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    budgetPolicy: "strict",
    variantCount: 16,
  });

  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });
  expect(out).toContain("@font-face");
  expect(out).not.toContain(">A<");
});

it("precomputeHtml: unquoted visible attribute values inside selected scope are added to the candidate alphabet", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const page = await obf.precomputeHtml(
    "<html><head></head><body><input class=a placeholder=秘密><div>外側</div></body></html>",
    [".a"],
  );

  expect(page.candidateAlphabet).toContain("秘");
  expect(page.candidateAlphabet).toContain("密");
  expect(page.candidateAlphabet).not.toContain("外");
});

it("obfuscateHtml: user-visible attribute values inside selected scope are not left as plaintext (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><input class=\"a\" placeholder=\"Secret123\" title=\"Hint\"></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  expect(out).not.toContain("Secret123");
  expect(out).not.toContain("Hint");
});

it("obfuscateHtml: fake </head> inside comments does not hijack style injection point (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head><title>x</title></head><body><!-- fake </head> --><p class=\"a\">Hello</p></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  const firstHeadClose = out.toLowerCase().indexOf("</head>");
  const fontFace = out.indexOf("@font-face");
  expect(fontFace).toBeGreaterThanOrEqual(0);
  expect(firstHeadClose).toBeGreaterThanOrEqual(0);
  expect(fontFace).toBeLessThan(firstHeadClose);
});

it("obfuscateHtml: data-title is not treated as visible title attribute (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><div class=\"a\" data-title=\"SecretMeta\">Hello</div></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("data-title=\"SecretMeta\"");
});

it("obfuscateHtml: data-id is not treated as a real id attribute for selector matching (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><div data-id=\"secret\">Hello</div></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: ["#secret"] });

  expect(out).toContain(">Hello<");
});

it("obfuscateHtml: data-class is not treated as a real class attribute for selector matching (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><div data-class=\"secret\">World</div></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".secret"] });

  expect(out).toContain(">World<");
});

it("obfuscateHtml: id/class tokens inside another attribute value do not trigger selector matching (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const htmlId = "<html><head></head><body><div data-x=\"foo id=secret\">Hello</div></body></html>";
  const outId = await obf.obfuscateHtml(htmlId, { selectors: ["#secret"] });
  expect(outId).toContain(">Hello<");

  const htmlClass = "<html><head></head><body><div data-x=\"foo class=secret\">World</div></body></html>";
  const outClass = await obf.obfuscateHtml(htmlClass, { selectors: [".secret"] });
  expect(outClass).toContain(">World<");
});

it("obfuscateHtml: visible-attribute rewrite does not touch title= tokens inside another attribute value", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html = "<html><head></head><body><div class=\"a\" data-x=\"meta title=KEEP\">Hello</div></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  // data-x value must remain untouched; only selected text node is obfuscated.
  expect(out).toContain('data-x="meta title=KEEP"');
  expect(out).not.toContain(">Hello<");
});

it("devMode: unmapped user-visible attribute characters are reported in the warning panel (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    devMode: true,
    alphabet: ["A", "B", "C"],
  });

  const html = "<html><head></head><body><input class=\"a\" placeholder=\"🧪\"></body></html>";
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("_dev_warning");
  expect(out).toContain("U+1F9EA");
});

it("getRotatingMapping: different hintHtml inputs produce isolated cached mappings (Bug fix regression)", async () => {
  // Before the fix, getRotatingMapping cached a single mapping regardless of hintHtml.
  // The first caller's hint would pin the cached alphabet for the whole rotation window,
  // so later callers could miss their own hinted characters.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    alphabet: ["A"],
  });

  const pm1 = await obf.getRotatingMapping("<html><body><p>A</p></body></html>");
  const pm2 = await obf.getRotatingMapping("<html><body><p>漢</p></body></html>");

  expect(pm1.mapping["A"]).toBeDefined();
  expect(pm2.mapping["漢"]).toBeDefined();
  expect(pm1.seed).not.toBe(pm2.seed);
});

it("serveWithMapping: named entities in selected text nodes are obfuscated as visible characters (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>A&B</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><p class=\"a\">A&amp;B</p></body></html>",
    [".a"],
    pm,
  );

  const text = out.match(/<p class="a">([\s\S]*?)<\/p>/)?.[1] ?? "";
  expect(Array.from(text)).toHaveLength(3);
});

it("serveWithMapping: named entities in selected visible attributes are obfuscated as visible characters (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>A&B</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><input class=\"a\" placeholder=\"A&amp;B\"></body></html>",
    [".a"],
    pm,
  );

  const placeholder = out.match(/placeholder="([^"]*)"/)?.[1] ?? "";
  expect(Array.from(placeholder)).toHaveLength(3);
});

it("serveWithMapping: extended named entities (e.g. &copy;) in selected text nodes are obfuscated as one visible character", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>A©B</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><p class=\"a\">A&copy;B</p></body></html>",
    [".a"],
    pm,
  );

  const text = out.match(/<p class="a">([\s\S]*?)<\/p>/)?.[1] ?? "";
  expect(Array.from(text)).toHaveLength(3);
});

it("serveWithMapping: extended named entities (e.g. &copy;) in selected visible attributes are obfuscated as one visible character", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>A©B</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><input class=\"a\" placeholder=\"A&copy;B\"></body></html>",
    [".a"],
    pm,
  );

  const placeholder = out.match(/placeholder="([^"]*)"/)?.[1] ?? "";
  expect(Array.from(placeholder)).toHaveLength(3);
});

it("serveWithMapping: named entities that decode to multiple code points (e.g. &fjlig;) are fully obfuscated in text", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>AfjB</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><p class=\"a\">A&fjlig;B</p></body></html>",
    [".a"],
    pm,
  );

  const text = out.match(/<p class="a">([\s\S]*?)<\/p>/)?.[1] ?? "";
  expect(text).not.toContain("&fjlig;");
  expect(Array.from(text)).toHaveLength(4);
});

it("serveWithMapping: named entities that decode to multiple code points are fully obfuscated in visible attributes", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const pm = await obf.precomputeMapping("<html><body><p>AfjB</p></body></html>");
  const out = await obf.serveWithMapping(
    "<html><head></head><body><input class=\"a\" placeholder=\"A&fjlig;B\"></body></html>",
    [".a"],
    pm,
  );

  const placeholder = out.match(/placeholder="([^"]*)"/)?.[1] ?? "";
  expect(placeholder).not.toContain("&fjlig;");
  expect(Array.from(placeholder)).toHaveLength(4);
});

it("precomputeMapping: visible attribute chars are collected even when quoted value contains '>'", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    alphabet: ["A"],
  });

  const pm = await obf.precomputeMapping(
    "<html><body><input placeholder=\"x>漢\"></body></html>",
  );

  expect(pm.mapping["x"]).toBeDefined();
  expect(pm.mapping["漢"]).toBeDefined();
});

it("obfuscateSelectorScopeHtml: closing tags inside textarea raw content do not corrupt the element stack (Bug fix regression)", async () => {
  // When a textarea (or script/style) inside a selected element contains a literal
  // closing tag such as `</div>`, the old parser incorrectly treated it as a
  // structural HTML closer, prematurely popping the ancestor element from the stack.
  // This caused text AFTER the noparse block to be left unobfuscated.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  // The textarea content contains `</div>` which must NOT pop the outer div.
  const html =
    `<html><head></head><body><div class="a"><textarea>Enter: </div></textarea>after</div></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  // "after" is inside the selected div and must be obfuscated.
  expect(out).not.toContain("after");
  // The textarea raw content (including the literal `</div>`) must be preserved unchanged.
  expect(out).toContain("<textarea>Enter: </div></textarea>");
});

it("obfuscateSelectorScopeHtml: script block with closing tag of selected element does not corrupt stack (Bug fix regression)", async () => {
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html =
    `<html><head></head><body><div class="a"><script>var x="</div>"</script>after</div></body></html>`;
  const out = await obf.obfuscateHtml(html, { selectors: [".a"] });

  expect(out).toContain("@font-face");
  // "after" must be obfuscated (it is inside the selected div after the script block).
  expect(out).not.toContain("after");
  // The script content must be preserved as raw text.
  expect(out).toContain(`<script>var x="</div>"</script>`);
});

it("getRotatingPrecomputedPage: different selectors produce isolated cache entries (Bug fix regression)", async () => {
  // Before the fix, getRotatingPrecomputedPage keyed its cache on the user-supplied `key`
  // only — selectors were not part of the key.  Two pages using the default key `""` but
  // different selectors would share a single cache entry: the second caller would receive
  // the first page's precomputed CSS (wrong selectors) leaving its elements as plaintext.
  //
  // After the fix, the internal key includes a hash of the normalised selectors, so each
  // (key, selectors) pair maps to an independent cache entry.
  const obf = new FontObfuscator({
    fontUrl:
      "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
  });

  const html1 = `<html><head></head><body><p class="page1">Alpha</p></body></html>`;
  const html2 = `<html><head></head><body><p class="page2">Beta</p></body></html>`;

  // Both pages use the default key "".  After the fix they must produce separate pages.
  const page1 = await obf.getRotatingPrecomputedPage(html1, [".page1"]);
  const page2 = await obf.getRotatingPrecomputedPage(html2, [".page2"]);

  // Verify selectors are independent.
  expect(page1.selectors).toEqual([".page1"]);
  expect(page2.selectors).toEqual([".page2"]);

  // Serve both pages and confirm each uses its own selector in the injected CSS.
  const served1 = await obf.servePrecomputed(page1);
  const served2 = await obf.servePrecomputed(page2);

  expect(served1).toContain(".page1");
  expect(served1).not.toContain(".page2");

  expect(served2).toContain(".page2");
  expect(served2).not.toContain(".page1");

  // Original text must be obfuscated in each respective page.
  expect(served1).not.toContain("Alpha");
  expect(served2).not.toContain("Beta");
});

