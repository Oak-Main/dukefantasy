import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type InjuryRow = { player: string; team_slug: string; sources: string[]; social?: string[] };
const research = JSON.parse(readFileSync(new URL("../../data/injury-research/current.json", import.meta.url), "utf8")) as {
  ledger: InjuryRow[];
  watch: InjuryRow[];
};
const tables = [
  { heading: "Out for the long haul", id: "inj-ledger-title", scrollName: "Long-term injury table scroll area", rows: research.ledger, labels: ["Player", "Team", "Pos", "Status", "Weeks out", "Detail", "Sources"] },
  { heading: "Game-time decisions, graded", id: "inj-watch-title", scrollName: "Weekly injury table scroll area", rows: research.watch, labels: ["Player", "Team", "Pos", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Likelihood", "Note"] },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/injuries");
  // Exercise hydration before testing the filter; a server-rendered select alone is insufficient.
  await expect(async () => {
    await page.getByLabel("Filter by team", { exact: true }).selectOption("new-england-patriots");
    await expect(page.locator(".inj-table tbody tr").first().locator("td").nth(1)).toHaveText("New England");
  }).toPass({ timeout: 15_000 });
});

async function resetFilter(page: Page) {
  await page.getByLabel("Filter by team", { exact: true }).selectOption("");
  await expect(page.locator(".inj-table tbody tr")).toHaveCount(research.ledger.length + research.watch.length);
}

test("every published injury cell has the correct mobile label and semantic header", async ({ page }) => {
  await resetFilter(page);
  for (const table of tables) {
    const board = page.getByRole("table", { name: table.heading, exact: true });
    await expect(board).toBeVisible();
    await expect(board.getByRole("columnheader")).toHaveText(table.labels);
    await expect(board.getByRole("row")).toHaveCount(table.rows.length + 1);
    await expect(board.getByRole("cell")).toHaveCount(table.rows.length * table.labels.length);
    const issues = await board.locator("tbody tr").evaluateAll((rows, labels) => rows.flatMap((row, rowIndex) => {
      const cells = [...row.querySelectorAll("td")];
      const errors: string[] = [];
      if (!row.classList.contains("db-data-row")) errors.push(`${rowIndex}: missing card row`);
      if (cells.length !== labels.length) errors.push(`${rowIndex}: wrong column count`);
      cells.forEach((cell, index) => {
        const label = labels[index];
        const header = document.getElementById(cell.getAttribute("headers") ?? "");
        if (cell.dataset.label !== label) errors.push(`${rowIndex}/${index}: wrong mobile label`);
        if (header?.textContent !== label || header.getAttribute("scope") !== "col" || header.closest("table") !== row.closest("table")) errors.push(`${rowIndex}/${index}: broken header relationship`);
        if (cell.children.length !== 1 || !cell.firstElementChild?.classList.contains("inj-cell-value")) errors.push(`${rowIndex}/${index}: split value`);
      });
      return errors;
    }), table.labels);
    expect(issues).toEqual([]);
  }
});

test("mobile labels and complete values reflow without clipping at the breakpoint", async ({ page }) => {
  await resetFilter(page);
  const width = page.viewportSize()?.width ?? 0;
  if (width < 680) {
    const issues = await page.locator(".inj-table td").evaluateAll((cells) => cells.flatMap((cell, index) => {
      const style = getComputedStyle(cell, "::before");
      const value = cell.querySelector<HTMLElement>(".inj-cell-value");
      const box = cell.getBoundingClientRect();
      const errors: string[] = [];
      if (style.content !== JSON.stringify((cell as HTMLElement).dataset.label) || style.display === "none" || Number.parseFloat(style.fontSize) < 12) errors.push(`${index}: unreadable label`);
      if (!value || value.scrollWidth > value.clientWidth + 1 || value.getBoundingClientRect().right > box.right + 1) errors.push(`${index}: clipped value`);
      if (box.left < 0 || box.right > innerWidth + 1) errors.push(`${index}: offscreen field`);
      return errors;
    }));
    expect(issues).toEqual([]);
    await expect(page.locator(".inj-table tbody tr").first()).toHaveCSS("display", "grid");
  } else {
    await expect(page.locator(".inj-table tbody tr").first()).toHaveCSS("display", "table-row");
    await expect(page.locator(".inj-table thead").first()).toHaveCSS("position", "static");
  }
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    candidates: [...document.querySelectorAll("body *")].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1;
    }).slice(0, 12).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
});

