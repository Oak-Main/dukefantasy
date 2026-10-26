import { defineConfig } from "@playwright/test";

const widths = [320, 390, 679, 680, 1440];

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "injuries.spec.ts",
  outputDir: "outputs/injury-mobile/browser",
  reporter: [["list"], ["json", { outputFile: "outputs/injury-mobile/results.json" }]],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8796",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    ...widths.map((width) => ({
      name: `chromium-${width}`,
      use: {
        browserName: "chromium" as const,
        viewport: { width, height: 844 },
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    })),
    { name: "webkit-390", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `"${process.execPath}" node_modules/wrangler/bin/wrangler.js dev --config wrangler.deploy.jsonc --local --ip 127.0.0.1 --port 8796`,
    url: "http://127.0.0.1:8796/injuries",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
