const PUA_START = 0xE000;
const PUA_END = 0xF8FF;
const SUPP_PUA_A_START = 0xF0000;
const SUPP_PUA_A_END = 0xFFFFF;
const SUPP_PUA_B_START = 0x100000;
const SUPP_PUA_B_END = 0x10FFFF;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, rand) {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function buildPuaPool(mode, seed) {
  const pool = [];
  for (let i = PUA_START; i <= PUA_END; i++) pool.push(i);

  if (mode === "bmp+supplementary") {
    for (let i = SUPP_PUA_A_START; i < SUPP_PUA_A_END; i++) {
      if (i === 0xFFFFE || i === 0xFFFFF) continue;
      pool.push(i);
    }
    for (let i = SUPP_PUA_B_START; i < SUPP_PUA_B_END; i++) {
      if (i === 0x10FFFE || i === 0x10FFFF) continue;
      pool.push(i);
    }
  }

  return shuffle(pool, mulberry32(seed));
}

function computeMaxMappableChars(mode) {
  const bmpCount = PUA_END - PUA_START + 1;
  if (mode === "bmp") return bmpCount;
  const suppACount = (SUPP_PUA_A_END - SUPP_PUA_A_START + 1) - 2;
  const suppBCount = (SUPP_PUA_B_END - SUPP_PUA_B_START + 1) - 2;
  return bmpCount + suppACount + suppBCount;
}

function detectRuntime() {
  if (typeof Bun !== "undefined") return "bun";
  if (typeof Deno !== "undefined") return "deno";
  return "node";
}

const seed = 0x1234ABCD;
const bmp = buildPuaPool("bmp", seed);
const supp = buildPuaPool("bmp+supplementary", seed);

const output = {
  runtime: detectRuntime(),
  seed,
  counts: {
    bmp: bmp.length,
    supplementary: supp.length,
    maxBmp: computeMaxMappableChars("bmp"),
    maxSupplementary: computeMaxMappableChars("bmp+supplementary"),
  },
  invariants: {
    bmpRangeOnly: bmp.every((cp) => cp >= PUA_START && cp <= PUA_END),
    supplementaryExcludesNonCharacters:
      !supp.includes(0xFFFFE) &&
      !supp.includes(0xFFFFF) &&
      !supp.includes(0x10FFFE) &&
      !supp.includes(0x10FFFF),
  },
  samples: {
    bmpFirst12: bmp.slice(0, 12),
    supplementaryFirst12: supp.slice(0, 12),
    supplementaryLast12: supp.slice(-12),
  },
};

console.log(JSON.stringify(output, null, 2));
