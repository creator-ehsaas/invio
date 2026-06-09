import puppeteerCore from "puppeteer-core";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--single-process",
  "--no-zygote",
];

/**
 * Launches a browser that works in both local dev (Windows/Linux) and
 * serverless environments (Vercel, AWS Lambda).
 *
 * - Serverless: uses @sparticuz/chromium (bundled, no download needed)
 * - Local dev: tries puppeteer-extra+stealth, falls back to puppeteer-core
 *   pointing at the local puppeteer-managed Chrome installation
 */
export async function launchBrowser() {
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
  );

  if (isServerless) {
    const { default: Chromium } = await import("@sparticuz/chromium");
    return puppeteerCore.launch({
      args: [...Chromium.args, ...LAUNCH_ARGS],
      executablePath: await Chromium.executablePath(),
      headless: true,
    });
  }

  // Local dev — prefer puppeteer-extra with stealth plugin
  try {
    const { default: puppeteerExtra } = await import("puppeteer-extra");
    const { default: StealthPlugin } = await import(
      "puppeteer-extra-plugin-stealth"
    );
    puppeteerExtra.use(StealthPlugin());
    return puppeteerExtra.launch({
      headless: true,
      args: LAUNCH_ARGS,
    }) as unknown as ReturnType<typeof puppeteerCore.launch>;
  } catch {
    // Fall back to puppeteer-core with the locally installed Chrome
    const { executablePath } = await import("puppeteer");
    return puppeteerCore.launch({
      headless: true,
      executablePath: executablePath(),
      args: LAUNCH_ARGS,
    });
  }
}