test("keyboard team filtering preserves every matching player and source link", async ({ page, context, browserName }) => {
  const filter = page.getByLabel("Filter by team", { exact: true });
  await filter.focus();
  await expect(filter).toBeFocused();
  expect(await filter.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  // From the last option, Home selects All teams through the native keyboard control.
  await filter.press("End");
  await filter.press("Home");
  await filter.press("Enter");
  await expect(filter).toHaveValue("");
  await expect(page.locator(".inj-table tbody tr")).toHaveCount(research.ledger.length + research.watch.length);
  const index = await filter.locator("option").evaluateAll(options => options.findIndex(option => (option as HTMLOptionElement).value === "new-england-patriots"));
  for (let step = 0; step < index; step += 1) await filter.press("ArrowDown");
  await filter.press("Enter");
  await expect(filter).toHaveValue("new-england-patriots");
  for (const table of tables) {
    const board = page.getByRole("table", { name: table.heading, exact: true });
    const scroller = page.getByRole("region", { name: table.scrollName, exact: true });
    await scroller.focus();
    await expect(scroller).toBeFocused();
    expect(await scroller.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    if (await scroller.evaluate(element => element.scrollWidth > element.clientWidth)) {
      await scroller.press("ArrowRight");
      await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
    const expected = table.rows.filter(row => row.team_slug === "new-england-patriots").sort((a, b) => a.player.localeCompare(b.player));
    await expect(board.locator("tbody tr")).toHaveCount(expected.length);
    await expect(board.locator("tbody tr td:first-child strong")).toHaveText(expected.map(row => row.player));
    for (let rowIndex = 0; rowIndex < expected.length; rowIndex += 1) {
      const row = board.locator("tbody tr").nth(rowIndex);
      await expect(row.locator("td").nth(1)).toHaveText("New England");
      const links = row.getByRole("link");
      const urls = [...expected[rowIndex].sources, ...(table.id === "inj-watch-title" ? expected[rowIndex].social ?? [] : [])];
      expect(await links.evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute("href")))).toEqual(urls);
      for (const link of await links.all()) {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    }
    const firstLink = board.getByRole("link").first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    expect(await firstLink.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    // Windows WebKit's native Tab mode skips links; do not change site markup
    // or browser preferences to make a Chromium-specific traversal claim.
    if (browserName === "chromium") {
      await firstLink.press("Tab");
      await expect(board.getByRole("link").nth(1)).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(firstLink).toBeFocused();
    }
    // Verify real keyboard activation in both engines without requesting an
    // external publisher or allowing its network availability to affect QA.
    const sourceUrl = await firstLink.getAttribute("href");
    expect(sourceUrl).toMatch(/^https:\/\//);
    const fulfillSource = async (route: import("@playwright/test").Route) => {
      await route.fulfill({ contentType: "text/html", body: "<title>Source link target</title>" });
    };
    await context.route(sourceUrl ?? "", fulfillSource);
    const popupPromise = page.waitForEvent("popup");
    await firstLink.press("Enter");
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(sourceUrl);
    await popup.close();
    await context.unroute(sourceUrl ?? "", fulfillSource);
  }
  await resetFilter(page);
});

test("accessibility tree retains named tables, headers, ordered cells and no axe violations", async ({ page, context, browserName }, testInfo) => {
  for (const table of tables) {
    const board = page.getByRole("table", { name: table.heading, exact: true });
    await expect(page.getByRole("region", { name: table.heading, exact: true })).toHaveCount(1);
    await expect(page.getByRole("region", { name: table.scrollName, exact: true })).toHaveCount(1);
    const snapshot = await board.ariaSnapshot();
    expect(snapshot).toContain(`table "${table.heading}"`);
    for (const label of table.labels) expect(snapshot).toContain(`columnheader "${label}"`);
    const cells = board.locator("tbody tr").first().getByRole("cell");
    await expect(cells).toHaveCount(table.labels.length);
    let cursor = 0;
    for (const cell of await cells.all()) {
      const accessibleCell = (await cell.ariaSnapshot()).split("\n")[0].replace(/^- /, "");
      const at = snapshot.indexOf(accessibleCell, cursor);
      expect(at, `accessible reading order: ${accessibleCell}`).toBeGreaterThanOrEqual(cursor);
      cursor = at + accessibleCell.length;
    }
  }
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const byId = new Map(nodes.map(node => [node.nodeId, node]));
    for (const table of tables) {
      const node = nodes.find(item => !item.ignored && item.role?.value === "table" && item.name?.value === table.heading);
      expect(node, `${table.heading}: native browser accessibility table`).toBeTruthy();
      const descendants = [];
      const pending = [...node?.childIds ?? []];
      while (pending.length) {
        const item = byId.get(pending.pop() ?? "");
        if (item) {
          descendants.push(item);
          pending.push(...item.childIds ?? []);
        }
      }
      const expectedRows = table.rows.filter(row => row.team_slug === "new-england-patriots").length;
      expect(descendants.filter(item => !item.ignored && item.role?.value === "row")).toHaveLength(expectedRows + 1);
      expect(descendants.filter(item => !item.ignored && item.role?.value === "columnheader")).toHaveLength(table.labels.length);
      expect(descendants.filter(item => !item.ignored && item.role?.value === "cell")).toHaveLength(expectedRows * table.labels.length);
    }
    await session.detach();
  }
  const result = await new AxeBuilder({ page })
    .include('section[aria-labelledby="inj-ledger-title"]')
    .include('section[aria-labelledby="inj-watch-title"]')
    .include("#inj-team-filter")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  await testInfo.attach("axe", { body: JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2), contentType: "application/json" });
  expect(result.violations).toEqual([]);
});

test("records comparison views of both table structures", async ({ page }, testInfo) => {
  for (const [index, name] of ["ledger", "watch"].entries()) {
    const row = page.locator(".inj-table").nth(index).locator("tbody tr").first();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
});
