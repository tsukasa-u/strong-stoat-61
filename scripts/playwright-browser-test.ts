// @ts-nocheck
/**
 * Playwright browser-level verification test.
 *
 * Coverage:
 * 1) .secret content is obfuscated (PUA present, plaintext absent)
 * 2) After client interaction, .secret content does not leak plaintext
 * 3) Client-side state updates remain plaintext (intentional boundary)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

interface TestConfig {
  name: string;
  url: string;
  launchCommand: string;
  hasInteractiveButton?: boolean;
  stateTextIndicators?: string[];
  protectedTextIndicators?: string[];
  expectFontInjection?: boolean;
}

const testConfigs: TestConfig[] = [
  {
    name: "Next.js Route Handler",
    url: "http://127.0.0.1:8010/protected",
    launchCommand: "pnpm exec tsx examples/next/main.ts",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "Nuxt",
    url: "http://127.0.0.1:3001/protected",
    launchCommand: "cd examples/nuxt && CHOKIDAR_USEPOLLING=1 WATCHPACK_POLLING=true pnpm dev --host 127.0.0.1 --port 3001",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "Remix",
    url: "http://127.0.0.1:8011/protected",
    launchCommand: "pnpm exec tsx examples/remix/main.ts",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "SvelteKit",
    url: "http://127.0.0.1:8013/",
    launchCommand: "pnpm exec tsx examples/sveltekit/main.ts",
    hasInteractiveButton: true,
    stateTextIndicators: ["status:", "tags:", "profile:", "secure-state:"],
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "SolidStart",
    url: "http://127.0.0.1:3004/",
    launchCommand: "cd examples/solidstart && CHOKIDAR_USEPOLLING=1 WATCHPACK_POLLING=true pnpm dev --host 127.0.0.1 --port 3004",
    hasInteractiveButton: true,
    stateTextIndicators: ["status:", "tags:", "profile:", "secure-state:"],
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "Astro",
    url: "http://127.0.0.1:8012/",
    launchCommand: "pnpm exec tsx examples/astro/main.ts",
    hasInteractiveButton: true,
    stateTextIndicators: ["count:", "secure-state:"],
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "Vue SSR",
    url: "http://127.0.0.1:8021/",
    launchCommand: "cd examples/vue && pnpm dev",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
      "現在値: 42",
      "status: working",
      "tags: alpha, beta",
      "profile: Aki (editor)",
      "secure-state: c3",
    ],
    expectFontInjection: true,
  },
  {
    name: "Express",
    url: "http://127.0.0.1:8000/",
    launchCommand: "cd examples/express && PORT=8000 pnpm dev",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
  {
    name: "Fastify",
    url: "http://127.0.0.1:8001/",
    launchCommand: "cd examples/fastify && PORT=8001 pnpm dev",
    hasInteractiveButton: false,
    protectedTextIndicators: [
      "このテキストは難読化されます",
      "Hello World",
    ],
    expectFontInjection: true,
  },
];

function checkForPUA(text: string): boolean {
  // Check if text contains PUA (Private Use Area) codepoints
  // PUA ranges: U+E000–U+F8FF, U+F0000–U+FFFFD, U+100000–U+10FFFD
  const pua1 = /[\uE000-\uF8FF]/g;
  return pua1.test(text);
}

function checkForPlaintext(text: string, indicators: string[]): boolean {
  // Check if any indicator string appears as plaintext
  return indicators.some((indicator) => text.includes(indicator));
}

async function waitUntilReachable(page: Page, url: string, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 });
      return true;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  return false;
}

async function testFramework(config: TestConfig): Promise<boolean> {
  console.log(`\n[TEST] ${config.name} ${config.url}`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const failures: string[] = [];
    browser = await chromium.launch({ headless: true });
    const context: BrowserContext = await browser.newContext();
    page = await context.newPage();

    page.setDefaultTimeout(10000);

    const reachable = await waitUntilReachable(page, config.url);
    if (!reachable) {
      throw new Error(`service not reachable within timeout: ${config.url}`);
    }

    await page.goto(config.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    console.log(`  [STEP] @font-face and token route`);
    const styleContent = await page.evaluate(() => {
      const sheets = document.styleSheets;
      let content = "";
      for (let i = 0; i < sheets.length; i++) {
        try {
          if (sheets[i].cssRules) {
            for (let j = 0; j < sheets[i].cssRules.length; j++) {
              content += sheets[i].cssRules[j].cssText;
            }
          }
        } catch {
          // Ignore cross-origin stylesheet access errors.
        }
      }
      return content;
    });

    const hasFontFace = styleContent.includes("@font-face");
    const hasFontToken = styleContent.includes("_obf/font");

    console.log(`    ${hasFontFace ? "OK" : "NG"} @font-face`);
    console.log(`    ${hasFontToken ? "OK" : "NG"} _obf/font`);

    if (config.expectFontInjection && !hasFontFace) {
      failures.push("@font-face missing");
    }
    if (config.expectFontInjection && !hasFontToken) {
      failures.push("font token route missing");
    }

    console.log(`  [STEP] .secret obfuscation check`);
    const secretElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(".secret");
      return Array.from(elements).map((el) => {
        const textContent = el.textContent || "";
        const innerHTML = el.innerHTML || "";
        return { textContent, innerHTML };
      });
    });

    console.log(`    found .secret elements: ${secretElements.length}`);
    if (secretElements.length === 0) {
      failures.push("no .secret element found");
    }

    for (let i = 0; i < secretElements.length; i++) {
      const el = secretElements[i];

      // Check for plaintext of protected indicators
      const hasPlaintext = checkForPlaintext(
        el.textContent,
        config.protectedTextIndicators || []
      );
      const hasPUA = checkForPUA(el.textContent);

      console.log(`    secret[${i}] ${!hasPlaintext ? "OK" : "NG"} plaintext check`);
      console.log(`    secret[${i}] ${hasPUA ? "OK" : "WARN"} PUA check`);

      if (hasPlaintext) {
        console.log(`      warning: plaintext seen in .secret`);
        failures.push(`plaintext found in .secret element index ${i}`);
      }
      if (!hasPUA) {
        failures.push(`PUA not detected in .secret element index ${i}`);
      }
    }

    if (config.hasInteractiveButton) {
      console.log(`  [STEP] interaction and post-hydration check`);

      try {
        const buttons = page.locator("button");
        const buttonCount = await buttons.count();
        if (buttonCount > 0) {
          const clickTimes = Math.min(3, buttonCount);
          for (let i = 0; i < clickTimes; i++) {
            await buttons.nth(i).click();
            await page.waitForTimeout(300);
          }

          const secretElementsAfter = await page.evaluate(() => {
            const elements = document.querySelectorAll(".secret");
            return Array.from(elements).map((el) => ({
              textContent: el.textContent || "",
              innerHTML: el.innerHTML || "",
            }));
          });

          console.log(`    recheck .secret after interaction: ${secretElementsAfter.length}`);

          for (let i = 0; i < secretElementsAfter.length; i++) {
            const el = secretElementsAfter[i];
            const hasPlaintext = checkForPlaintext(
              el.textContent,
              config.protectedTextIndicators || []
            );
            if (hasPlaintext) {
              console.log(`      NG leak detected in secret[${i}]`);
              failures.push(`post-hydration leak detected in .secret element index ${i}`);
            } else {
              console.log(`      OK secret[${i}] still protected`);
            }
          }

          const pTexts = await page.locator("p").allTextContents();
          const stateTexts = pTexts.filter((t) =>
            (config.stateTextIndicators || []).some((indicator) => t.includes(indicator))
          );
          const anyStateTextHasPua = stateTexts.some((t) => checkForPUA(t));
          console.log(
            `    ${!anyStateTextHasPua ? "OK" : "NG"} client state paragraph plaintext check`
          );
          if (anyStateTextHasPua) {
            failures.push("client state text contains PUA");
          }
        } else {
          console.log(`    WARN no button found`);
          failures.push("interactive button not found");
          }
      } catch (e) {
        console.log(`    WARN interaction error: ${(e as Error).message}`);
        failures.push(`interaction error: ${(e as Error).message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join("; "));
    }

    console.log(`  [DONE] ${config.name}`);
    await context.close();
    return true;
  } catch (error) {
    console.error(`  [FAIL] ${config.name}: ${error}`);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  console.log("Starting Playwright browser-level verification tests\n");
  console.log("Starting servers one-by-one for stable verification...");

  const failedFrameworks: string[] = [];

  for (const config of testConfigs) {
    console.log(`\n[BOOT] ${config.name}`);
    const proc: ChildProcess = spawn("bash", ["-lc", config.launchCommand], {
      cwd: "/home/ogu-h/Documents/GitHub/strong-stoat-61",
      env: {
        ...process.env,
        CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? "1",
        WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? "true",
      },
      stdio: "ignore",
    });

    try {
      const ok = await testFramework(config);
      if (!ok) {
        failedFrameworks.push(config.name);
      }
    } catch (error) {
      console.error(`Failed to test ${config.name}: ${error}`);
      failedFrameworks.push(config.name);
    } finally {
      if (proc && proc.pid) {
        proc.kill("SIGTERM");
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (failedFrameworks.length > 0) {
    console.error(`\nPlaywright verification failed: ${failedFrameworks.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nPlaywright browser verification tests completed (all passed)");
  }
}

main().catch(console.error);
