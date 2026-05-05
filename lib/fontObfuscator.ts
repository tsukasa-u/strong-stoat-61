import * as opentypeModule from "opentype.js";
import * as wawoff2Module from "wawoff2";

const opentype = (opentypeModule as { default?: unknown }).default ?? opentypeModule;
const wawoff2 = (wawoff2Module as { default?: unknown }).default ?? wawoff2Module;

export interface FontObfuscatorOptions {
  /**
   * URL of the source font file (TTF or WOFF2).  Must use the `http` or `https`
   * scheme — other schemes (e.g. `file://`) are rejected to prevent SSRF.
   */
  fontUrl: string;
  fontRoutePrefix?: string;
  /**
   * How long (ms) font tickets remain in the server's in-memory registry.
   * Tickets are one-time-use and also have their own shorter TTL (`fontUrlTtlMs`),
   * so this mainly controls how long the ticket map grows before garbage collection.
   * @default 3_600_000 (1 hour)
   */
  sessionTtlMs?: number;
  /**
   * TTL (ms) of one-time font URLs issued in HTML.
   * Increase this if first-load network latency causes occasional font fetch expiry.
   * @default 30_000
   */
  fontUrlTtlMs?: number;
  /**
   * `font-display` strategy used in injected @font-face rules.
   * `block` avoids immediate tofu/fallback rendering during first paint.
   * @default "block"
   */
  fontDisplay?: "auto" | "block" | "swap" | "fallback" | "optional";
  /**
   * Characters to include in the scrambled font.
   * Defaults to printable ASCII + hiragana + katakana + full-width alphanumerics.
   * Extend this if your content contains characters outside the default set
   * (e.g. kanji, Latin Extended, currency symbols).
   */
  alphabet?: string[];
  /**
   * Show a floating panel listing characters that appear in the selected
   * elements but are not covered by the font mapping.  Useful during
   * development to identify characters to add to `alphabet`.
   * @default false
   */
  devMode?: boolean;
  /**
   * Number of PUA variants to allocate for numeric glyphs (0-9, full-width 0-9).
   * A value > 1 makes the same digit encode to multiple possible PUA codepoints,
   * reducing inference from observing a single encoded sample.
   * @default 4
   */
  digitVariantCount?: number;
  /**
   * How often (ms) to rotate the PUA shuffle mapping.
   * After each interval a new random seed is chosen, invalidating any
   * previously captured font files and `_pre` arrays.
   * @default 120_000 (2 minutes)
   */
  mappingRotationIntervalMs?: number;
  /**
   * IP addresses of trusted reverse proxies in your infrastructure (e.g., nginx, Cloudflare).
   * When set, the library walks X-Forwarded-For right-to-left and uses the first IP
   * that is NOT in this list as the real client address for rate-limiting purposes.
   * When omitted (default), the leftmost X-Forwarded-For value is used as-is.
   * Pass an empty array `[]` to disable X-Forwarded-For entirely (identify clients by UA only).
   */
  trustedProxies?: string[];
}

export interface ObfuscateHtmlOptions {
  /** CSS selectors whose contained text nodes will be PUA-encoded (e.g. `[".secret", "#price"]`). */
  selectors: string[];
  /** Override the generated `font-family` name injected into the `@font-face` rule. */
  fontFamilyName?: string;
  /**
   * Show a floating dev panel listing any characters that appear inside the
   * selected elements but are not covered by the font mapping.
   * Overrides the instance-level `devMode` for this call.
   */
  devMode?: boolean;
  /**
   * Logical page identifier used to namespace font tickets.
   * Default: `"/"`.
   */
  pageKey?: string;
  /**
   * Opaque string that binds the font ticket to this client so it cannot be
   * replayed from a different browser session.  Obtain via
   * {@link FontObfuscator.getClientFingerprint}.
   */
  clientFingerprint?: string;
}

/**
 * The result of {@link FontObfuscator.precomputeHtml}.
 * Holds the raw HTML template and the stable mapping used to inject a fresh
 * per-request font ticket via {@link FontObfuscator.servePrecomputed}.
 * Text is re-obfuscated on every {@link FontObfuscator.servePrecomputed} call
 * so that digit-variant codepoints differ between responses.
 *
 * **Template injection** (e.g. `preEncodeShuffled` counter values): patch
 * `rawHtml` directly before storing the page object, since
 * `servePrecomputed` always starts from `rawHtml`.
 */
export interface PrecomputedPage {
  /**
   * The original HTML passed to `precomputeHtml`.  This is the template
   * re-obfuscated on every `servePrecomputed` call.
   *
   * Inject `preEncodeShuffled` values by replacing placeholder tokens in
   * `rawHtml` before caching the page object.
   */
  rawHtml: string;
  /**
   * @deprecated No longer used by `servePrecomputed` (which starts from
   * `rawHtml`).  Retained for backward compatibility only.
   */
  puaHtml: string;
  /** The seed used to build the mapping (fixed for the server lifetime). */
  seed: number;
  /** Characters included in the scrambled font. */
  candidateAlphabet: string[];
  /** char → PUA codepoint mapping derived from seed. */
  mapping: Record<string, number>;
  /** char → list of usable PUA variants (first item is `mapping[char]`). */
  variants: Record<string, number[]>;
  /** Normalised selectors that were obfuscated. */
  selectors: string[];
}

export interface ServePrecomputedOptions {
  /** Same as {@link ObfuscateHtmlOptions.pageKey}. */
  pageKey?: string;
  /** Same as {@link ObfuscateHtmlOptions.clientFingerprint}. */
  clientFingerprint?: string;
  /** Override the generated `font-family` name. */
  fontFamilyName?: string;
}

/**
 * A precomputed seed + character mapping that is stable across requests.
 * Obtain via {@link FontObfuscator.precomputeMapping} at server startup, then
 * pass to {@link FontObfuscator.serveWithMapping} on every SSR request.
 *
 * Use this instead of {@link PrecomputedPage} when the HTML body is generated
 * dynamically per-request (e.g. Nuxt, SolidStart) and cannot be pre-encoded.
 */
export interface PrecomputedMapping {
  /** Random seed used to shuffle PUA assignments (fixed for server lifetime). */
  seed: number;
  /** char → PUA codepoint, derived from `seed`. */
  mapping: Record<string, number>;
  /** char → list of usable PUA variants (first item is `mapping[char]`). */
  variants: Record<string, number[]>;
  /** The character set passed to the font scrambler. */
  candidateAlphabet: string[];
}

interface FontTicket {
  seed: number;
  token: string;
  expiry: number;
  used: boolean;
  pageKey: string;
  selectorKey: string;
  clientFingerprint?: string;
  candidateAlphabet?: string[];
  /**
   * Cached scramble result created during obfuscateHtml so the font-serve path
   * can reuse the same computation instead of rebuilding from the seed.
   */
  cachedScramble?: Promise<ScrambleResult>;
}

