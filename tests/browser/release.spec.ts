import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync(new URL("../../data/content-refresh/current.json", import.meta.url), "utf8"));

const routes = ["/", "/scores", "/schedule", "/watch", "/injuries", "/fantasy-desk", "/stats", "/data-sources"];
for (const path of routes) test(`Week 8 identity, content, accessibility and visual capture: ${path}`, async ({ page }, info) => {
  await page.goto(path);
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  const identity = await health.json();
  expect(identity.nflWeek).toBe(8);
  expect(identity.contentVersion).toBe("2026-10-28");
  expect(identity.contentRevision).toMatch(/^[a-f0-9]{64}$/);
  expect(identity.build.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(identity.build.dirty).toBe(false);
  expect(identity.sourceCutoffUtc).toBe(manifest.cutoffUtc);
  const main = page.locator("main");
  await expect(main).toBeVisible();
  const text = await main.innerText();
  if (path === "/") {
    expect(text).toMatch(/Carolina/); expect(text).toMatch(/Green Bay/);
    expect(text).not.toMatch(/Week 7 complete/);
    expect(text).toMatch(/Current decision boards are not published/);
    expect(text).not.toMatch(/Researched null|Early half-PPR redraft edition|transactions in the October 14–20 window/);
  } else if (path === "/scores") {
    await expect(page.getByLabel("Select scoreboard week", { exact: true })).toHaveValue("8");
    expect(text).toMatch(/Week 8\. 14 games shown/);
    await page.goto("/scores?week=7");
    await expect(page.getByLabel("Select scoreboard week", { exact: true })).toHaveValue("7");
    expect(await main.innerText()).toMatch(/Week 7\. 14 games shown/);
    await page.goto(path);
  } else if (path === "/schedule") {
    const ids = await main.locator('a[href^="/games/"]').evaluateAll(links => [...new Set(links.map(link => link.getAttribute("href")))]);
    expect(ids).toHaveLength(272);
  } else if (path === "/watch") {
    await expect(page.getByLabel("Select a broadcast week", { exact: true })).toHaveValue("8");
    expect(text).toMatch(/14/); expect(text).toMatch(/Carolina/); expect(text).toMatch(/Green Bay/);
  } else if (path === "/injuries") {
    expect(text).toMatch(/Week 8 Thursday watch/); expect(text).toMatch(/October 20/);
    expect(text).toMatch(/Official Week 8 designation: QUESTIONABLE/);
    expect(text).toMatch(/Week 8 inactives are not published/);
  } else if (path === "/fantasy-desk") {
    expect(text).toMatch(/Week 8 waiver\/start-sit\/trade and Week 7 rookie editions are not published/);
    expect(text).toMatch(/12-team, one-QB half-PPR/); expect(text).toMatch(/0 \/ 4/);
  } else if (path === "/stats") {
    expect(text).toMatch(/through Week 6/i); expect(text).toMatch(/Historical October 20/);
    expect(text).toMatch(/single-source research/); expect(text).not.toMatch(/1,989 yards/);
  } else if (path === "/data-sources") {
    await expect(main.getByRole("link", { name: "Week 7 final scores", exact: true })).toHaveAttribute("href", "/scores?week=7");
    expect(text).toMatch(/not all 32 teams recertified|No all-team recertification/);
    expect(text).toMatch(/not published/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  await info.attach("axe", { body: JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }), contentType: "application/json" });
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("current-edition.png") });
});
