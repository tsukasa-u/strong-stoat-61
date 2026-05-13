import * as opentypeModule from "opentype.js";
import * as wawoff2Module from "wawoff2";
import he from "he";

const opentype = (opentypeModule as { default?: unknown }).default ?? opentypeModule;
const wawoff2 = (wawoff2Module as { default?: unknown }).default ?? wawoff2Module;

/**
 * PUA plane selection for font obfuscation capacity.
 *
 * - `"bmp"`: BMP Private Use Area only (U+E000–U+F8FF), 6,400 codepoints.
 *   Recommended for typical content. Good backward compatibility.
 * - `"bmp+supplementary"`: BMP + Supplementary PUA (Plane 15 & 16),
 *   totaling 137,468 codepoints. Enables obfuscation of large character sets
 *   (e.g., dictionaries, large kanji inventories). ⚠️ Experimental — comprehensive
 *   testing across devices recommended before production use.
 *
 * @default "bmp"
 */
export type PuaPlaneMode = "bmp" | "bmp+supplementary";

/**
 * PUA budget overflow policy.
 *
 * - `"strict"`: throws at construction time if estimated slot usage exceeds the
 *   PUA pool. Every character is guaranteed its full variant count or construction
 *   fails. Recommended for security-critical deployments.
 * - `"adaptive"`: guarantees one primary PUA slot per character. Surplus slots are
 *   distributed to variants using `variantAllocator`. If the pool is exhausted
 *   before all variant requests are filled, `onBudgetDegrade` is called and
 *   execution continues (no plaintext leakage — primary mapping is always intact).
 * - `"legacy"`: original two-pass behaviour with `console.warn` on shortfall.
 *   Preserved for backward compatibility. Not recommended for new projects.
 *
 * @default "legacy"
 */
export type BudgetPolicy = "strict" | "adaptive" | "legacy";

/**
 * Variant slot allocation strategy. Effective only when `budgetPolicy` is
 * `"adaptive"`.
 *
 * - `"uniform"`: each character requests `variantCount` (or `digitVariantCount`
 *   for digits) extra slots, same as the legacy behaviour within the adaptive
 *   framework.
 * - `"class-weighted"`: digits, currency symbols, and Latin characters receive
 *   proportionally more variant slots based on a static weight table.
 * - `"frequency-weighted"`: allocates more variants to high-frequency
 *   characters observed in selected visible text.
 *
 * @default "uniform"
 */
export type VariantAllocator = "uniform" | "frequency-weighted" | "class-weighted";

/**
 * Event passed to `onBudgetDegrade` when variant slots run short in
 * `"adaptive"` mode.
 */
export interface BudgetDegradeEvent {
  /** Total number of characters in the mapping (= `usable.length`). */
  totalChars: number;
  /** Characters that received a primary PUA slot (= `totalChars` in adaptive mode). */
  primaryMapped: number;
  /** Number of characters that received fewer variants than requested. */
  variantShortfall: number;
  /**
   * Characters that could not receive even a primary slot.
   * Always 0 in `"adaptive"` mode (primary mapping is guaranteed).
   */
  droppedChars: number;
  /** PUA slots consumed in total (primary + variants). */
  slotsUsed: number;
  /** Total PUA slots available in the pool. */
  slotsAvailable: number;
}

export interface FontObfuscatorOptions {
  /**
   * URL of the source font file (TTF or WOFF2).  Must use the `http` or `https`
   * scheme — other schemes (e.g. `file://`) are rejected to prevent SSRF.
   */
  fontUrl: string;
  /**
   * PUA plane selection for character capacity.
   *
   * - `"bmp"` (default): Classic BMP Private Use Area (U+E000–U+F8FF), 6,400 codepoints.
   *   Suitable for typical content with Latin + CJK + common symbols.
   * - `"bmp+supplementary"`: Extends to Supplementary PUA (Plane 15 & 16), 137,468 total.
   *   Enables larger character sets (e.g., full Joyo kanji + rare variants, dictionaries).
   *   ⚠️ Experimental — test thoroughly across target devices before production.
   *
   * @default "bmp"
   */
  puaPlaneMode?: PuaPlaneMode;
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
   * Number of PUA variants to allocate per character.
   * A value > 1 makes every character encode to multiple possible PUA codepoints,
   * making frequency analysis harder across the entire page.
   *
   * **PUA budget**: the BMP Private Use Area holds 6,400 codepoints (U+E000–U+F8FF).
   * Total slots consumed = `uniqueChars × variantCount`.  The `budgetPolicy` option
   * controls what happens when the budget is exceeded: `"legacy"` (default) emits a
   * console warning, `"adaptive"` gracefully reduces variant counts, and `"strict"`
   * throws at construction time.  Typical pages (< 400 unique chars × 4 variants =
   * 1,600 slots) are well within the limit.
   * @default 1
   */
  variantCount?: number;
  /**
   * Number of PUA variants to allocate for numeric glyphs (0-9, full-width 0-9).
   * When set, digits receive `max(variantCount, digitVariantCount)` variants.
   * Useful to give counters and prices extra obfuscation on top of the base
   * `variantCount`.
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
  /**
   * PUA budget overflow policy.
   *
   * - `"strict"`: throws at construction time if estimated variant slot usage exceeds
   *   the PUA pool. Every character is guaranteed its full `variantCount`.
   * - `"adaptive"`: guarantees one primary PUA slot per character. Surplus slots are
   *   distributed with `variantAllocator`. Shortfalls invoke `onBudgetDegrade`.
   * - `"legacy"`: original behaviour — two-pass allocation with `console.warn` on
   *   shortfall. Default for backward compatibility; not recommended for new projects.
   *
   * @default "legacy"
   */
  budgetPolicy?: BudgetPolicy;
  /**
   * Variant slot allocation strategy. Effective only when `budgetPolicy` is `"adaptive"`.
   *
   * - `"uniform"`: each character gets `variantCount` (digits get `digitVariantCount`)
   *   additional slots — same as the legacy split but inside the adaptive framework.
   * - `"class-weighted"`: digits, currency symbols, and Latin characters receive
   *   proportionally more slots via a static weight table.
   * - `"frequency-weighted"`: uses selected-text frequency counts so high-frequency
   *   characters receive proportionally more variant slots.
   *
   * @default "uniform"
   */
  variantAllocator?: VariantAllocator;
  /**
   * Minimum guaranteed PUA slots per character in `"adaptive"` mode.
   * Construction throws if the pool cannot meet this for every character.
   * Keep at 1 (the default) unless you have a specific multi-slot guarantee requirement.
   *
   * @default 1
   */
  minPrimaryGuarantee?: number;
  /**
   * Called when variant budget runs short in `"adaptive"` mode (never called in
   * `"strict"` mode, which throws before reaching a shortfall).
   * Use this to emit Prometheus counters, structured logs, or alerts.
   *
   * @example
   * onBudgetDegrade: (e) => metrics.increment("font_obf.degrade", { shortfall: e.variantShortfall })
   */
  onBudgetDegrade?: (event: BudgetDegradeEvent) => void;
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
  /** Character frequencies collected from selected visible text. */
  candidateFrequencies: Record<string, number>;
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
  /**
   * Show a floating dev panel listing characters in the HTML that are not
   * covered by the font mapping.  Overrides the instance-level `devMode`.
   */
  devMode?: boolean;
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
  /** Character frequencies collected from selected visible text. */
  candidateFrequencies: Record<string, number>;
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
  candidateFrequencies?: Record<string, number>;
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

interface CandidateAlphabetData {
  alphabet: string[];
  freqs: Map<string, number>;
}

const DEFAULT_FONT_ROUTE_PREFIX = "/_obf/font";
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_FONT_URL_TTL_MS = 30 * 1000;
const DEFAULT_FONT_GATE_WINDOW_MS = 60 * 1000;
const DEFAULT_FONT_GATE_MAX_PER_WINDOW = 20;
const DEFAULT_FONT_GATE_BLOCK_AFTER_FAILURES = 5;
const DEFAULT_FONT_GATE_BLOCK_MS = 10 * 60 * 1000;
const MAX_GATE_KEY_IP_LEN = 64;
const MAX_GATE_KEY_UA_LEN = 512;
const PUA_START = 0xE000;
const PUA_END = 0xF8FF;
const SUPP_PUA_A_START = 0xF0000;
const SUPP_PUA_A_END = 0xFFFFF;
const SUPP_PUA_B_START = 0x100000;
const SUPP_PUA_B_END = 0x10FFFF;

/**
 * Compute maximum allocable PUA codepoints based on plane selection.
 * These values are computed at FontObfuscator construction time and stored
 * in the instance (see FontObfuscator.maxMappableChars).
 *
 * @param mode PUA plane mode (BMP only or BMP+Supplementary)
 * @returns Total count of usable PUA codepoints (excluding Unicode-designated non-characters)
 */
function computeMaxMappableChars(mode: PuaPlaneMode): number {
  const bmpCount = PUA_END - PUA_START + 1; // 6,400
  if (mode === "bmp") {
    return bmpCount;
  }
  // "bmp+supplementary": add Plane 15 & 16, excluding non-characters (U+FFFFE/FFFFF, U+10FFFE/10FFFF)
  const suppACount = (SUPP_PUA_A_END - SUPP_PUA_A_START + 1) - 2; // 65,534
  const suppBCount = (SUPP_PUA_B_END - SUPP_PUA_B_START + 1) - 2; // 65,534
  return bmpCount + suppACount + suppBCount; // 137,468
}

// Default for backward compatibility
const MAX_MAPPABLE_CHARS = computeMaxMappableChars("bmp"); // 6,400
const DEFAULT_VARIANT_COUNT = 1;
const MAX_VARIANT_COUNT = 16;
const DEFAULT_DIGIT_VARIANT_COUNT = 4;
const MAX_DIGIT_VARIANT_COUNT = 16;
const DEFAULT_MAPPING_ROTATION_INTERVAL_MS = 2 * 60 * 1000;
const FONT_DISPLAY_VALUES = new Set(["auto", "block", "swap", "fallback", "optional"]);

const DIGIT_VARIANT_TARGETS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "０", "１", "２", "３", "４", "５", "６", "７", "８", "９",
]);

