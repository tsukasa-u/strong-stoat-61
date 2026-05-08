from __future__ import annotations

from fontTools.ttLib import TTFont

SUPP_CP = 0xF0100


def has_format12_with_cp(ttf_path: str, cp: int) -> bool:
    with TTFont(ttf_path) as font:
        for table in font["cmap"].tables:
            if table.format == 12 and cp in table.cmap:
                return True
    return False


def main() -> None:
    step1_ok = has_format12_with_cp("/tmp/supp-test.ttf", SUPP_CP)
    step2_ok = has_format12_with_cp("/tmp/supp-test-roundtrip.ttf", SUPP_CP)

    print("Step1 format12+U+F0100:", "OK" if step1_ok else "NG")
    print("Step2 roundtrip keeps format12+U+F0100:", "OK" if step2_ok else "NG")

    if not (step1_ok and step2_ok):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
