import * as opentypeModule from "opentype.js";
import * as wawoff2Module from "wawoff2";

const opentype = (opentypeModule as { default?: unknown }).default ?? opentypeModule;
const wawoff2 = (wawoff2Module as { default?: unknown }).default ?? wawoff2Module;

export interface FontObfuscatorOptions {
  fontUrl: string;
  fontRoutePrefix?: string;
  sessionTtlMs?: number;
  alphabet?: string[];
  devMode?: boolean;
  /**
   * How often (ms) to rotate the PUA shuffle mapping.
   * After each interval a new random seed is chosen, invalidating any
   * previously captured font files and `_pre` arrays.
   * @default 300_000 (5 minutes)
   */
  mappingRotationIntervalMs?: number;
}

export interface ObfuscateHtmlOptions {
  selectors: string[];
  fontFamilyName?: string;
  observeMutations?: boolean;
  devMode?: boolean;
  pageKey?: string;
  clientFingerprint?: string;
  /**
   * When false, the client-side mapping script (_enc/_seed) is omitted.
   * Static text is still obfuscated server-side; use pre-encoded value arrays
   * for any dynamic text (e.g. counters).
   * @default true
   */
  sendClientMapping?: boolean;
}

/**
 * The result of {@link FontObfuscator.precomputeHtml}.
 * Holds the PUA-encoded HTML and the parameters needed to inject a fresh
 * per-request font ticket via {@link FontObfuscator.servePrecomputed}.
 */
export interface PrecomputedPage {
  /** HTML with protected elements already PUA-encoded at startup time. */
  puaHtml: string;
  /** The seed used to build the mapping (fixed for the server lifetime). */
  seed: number;
  /** Characters included in the scrambled font. */
  candidateAlphabet: string[];
  /** char → PUA codepoint mapping derived from seed. */
  mapping: Record<string, number>;
  /** Normalised selectors that were obfuscated. */
  selectors: string[];
}

export interface ServePrecomputedOptions {
  pageKey?: string;
  clientFingerprint?: string;
  /** @default true */
  observeMutations?: boolean;
  fontFamilyName?: string;
  /**
   * When false, the client-side mapping script (_enc/_seed) is omitted.
   * Static text is still obfuscated server-side; use pre-encoded value arrays
   * for any dynamic text (e.g. counters).
   * @default true
   */
  sendClientMapping?: boolean;
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
}

const DEFAULT_FONT_ROUTE_PREFIX = "/_obf/font";
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_FONT_URL_TTL_MS = 5 * 1000;
const DEFAULT_FONT_GATE_WINDOW_MS = 60 * 1000;
const DEFAULT_FONT_GATE_MAX_PER_WINDOW = 20;
const DEFAULT_FONT_GATE_BLOCK_AFTER_FAILURES = 5;
const DEFAULT_FONT_GATE_BLOCK_MS = 10 * 60 * 1000;
const PUA_START = 0xE000;
const PUA_END = 0xF8FF;
const MAX_MAPPABLE_CHARS = PUA_END - PUA_START + 1;

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
  const stripped = html
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

function encodeMapping(mapping: Record<string, number>, xorSeed: number): string {
  const pairs: number[] = [];
  for (const [ch, pua] of Object.entries(mapping)) {
    pairs.push(ch.codePointAt(0)!, pua);
  }

  const raw = new Uint8Array(pairs.length * 4);
  for (let i = 0; i < pairs.length; i++) {
    const cp = pairs[i];
    raw[i * 4 + 0] = (cp >>> 24) & 0xff;
    raw[i * 4 + 1] = (cp >>> 16) & 0xff;
    raw[i * 4 + 2] = (cp >>> 8) & 0xff;
    raw[i * 4 + 3] = cp & 0xff;
  }

  const rng = mulberry32(xorSeed);
  const enc = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    enc[i] = raw[i] ^ (Math.floor(rng() * 256) & 0xff);
  }
    // Build binary string without spread operator to avoid call-stack limits
    // when the mapping is large (up to MAX_MAPPABLE_CHARS * 8 bytes).
    let binaryStr = "";
    for (let i = 0; i < enc.length; i++) binaryStr += String.fromCharCode(enc[i]);
    return btoa(binaryStr);
}