const NAME_FIELDS_TO_KEEP_GENERATED = new Set([
  "fontFamily",
  "fontSubfamily",
  "fullName",
  "postScriptName",
  "preferredFamily",
  "preferredSubfamily",
  "compatibleFullName",
  "wwsFamily",
  "wwsSubfamily",
  "postScriptFindFontName",
  "uniqueID",
]);

function cloneNameValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = v;
  return out;
}
function preserveSourceNameTable(srcFont: any, newFont: any): void {
  const srcNames = srcFont?.names;
  if (!srcNames || typeof srcNames !== "object") return;

  if (!newFont.names || typeof newFont.names !== "object") {
    newFont.names = {};
  }

  // font.names has the structure: { windows: { copyright: { en: "..." }, ... }, macintosh: {...}, unicode: {...} }
  // Iterate each platform (windows/macintosh/unicode), then each field within the platform.
  // Skip fields that were generated for the obfuscated font identity (family name, PS name, etc.)
  // so license/copyright/trademark and attribution metadata from the source are preserved.
  const newNames = newFont.names as Record<string, Record<string, unknown>>;
  for (const [platform, platformRecord] of Object.entries(srcNames as Record<string, unknown>)) {
    if (!platformRecord || typeof platformRecord !== "object") continue;
    if (!newNames[platform] || typeof newNames[platform] !== "object") {
      newNames[platform] = {};
    }
    for (const [field, value] of Object.entries(platformRecord as Record<string, unknown>)) {
      if (NAME_FIELDS_TO_KEEP_GENERATED.has(field)) continue;
      newNames[platform][field] = cloneNameValue(value);
    }
  }
}

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

function extractUserVisibleAttributeText(fragment: string): string {
  let out = "";
  let i = 0;
  let noParseTag: string | null = null;

  while (i < fragment.length) {
    const lt = fragment.indexOf("<", i);
    if (lt === -1) break;

    if (fragment.startsWith("<!--", lt)) {
      const end = fragment.indexOf("-->", lt + 4);
      i = end === -1 ? fragment.length : end + 3;
      continue;
    }

    if (noParseTag && !startsWithClosingTagAt(fragment, lt, noParseTag)) {
      i = lt + 1;
      continue;
    }

    const tagEnd = indexOfTagEnd(fragment, lt + 1);
    const rawTag = fragment.slice(lt, tagEnd + 1);
    const tagName = parseTagName(rawTag);

    if (/^<\s*\//.test(rawTag)) {
      if (tagName && noParseTag === tagName) noParseTag = null;
      i = tagEnd + 1;
      continue;
    }

    for (const attr of parseTagAttributes(rawTag)) {
      if (attr.value === undefined) continue;
      if (
        attr.nameLower === "placeholder" ||
        attr.nameLower === "aria-label" ||
        attr.nameLower === "aria-placeholder" ||
        attr.nameLower === "title" ||
        attr.nameLower === "alt"
      ) {
        out += `${attr.value} `;
      }
    }

    const selfClose = /\/\s*>$/.test(rawTag);
    if (!selfClose && (tagName === "script" || tagName === "style" || tagName === "textarea")) {
      noParseTag = tagName;
    }

    i = tagEnd + 1;
  }

  return out;
}

function obfuscateUserVisibleAttributes(
  rawTag: string,
  mapping: Record<string, number>,
  variants?: Record<string, number[]>,
  variantSeed?: number,
): string {
  const attrs = parseTagAttributes(rawTag);
  if (attrs.length === 0) return rawTag;

  let out = rawTag;
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    if (attr.valueStart < 0 || attr.valueEnd < attr.valueStart) continue;
    if (
      attr.nameLower !== "placeholder" &&
      attr.nameLower !== "aria-label" &&
      attr.nameLower !== "aria-placeholder" &&
      attr.nameLower !== "title" &&
      attr.nameLower !== "alt"
    ) continue;

    const encoded = obfuscateTextWithMapping(
      attr.value ?? "",
      mapping,
      variants,
      variantSeed,
      true,
    );
    out = out.slice(0, attr.valueStart) + encoded + out.slice(attr.valueEnd + 1);
  }
  return out;
}

function collectVisibleCharsAndFreqs(
  text: string,
  seen: Set<string>,
  out: string[],
  freqs: Map<string, number>,
): void {
  for (const { ch } of decodeHtmlTextUnits(text, true)) {
    if (/\s/u.test(ch)) continue;
    freqs.set(ch, (freqs.get(ch) ?? 0) + 1);
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
}

function extractTextDataFromHtml(html: string): CandidateAlphabetData {
  // Also extract characters from user-visible attribute values (placeholder, aria-label, alt, title).
  // These are rendered to the user but live inside tags, so the strip-tags pass below would miss them.
  // Characters appearing only in these attributes must still be included in the font alphabet.
  const attrText = extractUserVisibleAttributeText(html);

  const stripped = attrText + html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // Decode numeric char refs so that &#20013; is counted as '中', not as the
  // literal ASCII chars '&', '#', '2', etc.  This must mirror the decoding that
  // obfuscateTextWithMapping does at encode time; otherwise entity-encoded chars
  // would not be added to the candidate alphabet and would leak as plaintext.
  const chars: string[] = [];
  const seen = new Set<string>();
  const freqs = new Map<string, number>();
  collectVisibleCharsAndFreqs(stripped, seen, chars, freqs);
  return { alphabet: chars, freqs };
}

function extractTextDataFromSelectorScopeHtml(html: string, selectors: string[]): CandidateAlphabetData {
  const sets = buildSelectorSets(selectors);
  if (sets.ids.size === 0 && sets.classes.size === 0) {
    return { alphabet: [], freqs: new Map<string, number>() };
  }

  const chars: string[] = [];
  const seen = new Set<string>();
  const freqs = new Map<string, number>();
  const stack: SelectorFrame[] = [];
  let targetDepth = 0;
  let noParseDepth = 0;
  let i = 0;

  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const end = next === -1 ? html.length : next;
      if (targetDepth > 0 && noParseDepth === 0) {
        collectVisibleCharsAndFreqs(html.slice(i, end), seen, chars, freqs);
      }
      i = end;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    // Guard: inside a raw-text element (script/style/textarea), only its own
    // closing tag is a structural HTML token.  Any other `<` is raw content and
    // must not be parsed as a tag — doing so would corrupt the stack by
    // prematurely popping ancestor elements (e.g. `</div>` inside a textarea).
    if (noParseDepth > 0) {
      let innerTag = "";
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].inNoParseScope) { innerTag = stack[k].tagName; break; }
      }
      if (innerTag && !startsWithClosingTagAt(html, i, innerTag)) {
        i++; // skip `<` as raw content
        continue;
      }
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
      i = tagEnd + 1;
      continue;
    }

    const tagName = parseTagName(rawTag);
    const selfClose = /\/\s*>$/.test(rawTag) || (tagName !== null && HTML_VOID_ELEMENTS.has(tagName));
    const noParseTag = tagName === "script" || tagName === "style" || tagName === "textarea";
    const inTargetScope = targetDepth > 0 || matchesSelectorSets(rawTag, sets);

    if (inTargetScope && noParseDepth === 0) {
      collectVisibleCharsAndFreqs(extractUserVisibleAttributeText(rawTag), seen, chars, freqs);
    }

    if (tagName && !selfClose) {
      stack.push({ tagName, inTargetScope, inNoParseScope: noParseTag });
      if (inTargetScope) targetDepth += 1;
      if (noParseTag) noParseDepth += 1;
    }

    i = tagEnd + 1;
  }

  return { alphabet: chars, freqs };
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

