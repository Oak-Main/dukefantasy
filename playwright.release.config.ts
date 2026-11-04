import { defineConfig } from "@playwright/test";
import injuries from "./playwright.injuries.config";

export default defineConfig({
  ...injuries,
  testMatch: "release.spec.ts",
  outputDir: "outputs/week8-browser",
  reporter: [["list"], ["json", { outputFile: "outputs/week8-browser/results.json" }]],
  projects: injuries.projects?.filter(project => ["chromium-390", "chromium-1440", "webkit-390"].includes(project.name ?? "")),
});