function buildClientScript(
  selectors: string[],
  encoded: string,
  xorSeed: number,
  observeMutations: boolean,
): string {
  const selectorsLiteral = JSON.stringify(selectors);
  const observeLiteral = observeMutations ? "true" : "false";
  return `(function(){
var _sel=${selectorsLiteral};
var _observe=${observeLiteral};
var _enc=atob(${JSON.stringify(encoded)});
var _seed=${xorSeed >>> 0};
function _rng(s){var a=s>>>0;return function(){a=(a+0x6d2b79f5)>>>0;var t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
var _r=_rng(_seed);
var _b=new Uint8Array(_enc.length);
for(var i=0;i<_enc.length;i++)_b[i]=_enc.charCodeAt(i)^(Math.floor(_r()*256)&255);
var _map={};
for(var i=0;i<_b.length;i+=8){var sc=(_b[i]<<24|_b[i+1]<<16|_b[i+2]<<8|_b[i+3]);var pc=(_b[i+4]<<24|_b[i+5]<<16|_b[i+6]<<8|_b[i+7]);if(sc>0&&pc>0)_map[String.fromCodePoint(sc)]=String.fromCodePoint(pc);}
function _obf(s){var out="";for(var i=0;i<s.length;){var cp=s.codePointAt(i);var ch=String.fromCodePoint(cp);out+=_map[ch]||ch;i+=(cp>0xFFFF?2:1);}return out;}
function _walk(root){
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var n;
  while((n=walker.nextNode())){
    var p=n.parentNode;
    if(!p||!p.nodeName)continue;
    var t=p.nodeName.toUpperCase();
    if(t==="SCRIPT"||t==="STYLE"||t==="TEXTAREA")continue;
    n.nodeValue=_obf(n.nodeValue||"");
  }
}
function _processNode(node){
  if(!node)return;
  if(node.nodeType===Node.TEXT_NODE){
    var p=node.parentNode;
    if(!p||!p.nodeName)return;
    var t=p.nodeName.toUpperCase();
    if(t==="SCRIPT"||t==="STYLE"||t==="TEXTAREA")return;
    node.nodeValue=_obf(node.nodeValue||"");
    return;
  }
  if(node.nodeType===Node.ELEMENT_NODE){
    _walk(node);
  }
}
for(var i=0;i<_sel.length;i++){
  var list=document.querySelectorAll(_sel[i]);
  for(var j=0;j<list.length;j++){
    var root=list[j];
    if(_observe&&typeof MutationObserver!=="undefined"){
      var obs=new MutationObserver(function(mutations){
        for(var mi=0;mi<mutations.length;mi++){
          var added=mutations[mi].addedNodes;
          for(var ai=0;ai<added.length;ai++)_processNode(added[ai]);
        }
      });
      obs.observe(root,{childList:true,subtree:true});
    }
  }
}
})();`;
}