function toFrequencyRecord(freqs: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ch, count] of freqs.entries()) out[ch] = count;
  return out;
}

function toFrequencyMap(freqs: Record<string, number> | undefined): Map<string, number> | undefined {
  if (!freqs) return undefined;
  return new Map<string, number>(Object.entries(freqs));
}

function hashFrequencyRecord(chars: string[], freqs: Record<string, number> | undefined): number {
  if (!freqs) return 0;
  let h = 2166136261;
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    const count = freqs[ch] ?? 1;
    h ^= cp & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (cp >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (count >>> 0) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (count >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (count >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (count >>> 24) & 0xff;
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

// ---------------------------------------------------------------------------
// PUA pool construction
// ---------------------------------------------------------------------------

/**
 * Build a shuffled pool of PUA codepoints.
 * The pool is a flat array of integers; callers index into it to assign
 * primary and variant PUA codepoints.
 *
 * @param mode PUA plane mode: "bmp" (6,400 slots) or "bmp+supplementary" (137,468 slots)
 * @param seed Random seed for reproducible shuffling (mulberry32)
 * @returns Shuffled array of usable PUA codepoints
 */
function buildPuaPool(mode: PuaPlaneMode, seed: number): number[] {
  const pool: number[] = [];
  
  // BMP PUA: U+E000–U+F8FF
  for (let i = PUA_START; i <= PUA_END; i++) {
    pool.push(i);
  }

  if (mode === "bmp+supplementary") {
    // Supplementary PUA-A (Plane 15): U+F0000–U+FFFFD
    // (excluding U+FFFFE as non-character; U+FFFFF is excluded by loop bound)
    for (let i = SUPP_PUA_A_START; i < SUPP_PUA_A_END; i++) {
      // Skip U+FFFFE
      if (i === 0xFFFFE) continue;
      pool.push(i);
    }

    // Supplementary PUA-B (Plane 16): U+100000–U+10FFFD
    // (excluding U+10FFFE as non-character; U+10FFFF is excluded by loop bound)
    for (let i = SUPP_PUA_B_START; i < SUPP_PUA_B_END; i++) {
      // Skip U+10FFFE
      if (i === 0x10FFFE) continue;
      pool.push(i);
    }
  }

  return shuffle(pool, mulberry32(seed));
}

// ---------------------------------------------------------------------------
// Variant allocator strategies
/**
 * Generate CSS unicode-range declaration for @font-face rules.
 *
 * @param mode PUA plane mode (BMP only or BMP+Supplementary)
 * @returns CSS unicode-range property value
 *
 * Examples:
 * - "bmp" → "U+E000-F8FF"
 * - "bmp+supplementary" → "U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD"
 */
function generateUnicodeRangeCss(mode: PuaPlaneMode): string {
  if (mode === "bmp") {
    return "U+E000-F8FF";
  }
  // "bmp+supplementary": BMP + Plane 15 + Plane 16
  return "U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD";
}

// ---------------------------------------------------------------------------

interface AllocatorStrategy {
  distribute(
    chars: string[],
    remaining: number,
    opts: {
      variantCount: number;
      digitVariantCount: number;
      freqs?: Map<string, number>;
    },
  ): Record<string, number>;
}

/**
 * Uniform allocator: each character requests `variantCount - 1` additional
 * slots (digits use `max(variantCount, digitVariantCount) - 1`).  The -1
 * accounts for the primary slot already consumed in Phase 2.
 */
function uniformDistribute(
  chars: string[],
  _remaining: number,
  opts: {
    variantCount: number;
    digitVariantCount: number;
    freqs?: Map<string, number>;
  },
): Record<string, number> {
  const extra: Record<string, number> = {};
  for (const ch of chars) {
    const target = DIGIT_VARIANT_TARGETS.has(ch)
      ? Math.max(opts.variantCount, opts.digitVariantCount)
      : opts.variantCount;
    extra[ch] = Math.max(0, target - 1);
  }
  return extra;
}

/**
 * Frequency-weighted allocator: high-frequency characters receive more
 * variant slots. Missing frequencies are treated as weight 1.
 */
function frequencyWeightedDistribute(
  chars: string[],
  remaining: number,
  opts: {
    variantCount: number;
    digitVariantCount: number;
    freqs?: Map<string, number>;
  },
): Record<string, number> {
  const maxPerChar = Math.max(opts.variantCount, opts.digitVariantCount) - 1;
  const extra: Record<string, number> = {};
  for (const ch of chars) extra[ch] = 0;

  if (maxPerChar <= 0 || chars.length === 0 || remaining <= 0) return extra;

  const weights = chars.map((ch) => Math.max(1, opts.freqs?.get(ch) ?? 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return extra;

  const priority: Array<{ ch: string; frac: number; w: number; cp: number }> = [];
  let used = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const ideal = (weights[i] / totalWeight) * remaining;
    const clamped = Math.min(maxPerChar, ideal);
    const base = Math.floor(clamped);
    extra[ch] = base;
    used += base;
    priority.push({
      ch,
      frac: clamped - base,
      w: weights[i],
      cp: ch.codePointAt(0)!,
    });
  }

  // Deterministic tie-breaker: higher fractional part -> higher weight -> lower codepoint.
  priority.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    if (b.w !== a.w) return b.w - a.w;
    return a.cp - b.cp;
  });

  let leftover = remaining - used;
  while (leftover > 0) {
    let progressed = false;
    for (const item of priority) {
      if (leftover <= 0) break;
      if (extra[item.ch] >= maxPerChar) continue;
      extra[item.ch] += 1;
      leftover -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }

  return extra;
}

/** Weight table used by the class-weighted allocator. */
const CLASS_WEIGHTS: Record<string, number> = {
  digit:    4.0, // 0–9, ０–９ (frequent in prices/counters; high analytical value)
  currency: 3.0, // ¥ $ € £ ¢ ₩ ₹
  symbol:   2.0, // punctuation / operator characters
  latin:    1.5, // ASCII letters
  kanji:    1.2, // CJK ideographs (large count naturally spreads slots)
  kana:     1.0, // hiragana / katakana (default weight)
  other:    1.0,
};

function charClass(ch: string): keyof typeof CLASS_WEIGHTS {
  const cp = ch.codePointAt(0)!;
  if (DIGIT_VARIANT_TARGETS.has(ch)) return "digit";
  if ("¥$€£¢₩₹".includes(ch)) return "currency";
  // Symbols: punctuation/operator ASCII ranges + ASCII brackets/braces/backtick/tilde
  // (0x5B–0x60 and 0x7B–0x7E are deliberately kept as "symbol", NOT "latin").
  if (
    (cp >= 0x21 && cp <= 0x2F) ||
    (cp >= 0x3A && cp <= 0x40) ||
    (cp >= 0x5B && cp <= 0x60) ||
    (cp >= 0x7B && cp <= 0x7E)
  ) return "symbol";
  // Latin: uppercase A–Z (0x41–0x5A) and lowercase a–z (0x61–0x7A) only.
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return "latin";
  if (cp >= 0x4E00 && cp <= 0x9FFF) return "kanji";
  if ((cp >= 0x3041 && cp <= 0x309F) || (cp >= 0x30A0 && cp <= 0x30FF)) return "kana";
  return "other";
}

/**
 * Class-weighted allocator: digits, currency symbols, and Latin characters
 * receive proportionally more variant slots based on a static weight table.
 * Does not require per-request frequency data (unlike frequency-weighted).
 */
function classWeightedDistribute(
  chars: string[],
  remaining: number,
  opts: {
    variantCount: number;
    digitVariantCount: number;
    freqs?: Map<string, number>;
  },
): Record<string, number> {
  const maxPerChar = Math.max(opts.variantCount, opts.digitVariantCount) - 1;
  if (maxPerChar <= 0 || chars.length === 0) {
    const extra: Record<string, number> = {};
    for (const ch of chars) extra[ch] = 0;
    return extra;
  }

  const weights = chars.map((ch) => CLASS_WEIGHTS[charClass(ch)]);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const extra: Record<string, number> = {};
  let used = 0;

  for (let i = 0; i < chars.length; i++) {
    const share = Math.min(
      maxPerChar,
      Math.floor((weights[i] / totalWeight) * remaining),
    );
    extra[chars[i]] = share;
    used += share;
  }

  // Distribute leftover slots in descending weight order.
  const sorted = chars
    .map((ch, i) => ({ ch, w: weights[i] }))
    .sort((a, b) => b.w - a.w);
  let leftover = remaining - used;
  for (const { ch } of sorted) {
    if (leftover <= 0) break;
    if (extra[ch] < maxPerChar) {
      extra[ch]++;
      leftover--;
    }
  }
  return extra;
}

// ---------------------------------------------------------------------------
// Adaptive allocation core
// ---------------------------------------------------------------------------

interface AdaptiveAllocateOptions {
  budgetPolicy: BudgetPolicy;
  variantCount: number;
  digitVariantCount: number;
  minPrimaryGuarantee: number;
  freqs?: Map<string, number>;
  onBudgetDegrade?: (event: BudgetDegradeEvent) => void;
  allocator: AllocatorStrategy;
}

/**
 * Three-phase adaptive PUA slot allocator.
 *
 * Phase 1 — guarantee check: throws if the pool cannot provide `minPrimaryGuarantee`
 *   slots per character.
 * Phase 2 — primary 1:1 mapping: every character receives exactly one primary PUA slot.
 * Phase 3 — surplus variant distribution: remaining slots are distributed by `allocator`.
 *
 * No character is ever left unmapped (plaintext leakage is impossible).
 * In `"adaptive"` mode a shortfall only reduces variant count, never primary coverage.
 * In `"strict"` mode any shortfall throws immediately; `onBudgetDegrade` is NOT called.
 */
function adaptiveAllocate(
  usable: string[],
  pool: number[],
  options: AdaptiveAllocateOptions,
): { mapping: Record<string, number>; variants: Record<string, number[]> } {
  const totalPool = pool.length;
  const supplementaryHint =
    totalPool === 6400
      ? ` Consider puaPlaneMode: "bmp+supplementary" (capacity 137468).`
      : "";

  // Phase 1: primary guarantee check.
  if (usable.length > totalPool) {
    throw new Error(
      `[FontObfuscator] critical overflow: ${usable.length} characters exceed PUA pool of ` +
      `${totalPool} slots. Primary mapping is impossible.${supplementaryHint} Reduce the alphabet.`,
    );
  }
  if (usable.length * options.minPrimaryGuarantee > totalPool) {
    throw new Error(
      `[FontObfuscator] minPrimaryGuarantee (${options.minPrimaryGuarantee}) cannot be ` +
      `satisfied: needs ${usable.length * options.minPrimaryGuarantee} slots but pool has ` +
      `${totalPool}.${supplementaryHint}`,
    );
  }

  const mapping: Record<string, number> = {};
  const variants: Record<string, number[]> = {};
  let idx = 0;

  // Phase 2: 1:1 primary assignment.
  for (const ch of usable) {
    mapping[ch] = pool[idx++];
    variants[ch] = [mapping[ch]];
  }

  // Phase 3: surplus variant distribution.
  const remaining = totalPool - usable.length;
  const extra = options.allocator.distribute(usable, remaining, options);
  let shortfall = 0;
  for (const ch of usable) {
    const want = extra[ch] ?? 0;
    let got = 0;
    while (got < want && idx < pool.length) {
      variants[ch].push(pool[idx++]);
      got++;
    }
    if (got < want) shortfall++;
  }

  if (shortfall > 0) {
    // In "strict" mode throw immediately — onBudgetDegrade is documented as
    // "never called in strict mode" and must not be invoked before the throw.
    if (options.budgetPolicy === "strict") {
      throw new Error(
        `[FontObfuscator] strict mode: ${shortfall} character(s) received fewer variants ` +
        `than requested. Lower variantCount or reduce the alphabet.`,
      );
    }
    // "adaptive" mode: fire the degradation hook so callers can emit metrics.
    const event: BudgetDegradeEvent = {
      totalChars: usable.length,
      primaryMapped: usable.length, // always all chars in adaptive mode
      variantShortfall: shortfall,
      droppedChars: 0,             // always 0 in adaptive mode
      slotsUsed: idx,
      slotsAvailable: totalPool,
    };
    options.onBudgetDegrade?.(event);
  }

  return { mapping, variants };
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

interface DecodedHtmlUnit {
  ch: string;
  raw: string;
}

function escapeHtmlTextChar(ch: string): string {
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  if (ch === '"') return "&quot;";
  if (ch === "'") return "&apos;";
  return ch;
}

function isValidScalar(cp: number): boolean {
  return cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

function decodeHtmlEntity(raw: string, decodeNamedEntities: boolean): string | null {
  const dec = raw.match(/^&#(\d{1,7});$/);
  if (dec) {
    const cp = Number(dec[1]);
    return Number.isFinite(cp) && isValidScalar(cp) ? String.fromCodePoint(cp) : null;
  }

  const hex = raw.match(/^&#x([0-9a-fA-F]{1,6});$/i);
  if (hex) {
    const cp = parseInt(hex[1], 16);
    return isValidScalar(cp) ? String.fromCodePoint(cp) : null;
  }

  if (!decodeNamedEntities) return null;
  // Decode the full HTML named-entity set (e.g. &copy;, &euro;, &hellip;)
  // so candidate collection and obfuscation operate on visible characters.
  const decoded = he.decode(raw, {
    isAttributeValue: false,
    strict: false,
  });
  return decoded !== raw ? decoded : null;
}

function decodeHtmlTextUnits(text: string, decodeNamedEntities = false): DecodedHtmlUnit[] {
  const out: DecodedHtmlUnit[] = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === "&") {
      const semi = text.indexOf(";", i + 1);
      if (semi !== -1) {
        const raw = text.slice(i, semi + 1);
        const decoded = decodeHtmlEntity(raw, decodeNamedEntities);
        if (decoded !== null) {
          for (let k = 0; k < decoded.length;) {
            const cp = decoded.codePointAt(k)!;
            const ch = String.fromCodePoint(cp);
            out.push({ ch, raw: escapeHtmlTextChar(ch) });
            k += cp > 0xffff ? 2 : 1;
          }
          i = semi + 1;
          continue;
        }
      }
    }

    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    out.push({ ch, raw: ch });
    i += cp > 0xffff ? 2 : 1;
  }
  return out;
}

function obfuscateTextWithMapping(
  input: string,
  mapping: Record<string, number>,
  variants?: Record<string, number[]>,
  variantSeed?: number,
  decodeNamedEntities = false,
): string {
  const decodedUnits = decodeHtmlTextUnits(input, decodeNamedEntities);
  const decoded = decodedUnits.map(({ ch }) => ch).join("");
  // Use `!== undefined` rather than truthiness so that variantSeed=0 still
  // activates variant randomization (mulberry32(0) is a valid PRNG state).
  const useVariants = variants != null && variantSeed !== undefined;
  const rng = useVariants ? mulberry32((variantSeed! ^ fnv1a32(decoded)) >>> 0) : null;
  let out = "";
  for (const unit of decodedUnits) {
    const ch = unit.ch;
    let mapped = mapping[ch];
    if (useVariants) {
      const choices = variants![ch];
      if (choices && choices.length > 1 && rng) {
        mapped = choices[Math.floor(rng() * choices.length)];
      }
    }
    out += mapped ? String.fromCodePoint(mapped) : unit.raw;
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
 * Obfuscate all string values in a flat dictionary while preserving keys.
 *
 * @example
 * const obfDict = obfuscateDictionary(i18n.en, pm.mapping, {
 *   variants: pm.variants,
 *   variantSeed: pm.seed,
 * });
 */
export function obfuscateDictionary<T extends Record<string, string>>(
  dict: T,
  mapping: Record<string, number>,
  options?: { variants?: Record<string, number[]>; variantSeed?: number },
): T {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    out[key] = encodeText(value, mapping, options);
  }
  return out as T;
}

/**
 * Obfuscate nested i18n dictionaries (e.g. `{ ja: {...}, en: {...} }`) while
 * preserving language and message keys.
 *
 * By default each language uses a derived seed (`variantSeed ^ hash(lang)`) so
 * variant selection differs across languages but stays deterministic per build.
 */
export function obfuscateI18nDictionary<T extends Record<string, Record<string, string>>>(
  dictionaries: T,
  mapping: Record<string, number>,
  options?: { variants?: Record<string, number[]>; variantSeed?: number },
): T {
  const out = {} as T;
  for (const lang of Object.keys(dictionaries) as Array<keyof T>) {
    const langSeed =
      options?.variantSeed === undefined
        ? undefined
        : ((options.variantSeed ^ fnv1a32(String(lang))) >>> 0);
    out[lang] = obfuscateDictionary(dictionaries[lang], mapping, {
      variants: options?.variants,
      variantSeed: langSeed,
    }) as T[keyof T];
  }
  return out;
}

function obfuscateStringLeavesInternal(
  value: unknown,
  mapping: Record<string, number>,
  options: { variants?: Record<string, number[]>; variantSeed?: number },
  path: string,
): unknown {
  if (typeof value === "string") {
    const leafSeed =
      options.variantSeed === undefined
        ? undefined
        : ((options.variantSeed ^ fnv1a32(path || "$")) >>> 0);
    return encodeText(value, mapping, {
      variants: options.variants,
      variantSeed: leafSeed,
    });
  }

  if (Array.isArray(value)) {
    return value.map((item, i) =>
      obfuscateStringLeavesInternal(item, mapping, options, `${path}[${i}]`));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = obfuscateStringLeavesInternal(v, mapping, options, `${path}.${k}`);
    }
    return out;
  }

  return value;
}

/**
 * Obfuscate all string leaves in an arbitrary JSON-like state object.
 *
 * This is useful when embedding pre-obfuscated state snapshots into HTML while
 * keeping non-string values (numbers, booleans, null) untouched.
 */
export function obfuscateStringLeaves<T>(
  state: T,
  mapping: Record<string, number>,
  options?: { variants?: Record<string, number[]>; variantSeed?: number },
): T {
  return obfuscateStringLeavesInternal(state, mapping, {
    variants: options?.variants,
    variantSeed: options?.variantSeed,
  }, "$") as T;
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

interface ParsedTagAttribute {
  nameLower: string;
  value: string | undefined;
  valueStart: number;
  valueEnd: number;
}

function parseTagAttributes(rawTag: string): ParsedTagAttribute[] {
  const out: ParsedTagAttribute[] = [];
  if (!rawTag.startsWith("<")) return out;

  let i = 1;
  while (i < rawTag.length && /\s/.test(rawTag[i])) i++;
  if (rawTag[i] === "/") i++;
  while (i < rawTag.length && !/[\s/>]/.test(rawTag[i])) i++;

  while (i < rawTag.length) {
    while (i < rawTag.length && /\s/.test(rawTag[i])) i++;
    if (i >= rawTag.length || rawTag[i] === ">") break;
    if (rawTag[i] === "/" && rawTag[i + 1] === ">") break;

    const nameStart = i;
    while (i < rawTag.length && !/[\s=/>]/.test(rawTag[i])) i++;
    if (i === nameStart) {
      i++;
      continue;
    }

    const nameLower = rawTag.slice(nameStart, i).toLowerCase();
    while (i < rawTag.length && /\s/.test(rawTag[i])) i++;

    if (rawTag[i] !== "=") {
      out.push({ nameLower, value: undefined, valueStart: -1, valueEnd: -1 });
      continue;
    }

    i++;
    while (i < rawTag.length && /\s/.test(rawTag[i])) i++;
    if (i >= rawTag.length) {
      out.push({ nameLower, value: "", valueStart: -1, valueEnd: -1 });
      break;
    }

    if (rawTag[i] === '"' || rawTag[i] === "'") {
      const quote = rawTag[i];
      const valueStart = i + 1;
      i++;
      while (i < rawTag.length && rawTag[i] !== quote) i++;
      const valueEnd = Math.max(valueStart - 1, i - 1);
      out.push({
        nameLower,
        value: rawTag.slice(valueStart, valueEnd + 1),
        valueStart,
        valueEnd,
      });
      if (i < rawTag.length && rawTag[i] === quote) i++;
      continue;
    }

    const valueStart = i;
    while (i < rawTag.length && !/[\s>]/.test(rawTag[i])) i++;
    const valueEnd = i - 1;
    out.push({
      nameLower,
      value: rawTag.slice(valueStart, valueEnd + 1),
      valueStart,
      valueEnd,
    });
  }

  return out;
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

/**
 * Returns true if `html[pos]` begins the closing tag `</tagName` (case-insensitive)
 * AND the character immediately after the tag name is `>`, whitespace, `/`, or end
 * of string — so `</scriptx>` does NOT match `</script>`.
 * Used to distinguish the structural end-tag of a raw-text element (script/style/
 * textarea) from any literal `<` characters in its raw content.
 */
function startsWithClosingTagAt(html: string, pos: number, tagName: string): boolean {
  if (html[pos] !== "<" || html[pos + 1] !== "/") return false;
  const end = pos + 2 + tagName.length;
  if (end > html.length) return false;
  for (let k = 0; k < tagName.length; k++) {
    if (html[pos + 2 + k].toLowerCase() !== tagName[k]) return false;
  }
  const next = html[end];
  return next === ">" || next === undefined || /[\s/]/.test(next);
}

function parseTagName(rawTag: string): string | null {
  const m = rawTag.match(/^<\s*\/?\s*([a-zA-Z][\w:-]*)/);
  return m ? m[1].toLowerCase() : null;
}

function parseAttributeValue(rawTag: string, attrName: string): string | undefined {
  const target = attrName.toLowerCase();
  for (const attr of parseTagAttributes(rawTag)) {
    if (attr.nameLower === target) return attr.value ?? "";
  }
  return undefined;
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
        ? obfuscateTextWithMapping(chunk, mapping, variants, variantSeed, true)
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

    // Guard: inside a raw-text element (script/style/textarea), only its own
    // closing tag is a structural HTML token.  Any other `<` is raw content and
    // must not be parsed as a tag — doing so would corrupt the stack by
    // prematurely popping ancestor elements (e.g. `</div>` inside a textarea).
    if (noParseDepth > 0) {
      let innerTag = "";
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].inNoParseScope) { innerTag = stack[k].tagName; break; }
      }
      if (innerTag && !startsWithClosingTagAt(html, i, innerTag)) {
        out += html[i]; // output `<` as-is (raw content)
        i++;
        continue;
      }
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
    const outTag = inTargetScope && noParseDepth === 0
      ? obfuscateUserVisibleAttributes(rawTag, mapping, variants, variantSeed)
      : rawTag;

    if (tagName && !selfClose) {
      stack.push({ tagName, inTargetScope, inNoParseScope: noParseTag });
      if (inTargetScope) targetDepth += 1;
      if (noParseTag) noParseDepth += 1;
    }

    out += outTag;
    i = tagEnd + 1;
  }

  return out;
}

function injectBeforeEndTag(html: string, tag: string, injection: string): string {
  const needle = `</${tag}>`;
  const lowerHtml = html.toLowerCase();
  // Build a list of ranges where textual `</tag>` tokens are not structural HTML
  // closers (comments, script/style/textarea contents). Without this, a fake
  // `</head>` inside a comment can steal the insertion point.
  const noParseRanges: Array<[number, number]> = [];
  const noParseRes = [
    /<!--([\s\S]*?)-->/g,
    /<(?:script|style|textarea)\b[^>]*>[\s\S]*?<\/(?:script|style|textarea)>/gi,
  ];
  for (const noParseRe of noParseRes) {
    let npm: RegExpExecArray | null;
    while ((npm = noParseRe.exec(html)) !== null) {
      noParseRanges.push([npm.index, npm.index + npm[0].length]);
    }
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
  private readonly puaPlaneMode: PuaPlaneMode;
  private readonly maxMappableChars: number;
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
  private rotatingMappingMap = new Map<string, { pm: Promise<PrecomputedMapping>; createdAt: number }>();
  private rotatingPageMap = new Map<string, { page: Promise<PrecomputedPage>; createdAt: number }>();
  private readonly scrambleCacheMaxSize = 10;
  private readonly fontGateMaxSize = 50_000;
  private readonly fontTicketsMaxSize = 200_000;
  private readonly rotatingMappingMapMaxSize = 50;
  private readonly rotatingPageMapMaxSize = 50;
  private readonly variantCount: number;
  private readonly digitVariantCount: number;
  private readonly trustedProxies: string[] | undefined;
  private readonly budgetPolicy: BudgetPolicy;
  private readonly variantAllocator: VariantAllocator;
  private readonly minPrimaryGuarantee: number;
  private readonly onBudgetDegrade?: (event: BudgetDegradeEvent) => void;
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
    this.puaPlaneMode = options.puaPlaneMode ?? "bmp";
    this.maxMappableChars = computeMaxMappableChars(this.puaPlaneMode);
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
    // Deduplicate alphabet entries while preserving insertion order.
    // Duplicates in user-supplied alphabets would inflate the budget estimate and
    // could cause false strict-mode throws or unnecessary legacy-mode warnings.
    this.alphabet = [...new Set(options.alphabet ?? defaultAlphabet())];
    this.devMode = options.devMode ?? false;
    this.variantCount = Math.max(
      1,
      Math.min(options.variantCount ?? DEFAULT_VARIANT_COUNT, MAX_VARIANT_COUNT),
    );
    this.digitVariantCount = Math.max(
      1,
      Math.min(options.digitVariantCount ?? DEFAULT_DIGIT_VARIANT_COUNT, MAX_DIGIT_VARIANT_COUNT),
    );
    this.mappingRotationIntervalMs = options.mappingRotationIntervalMs ?? DEFAULT_MAPPING_ROTATION_INTERVAL_MS;
    this.trustedProxies = options.trustedProxies;
    this.budgetPolicy = options.budgetPolicy ?? "legacy";
    this.variantAllocator = options.variantAllocator ?? "uniform";
    this.minPrimaryGuarantee = Math.max(1, options.minPrimaryGuarantee ?? 1);
    this.onBudgetDegrade = options.onBudgetDegrade;

    // Static budget check — runs at construction time, before any request arrives.
    // Only digit chars (DIGIT_VARIANT_TARGETS) use digitVariantCount; all others use
    // variantCount.  Count each group separately for an accurate estimate.
    let digitInAlphabet = 0;
    for (const ch of this.alphabet) {
      if (DIGIT_VARIANT_TARGETS.has(ch)) digitInAlphabet++;
    }
    const nonDigitInAlphabet = this.alphabet.length - digitInAlphabet;
    const estimatedSlots =
      nonDigitInAlphabet * this.variantCount +
      digitInAlphabet * Math.max(this.variantCount, this.digitVariantCount);
    const supplementaryHint =
      this.puaPlaneMode === "bmp"
        ? ` Consider puaPlaneMode: "bmp+supplementary" (capacity 137468).`
        : "";
    if (this.alphabet.length > this.maxMappableChars) {
      throw new Error(
        `[FontObfuscator] alphabet has ${this.alphabet.length} characters ` +
        `but the PUA pool only holds ${this.maxMappableChars}. ` +
        `Characters beyond the limit cannot be obfuscated and would appear as plaintext. ` +
        `${supplementaryHint} Reduce your alphabet or split content across multiple FontObfuscator instances.`,
      );
    } else if (estimatedSlots > this.maxMappableChars) {
      const maxSafeVariant = Math.floor(this.maxMappableChars / this.alphabet.length);
      if (this.budgetPolicy === "strict") {
        throw new Error(
          `[FontObfuscator] strict mode: estimated PUA slots needed (${estimatedSlots}) ` +
          `exceeds pool of ${this.maxMappableChars}. ` +
          `Lower variantCount to ≤ ${maxSafeVariant} or reduce the alphabet.`,
        );
      } else if (this.budgetPolicy === "legacy") {
        console.warn(
          `[FontObfuscator] PUA budget warning: estimated PUA slots needed = ${estimatedSlots} ` +
          `(${nonDigitInAlphabet} non-digit chars × ${this.variantCount} + ` +
          `${digitInAlphabet} digit chars × ${Math.max(this.variantCount, this.digitVariantCount)}), ` +
          `but the PUA pool only holds ${this.maxMappableChars}. ` +
          `Characters that exceed the budget will be obfuscated but with fewer variants, ` +
          `weakening frequency-analysis resistance. ` +
          `Consider setting variantCount ≤ ${maxSafeVariant} for this alphabet size.`,
        );
      }
      // "adaptive": no construction-time warning; handled gracefully at runtime.
    }

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
    const frequencies = ticket.candidateFrequencies;
    // Reuse a scramble that was pre-built during obfuscateHtml (if available)
    // to avoid building the same font twice for the same request cycle.
    const { fontBytes } = await (ticket.cachedScramble ?? this.scrambleFont(ticket.seed, alphabet, frequencies));
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
      return {
        rawHtml: html,
        puaHtml: html,
        seed: 0,
        candidateAlphabet: [],
        candidateFrequencies: {},
        mapping: {},
        variants: {},
        selectors: [],
      };
    }
    const { alphabet: candidateAlphabet, freqs } = this.buildCandidateAlphabetData(html, normalizedSelectors);
    const candidateFrequencies = toFrequencyRecord(freqs);
    const seed = this.generateFreshSeed();
    const { mapping, variants } = await this.scrambleFont(seed, candidateAlphabet, candidateFrequencies);
    const puaHtml = obfuscateSelectorScopeHtml(
      html,
      normalizedSelectors,
      mapping,
      variants,
      secureRandU32(),
    );
    return {
      rawHtml: html,
      puaHtml,
      seed,
      candidateAlphabet,
      candidateFrequencies,
      mapping,
      variants,
      selectors: normalizedSelectors,
    };
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
    const candidate = hintHtml
      ? this.buildCandidateAlphabetData(hintHtml)
      : { alphabet: [...this.alphabet], freqs: new Map<string, number>() };
    const candidateAlphabet = candidate.alphabet;
    const candidateFrequencies = toFrequencyRecord(candidate.freqs);
    const seed = this.generateFreshSeed();
    const { mapping, variants } = await this.scrambleFont(seed, candidateAlphabet, candidateFrequencies);
    return { seed, mapping, variants, candidateAlphabet, candidateFrequencies };
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

    const { seed, mapping, variants, candidateAlphabet, candidateFrequencies } = precomputed;
    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(normalizedSelectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      candidateFrequencies,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
  const unicodeRange = generateUnicodeRangeCss(this.puaPlaneMode);
  const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};unicode-range:${unicodeRange};}${normalizedSelectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;

    let out = obfuscateSelectorScopeHtml(
      html,
      normalizedSelectors,
      mapping,
      variants,
      secureRandU32(),
    );
    out = injectBeforeEndTag(out, "head", style);

    const devMode = options.devMode ?? this.devMode;
    if (devMode) {
      const unmappedChars = this.findUnmappedChars(html, mapping, normalizedSelectors);
      if (unmappedChars.size > 0) {
        out = injectBeforeEndTag(out, "body", this.buildDevWarningPanel(unmappedChars, normalizedSelectors));
      }
    }

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
    const candidate = hintHtml
      ? this.buildCandidateAlphabetData(hintHtml)
      : { alphabet: [...this.alphabet], freqs: new Map<string, number>() };
    const internalKey = JSON.stringify([
      candidate.alphabet,
      toFrequencyRecord(candidate.freqs),
      this.variantAllocator,
    ]);
    const now = Date.now();
    const entry = this.rotatingMappingMap.get(internalKey);
    if (!entry || now - entry.createdAt >= this.mappingRotationIntervalMs) {
      if (!entry && this.rotatingMappingMap.size >= this.rotatingMappingMapMaxSize) {
        const oldest = this.rotatingMappingMap.keys().next().value;
        if (oldest !== undefined) this.rotatingMappingMap.delete(oldest);
      }
      const pm = this.precomputeMapping(hintHtml);
      // Clear the cached entry on failure so the next call can retry.
      pm.catch(() => {
        if (this.rotatingMappingMap.get(internalKey)?.pm === pm) {
          this.rotatingMappingMap.delete(internalKey);
        }
      });
      this.rotatingMappingMap.set(internalKey, { pm, createdAt: now });
    }
    return this.rotatingMappingMap.get(internalKey)!.pm;
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
    // Include normalised selectors in the internal map key so that two different
    // pages sharing the same user-facing `key` (including the default "") but
    // targeting different selectors never receive each other's cached precomputed
    // page.  Use the full selector string (not a hash) to avoid collision risk.
    const normalizedSels = normalizeSelectors(selectors);
    const selectorKey = normalizedSels.join("\x01");
    const internalKey = `${key}\x00${selectorKey}`;
    const now = Date.now();
    const entry = this.rotatingPageMap.get(internalKey);
    if (!entry || now - entry.createdAt >= this.mappingRotationIntervalMs) {
      // Evict oldest entry when the map is full.
      if (!entry && this.rotatingPageMap.size >= this.rotatingPageMapMaxSize) {
        const oldest = this.rotatingPageMap.keys().next().value;
        if (oldest !== undefined) this.rotatingPageMap.delete(oldest);
      }
      // Pass pre-normalised selectors — normalizeSelectors is idempotent so this is safe.
      const page = this.precomputeHtml(html, normalizedSels);
      // Clear the cached entry on failure so the next call can retry.
      page.catch(() => {
        if (this.rotatingPageMap.get(internalKey)?.page === page) {
          this.rotatingPageMap.delete(internalKey);
        }
      });
      const newEntry = { page, createdAt: now };
      this.rotatingPageMap.set(internalKey, newEntry);
    }
    return this.rotatingPageMap.get(internalKey)!.page;
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
    const {
      rawHtml,
      puaHtml,
      seed,
      candidateAlphabet,
      candidateFrequencies,
      mapping,
      variants,
      selectors,
    } = page;
    if (selectors.length === 0) return rawHtml ?? puaHtml;

    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(selectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      candidateFrequencies,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
    const unicodeRange = generateUnicodeRangeCss(this.puaPlaneMode);
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};unicode-range:${unicodeRange};}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;
    // Re-obfuscate per request with a fresh variantSeed so digit-variant
    // codepoints differ between responses within the same rotation window.
    const source = rawHtml ?? puaHtml;
    let out = obfuscateSelectorScopeHtml(source, selectors, mapping, variants ?? {}, secureRandU32());
    out = injectBeforeEndTag(out, "head", style);

    const devMode = options.devMode ?? this.devMode;
    if (devMode) {
      const unmappedChars = this.findUnmappedChars(source, mapping, selectors);
      if (unmappedChars.size > 0) {
        out = injectBeforeEndTag(out, "body", this.buildDevWarningPanel(unmappedChars, selectors));
      }
    }

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
    const { alphabet: candidateAlphabet, freqs } = this.buildCandidateAlphabetData(html, selectors);
    const candidateFrequencies = toFrequencyRecord(freqs);
    const ticket = await this.createFontTicket({
      seed: scopedSeed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      candidateFrequencies,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });
    // Build the scramble once here. Store the promise on the ticket so that
    // maybeHandleFontRequest can reuse it instead of rebuilding from the seed.
    // Use the uncached buildScramble path because obfuscateHtml uses a fresh
    // seed every call and we don't want to pollute the precomputed rotation cache.
    const scramblePromise = this.buildScramble(ticket.seed, candidateAlphabet, candidateFrequencies);
    const storedTicket = this.fontTickets.get(ticket.token);
    if (storedTicket) storedTicket.cachedScramble = scramblePromise;
    const { mapping, variants } = await scramblePromise;

    const devMode = options.devMode ?? this.devMode;
    let unmappedChars: Set<string> | null = null;
    if (devMode) {
      unmappedChars = this.findUnmappedChars(html, mapping, selectors);
    }

    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;
    const unicodeRange = generateUnicodeRangeCss(this.puaPlaneMode);
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");font-display:${this.fontDisplay};unicode-range:${unicodeRange};}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;

    let out = obfuscateSelectorScopeHtml(html, selectors, mapping, variants, secureRandU32());
    out = injectBeforeEndTag(out, "head", style);

    if (devMode && unmappedChars && unmappedChars.size > 0) {
      const warningHtml = this.buildDevWarningPanel(unmappedChars, selectors);
      out = injectBeforeEndTag(out, "body", warningHtml);
    }

    return out;
  }

  private buildCandidateAlphabetData(html: string, selectors?: string[]): CandidateAlphabetData {
    const out: string[] = [];
    const seen = new Set<string>();
    const dynamicData = selectors && selectors.length > 0
      ? extractTextDataFromSelectorScopeHtml(html, selectors)
      : extractTextDataFromHtml(html);
    const dynamicChars = dynamicData.alphabet;

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

    return { alphabet: out, freqs: dynamicData.freqs };
  }

  private findUnmappedChars(
    html: string,
    mapping: Record<string, number>,
    selectors: string[],
  ): Set<string> {
    const unmapped = new Set<string>();

    // Walk the HTML using the same selector-scope logic as obfuscateSelectorScopeHtml.
    // Only collect chars from within selector-matched element subtrees so that text
    // outside the protected selectors does not generate false-positive warnings.
    const sets = buildSelectorSets(selectors);
    if (sets.ids.size === 0 && sets.classes.size === 0) return unmapped;

    const stack: SelectorFrame[] = [];
    let targetDepth = 0;
    let noParseDepth = 0;
    let i = 0;

    const collectUnmapped = (text: string) => {
      for (const { ch } of decodeHtmlTextUnits(text, true)) {
        if (!/\s/u.test(ch) && !mapping[ch]) {
          unmapped.add(ch);
        }
      }
    };

    while (i < html.length) {
      if (html[i] !== "<") {
        const next = html.indexOf("<", i);
        const end = next === -1 ? html.length : next;
        if (targetDepth > 0 && noParseDepth === 0) {
          collectUnmapped(html.slice(i, end));
        }
        i = end;
        continue;
      }

      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        i = end === -1 ? html.length : end + 3;
        continue;
      }

      if (noParseDepth > 0) {
        let innerTag = "";
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].inNoParseScope) { innerTag = stack[k].tagName; break; }
        }
        if (innerTag && !startsWithClosingTagAt(html, i, innerTag)) {
          i++;
          continue;
        }
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
        i = tagEnd + 1;
        continue;
      }

      const tagName = parseTagName(rawTag);
      const selfClose = /\/\s*>$/.test(rawTag) || (tagName !== null && HTML_VOID_ELEMENTS.has(tagName));
      const noParseTag = tagName === "script" || tagName === "style" || tagName === "textarea";
      const inTargetScope = targetDepth > 0 || matchesSelectorSets(rawTag, sets);

      // Collect unmapped chars from user-visible attributes (placeholder, alt, title…)
      // of elements that are themselves matched or are inside a matched subtree.
      if (inTargetScope && noParseDepth === 0) {
        collectUnmapped(extractUserVisibleAttributeText(rawTag));
      }

      if (tagName && !selfClose) {
        stack.push({ tagName, inTargetScope, inNoParseScope: noParseTag });
        if (inTargetScope) targetDepth += 1;
        if (noParseTag) noParseDepth += 1;
      }

      i = tagEnd + 1;
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
    candidateFrequencies?: Record<string, number>;
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
      candidateFrequencies: input.candidateFrequencies,
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
      // Default mode (no proxy config): use the leftmost X-Forwarded-For value as-is.
      // Do NOT fall back to cf-connecting-ip here: if the server is not actually behind
      // Cloudflare, a client could set that header to spoof their rate-limiter key.
      // cf-connecting-ip is only trustworthy when Cloudflare IPs are in trustedProxies.
      return (headers.get("x-forwarded-for") ?? "")
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
    const ua = (req.headers.get("user-agent") ?? "").slice(0, MAX_GATE_KEY_UA_LEN);
    const ip = this.extractClientIp(req.headers).slice(0, MAX_GATE_KEY_IP_LEN);
    return `${ip}|${ua}`;
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
      const retryAfterSec = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": String(retryAfterSec) },
      });
    }

    if (state.resetAt <= now) {
      state.count = 0;
      state.resetAt = now + DEFAULT_FONT_GATE_WINDOW_MS;
      // Also reset the failure counter so that transient errors in a past window
      // do not accumulate into a block in the next window.  Without this reset,
      // a user with 4 failures in window N + 1 failure in window N+1 would be
      // blocked even though their per-window failure rate was within limits.
      state.failures = 0;
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
      const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": String(retryAfterSec) },
      });
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
      // An entry is stale once the rate window has expired AND any active block has
      // also expired.  The extra DEFAULT_FONT_GATE_BLOCK_MS that was previously
      // added to resetAt was redundant: gate.blockedUntil < now already covers the
      // block-has-expired check and kept blocked entries from being deleted.
      const stale = gate.resetAt < now && gate.blockedUntil < now;
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
  private async buildScramble(
    seed: number,
    candidateAlphabet: string[],
    candidateFrequencies?: Record<string, number>,
  ): Promise<ScrambleResult> {
    const srcFont = await this.loadSourceFont();

    const usable: string[] = [];
    for (const ch of candidateAlphabet) {
      const gid = srcFont.charToGlyphIndex(ch);
      if (gid && gid !== 0) usable.push(ch);
    }
    if (usable.length === 0) {
      throw new Error("no usable glyphs in source font for alphabet");
    }

    const puaPool = buildPuaPool(this.puaPlaneMode, seed);

    // [Security] Last-resort guard: even after the constructor check, if the
    // candidate alphabet (which includes dynamic HTML chars) exceeds the pool,
    // we must fail rather than silently passing characters through as plaintext.
    if (usable.length > puaPool.length) {
      const dropped = usable.length - puaPool.length;
      const examples = usable.slice(puaPool.length, puaPool.length + 8).join(" ");
      const supplementaryHint =
        this.puaPlaneMode === "bmp"
          ? ` Consider puaPlaneMode: "bmp+supplementary" (capacity 137468).`
          : "";
      throw new Error(
        `[FontObfuscator] ${usable.length} characters are mappable in the source font ` +
        `but the PUA pool only has ${puaPool.length} slots. ` +
        `The last ${dropped} characters (e.g. "${examples}") would appear as plaintext. ` +
        `${supplementaryHint} Reduce your alphabet or lower variantCount.`,
      );
    }

    let mapping: Record<string, number>;
    let variants: Record<string, number[]>;

    if (this.budgetPolicy === "legacy") {
      // Original two-pass allocation — preserved verbatim for backward compatibility.
      mapping = {};
      variants = {};
      let puaIdx = 0;

      // First pass: assign one primary codepoint to every usable character.
      for (const ch of usable) {
        const pua = puaPool[puaIdx++];
        mapping[ch] = pua;
        variants[ch] = [pua];
      }

      // Second pass: allocate additional variants for all characters.
      if (this.variantCount > 1 || this.digitVariantCount > 1) {
        let shortfallCount = 0;
        for (const ch of usable) {
          const target = DIGIT_VARIANT_TARGETS.has(ch)
            ? Math.max(this.variantCount, this.digitVariantCount)
            : this.variantCount;
          const bucket = variants[ch];
          while (bucket.length < target && puaIdx < puaPool.length) {
            bucket.push(puaPool[puaIdx++]);
          }
          if (bucket.length < target) shortfallCount++;
        }
        if (shortfallCount > 0) {
          let slotsNeeded = 0;
          for (const ch of usable) {
            slotsNeeded += DIGIT_VARIANT_TARGETS.has(ch)
              ? Math.max(this.variantCount, this.digitVariantCount)
              : this.variantCount;
          }
          console.warn(
            `[FontObfuscator] PUA variant budget exhausted: ${shortfallCount} of ${usable.length} characters ` +
            `received fewer than their requested variants ` +
            `(need ${slotsNeeded} slots total, PUA pool has ${this.maxMappableChars}). ` +
            `These characters are still obfuscated but their frequency pattern is less obscured. ` +
            `Consider lowering variantCount (currently ${this.variantCount}) or reducing the alphabet size.`,
          );
        }
      }
    } else {
      // "adaptive" or "strict": use three-phase adaptiveAllocate.
      const allocatorFn: AllocatorStrategy =
        this.variantAllocator === "frequency-weighted"
          ? { distribute: frequencyWeightedDistribute }
          :
        this.variantAllocator === "class-weighted"
          ? { distribute: classWeightedDistribute }
          : { distribute: uniformDistribute };

      const result = adaptiveAllocate(usable, puaPool, {
        budgetPolicy: this.budgetPolicy,
        variantCount: this.variantCount,
        digitVariantCount: this.digitVariantCount,
        minPrimaryGuarantee: this.minPrimaryGuarantee,
        freqs: toFrequencyMap(candidateFrequencies),
        onBudgetDegrade: this.onBudgetDegrade,
        allocator: allocatorFn,
      });
      mapping = result.mapping;
      variants = result.variants;
    }

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
    for (let i = 0; i < usable.length; i++) {
      const ch = usable[i];
      const srcGlyph = srcFont.charToGlyph(ch);
      for (let v = 0; v < variants[ch].length; v++) {
        const pua = variants[ch][v];
        newGlyphs.push(new Glyph({
          // Use the PUA codepoint as the glyph name suffix.  Since each PUA slot
          // is assigned to exactly one glyph, `toHex32(pua)` is guaranteed unique.
          // A 32-bit hash of (seed, i, v, pua) was used before but could collide
          // with ~0.5% probability across a full 6 400-glyph font, producing an
          // invalid font with duplicate glyph names.
          name: `g${toHex32(pua)}`,
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
    preserveSourceNameTable(srcFont, newFont);

    const ab: ArrayBuffer = newFont.toArrayBuffer();
    return { fontBytes: new Uint8Array(ab), mapping, variants };
  }

  private scrambleFont(
    seed: number,
    candidateAlphabet: string[],
    candidateFrequencies?: Record<string, number>,
  ): Promise<ScrambleResult> {
    const cacheKey = JSON.stringify([
      seed,
      this.variantCount,
      this.digitVariantCount,
      candidateAlphabet,
      hashFrequencyRecord(candidateAlphabet, candidateFrequencies),
    ]);
    const cached = this.scrambleCache.get(cacheKey);
    if (cached) return cached;

    // LRU eviction: keep the cache bounded so old rotation entries don't accumulate.
    if (this.scrambleCache.size >= this.scrambleCacheMaxSize) {
      const oldest = this.scrambleCache.keys().next().value;
      if (oldest !== undefined) this.scrambleCache.delete(oldest);
    }

    const p = this.buildScramble(seed, candidateAlphabet, candidateFrequencies);
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
