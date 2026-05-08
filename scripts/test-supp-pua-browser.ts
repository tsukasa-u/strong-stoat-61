import { chromium, firefox, webkit } from "playwright";

const DEFAULT_TEST_URL = "http://localhost:8888/supp-test.html";
const TEST_URL = (process.env.TEST_URL ?? DEFAULT_TEST_URL).trim() || DEFAULT_TEST_URL;
const EXPECTED_FONT = "SuppTest";
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

interface BrowserResult {
  browser: string;
  runnable: boolean;
  launchError?: string;
  otsErrorFound: boolean;
  otsErrorMessages: string[];
  glyphRendered: boolean;
  computedFontFamily: string;
  fontRequestOk: boolean;
  fontRequestStatus: number | null;
}

async function testBrowser(
  browserType: BrowserType,
): Promise<BrowserResult> {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return {
      browser: browserType.name(),
      runnable: false,
      launchError: error instanceof Error ? error.message : String(error),
      otsErrorFound: false,
      otsErrorMessages: [],
      glyphRendered: false,
      computedFontFamily: "",
      fontRequestOk: false,
      fontRequestStatus: null,
    };
  }

  try {
    const page = await browser.newPage();

    const otsErrors: string[] = [];
    let fontStatus: number | null = null;

    page.on("console", (msg) => {
      const text = msg.text().toLowerCase();
      if (msg.type() === "error" && text.includes("font")) {
        otsErrors.push(msg.text());
      }
    });

    page.on("response", (resp) => {
      if (resp.url().includes("supp-test.woff2")) {
        fontStatus = resp.status();
      }
    });

    await page.goto(TEST_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.fonts.status === "loaded");

    const computedFontFamily = await page.locator(".target").evaluate((node) => {
      return getComputedStyle(node).fontFamily;
    });

    const boundingBox = await page.locator(".target").boundingBox();
    const glyphRendered = Boolean(boundingBox && boundingBox.width > 10 && boundingBox.height > 10);

    return {
      browser: browserType.name(),
      runnable: true,
      otsErrorFound: otsErrors.length > 0,
      otsErrorMessages: otsErrors,
      glyphRendered,
      computedFontFamily,
      fontRequestOk: fontStatus === 200,
      fontRequestStatus: fontStatus,
    };
  } catch (error) {
    return {
      browser: browserType.name(),
      runnable: false,
      launchError: error instanceof Error ? error.message : String(error),
      otsErrorFound: false,
      otsErrorMessages: [],
      glyphRendered: false,
      computedFontFamily: "",
      fontRequestOk: false,
      fontRequestStatus: null,
    };
  } finally {
    await browser.close();
  }
}

function printResult(result: BrowserResult): void {
  if (!result.runnable) {
    console.log(`\n[${result.browser}]`);
    console.log("- Execution: SKIPPED (runtime dependency missing)");
    console.log(`- Reason: ${result.launchError ?? "unknown"}`);
    return;
  }

  const fallbackRisk = !result.computedFontFamily.includes(EXPECTED_FONT);

  console.log(`\n[${result.browser}]`);
  console.log(`- OTS/font error logs: ${result.otsErrorFound ? "NG" : "OK"}`);
  console.log(`- Glyph rendered: ${result.glyphRendered ? "OK" : "NG"}`);
  console.log(`- Font request 200: ${result.fontRequestOk ? "OK" : "NG"} (status=${result.fontRequestStatus ?? "n/a"})`);
  console.log(`- Computed font-family: ${result.computedFontFamily}`);
  console.log(`- Fallback risk: ${fallbackRisk ? "PRESENT" : "NOT DETECTED"}`);

  if (result.otsErrorMessages.length > 0) {
    console.log("- Error messages:");
    for (const msg of result.otsErrorMessages) {
      console.log(`  - ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(selectedBrowsers().map((browserType) => testBrowser(browserType)));

  for (const result of results) {
    printResult(result);
  }

  const hasFailure = results.some((r) => r.otsErrorFound || !r.glyphRendered || !r.fontRequestOk);
  const hasSkipped = results.some((r) => !r.runnable);
  if (hasFailure || hasSkipped) {
    process.exitCode = 1;
  }
}

await main();
