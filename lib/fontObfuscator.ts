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
}

export interface ObfuscateHtmlOptions {
  selectors: string[];
  fontFamilyName?: string;
  observeMutations?: boolean;
  devMode?: boolean;
}

interface SessionEntry {
  seed: number;
  expiry: number;
  candidateAlphabet?: string[];
}

interface ScrambleResult {
  fontBytes: Uint8Array;
  mapping: Record<string, number>;
}

const DEFAULT_FONT_ROUTE_PREFIX = "/_obf/font";
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
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
  return btoa(String.fromCharCode(...enc));
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
    _walk(root);
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

function injectBeforeEndTag(html: string, tag: string, injection: string): string {
  const needle = `</${tag}>`;
  const idx = html.toLowerCase().lastIndexOf(needle);
  if (idx === -1) return html + injection;
  return html.slice(0, idx) + injection + html.slice(idx);
}

export class FontObfuscator {
  private readonly fontUrl: string;
  private readonly fontRoutePrefix: string;
  private readonly sessionTtlMs: number;
  private readonly alphabet: string[];
  private readonly devMode: boolean;

  private sessions = new Map<string, SessionEntry>();
  private scrambleCache = new Map<string, Promise<ScrambleResult>>();
  private srcFontPromise: Promise<any> | null = null;

  constructor(options: FontObfuscatorOptions) {
    this.fontUrl = options.fontUrl;
    this.fontRoutePrefix = options.fontRoutePrefix ?? DEFAULT_FONT_ROUTE_PREFIX;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.alphabet = options.alphabet ?? defaultAlphabet();
    this.devMode = options.devMode ?? false;
  }

  async maybeHandleFontRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const prefix = `${this.fontRoutePrefix}/`;
    if (!url.pathname.startsWith(prefix)) return null;

    const token = url.pathname.slice(prefix.length);
    if (!/^[0-9a-f-]{36}$/.test(token)) {
      return new Response("Not Found", { status: 404 });
    }

    const session = this.getSession(token);
    if (!session) {
      return new Response("Session expired", { status: 410 });
    }

    const alphabet = session.candidateAlphabet ?? this.alphabet;
    const { fontBytes } = await this.scrambleFont(session.seed, alphabet);
    return new Response(fontBytes as unknown as BodyInit, {
      headers: {
        "content-type": "font/ttf",
        "cache-control": "no-store",
      },
    });
  }

  async obfuscateHtml(
    html: string,
    options: ObfuscateHtmlOptions,
  ): Promise<string> {
    const selectors = options.selectors.filter((s) => s.trim().length > 0);
    if (selectors.length === 0) return html;

    const token = this.createSession();
    const session = this.getSession(token)!;
    const candidateAlphabet = this.buildCandidateAlphabet(html);
    session.candidateAlphabet = candidateAlphabet;
    const { mapping } = await this.scrambleFont(session.seed, candidateAlphabet);

    const devMode = options.devMode ?? this.devMode;
    let unmappedChars: Set<string> | null = null;
    if (devMode) {
      unmappedChars = this.findUnmappedChars(html, selectors, mapping);
    }

    const xorSeed = secureRandU32();
    const encoded = encodeMapping(mapping, xorSeed);
    const family = options.fontFamilyName ?? `Obf_${token.slice(0, 8)}`;
    const observeMutations = options.observeMutations ?? true;

    const style = `<style>@font-face{font-family:${JSON.stringify(family)};src:url("${this.fontRoutePrefix}/${token}") format("truetype");}${selectors.join(",")}{font-family:${JSON.stringify(family)},sans-serif !important;}</style>`;
    const script = `<script>${buildClientScript(selectors, encoded, xorSeed, observeMutations)}</script>`;

    let out = html;
    out = injectBeforeEndTag(out, "head", style);
    out = injectBeforeEndTag(out, "body", script);

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

  private createSession(): string {
    const now = Date.now();
    for (const [k, v] of this.sessions) {
      if (v.expiry < now) this.sessions.delete(k);
    }

    const token = crypto.randomUUID();
    this.sessions.set(token, {
      seed: secureRandU32(),
      expiry: now + this.sessionTtlMs,
    });
    return token;
  }

  private getSession(token: string): SessionEntry | null {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiry < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  private loadSourceFont(): Promise<any> {
    if (!this.srcFontPromise) {
      this.srcFontPromise = (async () => {
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
    }
    return this.srcFontPromise;
  }

  private scrambleFont(seed: number, candidateAlphabet: string[]): Promise<ScrambleResult> {
    const cacheKey = `${seed}:${candidateAlphabet.length}:${hashCharList(candidateAlphabet)}`;
    const cached = this.scrambleCache.get(cacheKey);
    if (cached) return cached;

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
          name: srcGlyph.name || `g${pua.toString(16)}`,
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

    this.scrambleCache.set(cacheKey, p);
    return p;
  }
}
