import { chromium, firefox, webkit } from "playwright";

const DEFAULT_TEST_URL = "http://localhost:8888/supp-test.html";
const TEST_URL = (process.env.TEST_URL ?? DEFAULT_TEST_URL).trim() || DEFAULT_TEST_URL;
const EXPECTED = "\u{F0100}";
const rawBrowsersEnv = (process.env.BROWSERS ?? "all").trim().toLowerCase();
const TARGET_BROWSERS = rawBrowsersEnv.length > 0 ? rawBrowsersEnv : "all";

type BrowserType = typeof chromium | typeof firefox | typeof webkit;

function selectedBrowsers(): BrowserType[] {
  const all: Record<string, BrowserType> = {
    chromium,
    firefox,
    webkit,
  };

  if (TARGET_BROWSERS === "all") {
    return [chromium, firefox, webkit];
  }

  const list = TARGET_BROWSERS
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const unknown = list.filter((name) => !(name in all));
  if (unknown.length > 0) {
    throw new Error(`Invalid BROWSERS value: ${TARGET_BROWSERS}. Unknown tokens: ${unknown.join(",")}. Use chromium,firefox,webkit or all.`);
  }
  const resolved = list.map((name) => all[name]);
  if (resolved.length === 0) {
    throw new Error(`Invalid BROWSERS value: ${TARGET_BROWSERS}. Use chromium,firefox,webkit or all.`);
  }
  return resolved;
}

interface ClipboardResult {
  browser: string;
  runnable: boolean;
  launchError?: string;
  clipboardMatch: boolean;
  copiedCodePoints: string[];
}

function toCodePoints(input: string): string[] {
  return Array.from(input).map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`);
}

async function testClipboard(
  browserType: BrowserType,
): Promise<ClipboardResult> {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return {
      browser: browserType.name(),
      runnable: false,
      launchError: error instanceof Error ? error.message : String(error),
      clipboardMatch: false,
      copiedCodePoints: [],
    };
  }

  let context;
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TEST_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.fonts.status === "loaded");

    // Browser-level clipboard precheck via copy event capture.
    // This is not equivalent to OS clipboard validation.
    const copied = await page.evaluate(async () => {
      const target = document.querySelector(".target");
      if (!(target instanceof HTMLElement)) {
        throw new Error(".target not found");
      }

      const sel = window.getSelection();
      if (!sel) {
        throw new Error("selection API unavailable");
      }
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(target);
      sel.addRange(range);

      let captured = "";
      document.addEventListener("copy", function (event: ClipboardEvent) {
        const text = sel.toString();
        if (event.clipboardData) {
          event.clipboardData.setData("text/plain", text);
        }
        captured = text;
        event.preventDefault();
      }, { once: true });
      const ok = document.execCommand("copy");
      if (!ok) {
        throw new Error("execCommand(copy) failed");
      }
      return captured;
    });

    return {
      browser: browserType.name(),
      runnable: true,
      clipboardMatch: copied === EXPECTED,
      copiedCodePoints: toCodePoints(copied),
    };
  } catch (error) {
    return {
      browser: browserType.name(),
      runnable: false,
      launchError: error instanceof Error ? error.message : String(error),
      clipboardMatch: false,
      copiedCodePoints: [],
    };
  } finally {
    if (context) {
      await context.close();
    }
    await browser.close();
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(selectedBrowsers().map((browserType) => testClipboard(browserType)));

  let hasFailure = false;
  for (const result of results) {
    console.log(`\n[${result.browser}]`);
    if (!result.runnable) {
      console.log("- Execution: SKIPPED");
      console.log(`- Reason: ${result.launchError ?? "unknown"}`);
      hasFailure = true;
      continue;
    }

    console.log(`- Clipboard code points: ${result.copiedCodePoints.join(", ") || "(empty)"}`);
    console.log(`- Browser clipboard retains U+F0100: ${result.clipboardMatch ? "OK" : "NG"}`);
    if (!result.clipboardMatch) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

await main();
