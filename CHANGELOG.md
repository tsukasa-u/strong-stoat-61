# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Supplementary PUA support (experimental):
  - New option `puaPlaneMode: "bmp" | "bmp+supplementary"`
  - Capacity expands from 6,400 to 137,468 codepoints in supplementary mode
  - Supplementary ranges include U+F0000-U+FFFFD and U+100000-U+10FFFD (non-characters excluded)
- CSS `unicode-range` output now adapts to `puaPlaneMode` in all obfuscation flows:
  - `obfuscateHtml`
  - `servePrecomputed`
  - `serveWithMapping`
- New supplementary PUA test coverage:
  - Overflow guidance behavior in BMP mode
  - Unicode-range output checks for BMP and supplementary modes
  - Large alphabet acceptance in supplementary mode
- Phase D runtime/performance artifacts:
  - `scripts/phase-d-runtime-compat.mjs`
  - `scripts/phase-d-benchmark.ts`
  - `docs/phase-d-benchmark-results.json`
  - `docs/phase-d-performance.ja.md`

### Changed

- Overflow error messages now suggest `puaPlaneMode: "bmp+supplementary"` when BMP capacity is exceeded.
- PUA capacity checks are now mode-aware and consistent across constructor/runtime paths.

### Notes

- Supplementary PUA mode is experimental. Validate across your target browsers/devices before production rollout.
- Default behavior remains unchanged (`puaPlaneMode: "bmp"`).