function obfuscateTextWithMapping(input: string, mapping: Record<string, number>): string {
  let out = "";
  for (let i = 0; i < input.length;) {
    const cp = input.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const mapped = mapping[ch];
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
export function encodeText(text: string, mapping: Record<string, number>): string {
  return obfuscateTextWithMapping(text, mapping);
}

/**
 * Pre-encode an ordered array of values and return them in a **shuffled** order
 * together with an index map so the client can resolve `values[i]` without the
 * indices being trivially sequential.
 *
 * This breaks the naive sequential-correlation attack where `_pre[0]` could be
 * assumed to equal `encode("0")`, `_pre[1]` = `encode("1")`, etc.
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
): { encoded: string[]; indices: number[] } {
  const n = values.length;
  const perm = Array.from({ length: n }, (_, i) => i);
  shuffle(perm, mulberry32(secureRandU32()));
  const encoded = perm.map(i => encodeText(values[i], mapping));
  const indices = new Array<number>(n);
  perm.forEach((origIdx, pos) => { indices[origIdx] = pos; });
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
      out += (targetDepth > 0 && noParseDepth === 0) ? obfuscateTextWithMapping(chunk, mapping) : chunk;
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
  const idx = html.toLowerCase().lastIndexOf(needle);
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

export class FontObfuscator {
  private readonly fontUrl: string;
  private readonly fontRoutePrefix: string;
  private readonly sessionTtlMs: number;
  private readonly fontUrlTtlMs: number;
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

  constructor(options: FontObfuscatorOptions) {
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
    this.fontUrlTtlMs = Math.min(this.sessionTtlMs, DEFAULT_FONT_URL_TTL_MS);
    this.alphabet = options.alphabet ?? defaultAlphabet();
    this.devMode = options.devMode ?? false;
    this.mappingRotationIntervalMs = options.mappingRotationIntervalMs ?? 5 * 60 * 1000;
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

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "allow": "GET, HEAD" },
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

    if (!/^[0-9a-f]{64}$/i.test(sig)) {
      this.recordGateFailure(gateKey);
      return new Response("Forbidden", { status: 403 });
    }

    const expectedSig = await this.signTicket(token, exp, ticket.clientFingerprint);
    if (exp !== ticket.expiry || !timingSafeEqual(sig.toLowerCase(), expectedSig)) {
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
    const { fontBytes } = await this.scrambleFont(ticket.seed, alphabet);
    return new Response(fontBytes as unknown as BodyInit, {
      headers: {
        "content-type": "font/ttf",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  /**
   * Encode all text inside `selectors` to PUA characters at startup time.
   * Store the returned {@link PrecomputedPage} at module scope and pass it
   * to {@link servePrecomputed} on every request to inject only a fresh
   * per-request font ticket, avoiding repeated text-encoding work.
   */
  async precomputeHtml(html: string, selectors: string[]): Promise<PrecomputedPage> {
    const normalizedSelectors = normalizeSelectors(selectors);
    if (normalizedSelectors.length === 0) {
      return { puaHtml: html, seed: 0, candidateAlphabet: [], mapping: {}, selectors: [] };
    }
    const candidateAlphabet = this.buildCandidateAlphabet(html);
    const seed = secureRandU32();
    const { mapping } = await this.scrambleFont(seed, candidateAlphabet);
    const puaHtml = obfuscateSelectorScopeHtml(html, normalizedSelectors, mapping);
    return { puaHtml, seed, candidateAlphabet, mapping, selectors: normalizedSelectors };
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
    const seed = secureRandU32();
    const { mapping } = await this.scrambleFont(seed, candidateAlphabet);
    return { seed, mapping, candidateAlphabet };
  }

  /**
   * Per-request companion to {@link precomputeMapping}.
   * Encodes `html` with the precomputed mapping, then injects a fresh
   * one-time font ticket (`<style>` + `<script>`) for this request.
   *
   * Usage (Nuxt / SolidStart Nitro plugin):
   * ```ts
   * // Once at startup:
   * const _mapping = obfuscator.precomputeMapping();
   *
   * // In render:response hook:
   * const pm = await _mapping;
   * response.body = await obfuscator.serveWithMapping(response.body, selectors, pm, {
   *   pageKey: event.path,
   *   clientFingerprint: `${ip}|${ua}`,
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

    const { seed, mapping, candidateAlphabet } = precomputed;
    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(normalizedSelectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const xorSeed = secureRandU32();
    const encoded = encodeMapping(mapping, xorSeed);
    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const observeMutations = options.observeMutations ?? true;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;

    const sendClientMapping = options.sendClientMapping !== false;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");}${normalizedSelectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;
    const script = sendClientMapping
      ? `<script>${buildClientScript(normalizedSelectors, encoded, xorSeed, observeMutations)}</script>`
      : "";

    let out = obfuscateSelectorScopeHtml(html, normalizedSelectors, mapping);
    out = injectBeforeEndTag(out, "head", style);
    if (script) out = injectBeforeEndTag(out, "body", script);
    return out;
  }

  /**
   * Inject a fresh per-request font ticket into a {@link PrecomputedPage}.
   * The PUA-encoded text is already in `page.puaHtml`; this method only
   * creates the font URL and injects the `<style>` + `<script>` tags.
   *
   * Dynamic text added via MutationObserver is still obfuscated because the
   * mapping is sent to the client — PUA characters already in the HTML simply
   * pass through unchanged (they are not in the mapping's key set).
   */
  /**
   * Returns the current rotating mapping. A new mapping is generated after
   * `mappingRotationIntervalMs` (default 5 min), limiting how long any
   * captured `_pre` array or downloaded font file remains exploitable.
   *
   * Call this **per-request** in SSR handlers instead of caching
   * `precomputeMapping()` at module scope.
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
   * Returns the current rotating precomputed page for static HTML.
   * Re-runs `precomputeHtml` after `mappingRotationIntervalMs` so that
   * old fonts and cached HTML become useless after each rotation window.
   *
   * @param html  The static HTML template (re-evaluated only on rotation).
   * @param selectors  CSS selectors to obfuscate.
   * @param key  Cache key for distinguishing multiple pages (default `""`).
   */
  private readonly rotatingPageMapMaxSize = 50;

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

  async servePrecomputed(page: PrecomputedPage, options: ServePrecomputedOptions = {}): Promise<string> {
    const { puaHtml, seed, candidateAlphabet, mapping, selectors } = page;
    if (selectors.length === 0) return puaHtml;

    const pageKey = normalizePageKey(options.pageKey);
    const selectorKey = normalizeSelectorKey(selectors);

    const ticket = await this.createFontTicket({
      seed,
      pageKey,
      selectorKey,
      candidateAlphabet,
      clientFingerprint: normalizeClientFingerprint(options.clientFingerprint),
    });

    const xorSeed = secureRandU32();
    const encoded = encodeMapping(mapping, xorSeed);
    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const observeMutations = options.observeMutations ?? true;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;

    const sendClientMapping = options.sendClientMapping !== false;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;
    const script = sendClientMapping
      ? `<script>${buildClientScript(selectors, encoded, xorSeed, observeMutations)}</script>`
      : "";

    let out = injectBeforeEndTag(puaHtml, "head", style);
    if (script) out = injectBeforeEndTag(out, "body", script);
    return out;
  }

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
    const { mapping } = await this.scrambleFont(ticket.seed, candidateAlphabet);

    const devMode = options.devMode ?? this.devMode;
    let unmappedChars: Set<string> | null = null;
    if (devMode) {
      unmappedChars = this.findUnmappedChars(html, selectors, mapping);
    }

    const xorSeed = secureRandU32();
    const encoded = encodeMapping(mapping, xorSeed);
    const family = options.fontFamilyName ?? `Obf_${ticket.token.slice(0, 8)}`;
    const observeMutations = options.observeMutations ?? true;
    const fontUrl = `${this.fontRoutePrefix}/${ticket.token}?exp=${ticket.expiry}&sig=${ticket.sig}`;

    const sendClientMapping = options.sendClientMapping !== false;
    const style = `<style>@font-face{font-family:${safeCssStringLiteral(family)};src:url("${fontUrl}") format("truetype");}${selectors.join(",")}{font-family:${safeCssStringLiteral(family)},sans-serif !important;}</style>`;
    const script = sendClientMapping
      ? `<script>${buildClientScript(selectors, encoded, xorSeed, observeMutations)}</script>`
      : "";

    let out = obfuscateSelectorScopeHtml(html, selectors, mapping);
    out = injectBeforeEndTag(out, "head", style);
    if (script) out = injectBeforeEndTag(out, "body", script);

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
    
    // Strip HTML tags/scripts/styles, leaving only text content
    let textContent = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    
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
      .map(
        (ch) =>
          `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} (${ch})`,
      )
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

  private getClientFingerprint(req: Request): string {
    const headers = req.headers;
    const ua = headers.get("user-agent") ?? "";
    const ip = (headers.get("x-forwarded-for") ?? headers.get("cf-connecting-ip") ?? "")
      .split(",")[0]
      .trim();
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
    for (const [token, ticket] of this.fontTickets) {
      if (ticket.expiry < now || ticket.used) this.fontTickets.delete(token);
    }
    for (const [k, gate] of this.fontGate) {
      const stale = gate.resetAt + DEFAULT_FONT_GATE_BLOCK_MS < now && gate.blockedUntil < now;
      if (stale) this.fontGate.delete(k);
    }
  }

  private loadSourceFont(): Promise<any> {
    if (!this.srcFontPromise) {
      const p = (async () => {
        const res = await fetch(this.fontUrl);
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

  private scrambleFont(seed: number, candidateAlphabet: string[]): Promise<ScrambleResult> {
    const cacheKey = `${seed}:${candidateAlphabet.length}:${hashCharList(candidateAlphabet)}`;
    const cached = this.scrambleCache.get(cacheKey);
    if (cached) return cached;

    // LRU eviction: keep the cache bounded so old rotation entries don't accumulate.
    if (this.scrambleCache.size >= this.scrambleCacheMaxSize) {
      const oldest = this.scrambleCache.keys().next().value;
      if (oldest !== undefined) this.scrambleCache.delete(oldest);
    }

    const p = (async (): Promise<ScrambleResult> => {
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

      const puaCodes: number[] = [];
      for (let i = 0; i < usable.length; i++) puaCodes.push(PUA_START + i);
      shuffle(puaCodes, mulberry32(seed));

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

      for (let i = 0; i < usable.length; i++) {
        const ch = usable[i];
        const pua = puaCodes[i];
        const srcGlyph = srcFont.charToGlyph(ch);

        newGlyphs.push(new Glyph({
          // Opaque deterministic name: never reveals the original character.
          // Prevents fonttools / name-table attacks that map PUA → glyph name → original char.
          name: `g${toHex32(Math.imul((seed ^ i) + 0x9e3779b9, pua + 0x6c62272e) >>> 0)}`,
          unicode: pua,
          advanceWidth: srcGlyph.advanceWidth,
          path: srcGlyph.path,
        }));
        mapping[ch] = pua;
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
      return { fontBytes: new Uint8Array(ab), mapping };
    })();

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
