import * as fs from "node:fs";
import * as path from "node:path";
import * as wawoff2Module from "wawoff2";
import { FontObfuscator, type PuaPlaneMode } from "../lib/index.ts";

const wawoff2 = (wawoff2Module as { default?: unknown }).default ?? wawoff2Module;

const FONT_URL =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
const SIZES = [500, 1000, 5000] as const;
const MODES: PuaPlaneMode[] = ["bmp", "bmp+supplementary"];
const OUT_DIR = "/tmp";
const OUT_FILE = path.join(OUT_DIR, "phase-d-benchmark-results.json");

interface CandidateData {
  alphabet: string[];
  freqs: Map<string, number>;
}

interface ScrambleResult {
  fontBytes: Uint8Array;
  mapping: Record<string, number>;
  variants: Record<string, number[]>;
}

interface BenchmarkRow {
  mode: PuaPlaneMode;
  size: number;
  uniqueAlphabet: number;
  ttfBuildMs: number;
  ttfSizeBytes: number;
  woff2CompressMs: number;
  woff2SizeBytes: number;
  woff2DecompressMs: number;
  roundtripTtfBytes: number;
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

function buildUniqueCjkText(size: number): string {
  const chars: string[] = [];
  const base = 0x4e00;
  for (let i = 0; i < size; i++) {
    chars.push(String.fromCodePoint(base + i));
  }
  return chars.join("");
}

async function runOne(mode: PuaPlaneMode, size: number): Promise<BenchmarkRow> {
  const obf = new FontObfuscator({
    fontUrl: FONT_URL,
    puaPlaneMode: mode,
    budgetPolicy: "adaptive",
    variantCount: 1,
    digitVariantCount: 1,
  });

  const internal = obf as any;
  await internal.loadSourceFont();

  const html = `<html><head></head><body><p class="a">${buildUniqueCjkText(size)}</p></body></html>`;
  const candidate = internal.buildCandidateAlphabetData(html, [".a"]) as CandidateData;
  const seed = (0x9e3779b9 ^ size) >>> 0;

  const t0 = nowMs();
  const scramble = (await internal.buildScramble(
    seed,
    candidate.alphabet,
    Object.fromEntries(candidate.freqs),
  )) as ScrambleResult;
  const t1 = nowMs();

  const ttfBytes = scramble.fontBytes;

  const t2 = nowMs();
  const woff2Bytes = (await (wawoff2 as any).compress(ttfBytes)) as Uint8Array;
  const t3 = nowMs();

  const t4 = nowMs();
  const roundtrip = (await (wawoff2 as any).decompress(woff2Bytes)) as Uint8Array;
  const t5 = nowMs();

  return {
    mode,
    size,
    uniqueAlphabet: candidate.alphabet.length,
    ttfBuildMs: Number((t1 - t0).toFixed(2)),
    ttfSizeBytes: ttfBytes.byteLength,
    woff2CompressMs: Number((t3 - t2).toFixed(2)),
    woff2SizeBytes: woff2Bytes.byteLength,
    woff2DecompressMs: Number((t5 - t4).toFixed(2)),
    roundtripTtfBytes: roundtrip.byteLength,
  };
}

async function main(): Promise<void> {
  const rows: BenchmarkRow[] = [];
  for (const mode of MODES) {
    for (const size of SIZES) {
      rows.push(await runOne(mode, size));
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    fontUrl: FONT_URL,
    rows,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote benchmark results to ${OUT_FILE}`);
  for (const row of rows) {
    console.log(
      `${row.mode} size=${row.size} alphabet=${row.uniqueAlphabet} ` +
      `ttf=${row.ttfBuildMs}ms/${row.ttfSizeBytes}B ` +
      `woff2=${row.woff2CompressMs}ms/${row.woff2SizeBytes}B ` +
      `inflate=${row.woff2DecompressMs}ms`,
    );
  }
}

await main();