interface GateState {
  count: number;
  resetAt: number;
  failures: number;
  blockedUntil: number;
}

interface ScrambleResult {
  fontBytes: Uint8Array;
  mapping: Record<string, number>;
  variants: Record<string, number[]>;
}

const DEFAULT_FONT_ROUTE_PREFIX = "/_obf/font";
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_FONT_URL_TTL_MS = 30 * 1000;
const DEFAULT_FONT_GATE_WINDOW_MS = 60 * 1000;
const DEFAULT_FONT_GATE_MAX_PER_WINDOW = 20;
const DEFAULT_FONT_GATE_BLOCK_AFTER_FAILURES = 5;
const DEFAULT_FONT_GATE_BLOCK_MS = 10 * 60 * 1000;
const PUA_START = 0xE000;
const PUA_END = 0xF8FF;
const MAX_MAPPABLE_CHARS = PUA_END - PUA_START + 1;
const DEFAULT_DIGIT_VARIANT_COUNT = 4;
const MAX_DIGIT_VARIANT_COUNT = 16;
const DEFAULT_MAPPING_ROTATION_INTERVAL_MS = 2 * 60 * 1000;
const FONT_DISPLAY_VALUES = new Set(["auto", "block", "swap", "fallback", "optional"]);

const DIGIT_VARIANT_TARGETS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "０", "１", "２", "３", "４", "５", "６", "７", "８", "９",
]);

function secureRandU32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function defaultAlphabet(): string[] {
  const out: string[] = [];
  for (let cp = 0x20; cp < 0x7f; cp++) out.push(String.fromCodePoint(cp));
  for (let cp = 0x3041; cp <= 0x3096; cp++) out.push(String.fromCodePoint(cp));
  for (let cp = 0x30a1; cp <= 0x30fa; cp++) out.push(String.fromCodePoint(cp));
  for (let cp = 0xff10; cp <= 0xff19; cp++) out.push(String.fromCodePoint(cp));
  for (let cp = 0xff21; cp <= 0xff3a; cp++) out.push(String.fromCodePoint(cp));
  for (let cp = 0xff41; cp <= 0xff5a; cp++) out.push(String.fromCodePoint(cp));
  return out;
}

function extractTextCharsFromHtml(html: string): string[] {
  // Also extract characters from user-visible attribute values (placeholder, aria-label, alt, title).
  // These are rendered to the user but live inside tags, so the strip-tags pass below would miss them.
  // Characters appearing only in these attributes must still be included in the font alphabet.
  const attrRe = /\b(?:placeholder|aria-label|aria-placeholder|title|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let attrText = "";
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRe.exec(html)) !== null) {
    attrText += (attrMatch[1] ?? attrMatch[2] ?? "") + " ";
  }

  const stripped = attrText + html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const chars: string[] = [];
  const seen = new Set<string>();
  for (const ch of stripped) {
    if (/\s/u.test(ch)) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    chars.push(ch);
  }
  return chars;
}

function hashCharList(chars: string[]): number {
  let h = 2166136261;
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    h ^= cp & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (cp >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (cp >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (cp >>> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function normalizeSelectors(selectors: string[]): string[] {
  const out: string[] = [];
  for (const raw of selectors) {
    const s = raw.trim();
    if (!s) continue;
    // Guard against breaking inline style/script contexts.
    if (/[<>{};]/.test(s)) {
      throw new Error(`unsafe selector: ${s}`);
    }
    // Server-side HTML obfuscation currently supports only simple id/class selectors.
    // Reject broader CSS selectors to avoid silent no-op obfuscation.
    if (!/^[.#][A-Za-z0-9_-]+$/.test(s)) {
      throw new Error(`unsupported selector: ${s}`);
    }
    out.push(s);
  }
  return out;
}

function normalizePageKey(value: string | undefined): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "/";
}

function normalizeSelectorKey(selectors: string[]): string {
  return selectors.map((s) => s.trim()).filter((s) => s.length > 0).join("|");
}

function normalizeClientFingerprint(value: string | undefined): string | undefined {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Decode numeric HTML character references (&#48; &#x30;) in a text node.
 * Structural named entities (&amp; &lt; &gt; &quot;) are intentionally
 * left encoded because replacing them with raw characters would corrupt the
 * surrounding HTML structure.
 */
function decodeNumericCharRefs(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (_, dec) => {
      const cp = Number(dec);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : _;
    })
    .replace(/&#x([0-9a-fA-F]{1,6});/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    });
}

function obfuscateTextWithMapping(
  input: string,
  mapping: Record<string, number>,
  variants?: Record<string, number[]>,
  variantSeed?: number,
): string {
  // Decode numeric character references so that e.g. &#48; is treated as '0'
  // and gets the same PUA mapping as the literal character.
  const decoded = decodeNumericCharRefs(input);
  const useVariants = !!variants && !!variantSeed;
  const rng = useVariants ? mulberry32((variantSeed! ^ fnv1a32(decoded)) >>> 0) : null;
  let out = "";
  for (let i = 0; i < decoded.length;) {
    const cp = decoded.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    let mapped = mapping[ch];
    if (useVariants) {
      const choices = variants![ch];
      if (choices && choices.length > 1 && rng) {
        mapped = choices[Math.floor(rng() * choices.length)];
      }
    }
    out += mapped ? String.fromCodePoint(mapped) : ch;
    i += cp > 0xffff ? 2 : 1;
  }
  return out;
}

/**
 * Encode a plain-text string to PUA characters using a precomputed mapping.
 * Use this server-side to pre-encode dynamic values (e.g. counter range) so
 * that the client never receives the raw character → PUA mapping.
 */
export function encodeText(
  text: string,
  mapping: Record<string, number>,
  options?: { variants?: Record<string, number[]>; variantSeed?: number },
): string {
  return obfuscateTextWithMapping(text, mapping, options?.variants, options?.variantSeed);
}

/**
 * Pre-encode an ordered array of values and return them in a **shuffled** order
 * together with an index map so the client can resolve `values[i]` without the
 * indices being trivially sequential.
 *
 * **Decoy entries** are interspersed at random positions so that
 * `encoded.length` does not reveal the actual count of values, making it
 * harder for an attacker to infer the range of possible counter values.
 * Only positions referenced by `indices` are real; all other positions are
 * decoys with random (but valid-looking) PUA codepoints.
 *
 * The client receives both arrays and reads: `encoded[indices[i]]`.
 *
 * @example
 * // Server (per rotation):
 * const { encoded, indices } = preEncodeShuffled(
 *   Array.from({ length: 100 }, (_, i) => String(i)),
 *   mapping,
 * );
 * // inject into HTML:
 * // `var _pre=${JSON.stringify(encoded)},_preIdx=${JSON.stringify(indices)}`
 *
 * // Client onclick:
 * el.textContent = _pre[_preIdx[c]];
 */
export function preEncodeShuffled(
  values: string[],
  mapping: Record<string, number>,
  options?: { variants?: Record<string, number[]>; variantSeed?: number; decoyCount?: number },
): { encoded: string[]; indices: number[] } {
  const n = values.length;
  // Decoy entries pad the array so its length does not reveal the true value count.
  const decoyCount = options?.decoyCount ?? Math.max(5, Math.ceil(n * 0.5));
  const totalLen = n + decoyCount;

  // Choose which positions in the output array will hold decoy entries.
  const allPositions = Array.from({ length: totalLen }, (_, i) => i);
  shuffle(allPositions, mulberry32(secureRandU32()));
  const decoyPositionSet = new Set(allPositions.slice(0, decoyCount));

  // Shuffle real values so the order of encoded entries reveals nothing.
  const perm = Array.from({ length: n }, (_, i) => i);
  shuffle(perm, mulberry32(secureRandU32()));
  const baseSeed = options?.variantSeed ?? secureRandU32();

  // Build decoy strings from existing PUA codepoints (valid-looking but unreferenced).
  const puaValues = Object.values(mapping);
  const decoyRng = mulberry32(secureRandU32());
  const decoys: string[] = [];
  for (let d = 0; d < decoyCount; d++) {
    const len = 1 + Math.floor(decoyRng() * 3); // 1–3 PUA characters per decoy
    let s = "";
    for (let k = 0; k < len; k++) {
      if (puaValues.length > 0) {
        s += String.fromCodePoint(puaValues[Math.floor(decoyRng() * puaValues.length)]);
      }
    }
    decoys.push(s || String.fromCodePoint(PUA_START));
  }

  // Collect real-entry positions (those not occupied by decoys).
  const realSlots: number[] = [];
  for (let slot = 0; slot < totalLen; slot++) {
    if (!decoyPositionSet.has(slot)) realSlots.push(slot);
  }

  // Fill the output array.
  const encoded: string[] = new Array(totalLen);

  // Place encoded real values at their real slots (in shuffled order).
  for (let pos = 0; pos < n; pos++) {
    const origIdx = perm[pos];
    encoded[realSlots[pos]] = encodeText(values[origIdx], mapping, {
      variants: options?.variants,
      variantSeed: (baseSeed ^ Math.imul(pos + 1, 0x9e3779b9)) >>> 0,
    });
  }

  // Place decoys at their assigned slots.
  const decoySlots = Array.from(decoyPositionSet).sort((a, b) => a - b);
  for (let d = 0; d < decoyCount; d++) {
    encoded[decoySlots[d]] = decoys[d];
  }

  // Build index map: indices[origIdx] = position in `encoded` for that value.
  const indices = new Array<number>(n);
  for (let pos = 0; pos < n; pos++) {
    indices[perm[pos]] = realSlots[pos];
  }
  return { encoded, indices };
}

interface SelectorSets {
  ids: Set<string>;
  classes: Set<string>;
}

interface SelectorFrame {
  tagName: string;
  inTargetScope: boolean;
  inNoParseScope: boolean;
}

function buildSelectorSets(selectors: string[]): SelectorSets {
  const ids = new Set<string>();
  const classes = new Set<string>();
  for (const raw of selectors) {
    const s = raw.trim();
    if (!s) continue;
    if (s.startsWith("#") && s.length > 1) ids.add(s.slice(1));
    if (s.startsWith(".") && s.length > 1) classes.add(s.slice(1));
  }
  return { ids, classes };
}

function indexOfTagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return html.length - 1;
}

function parseTagName(rawTag: string): string | null {
  const m = rawTag.match(/^<\s*\/?\s*([a-zA-Z][\w:-]*)/);
  return m ? m[1].toLowerCase() : null;
}

function parseAttributeValue(rawTag: string, attrName: string): string | undefined {
  const re = new RegExp(
    `\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`,
    "i",
  );
  const m = rawTag.match(re);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

function matchesSelectorSets(rawTag: string, sets: SelectorSets): boolean {
  if (sets.ids.size === 0 && sets.classes.size === 0) return false;

  const idValue = parseAttributeValue(rawTag, "id");
  if (idValue && sets.ids.has(idValue.trim())) return true;

  const classValue = parseAttributeValue(rawTag, "class");
  if (!classValue) return false;
  const tokens = classValue.split(/\s+/).filter(Boolean);
  return tokens.some((token) => sets.classes.has(token));
}

// HTML5 void elements never have children or closing tags.
// We must NOT push them onto the stack or increment targetDepth,
// otherwise all subsequent sibling text would be incorrectly obfuscated.
const HTML_VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function obfuscateSelectorScopeHtml(
  html: string,
  selectors: string[],
  mapping: Record<string, number>,
  variants?: Record<string, number[]>,
  variantSeed?: number,
): string {
  const sets = buildSelectorSets(selectors);
  if (sets.ids.size === 0 && sets.classes.size === 0) return html;

  const stack: SelectorFrame[] = [];
  let targetDepth = 0;
  let noParseDepth = 0;
  let out = "";
  let i = 0;

  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const end = next === -1 ? html.length : next;
      const chunk = html.slice(i, end);
      out += (targetDepth > 0 && noParseDepth === 0)
        ? obfuscateTextWithMapping(chunk, mapping, variants, variantSeed)
        : chunk;
      i = end;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const stop = end === -1 ? html.length : end + 3;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }

    const tagEnd = indexOfTagEnd(html, i + 1);
    const rawTag = html.slice(i, tagEnd + 1);

    if (/^<\s*\//.test(rawTag)) {
      const closeName = parseTagName(rawTag);
      if (closeName) {
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].tagName !== closeName) continue;
          for (let p = stack.length - 1; p >= k; p--) {
            const frame = stack.pop()!;
            if (frame.inTargetScope) targetDepth -= 1;
            if (frame.inNoParseScope) noParseDepth -= 1;
          }
          break;
        }
      }
      out += rawTag;
      i = tagEnd + 1;
      continue;
    }

    const tagName = parseTagName(rawTag);
    // Treat void elements and explicit self-closing tags as non-container:
    // do not push them onto the stack so targetDepth is not corrupted.
    const selfClose = /\/\s*>$/.test(rawTag) || (tagName !== null && HTML_VOID_ELEMENTS.has(tagName));
    const noParseTag = tagName === "script" || tagName === "style" || tagName === "textarea";
    const inTargetScope = targetDepth > 0 || matchesSelectorSets(rawTag, sets);

    if (tagName && !selfClose) {
      stack.push({ tagName, inTargetScope, inNoParseScope: noParseTag });
      if (inTargetScope) targetDepth += 1;
      if (noParseTag) noParseDepth += 1;
    }

    out += rawTag;
    i = tagEnd + 1;
  }

  return out;
}

function injectBeforeEndTag(html: string, tag: string, injection: string): string {
  const needle = `</${tag}>`;
  const lowerHtml = html.toLowerCase();
  // Build a list of byte ranges that are inside <script> or <style> blocks so we
  // never match a closing tag that appears as a string literal in JavaScript.
  const noParseRanges: Array<[number, number]> = [];
  const noParseRe = /<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi;
  let npm: RegExpExecArray | null;
  while ((npm = noParseRe.exec(html)) !== null) {
    noParseRanges.push([npm.index, npm.index + npm[0].length]);
  }

  let idx = lowerHtml.lastIndexOf(needle);
  while (idx !== -1) {
    const inside = noParseRanges.some(([start, end]) => idx >= start && idx < end);
    if (!inside) break;
    idx = lowerHtml.lastIndexOf(needle, idx - 1);
  }

  if (idx === -1) return html + injection;
  return html.slice(0, idx) + injection + html.slice(idx);
}

/**
 * Produce a CSS string literal (double-quoted) that is safe to embed inside
 * an HTML `<style>` block.  JSON.stringify provides proper CSS quoting but
 * does NOT escape `<`, so `</style>` inside the value would prematurely close
 * the style element.  We additionally replace every `</` with `<\/`.
 */
function safeCssStringLiteral(value: string): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

/**
 * Core obfuscation engine.  Create **one instance per process** and share it
 * across all requests.
 *
 * ---
 * ### Which API to use?
 *
 * | Scenario | API |
 * |---|---|
 * | Low-traffic or fully dynamic HTML | `obfuscateHtml()` — simplest, one call per request |
 * | Static HTML template (Express, Fastify, Hono) | `precomputeHtml()` + `getRotatingPrecomputedPage()` + `servePrecomputed()` |
 * | Dynamic SSR body (Nuxt, SolidStart) | `precomputeMapping()` + `getRotatingMapping()` + `serveWithMapping()` |
 * | Framework middleware | adapter helpers in `lib/adapters.ts` |
 *
 * All patterns serve font files automatically — call `maybeHandleFontRequest()`
 * (or use an adapter) in your router and the library handles the rest.
 *
 * ---
 * **Multi-process / cluster deployments:** each worker process has its own
 * `FontObfuscator` instance with independent state.  The per-IP rate limiter
 * is therefore **not shared** across workers.  For stricter per-IP limits use
 * a shared reverse-proxy (nginx / Cloudflare) rate-limiter in front of the app.
 *
 * **Content-Security-Policy:** this library does not set CSP headers.  It is
 * strongly recommended to add at minimum `default-src 'self'` and
 * `font-src 'self'` so that XSS cannot trivially bypass the obfuscation.
 */
export class FontObfuscator {
  private readonly fontUrl: string;
  private readonly fontRoutePrefix: string;
  private readonly sessionTtlMs: number;
  private readonly fontUrlTtlMs: number;
  private readonly fontDisplay: "auto" | "block" | "swap" | "fallback" | "optional";
  private readonly alphabet: string[];
  private readonly devMode: boolean;
  private readonly hmacSecret: Uint8Array;
  private readonly hmacKeyPromise: Promise<CryptoKey>;

  private fontTickets = new Map<string, FontTicket>();
  private fontGate = new Map<string, GateState>();
  private scrambleCache = new Map<string, Promise<ScrambleResult>>();
  private srcFontPromise: Promise<any> | null = null;
  private readonly mappingRotationIntervalMs: number;
  private rotatingMappingEntry: { pm: Promise<PrecomputedMapping>; createdAt: number } | null = null;
  private rotatingPageMap = new Map<string, { page: Promise<PrecomputedPage>; createdAt: number }>();
  private readonly scrambleCacheMaxSize = 10;
  private readonly fontGateMaxSize = 50_000;
  private readonly fontTicketsMaxSize = 200_000;
  private readonly rotatingPageMapMaxSize = 50;
  private readonly digitVariantCount: number;
  private readonly trustedProxies: string[] | undefined;
  private lastCleanupAt = 0;
  private readonly recentSeeds = new Set<number>();

  constructor(options: FontObfuscatorOptions) {
    // Validate fontUrl scheme to prevent SSRF via file:// / ftp:// / etc.
    try {
      const parsedFontUrl = new URL(options.fontUrl);
      if (parsedFontUrl.protocol !== "http:" && parsedFontUrl.protocol !== "https:") {
        throw new Error(`fontUrl must use http or https, got: ${parsedFontUrl.protocol}`);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`fontUrl is not a valid URL: ${options.fontUrl}`);
      }
      throw e;
    }
    this.fontUrl = options.fontUrl;
    const prefix = options.fontRoutePrefix ?? DEFAULT_FONT_ROUTE_PREFIX;
    // Validate fontRoutePrefix to prevent CSS/path injection:
    // must be an absolute path consisting only of safe URL path characters.
    if (!/^\/[A-Za-z0-9/_-]*$/.test(prefix)) {
      throw new Error(
        `fontRoutePrefix must be an absolute path with only [A-Za-z0-9/_-] characters, got: ${prefix}`,
      );
    }
    this.fontRoutePrefix = prefix;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    const requestedFontUrlTtlMs = options.fontUrlTtlMs ?? DEFAULT_FONT_URL_TTL_MS;
    this.fontUrlTtlMs = Math.max(1000, Math.min(this.sessionTtlMs, requestedFontUrlTtlMs));
    const requestedFontDisplay = options.fontDisplay ?? "block";
    if (!FONT_DISPLAY_VALUES.has(requestedFontDisplay)) {
      throw new Error(`fontDisplay must be one of auto|block|swap|fallback|optional, got: ${requestedFontDisplay}`);
    }
    this.fontDisplay = requestedFontDisplay;
    this.alphabet = options.alphabet ?? defaultAlphabet();
    this.devMode = options.devMode ?? false;
    this.digitVariantCount = Math.max(
      1,
      Math.min(options.digitVariantCount ?? DEFAULT_DIGIT_VARIANT_COUNT, MAX_DIGIT_VARIANT_COUNT),
    );
    this.mappingRotationIntervalMs = options.mappingRotationIntervalMs ?? DEFAULT_MAPPING_ROTATION_INTERVAL_MS;
    this.trustedProxies = options.trustedProxies;
    this.hmacSecret = crypto.getRandomValues(new Uint8Array(32));
    const keyMaterial = this.hmacSecret.buffer.slice(
      this.hmacSecret.byteOffset,
      this.hmacSecret.byteOffset + this.hmacSecret.byteLength,
    ) as ArrayBuffer;
    this.hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  async maybeHandleFontRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const prefix = `${this.fontRoutePrefix}/`;
    if (!url.pathname.startsWith(prefix)) return null;

    // Only GET is supported.  HEAD is explicitly rejected because font URLs are
    // one-time-use tokens: a HEAD request from a CDN probe or reverse proxy would
    // consume the token before the browser's GET, causing the font fetch to fail
    // with 410 Gone and leaving the page text unreadable.
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "allow": "GET" },
      });
    }

    const gateKey = this.getGateKey(req);
    const gateErr = this.checkAndTouchGate(gateKey);
    if (gateErr) return gateErr;

    const token = url.pathname.slice(prefix.length);
    if (!/^[0-9a-f-]{36}$/.test(token)) {
      this.recordGateFailure(gateKey);
      return new Response("Not Found", { status: 404 });
    }

    const expRaw = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    // Reject non-decimal or suspiciously long exp values before Number() conversion.
    if (!expRaw || !/^\d{1,15}$/.test(expRaw) || !sig) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= 0) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }

    const ticket = this.getFontTicket(token);
    if (!ticket) {
      this.recordGateFailure(gateKey);
      return new Response("Session expired", { status: 410 });
    }

    // Generated sigs are always lowercase hex; reject any uppercase variant to
    // avoid the allocation of sig.toLowerCase() on every request.
    if (!/^[0-9a-f]{64}$/.test(sig)) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }

    const expectedSig = await this.signTicket(token, exp, ticket.clientFingerprint);
    if (exp !== ticket.expiry || !timingSafeEqual(sig, expectedSig)) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }
    if (ticket.clientFingerprint && ticket.clientFingerprint !== this.getClientFingerprint(req)) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }
    if (ticket.used) {
      this.recordGateFailure(gateKey);
      return new Response("Gone", { status: 410 });
    }

    ticket.used = true;
    this.clearGateFailure(gateKey);

    const alphabet = ticket.candidateAlphabet ?? this.alphabet;
    // Reuse a scramble that was pre-built during obfuscateHtml (if available)
    // to avoid building the same font twice for the same request cycle.
    const { fontBytes } = await (ticket.cachedScramble ?? this.scrambleFont(ticket.seed, alphabet));
    return new Response(fontBytes as unknown as BodyInit, {
      headers: {
        "content-type": "font/ttf",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  /**
   * Precompute the stable seed + mapping for a **static HTML template**.
   * Call once at startup (and on each rotation via `getRotatingPrecomputedPage`),
   * then call `servePrecomputed` on every request to inject only a fresh
   * per-request font ticket, avoiding per-request font-building work.
   *
   * **Injecting `preEncodeShuffled` values:** after receiving the page, patch
   * `page.rawHtml` with encoded counter/price arrays before caching:
   * ```ts
   * const page = await obfuscator.precomputeHtml(BASE_HTML, [".secret"]);
   * const { encoded, indices } = preEncodeShuffled(values, page.mapping);
   * page.rawHtml = page.rawHtml
   *   .replace('var _pre=[]', `var _pre=${JSON.stringify(encoded)}`)
   *   .replace('_preIdx=[]',  `_preIdx=${JSON.stringify(indices)}`);
   * ```
   */
  async precomputeHtml(html: string, selectors: string[]): Promise<PrecomputedPage> {
    const normalizedSelectors = normalizeSelectors(selectors);
    if (normalizedSelectors.length === 0) {
      return { rawHtml: html, puaHtml: html, seed: 0, candidateAlphabet: [], mapping: {}, variants: {}, selectors: [] };
    }
    const candidateAlphabet = this.buildCandidateAlphabet(html);
    const seed = this.generateFreshSeed();
    const { mapping, variants } = await this.scrambleFont(seed, candidateAlphabet);
    const puaHtml = obfuscateSelectorScopeHtml(
      html,
      normalizedSelectors,
      mapping,
      variants,
      secureRandU32(),
    );
    return { rawHtml: html, puaHtml, seed, candidateAlphabet, mapping, variants, selectors: normalizedSelectors };
  }

  /**
   * Precompute a stable seed + character mapping **without** needing the final
   * HTML body. Use this when HTML is generated dynamically per-request (e.g.
   * Nuxt, SolidStart). Call once at server startup and cache the result.
   *
   * If `hintHtml` is supplied the characters found in it are added to the
   * default alphabet so that all common characters are guaranteed to be mapped.
   */
  async precomputeMapping(hintHtml?: string): Promise<PrecomputedMapping> {
    const candidateAlphabet = hintHtml
      ? this.buildCandidateAlphabet(hintHtml)
      : [...this.alphabet];
    const seed = this.generateFreshSeed();
    const { mapping, variants } = await this.scrambleFont(seed, candidateAlphabet);
    return { seed, mapping, variants, candidateAlphabet };
  }

  /**
   * Per-request companion to {@link precomputeMapping} / {@link getRotatingMapping}.
   * PUA-encodes `html` with the precomputed mapping and injects a fresh
   * one-time font ticket (`<style>`) for this request.
   *
   * Use this when the HTML body is generated dynamically per-request
   * (Nuxt, SolidStart) and cannot be pre-encoded at startup.
   *
   * @example
   * ```ts
   * // Once at startup (or per rotation):
   * const pm = await obfuscator.getRotatingMapping(hintHtml);
   *
   * // Per request (e.g. Nitro render:response hook):
   * response.body = await obfuscator.serveWithMapping(response.body, [".secret"], pm, {
   *   pageKey: event.path,
   *   clientFingerprint: obfuscator.getClientFingerprint(event.node.req as unknown as Request),
   * });
   * ```
   */
  async serveWithMapping(
    html: string,
    selectors: string[],
    precomputed: PrecomputedMapping,
    options: ServePrecomputedOptions = {},
  ): Promise<string> {
    const normalizedSelectors = normalizeSelectors(selectors);
    if (normalizedSelectors.length === 0) return html;

    const { seed, mapping, variants, candidateAlphabet } = precomputed;
    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(normalizedSelectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};}${normalizedSelectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;

    let out = obfuscateSelectorScopeHtml(
      html,
      normalizedSelectors,
      mapping,
      variants,
      secureRandU32(),
    );
    out = injectBeforeEndTag(out, "head", style);
    return out;
  }

  /**
   * Returns the current rotating mapping, regenerating it after
   * `mappingRotationIntervalMs` (default 2 min).  Rotation limits how long a
   * captured `_pre` array or downloaded font file remains exploitable.
   *
   * Call this **per-request** in SSR handlers instead of caching
   * `precomputeMapping()` at module scope.
   *
   * @param hintHtml Optional HTML snippet whose characters are added to the
   *   alphabet so they are guaranteed to be mapped even before the first real
   *   request arrives.
   */
  getRotatingMapping(hintHtml?: string): Promise<PrecomputedMapping> {
    const now = Date.now();
    if (
      !this.rotatingMappingEntry ||
      now - this.rotatingMappingEntry.createdAt >= this.mappingRotationIntervalMs
    ) {
      const pm = this.precomputeMapping(hintHtml);
      // Clear the cached entry on failure so the next call can retry.
      pm.catch(() => {
        if (this.rotatingMappingEntry?.pm === pm) {
          this.rotatingMappingEntry = null;
        }
      });
      this.rotatingMappingEntry = { pm, createdAt: now };
    }
    return this.rotatingMappingEntry.pm;
  }

  /**
   * Returns the current rotating precomputed page for a **static HTML template**.
   * Re-runs `precomputeHtml` after `mappingRotationIntervalMs` so that
   * old fonts and captured HTML become useless after each rotation window.
   *
   * Pass the result to `servePrecomputed` on every request.
   *
   * @param html  The static HTML template (only re-evaluated on rotation).
   * @param selectors  CSS selectors whose text nodes should be obfuscated.
   * @param key  Cache key for distinguishing multiple pages (default `""`).
   */
  getRotatingPrecomputedPage(
    html: string,
    selectors: string[],
    key = "",
  ): Promise<PrecomputedPage> {
    const now = Date.now();
    const entry = this.rotatingPageMap.get(key);
    if (!entry || now - entry.createdAt >= this.mappingRotationIntervalMs) {
      // Evict oldest entry when the map is full.
      if (!entry && this.rotatingPageMap.size >= this.rotatingPageMapMaxSize) {
        const oldest = this.rotatingPageMap.keys().next().value;
        if (oldest !== undefined) this.rotatingPageMap.delete(oldest);
      }
      const page = this.precomputeHtml(html, selectors);
      // Clear the cached entry on failure so the next call can retry.
      page.catch(() => {
        if (this.rotatingPageMap.get(key)?.page === page) {
          this.rotatingPageMap.delete(key);
        }
      });
      const newEntry = { page, createdAt: now };
      this.rotatingPageMap.set(key, newEntry);
    }
    return this.rotatingPageMap.get(key)!.page;
  }

  /**
   * Per-request companion to `precomputeHtml` / `getRotatingPrecomputedPage`.
   * Injects a fresh one-time font ticket into the precomputed page and
   * re-obfuscates the text with a new random digit-variant seed so each
   * response looks different even within the same rotation window.
   *
   * Starts from `page.rawHtml` on every call; any template replacements
   * (e.g. `preEncodeShuffled` arrays) must be applied to `page.rawHtml`
   * before the page object is cached (see `precomputeHtml` JSDoc).
   */
  async servePrecomputed(page: PrecomputedPage, options: ServePrecomputedOptions = {}): Promise<string> {
    const { rawHtml, puaHtml, seed, candidateAlphabet, mapping, variants, selectors } = page;
    if (selectors.length === 0) return rawHtml ?? puaHtml;

    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(selectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;

    // Re-obfuscate per request with a fresh variantSeed so digit-variant
    // codepoints differ between responses within the same rotation window.
    const source = rawHtml ?? puaHtml;
    let out = obfuscateSelectorScopeHtml(source, selectors, mapping, variants ?? {}, secureRandU32());
    out = injectBeforeEndTag(out, "head", style);
    return out;
  }

  /**
   * All-in-one per-request obfuscation for **fully dynamic HTML**.
   *
   * Builds a fresh font + mapping on every call.  For static templates or
   * SSR frameworks use `getRotatingPrecomputedPage` + `servePrecomputed` or
   * `getRotatingMapping` + `serveWithMapping` instead to avoid redundant
   * font-build work on each request.
   *
   * @param html - The full HTML string to obfuscate.
   * @param options - Must include `selectors` (e.g. `[".secret", "#price"]`).
   */
  async obfuscateHtml(
    html: string,
    options: ObfuscateHtmlOptions,
  ): Promise<string> {
    const selectors = normalizeSelectors(options.selectors);
    if (selectors.length === 0) return html;

    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(selectors);
    const selectorHash = fnv1a32(`${pageKey}|${selectorKey}`);
    const scopedSeed = (secureRandU32() ^ selectorHash) >>> 0;
    const candidateAlphabet = this.buildCandidateAlphabet(html);
    const ticket = await this.createFontTicket({
      seed: scopedSeed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });
    // Build the scramble once here. Store the promise on the ticket so that
    // maybeHandleFontRequest can reuse it instead of rebuilding from the seed.
    // Use the uncached buildScramble path because obfuscateHtml uses a fresh
    // seed every call and we don't want to pollute the precomputed rotation cache.
    const scramblePromise = this.buildScramble(ticket.seed, candidateAlphabet);
    const storedTicket = this.fontTickets.get(ticket.token);
    if (storedTicket) storedTicket.cachedScramble = scramblePromise;
    const { mapping, variants } = await scramblePromise;

    const devMode = options.devMode ?? this.devMode;
    let unmappedChars: Set<string> | null = null;
    if (devMode) {
      unmappedChars = this.findUnmappedChars(html, selectors, mapping);
    }

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;

    let out = obfuscateSelectorScopeHtml(html, selectors, mapping, variants, secureRandU32());
    out = injectBeforeEndTag(out, "head", style);

    if (devMode && unmappedChars && unmappedChars.size > 0) {
      const warningHtml = this.buildDevWarningPanel(unmappedChars, selectors);
      out = injectBeforeEndTag(out, "body", warningHtml);
    }

    return out;
  }

  private buildCandidateAlphabet(html: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const dynamicChars = extractTextCharsFromHtml(html);

    for (const ch of dynamicChars) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      out.push(ch);
    }

    for (const ch of this.alphabet) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      out.push(ch);
    }

    return out;
  }

  private findUnmappedChars(
    html: string,
    selectors: string[],
    mapping: Record<string, number>,
  ): Set<string> {
    const unmapped = new Set<string>();
    
    // Strip HTML tags/scripts/styles/textarea, leaving only text content.
    // Must mirror the same exclusions as extractTextCharsFromHtml so that
    // chars in noparse blocks (e.g. textarea) are not falsely reported.
    let textContent = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    // Also decode numeric char refs so we flag the same chars as the HTML
    // entity bypass fix in obfuscateTextWithMapping.
    textContent = decodeNumericCharRefs(textContent);
    
    // Check characters in text that would appear in selected elements
    // (conservative: check all visible text, not just selector-matched elements)
    for (const ch of textContent) {
      if (!/\s/u.test(ch) && !mapping[ch]) {
        unmapped.add(ch);
      }
    }
    return unmapped;
  }

  private buildDevWarningPanel(
    unmappedChars: Set<string>,
    selectors: string[],
  ): string {
    const chars = Array.from(unmappedChars);
    const codes = chars
      .map((ch) => {
        const cp = ch.codePointAt(0)!;
        // HTML-escape the literal character so that chars like < > & in the
        // alphabet cannot inject markup into the devMode warning panel.
        const escaped = ch
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `U+${cp.toString(16).toUpperCase().padStart(4, "0")} (${escaped})`;
      })
      .join(", ");

    const style = `
<style>
._dev_warning {
  position: fixed;
  bottom: 20px;
  right: 20px;
  max-width: 420px;
  border: 2px solid #ff6b6b;
  border-radius: 10px;
  background: #fff5f5;
  padding: 14px 16px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #c92a2a;
  z-index: 999999;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-height: 240px;
  overflow-y: auto;
  line-height: 1.6;
}
._dev_warning::before {
  content: "⚠ Dev Mode: Unmapped Characters";
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
  color: #d9480f;
}
._dev_warning strong { color: #a61e4d; }
._dev_warning button {
  display: block;
  margin-top: 8px;
  background: #ff6b6b;
  color: white;
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: background 120ms;
}
._dev_warning button:hover { background: #fa5252; }
</style>
`;

    const div = `<div class="_dev_warning">
  <strong>Selectors:</strong> ${selectors.join(", ")}<br>
  <strong>Unmapped (${chars.length}):</strong> ${codes}<br>
  <button onclick="this.parentNode.remove()">Dismiss</button>
</div>`;

    return style + div;
  }

  private async createFontTicket(input: {
    seed: number;
    pageKey: string;
    selectorKey: string;
    candidateAlphabet: string[];
    clientFingerprint?: string;
  }): Promise<FontTicket & { sig: string }> {
    const now = Date.now();
    this.cleanupState(now);

    const token = crypto.randomUUID();
      // Hard cap: if the map is still full after cleanup, evict the oldest ticket.
      if (this.fontTickets.size >= this.fontTicketsMaxSize) {
        const oldest = this.fontTickets.keys().next().value;
        if (oldest !== undefined) this.fontTickets.delete(oldest);
      }
    const expiry = now + this.fontUrlTtlMs;
    const ticket: FontTicket = {
      seed: input.seed,
      token,
      expiry,
      used: false,
      pageKey: input.pageKey,
      selectorKey: input.selectorKey,
      candidateAlphabet: input.candidateAlphabet,
      clientFingerprint: input.clientFingerprint,
    };

    this.fontTickets.set(token, ticket);
    const sig = await this.signTicket(token, expiry, ticket.clientFingerprint);
    return { ...ticket, sig };
  }

  private getFontTicket(token: string): FontTicket | null {
    const t = this.fontTickets.get(token);
    if (!t) return null;
    if (t.expiry < Date.now()) {
      this.fontTickets.delete(token);
      return null;
    }
    return t;
  }

  private async signTicket(token: string, expiry: number, clientFingerprint?: string): Promise<string> {
    const fp = clientFingerprint ?? "-";
    const key = await this.hmacKeyPromise;
    const payload = new TextEncoder().encode(`${token}|${expiry}|${fp}`);
    const sig = await crypto.subtle.sign("HMAC", key, payload);
    return toHex(new Uint8Array(sig));
  }

  private extractClientIp(headers: Headers): string {
    if (this.trustedProxies === undefined) {
      // Legacy mode (no proxy config): trust leftmost X-Forwarded-For value.
      return (headers.get("x-forwarded-for") ?? headers.get("cf-connecting-ip") ?? "")
        .split(",")[0]
        .trim();
    }
    if (this.trustedProxies.length === 0) {
      // Explicit hardening mode: ignore all forwarded-IP headers.
      return "";
    }
    // Trusted-proxy mode: walk XFF right-to-left, return first non-trusted IP.
    // Cloudflare's dedicated header takes priority when set and non-trusted.
    const cfIp = headers.get("cf-connecting-ip") ?? "";
    if (cfIp && !this.trustedProxies.includes(cfIp)) return cfIp;
    const xff = headers.get("x-forwarded-for") ?? "";
    const candidates = xff.split(",").map((s) => s.trim()).filter(Boolean).reverse();
    for (const ip of candidates) {
      if (!this.trustedProxies.includes(ip)) return ip;
    }
    // All addresses were trusted proxies or headers were absent — identify by UA only.
    return "";
  }

  getClientFingerprint(req: Request): string {
    const ua = req.headers.get("user-agent") ?? "";
    const ip = this.extractClientIp(req.headers);
    return `${ip}|${ua}`;
  }

  private getGateKey(req: Request): string {
    const fp = this.getClientFingerprint(req);
    return toHex32(fnv1a32(fp));
  }

  private checkAndTouchGate(key: string): Response | null {
    const now = Date.now();
    const state = this.fontGate.get(key) ?? {
      count: 0,
      resetAt: now + DEFAULT_FONT_GATE_WINDOW_MS,
      failures: 0,
      blockedUntil: 0,
    };

    if (state.blockedUntil > now) {
      this.fontGate.set(key, state);
      return new Response("Too Many Requests", { status: 429 });
    }

    if (state.resetAt <= now) {
      state.count = 0;
      state.resetAt = now + DEFAULT_FONT_GATE_WINDOW_MS;
    }

    state.count += 1;
    // Evict oldest entry when the gate map reaches its size cap to prevent
    // unbounded memory growth under a distributed IP flood attack.
    if (!this.fontGate.has(key) && this.fontGate.size >= this.fontGateMaxSize) {
      const oldest = this.fontGate.keys().next().value;
      if (oldest !== undefined) this.fontGate.delete(oldest);
    }
    this.fontGate.set(key, state);
    if (state.count > DEFAULT_FONT_GATE_MAX_PER_WINDOW) {
      return new Response("Too Many Requests", { status: 429 });
    }

    return null;
  }

  private recordGateFailure(key: string): void {
    const now = Date.now();
    const state = this.fontGate.get(key) ?? {
      count: 0,
      resetAt: now + DEFAULT_FONT_GATE_WINDOW_MS,
      failures: 0,
      blockedUntil: 0,
    };
    state.failures += 1;
    if (state.failures >= DEFAULT_FONT_GATE_BLOCK_AFTER_FAILURES) {
      state.blockedUntil = now + DEFAULT_FONT_GATE_BLOCK_MS;
      state.failures = 0;
    }
    this.fontGate.set(key, state);
  }

  private clearGateFailure(key: string): void {
    const state = this.fontGate.get(key);
    if (!state) return;
    state.failures = 0;
    this.fontGate.set(key, state);
  }

  private cleanupState(now: number): void {
    // Throttle to at most once every 30 s to avoid an O(n) scan on every request.
    if (now - this.lastCleanupAt < 30_000) return;
    this.lastCleanupAt = now;
    for (const [token, ticket] of this.fontTickets) {
      if (ticket.expiry < now || ticket.used) this.fontTickets.delete(token);
    }
    for (const [k, gate] of this.fontGate) {
      const stale = gate.resetAt + DEFAULT_FONT_GATE_BLOCK_MS < now && gate.blockedUntil < now;
      if (stale) this.fontGate.delete(k);
    }
  }

  /**
   * Return a securely random U32 seed that has not been used in the last 1000
   * rotations, so consecutive rotations always produce a distinct mapping.
   */
  private generateFreshSeed(): number {
    let seed: number;
    do {
      seed = secureRandU32();
    } while (this.recentSeeds.has(seed));
    this.recentSeeds.add(seed);
    if (this.recentSeeds.size > 1000) {
      const oldest = this.recentSeeds.values().next().value;
      if (oldest !== undefined) this.recentSeeds.delete(oldest);
    }
    return seed;
  }

  private loadSourceFont(): Promise<any> {
    if (!this.srcFontPromise) {
      const p = (async () => {
        const ac = new AbortController();
        const fetchTimer = setTimeout(
          () => ac.abort(new Error("font fetch timed out after 30 s")),
          30_000,
        );
        let res: Response;
        try {
          res = await fetch(this.fontUrl, { signal: ac.signal });
        } finally {
          clearTimeout(fetchTimer);
        }
        if (!res.ok) throw new Error(`failed to fetch font: ${res.status}`);
        let bytes = new Uint8Array(await res.arrayBuffer());

        if (
          bytes.length >= 4 && bytes[0] === 0x77 && bytes[1] === 0x4f &&
          bytes[2] === 0x46 && bytes[3] === 0x32
        ) {
          const decompressed: Uint8Array<ArrayBuffer> = await (wawoff2 as any)
            .decompress(bytes) as Uint8Array<ArrayBuffer>;
          bytes = decompressed;
        }

        return (opentype as any).parse(bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ));
      })();
      // Clear the cached promise on failure so subsequent calls can retry.
      this.srcFontPromise = p.catch((e) => {
        this.srcFontPromise = null;
        throw e;
      });
    }
    return this.srcFontPromise;
  }

  /** Build a scrambled font. Called by scrambleFont (cached path) and obfuscateHtml (uncached path). */
  private async buildScramble(seed: number, candidateAlphabet: string[]): Promise<ScrambleResult> {
    const srcFont = await this.loadSourceFont();

    const usable: string[] = [];
    for (const ch of candidateAlphabet) {
      const gid = srcFont.charToGlyphIndex(ch);
      if (gid && gid !== 0) usable.push(ch);
    }
    if (usable.length === 0) {
      throw new Error("no usable glyphs in source font for alphabet");
    }
    if (usable.length > MAX_MAPPABLE_CHARS) {
      usable.length = MAX_MAPPABLE_CHARS;
    }

    const puaPool: number[] = [];
    for (let i = 0; i < MAX_MAPPABLE_CHARS; i++) puaPool.push(PUA_START + i);
    shuffle(puaPool, mulberry32(seed));

    const Glyph: any = (opentype as any).Glyph;
    const Path: any = (opentype as any).Path;
    const Font: any = (opentype as any).Font;

    const notdefSrc = srcFont.glyphs.get(0);
    const notdef = new Glyph({
      name: ".notdef",
      unicode: 0,
      advanceWidth: notdefSrc?.advanceWidth ?? srcFont.unitsPerEm,
      path: notdefSrc?.path ?? new Path(),
    });

    const newGlyphs: any[] = [notdef];
    const mapping: Record<string, number> = {};
    const variants: Record<string, number[]> = {};

    // First pass: assign one primary codepoint to every usable character.
    let puaIdx = 0;
    for (let i = 0; i < usable.length; i++) {
      const ch = usable[i];
      const pua = puaPool[puaIdx++];
      mapping[ch] = pua;
      variants[ch] = [pua];
    }

    // Second pass: allocate additional variants for numeric glyphs.
    if (this.digitVariantCount > 1) {
      for (const ch of usable) {
        if (!DIGIT_VARIANT_TARGETS.has(ch)) continue;
        const bucket = variants[ch];
        while (bucket.length < this.digitVariantCount && puaIdx < puaPool.length) {
          bucket.push(puaPool[puaIdx++]);
        }
      }
    }

    for (let i = 0; i < usable.length; i++) {
      const ch = usable[i];
      const srcGlyph = srcFont.charToGlyph(ch);
      for (let v = 0; v < variants[ch].length; v++) {
        const pua = variants[ch][v];
        newGlyphs.push(new Glyph({
          // Opaque deterministic name: never reveals the original character.
          // Prevents fonttools / name-table attacks that map PUA → glyph name → original char.
          name: `g${toHex32(Math.imul((seed ^ i ^ v) + 0x9e3779b9, pua + 0x6c62272e) >>> 0)}`,
          unicode: pua,
          advanceWidth: srcGlyph.advanceWidth,
          path: srcGlyph.path,
        }));
      }
    }

    const newFont = new Font({
      familyName: "Obfuscated",
      styleName: "Regular",
      unitsPerEm: srcFont.unitsPerEm,
      ascender: srcFont.ascender,
      descender: srcFont.descender,
      glyphs: newGlyphs,
    });

    const ab: ArrayBuffer = newFont.toArrayBuffer();
    return { fontBytes: new Uint8Array(ab), mapping, variants };
  }

  private scrambleFont(seed: number, candidateAlphabet: string[]): Promise<ScrambleResult> {
    const cacheKey = `${seed}:${candidateAlphabet.length}:${hashCharList(candidateAlphabet)}:${this.digitVariantCount}`;
    const cached = this.scrambleCache.get(cacheKey);
    if (cached) return cached;

    // LRU eviction: keep the cache bounded so old rotation entries don't accumulate.
    if (this.scrambleCache.size >= this.scrambleCacheMaxSize) {
      const oldest = this.scrambleCache.keys().next().value;
      if (oldest !== undefined) this.scrambleCache.delete(oldest);
    }

    const p = this.buildScramble(seed, candidateAlphabet);
    // Clear the cache entry on failure so subsequent calls can retry.
    p.catch(() => {
      if (this.scrambleCache.get(cacheKey) === p) {
        this.scrambleCache.delete(cacheKey);
      }
    });
    this.scrambleCache.set(cacheKey, p);
    return p;
  }
}
